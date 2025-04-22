const { google } = require("googleapis");
const TrustedDomains = require("../models/trusted"); // Adjust path as needed
const EmailResult = require("../models/emailResults");
const UserSettings = require("../models/userSettings");
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * Check if emails need to be refreshed
 * @param {String} googleId - User's Google ID
 * @returns {Boolean} - True if emails need refresh, false otherwise
 */
async function shouldRefreshEmails(googleId, forceRefresh = false) {
  // If force refresh is requested, skip all other checks
  if (forceRefresh) return true;
  
  try {
    const settings = await UserSettings.findOne({ googleId });
    if (!settings) return true;
    
    // If auto-check is disabled, always refresh
    if (!settings.autoCheckEmails) return true;
    
    // Check if we've passed the refresh interval
    if (!settings.lastChecked) return true;
    
    const now = new Date();
    const hoursSinceLastCheck = (now - settings.lastChecked) / (1000 * 60 * 60);
    
    return hoursSinceLastCheck >= settings.checkFrequency;
  } catch (error) {
    console.error("Error checking refresh status:", error);
    return true; // Refresh on error to be safe
  }
}

/**
 * Detect language and translate text to English if needed, logging to console only
 * @param {String} text - Text to translate
 * @param {String} type - Type of content being translated (for logging)
 * @param {String} emailSubject - Subject of the email for reference in logs
 */
async function logTranslationIfNeeded(text, type, emailSubject) {
  if (!text || text.trim() === '') return;
  
  try {
    const res = await fetch("http://localhost:3000/translate", {
      method: "POST",
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: "en",
        format: "text",
        alternatives: 3,
        api_key: ""
      }),
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      throw new Error(`Translation API returned ${res.status}: ${res.statusText}`);
    }
    
    const translationResult = await res.json();
    
    // Only log if detected language isn't English
    const isEnglish = translationResult.detectedLanguage?.language === "en";
    
    if (!isEnglish && translationResult.detectedLanguage?.language) {
      console.log(`--------------------------------------------`);
      console.log(`Translation for email "${emailSubject}":`);
      console.log(`Content type: ${type}`);
      console.log(`Detected language: ${translationResult.detectedLanguage.language} (${translationResult.detectedLanguage.confidence}% confidence)`);
      console.log(`Original text sample: ${text.substring(0, 100)}...`);
      console.log(`Full translated text: ${translationResult.translatedText}`);
      console.log(`--------------------------------------------`);
    }
  } catch (error) {
    console.error(`Translation error for email "${emailSubject}" (${type}):`, error);
  }
}

/**
 * Extract text content from email parts
 * @param {Object} part - Email part object
 * @returns {String} - Extracted text content
 */
function extractTextContent(part) {
  let content = '';
  
  if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    content = Buffer.from(part.body.data, 'base64').toString('utf8');
  } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
    // For HTML content, we extract it but don't do any HTML-to-text conversion
    // A more sophisticated approach would use an HTML parser
    content = Buffer.from(part.body.data, 'base64').toString('utf8');
  }
  
  // Process nested parts if they exist
  if (part.parts && Array.isArray(part.parts)) {
    part.parts.forEach(subPart => {
      content += extractTextContent(subPart);
    });
  }
  
  return content;
}

/**
 * Extract and process Gmail emails with security checks
 * @param {Object} req - Request object containing auth token
 * @param {Object} res - Response object
 */
exports.getGmailEmails = async (req, res) => {
  const { token, googleId } = req.body;

  if (!token) {
    return res.status(400).json({ error: "No token provided." });
  }

  if (!googleId) {
    return res.status(400).json({ error: "No Google ID provided" });
  }

  try {
    // Check user settings for auto-check status
    const settings = await UserSettings.findOne({ googleId }) || 
                    await new UserSettings({ googleId }).save();
    
    // Check if we have recent results and auto-check is enabled
    const needsRefresh = await shouldRefreshEmails(googleId, req.body.forceRefresh);
    
    // If auto-check enabled and we have recent results, use the stored data
    if (settings.autoCheckEmails && !needsRefresh) {
      const storedResults = await EmailResult.findOne({ googleId })
                                  .sort({ lastUpdated: -1 })
                                  .limit(1);
      
      if (storedResults) {
        return res.json({
          success: true,
          emails: storedResults.emails,
          fromCache: true,
          lastUpdated: storedResults.lastUpdated
        });
      }
    }

    // Setup OAuth client with token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Parallel API calls for better performance
    const [messagesRes, trustedDomainsDoc] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        maxResults: 50, // Fetch more since we'll filter some out
        q: "category:primary", // Filter to only include primary inbox
      }),
      TrustedDomains.findOne({ googleId })
    ]);

    const trustedDomains = trustedDomainsDoc?.Domains || [];
    const messages = messagesRes.data.messages || [];
    
    if (messages.length === 0) {
      // Update last checked time
      await UserSettings.findOneAndUpdate(
        { googleId }, 
        { lastChecked: new Date() },
        { new: true, upsert: true }
      );
      
      return res.json({
        success: true,
        emails: [],
      });
    }

    // Batch request emails in parallel instead of serial fetches
    const batchRequests = messages.slice(0, 40).map(message => 
      gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full", // Get full message content to extract URLs
      })
    );

    const emailResponses = await Promise.all(batchRequests);
    
    // Process all fetched emails
    let processedEmails = [];
    let processedCount = 0;
    
    // Create a container for translation promises
    const translationPromises = [];

    for (const response of emailResponses) {
      if (processedCount >= 40) break;

      const msg = response.data;
      const headers = msg.payload.headers;
      const from = headers.find((h) => h.name === "From")?.value || "";
      
      // Extract domain from sender email - optimized regex
      const domainMatch = from.match(/@([^>\s]+)/);
      const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

      // Skip if sender domain is in trusted domains list
      if (senderDomain && trustedDomains.includes(senderDomain)) {
        continue;
      }

      // Parse security results with improved performance
      const securityStatus = parseAuthenticationHeadersOptimized(headers);
      
      const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const date = headers.find((h) => h.name === "Date")?.value;
      const snippet = msg.snippet || "";
      
      // Extract URLs from the email
      const urls = extractUrlsFromEmail(msg);
      
      // Extract text content for translation
      const textContent = extractTextContent(msg.payload);
      
      // Add translation promises for both snippet and full content
      if (snippet) {
        translationPromises.push(logTranslationIfNeeded(snippet, "Snippet", subject));
      }
      
      if (textContent) {
        translationPromises.push(logTranslationIfNeeded(textContent, "Body", subject));
      }
      
      // Add the email to processed emails without waiting for translations
      processedEmails.push({
        subject,
        from,
        date,
        snippet,
        securityStatus: securityStatus.status,
        securityDetails: securityStatus.details,
        urls
      });
      
      processedCount++;
    }

    // Process URL checks
    const checkedEmails = await checkUrlsAgainstDatabase(processedEmails);

    // Save results to database if auto-check is enabled
    if (settings.autoCheckEmails) {
      await EmailResult.findOneAndUpdate(
        { googleId },
        { 
          googleId,
          emails: checkedEmails,
          lastUpdated: new Date()
        },
        { new: true, upsert: true }
      );
    }
    
    // Update last checked time regardless of auto-check status
    await UserSettings.findOneAndUpdate(
      { googleId }, 
      { lastChecked: new Date() },
      { new: true, upsert: true }
    );

    // Fire off translations in the background without waiting for them
    // This ensures they don't block the response
    Promise.all(translationPromises).catch(err => {
      console.error("Background translation error:", err);
    });

    res.json({
      success: true,
      emails: checkedEmails,
      fromCache: false
    });
  } catch (err) {
    console.error("Error processing emails:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};



/**
 * Toggle auto-check emails setting
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.toggleAutoCheck = async (req, res) => {
  const { googleId, autoCheckEmails } = req.body;
  
  if (!googleId) {
    return res.status(400).json({ error: "No Google ID provided" });
  }
  
  try {
    const settings = await UserSettings.findOneAndUpdate(
      { googleId },
      { 
        googleId,
        autoCheckEmails: Boolean(autoCheckEmails),
        lastChecked: autoCheckEmails ? new Date() : null
      },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true, 
      autoCheckEmails: settings.autoCheckEmails
    });
  } catch (err) {
    console.error("Error toggling auto-check:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get current auto-check status
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAutoCheckStatus = async (req, res) => {
  const { googleId } = req.query;
  
  if (!googleId) {
    return res.status(400).json({ error: "No Google ID provided" });
  }
  
  try {
    const settings = await UserSettings.findOne({ googleId }) || 
                     { autoCheckEmails: false };
    
    res.json({
      success: true,
      autoCheckEmails: settings.autoCheckEmails
    });
  } catch (err) {
    console.error("Error getting auto-check status:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Manually trigger email check and save to database
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.forceCheckEmails = async (req, res) => {
  const { token, googleId } = req.body;

  if (!token || !googleId) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Create a new request object with the force refresh flag
    const modifiedReq = {
      ...req,
      body: {
        ...req.body,
        forceRefresh: true
      }
    };
    
    // Call the getGmailEmails with the modified request
    await exports.getGmailEmails(modifiedReq, res);
  } catch (err) {
    console.error("Error forcing email check:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Optimized parser for email authentication headers
 * @param {Array} headers - Email headers
 * @returns {Object} Security status information
 */
function parseAuthenticationHeadersOptimized(headers) {
  // Initialize results
  const results = {
    spf: { pass: false, details: null },
    dkim: { pass: false, details: null },
    dmarc: { pass: false, details: null }
  };
  
  // Find Authentication-Results header
  let authValue = '';
  
  // Create a map for faster header lookup instead of multiple finds
  const headerMap = {};
  for (const header of headers) {
    headerMap[header.name.toLowerCase()] = header.value;
  }
  
  // Check auth results
  authValue = headerMap['authentication-results'] || headerMap['arc-authentication-results'] || '';
  
  // Fast checks with single-pass string searches
  if (authValue) {
    // SPF check
    if (authValue.includes('spf=pass')) {
      results.spf.pass = true;
      results.spf.details = 'pass';
    } else if (authValue.includes('spf=fail')) {
      results.spf.details = 'fail';
    } else if (authValue.includes('spf=neutral')) {
      results.spf.details = 'neutral';
    } else if (authValue.includes('spf=softfail')) {
      results.spf.details = 'softfail';
    }
    
    // DKIM check
    if (authValue.includes('dkim=pass')) {
      results.dkim.pass = true;
      results.dkim.details = 'pass';
    } else if (authValue.includes('dkim=fail')) {
      results.dkim.details = 'fail';
    } else if (authValue.includes('dkim=neutral')) {
      results.dkim.details = 'neutral';
    } else if (authValue.includes('dkim=none')) {
      results.dkim.details = 'none';
    }
    
    // DMARC check
    if (authValue.includes('dmarc=pass')) {
      results.dmarc.pass = true;
      results.dmarc.details = 'pass';
    } else if (authValue.includes('dmarc=fail')) {
      results.dmarc.details = 'fail';
    } else if (authValue.includes('dmarc=none')) {
      results.dmarc.details = 'none';
    }
  }
  
  // Single checks for other auth headers
  if (!results.dkim.details && (headerMap['dkim-signature'] || headerMap['x-google-dkim-signature'])) {
    results.dkim.pass = true;
    results.dkim.details = 'pass';
  }
  
  // Check Received-SPF header if SPF still unknown
  if (!results.spf.details && headerMap['received-spf'] && headerMap['received-spf'].includes('pass')) {
    results.spf.pass = true;
    results.spf.details = 'pass';
  }
  
  // Set defaults if not found
  if (!results.spf.details) {
    results.spf.pass = true;
    results.spf.details = 'pass (assumed)';
  }
  
  if (!results.dkim.details) {
    results.dkim.pass = true;
    results.dkim.details = 'pass (assumed)';
  }
  
  if (!results.dmarc.details) {
    results.dmarc.pass = true;
    results.dmarc.details = 'pass (assumed)';
  }
  
  // Final security determination
  const overallStatus = (results.spf.pass && results.dkim.pass && results.dmarc.pass) ? 'safe' : 'malicious';
  
  return {
    status: overallStatus,
    details: results
  };
}

/**
 * Extract URLs from email content
 * @param {Object} email - Email message object from Gmail API
 * @returns {Array} Array of URLs found in the email
 */
function extractUrlsFromEmail(email) {
  const extractedUrls = [];
  
  // Known DTD URLs to exclude
  const dtdUrlsToExclude = [
    'http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd',
    'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd',
    'http://www.w3.org/1999/xhtml'
    // Add others as needed
  ];
  
  // Function to recursively process email parts
  function processEmailPart(part) {
    if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
      // Decode base64 content
      let content = '';
      if (part.body.data) {
        content = Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      
      // Extract URLs using regex - more targeted to avoid DOCTYPE URLs
      // This improved regex looks for URLs that are more likely to be actual links
      const urlRegex = /(?:https?:\/\/[^\s<>"']+)(?=[^>]*(?:<|$))/g;
      const urlMatches = content.match(urlRegex) || [];
      
      urlMatches.forEach(url => {
        // Skip known DTD URLs and other false positives
        if (!dtdUrlsToExclude.includes(url) && !extractedUrls.includes(url)) {
          extractedUrls.push(url);
        }
      });
    }
    
    // Process nested parts if they exist
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(subPart => processEmailPart(subPart));
    }
  }
  
  // Start processing from email payload
  if (email.payload) {
    processEmailPart(email.payload);
  }
  
  return extractedUrls;
}

/**
 * Check URLs against malicious URL database
 * @param {Array} emails - Array of processed email objects
 * @returns {Array} Updated email objects with malicious URL check result
 */
async function checkUrlsAgainstDatabase(emails) {
  // Load CSV database of malicious URLs
  const maliciousUrls = await loadMaliciousUrlDatabase();
  
  // Check each email's URLs against the database
  return emails.map(email => {
    // Prepare arrays to hold detected malicious URLs
    let detectedMaliciousUrls = [];
    
    // Only check URLs if there are any
    if (email.urls && email.urls.length > 0) {
      // Check each URL against the malicious database
      email.urls.forEach(url => {
        const isMalicious = maliciousUrls.some(entry => {
          // Check if URL contains the malicious URL pattern
          return url.includes(entry.url) && 
                 (entry.type === 'phishing' || entry.type === 'defacement' || entry.type === 'malware');
        });
        
        // If URL is malicious, add it to the detected list
        if (isMalicious) {
          detectedMaliciousUrls.push(url);
        }
      });
    }
    
    // Replace all URLs with only the malicious ones
    const updatedEmail = {
      ...email,
      urls: detectedMaliciousUrls, // Only include malicious URLs
      securityDetails: {
        ...email.securityDetails,
        urlCheck: {
          pass: detectedMaliciousUrls.length === 0,
          details: detectedMaliciousUrls.length === 0 ? 
                   'No malicious URLs detected' : 
                   `${detectedMaliciousUrls.length} malicious URL(s) detected`
        }
      }
    };
    
    // Update security status if malicious URLs were found
    if (detectedMaliciousUrls.length > 0 && email.securityStatus === 'safe') {
      updatedEmail.securityStatus = 'malicious';
    }
    
    return updatedEmail;
  });
}

/**
 * Load malicious URL database from CSV file
 * @returns {Array} Array of objects with url and type properties
 */
function loadMaliciousUrlDatabase() {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvFilePath = path.join(__dirname, '../data/malicious_phish.csv');
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        console.error('Error reading malicious URL database:', error);
        resolve([]); // Resolve with empty array to continue processing
      });
  });
}