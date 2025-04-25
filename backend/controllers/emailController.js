// emailController.js
const { google } = require("googleapis");
const TrustedDomains = require("../models/trusted"); // Adjust path as needed
const EmailResult = require("../models/emailResults");
const UserSettings = require("../models/userSettings");
const Useranalyses = require("../models/userAnalysis");
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const axios = require('axios');

// --- shouldRefreshEmails function remains the same ---
async function shouldRefreshEmails(googleId, forceRefresh = false) {
  // If force refresh is requested, skip all other checks
  if (forceRefresh) return true;

  try {
    const settings = await UserSettings.findOne({ googleId });
    if (!settings) return true; // No settings, treat as needing refresh

    // If auto-check is disabled, always refresh when manually requested
    if (!settings.autoCheckEmails) return true;

    // Check if we've passed the refresh interval
    if (!settings.lastChecked) return true; // Never checked before

    const now = new Date();
    
    // Calculate time difference in minutes instead of hours for finer granularity
    const minutesSinceLastCheck = (now - settings.lastChecked) / (1000 * 60);
    
    // Convert checkFrequency from hours to minutes
    const frequencyMinutes = settings.checkFrequency * 60;
    
    // For minute-based cron, use smaller minimum threshold (1 minute)
    const needsRefresh = minutesSinceLastCheck >= Math.max(1, frequencyMinutes);
    
    console.log(`[${googleId}] Minutes since last check: ${minutesSinceLastCheck.toFixed(2)}, frequency (mins): ${frequencyMinutes}, needs refresh: ${needsRefresh}`);
    
    return needsRefresh;
  } catch (error) {
    console.error("Error checking refresh status:", error);
    return true; // Refresh on error to be safe
  }
}

// --- logTranslationIfNeeded function remains the same ---
async function logTranslationIfNeeded(text, type, emailSubject) {
  if (!text || text.trim() === '') return '';

  try {
    // NOTE: Consider adding error handling and potential fallback if the translation service is down.
    const res = await fetch("http://translator:5000/translate", { // Ensure this endpoint is correct and running
      method: "POST",
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: "en",
        format: "text",
        alternatives: 3,
        api_key: "" // Use environment variables for API keys
      }),
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
      // Log the error but don't stop processing, return original text
      console.error(`Translation API Error for "${emailSubject}" (${type}): ${res.status} ${res.statusText}`);
      const errorBody = await res.text();
      console.error(`Translation API Error Body: ${errorBody}`);
      return text; // Return original text on API error
    }

    const translationResult = await res.json();

    // Only log if detected language isn't English
    const detectedLang = translationResult.detectedLanguage?.language;
    const isEnglish = detectedLang === "en";

    if (!isEnglish && detectedLang) {
      console.log(`--------------------------------------------`);
      console.log(`Translation for email "${emailSubject}":`);
      console.log(`Content type: ${type}`);
      console.log(`Detected language: ${detectedLang} (${translationResult.detectedLanguage?.confidence}% confidence)`);
      console.log(`Original text sample: ${text.substring(0, 100)}...`);
      console.log(`Full translated text: ${translationResult.translatedText}`);
      console.log(`--------------------------------------------`);

      return translationResult.translatedText;
    }

    return text; // Return original text if it's already in English or detection failed
  } catch (error) {
    console.error(`Translation function error for email "${emailSubject}" (${type}):`, error);
    return text; // Return original text on function error
  }
}

// --- extractTextContent function remains the same ---
function extractTextContent(part) {
    let content = '';

    // Base case: check if the part itself has relevant text content
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        try {
            content += Buffer.from(part.body.data, 'base64').toString('utf8');
        } catch (e) {
            console.error("Error decoding base64 plain text:", e);
        }
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        // Extract HTML content - useful if NLP or other tools can handle HTML
        // For pure text extraction, consider an HTML-to-text library
         try {
            content += Buffer.from(part.body.data, 'base64').toString('utf8');
        } catch (e) {
            console.error("Error decoding base64 html text:", e);
        }
    }

    // Recursive step: process nested parts if they exist
    if (part.parts && Array.isArray(part.parts)) {
        part.parts.forEach(subPart => {
            content += extractTextContent(subPart); // Recursively call
        });
    }
    // Handle multipart/alternative: prefer text/plain if available, otherwise use html
    // Note: The current structure adds content from *all* parts.
    // A more sophisticated approach might prioritize text/plain within multipart/alternative.

    return content;
}

// --- runNlpModel function remains the same ---
async function runNlpModel(translatedText) {
  if (!translatedText || translatedText.trim().length === 0) {
     // Return safe defaults if no text is provided
     return { confidence: 0.0, prediction: 0 };
  }
  try {
    // Ensure the NLP service endpoint is correct and running
    const response = await axios.post('http://nlp-container:5000/predict', { // Use environment variable for URL
      text: translatedText
    });

    // Validate response structure
    if (response.data && typeof response.data.confidence === 'number' && typeof response.data.prediction === 'number') {
       const { confidence, prediction } = response.data;
       return { confidence, prediction };
    } else {
       console.error('Invalid response structure from NLP model:', response.data);
       return { confidence: 0.0, prediction: 0 }; // Default to safe on invalid response
    }

  } catch (error) {
    // Log specific error details if available
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('NLP model error response:', error.response.status, error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('NLP model no response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('NLP model request setup error:', error.message);
    }
    return { confidence: 0.0, prediction: 0 }; // Default to safe side on error
  }
}

/**
 * Extract and process Gmail emails with security checks (UPDATED)
 * @param {Object} req - Request object containing auth token
 * @param {Object} res - Response object
 */
exports.getGmailEmails = async (req, res) => {
  const { token, googleId, forceRefresh = false } = req.body;

  if (!token) return res.status(400).json({ error: "No token provided." });
  if (!googleId) return res.status(400).json({ error: "No Google ID provided" });

  let lastCheckTimestampMs = 0;
  let existingResults = null;
  let userEmail = null; // Declare variable to store user's email

  try {
    const settings = await UserSettings.findOne({ googleId }) ||
                    await new UserSettings({ googleId }).save();

    existingResults = await EmailResult.findOne({ googleId }).sort({ lastUpdated: -1 }).limit(1);
    if (existingResults && existingResults.lastEmailTimestamp) {
      lastCheckTimestampMs = existingResults.lastEmailTimestamp;
    }

    const needsRefresh = await shouldRefreshEmails(googleId, forceRefresh);

    if (settings.autoCheckEmails && !needsRefresh && existingResults) {
      console.log(`[${googleId}] Returning cached emails from ${existingResults.lastUpdated}`);
      return res.json({
        success: true,
        emails: existingResults.emails || [],
        fromCache: true,
        lastUpdated: existingResults.lastUpdated,
        lastEmailTimestamp: existingResults.lastEmailTimestamp
      });
    }

    console.log(`[${googleId}] Refresh needed (forceRefresh=${forceRefresh}, needsRefresh=${needsRefresh}). Fetching new emails.`);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      const userInfoResponse = await gmail.users.getProfile({ userId: "me" });
      userEmail = userInfoResponse.data.emailAddress.toLowerCase();
      console.log(`[${googleId}] User email identified as: ${userEmail}`);
    } catch (error) {
      console.error(`[${googleId}] Failed to retrieve user email:`, error);
      // Continue without user email - we'll just skip the self-sent email detection
    }

    let query = "category:primary";
    if (lastCheckTimestampMs > 0) {
      const lastCheckTimestampSec = Math.floor(lastCheckTimestampMs / 1000);
      query += ` after:${lastCheckTimestampSec}`;
      console.log(`[${googleId}] Fetching emails after timestamp: ${lastCheckTimestampSec} (${new Date(lastCheckTimestampMs).toISOString()})`);
    } else {
       console.log(`[${googleId}] No previous timestamp found, fetching recent primary emails.`);
    }

    // yaha tak

    const [messagesRes, trustedDomainsDoc] = await Promise.all([
      gmail.users.messages.list({ userId: "me", maxResults: 50, q: query }),
      TrustedDomains.findOne({ googleId })
    ]);

    const trustedDomains = trustedDomainsDoc?.Domains || [];
    const messages = messagesRes.data.messages || [];

    if (messages.length === 0) {
      console.log(`[${googleId}] No new messages found since last check.`);
      await UserSettings.findOneAndUpdate(
        { googleId },
        { lastChecked: new Date() },
        { new: true, upsert: true }
      );
      return res.json({
        success: true,
        emails: existingResults?.emails || [],
        fromCache: false,
        lastUpdated: existingResults?.lastUpdated || new Date(),
        lastEmailTimestamp: lastCheckTimestampMs
      });
    }

    console.log(`[${googleId}] Found ${messages.length} new message(s). Fetching details.`);

    const batchRequests = messages.map(message =>
      gmail.users.messages.get({ userId: "me", id: message.id, format: "full" })
    );
    const emailResponses = await Promise.all(batchRequests);

    let newlyProcessedEmails = []; // Store emails processed in *this run*
    let maxTimestampThisRun = lastCheckTimestampMs;

    for (const response of emailResponses) {
      const msg = response.data;
      const messageId = msg.id;
      const internalDateMs = parseInt(msg.internalDate, 10);

      if (internalDateMs > maxTimestampThisRun) {
          maxTimestampThisRun = internalDateMs;
      }

      const headers = msg.payload.headers;
      const fromHeader = headers.find((h) => h.name === "From")?.value || "";
      // Extract sender's email from the From header
      const senderEmail = fromHeader.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0]?.toLowerCase() || "";
      const domainMatch = fromHeader.match(/@([^>\s]+)/);
      const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

      // Check if this is a self-sent email (only if we have the user's email)
      const isSelfSent = userEmail && senderEmail === userEmail;

      if (senderDomain && trustedDomains.includes(senderDomain)) {
        console.log(`[${googleId}] Skipping email from trusted domain: ${senderDomain}`);
        continue;
      }

      const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const dateHeader = headers.find((h) => h.name === "Date")?.value;
      const snippet = msg.snippet || "";
      const securityStatusInfo = parseAuthenticationHeadersOptimized(headers);
      const urls = extractUrlsFromEmail(msg);
      const textContent = extractTextContent(msg.payload);
      const translatedSnippet = await logTranslationIfNeeded(snippet, "Snippet", subject);
      const translatedBody = await logTranslationIfNeeded(textContent, "Body", subject);
      const combinedText = `${translatedSnippet}\n${translatedBody}`;
      const { confidence, prediction } = await runNlpModel(combinedText);
      const isHighConfidencePhishing = prediction === 1 && confidence >= 0.9;

      let finalSecurityStatus = securityStatusInfo.status;
      if (isHighConfidencePhishing) {
          finalSecurityStatus = 'malicious';
      }
      
      // Handle self-sent emails
      if (isSelfSent) {
        console.log(`[${googleId}] Detected self-sent email: "${subject}"`);
        // Override security status to safe for self-sent emails unless NLP model has high confidence it's phishing
        if (!isHighConfidencePhishing) {
          finalSecurityStatus = 'safe';
        }
      }

      const securityDetails = {
          ...securityStatusInfo.details,
          nlpCheck: {
              pass: prediction !== 1,
              details: prediction === 1
                  ? `Potential phishing detected (${Math.round(confidence * 100)}% confidence)`
                  : `No phishing detected (${Math.round(confidence * 100)}% confidence)`
          }
      };

      // Add self-sent email explanation to security details if applicable
      if (isSelfSent) {
        securityDetails.selfSent = {
          pass: true,
          details: "This email was sent from your own account to yourself. Authentication headers may be missing or incomplete for self-sent emails, which can trigger security warnings."
        };
      }

      // Add to the list of emails processed in this specific run
      newlyProcessedEmails.push({
        subject,
        from: fromHeader,
        date: dateHeader,
        internalDate: internalDateMs,
        messageId: messageId,
        snippet,
        securityStatus: finalSecurityStatus,
        securityDetails,
        urls,
        nlpConfidence: confidence,
        nlpPrediction: prediction,
        isHighConfidencePhishing: isHighConfidencePhishing,
        isSelfSent: isSelfSent // Store this flag for potential use later
      });
    }
    // End processing loop for new emails

    // --- Check URLs (modifies securityStatus/details IN PLACE if malicious URL found) ---
    const checkedNewEmails = await checkUrlsAgainstDatabase(newlyProcessedEmails); // Note: checkUrlsAgainstDatabase modifies securityStatus if URLs are bad

    // --- Update analyses Data ---
    const newlyProcessedCount = checkedNewEmails.length;
    let newlyMaliciousCount = 0;
    const newMaliciousSenders = new Set(); // Use Set for automatic uniqueness

    checkedNewEmails.forEach(email => {
      // Check the *final* security status AFTER URL checks
      if (email.securityStatus === 'malicious') {
        newlyMaliciousCount++;
        // Extract just the email address part if possible, otherwise use the full 'From' header
        const fromEmailMatch = email.from.match(/[\w\.-]+@[\w\.-]+\.\w+/);
        if (fromEmailMatch) {
            newMaliciousSenders.add(fromEmailMatch[0]);
        } else {
            newMaliciousSenders.add(email.from); // Fallback to full header if regex fails
        }
      }
    });

    if (newlyProcessedCount > 0) {
      try {
        const analysesUpdate = {
          $inc: {
            totalEmailsProcessed: newlyProcessedCount,
            maliciousEmailsCount: newlyMaliciousCount
          },
          $set: { lastUpdated: new Date() } // Update timestamp
        };
        // Add senders only if there are new ones
        if (newMaliciousSenders.size > 0) {
          analysesUpdate.$addToSet = { maliciousSenders: { $each: Array.from(newMaliciousSenders) } };
        }

        await Useranalyses.findOneAndUpdate(
          { googleId: googleId },
          analysesUpdate,
          { upsert: true, new: true } // Create if doesn't exist
        );
        console.log(`[${googleId}] Updated analyses: +${newlyProcessedCount} processed, +${newlyMaliciousCount} malicious.`);
      } catch (analysesError) {
        console.error(`[${googleId}] Failed to update user analyses data:`, analysesError);
        // Decide if you want to halt execution or just log the error
      }
    }
    // --- End analyses Update ---


    // --- Combine, Save Results, Update Settings, Send Response ---
    const existingEmails = existingResults?.emails || [];
    let combinedEmails = [...checkedNewEmails, ...existingEmails];
    const MAX_STORED_EMAILS = 100;
    if (combinedEmails.length > MAX_STORED_EMAILS) {
        combinedEmails = combinedEmails.slice(0, MAX_STORED_EMAILS);
    }
    combinedEmails.sort((a, b) => b.internalDate - a.internalDate);
    let finalEmailsToSave = combinedEmails;

    const now = new Date();
    const updateData = {
      googleId,
      emails: finalEmailsToSave,
      lastUpdated: now,
      lastEmailTimestamp: maxTimestampThisRun
    };
    await EmailResult.findOneAndUpdate(
      { googleId }, updateData, { new: true, upsert: true }
    );
    console.log(`[${googleId}] Saved/Updated ${finalEmailsToSave.length} emails. Newest timestamp: ${maxTimestampThisRun}`);

    await UserSettings.findOneAndUpdate(
      { googleId }, { lastChecked: now }, { new: true, upsert: true }
    );

    res.json({
      success: true,
      emails: finalEmailsToSave,
      fromCache: false,
      lastUpdated: now,
      lastEmailTimestamp: maxTimestampThisRun
    });

  } catch (err) {
    console.error(`[${googleId}] Error processing emails:`, err);
    if (err.code === 401 || (err.response && err.response.status === 401)) {
     return res.status(401).json({ success: false, error: 'Authentication failed. Please log in again.', requiresReAuth: true });
    }
    res.status(500).json({ success: false, error: err.message || "Internal server error processing emails." });
  }
};

// --- toggleAutoCheck function remains the same ---
exports.toggleAutoCheck = async (req, res) => {
  const { googleId, autoCheckEmails } = req.body;

  if (googleId === undefined || autoCheckEmails === undefined) {
    // Use `undefined` check as `false` is a valid value for autoCheckEmails
    return res.status(400).json({ error: "Missing required parameters (googleId, autoCheckEmails)" });
  }

  try {
    const settings = await UserSettings.findOneAndUpdate(
      { googleId },
      {
        googleId, // Ensure googleId is set, especially on upsert
        autoCheckEmails: Boolean(autoCheckEmails),
        // Optionally reset lastChecked when toggling, or keep it
        // lastChecked: autoCheckEmails ? new Date() : null // Example: reset if turning on
      },
      { new: true, upsert: true } // Create settings doc if it doesn't exist
    );

    console.log(`[${googleId}] AutoCheck toggled to: ${settings.autoCheckEmails}`);
    res.json({
      success: true,
      autoCheckEmails: settings.autoCheckEmails
    });
  } catch (err) {
    console.error(`[${googleId}] Error toggling auto-check:`, err);
    res.status(500).json({ success: false, error: err.message || "Internal server error." });
  }
};

// --- getAutoCheckStatus function remains the same ---
exports.getAutoCheckStatus = async (req, res) => {
  const { googleId } = req.query;

  if (!googleId) {
    return res.status(400).json({ error: "No Google ID provided" });
  }

  try {
    // Find settings or default to false if not found (don't create here)
    const settings = await UserSettings.findOne({ googleId });

    res.json({
      success: true,
      // If settings exist, use the value, otherwise default to false
      autoCheckEmails: settings ? settings.autoCheckEmails : false
    });
  } catch (err) {
    console.error(`[${googleId}] Error getting auto-check status:`, err);
    res.status(500).json({ success: false, error: err.message || "Internal server error." });
  }
};

// --- forceCheckEmails function remains the same ---
// It correctly passes forceRefresh: true to getGmailEmails
exports.forceCheckEmails = async (req, res) => {
  const { token, googleId } = req.body;

  if (!token || !googleId) {
    return res.status(400).json({ error: "Missing required parameters (token, googleId)" });
  }

  try {
    // Create a modified request object specifically for the underlying function
    // This avoids potential conflicts if `req` is used elsewhere concurrently
    const modifiedReq = {
      body: { // Only pass necessary parts of the body
        token,
        googleId,
        forceRefresh: true // Explicitly set forceRefresh
      }
      // Copy other necessary properties from req if getGmailEmails uses them
      // e.g., req.user if you have authentication middleware
    };

    // Call getGmailEmails directly, passing the response object
    // The response will be sent from within getGmailEmails
    await exports.getGmailEmails(modifiedReq, res);

  } catch (err) {
    // This catch block might be redundant if getGmailEmails handles its own errors,
    // but it's good practice as a fallback.
    console.error(`[${googleId}] Error forcing email check:`, err);
     // Avoid sending response twice if getGmailEmails already sent one
    if (!res.headersSent) {
       res.status(500).json({ success: false, error: err.message || "Internal server error during forced check." });
    }
  }
};


// --- parseAuthenticationHeadersOptimized function remains the same ---
function parseAuthenticationHeadersOptimized(headers) {
  const results = {
    spf: { pass: false, details: null },
    dkim: { pass: false, details: null },
    dmarc: { pass: false, details: null }
  };

  // Create a map for faster header lookup (case-insensitive keys)
  const headerMap = headers.reduce((map, header) => {
    map[header.name.toLowerCase()] = header.value;
    return map;
  }, {});


  const authResultsValue = headerMap['authentication-results'] || headerMap['arc-authentication-results'] || '';

  if (authResultsValue) {
    // Use regex for slightly more robust parsing of key=value pairs
    const parseAuthPart = (key) => {
      const match = authResultsValue.match(new RegExp(`${key}=([a-zA-Z]+)`));
      return match ? match[1].toLowerCase() : null;
    };

    const spfResult = parseAuthPart('spf');
    if (spfResult) {
      results.spf.pass = spfResult === 'pass';
      results.spf.details = spfResult;
    }

    const dkimResult = parseAuthPart('dkim');
    if (dkimResult) {
        results.dkim.pass = dkimResult === 'pass';
        results.dkim.details = dkimResult;
     }

     const dmarcResult = parseAuthPart('dmarc');
     if (dmarcResult) {
        results.dmarc.pass = dmarcResult === 'pass';
        results.dmarc.details = dmarcResult;
     }
  }

  // Fallback checks / assumptions
  // DKIM: Check for signature existence if no explicit result
  if (!results.dkim.details && (headerMap['dkim-signature'] || headerMap['x-google-dkim-signature'])) {
     // Finding the header doesn't guarantee it passed verification,
     // but it's often assumed pass if present in simple checks.
     // A stricter approach might leave it as 'none' or 'unknown' if not in Auth-Results.
     // Let's assume 'pass' based on original logic's intent.
     results.dkim.pass = true;
     results.dkim.details = 'pass (assumed by signature presence)';
  }


  // Received-SPF check if SPF still unknown
  const receivedSpf = headerMap['received-spf'];
   if (!results.spf.details && receivedSpf) {
     // Simple check for 'pass' within the Received-SPF header value
      if (receivedSpf.toLowerCase().includes('pass')) {
         results.spf.pass = true;
         results.spf.details = 'pass (from Received-SPF)';
      } else {
        // Could attempt to parse other results like fail, neutral, softfail here
        // For now, just note it wasn't an explicit pass from this header
      }
   }

   // Final default assumptions if still undetermined
   // Consider if assuming 'pass' is the desired default security posture.
   // Maybe defaulting to 'unknown' or 'none' is safer.
   if (!results.spf.details) {
     results.spf.pass = false; // Safer default?
     results.spf.details = 'unknown';
   }
   if (!results.dkim.details) {
     results.dkim.pass = false; // Safer default?
     results.dkim.details = 'none';
   }
   if (!results.dmarc.details) {
     results.dmarc.pass = false; // Safer default?
     results.dmarc.details = 'none';
   }

  // Determine overall status based on all three checks passing
  // Strict check: All must pass explicitly.
  const overallStatus = (results.spf.pass && results.dkim.pass && results.dmarc.pass) ? 'safe' : 'malicious'; // 'malicious' might be too strong, maybe 'suspicious' or 'unverified'?

  return {
    status: overallStatus,
    details: results
  };
}

// --- extractUrlsFromEmail function remains the same ---
function extractUrlsFromEmail(email) {
   const extractedUrls = new Set(); // Use a Set to automatically handle duplicates

   // Known DTD/Schema URLs to exclude (add more if needed)
   const exclusionPatterns = [
     /^http:\/\/www\.w3\.org\//i,
     /^http:\/\/schemas\.microsoft\.com\//i,
     // Add more specific domains or patterns if necessary
   ];

   // Function to recursively process email parts
   function processEmailPart(part) {
     if (!part) return; // Add null check

     let content = '';
     if (part.body && part.body.data) {
        try {
            content = Buffer.from(part.body.data, 'base64').toString('utf8');
        } catch (e) {
            console.error("Error decoding base64 content:", e);
            // Decide how to handle decoding errors, e.g., skip this part
            return;
        }
     } else if (part.body && part.body.attachmentId) {
         // If content is in an attachment, we'd need another API call to fetch it.
         // For URL extraction, usually we only care about inline text/html parts.
         // console.log("Skipping attachment part for URL extraction:", part.filename);
         return; // Skip attachments for now
     }


     if ((part.mimeType === 'text/plain' || part.mimeType === 'text/html') && content) {
       // Improved regex: Handles various URL schemes, domains, paths, queries, fragments.
       // Avoids simple punctuation at the end of the URL.
       const urlRegex = /((?:https?|ftp):\/\/[^\s<>"'()\[\]{};:,]+)/gi;
       const urlMatches = content.match(urlRegex) || [];

       urlMatches.forEach(url => {
         // Clean trailing punctuation often captured by regex
         const cleanedUrl = url.replace(/[.,!?)\];:]$/, '');

         // Check against exclusion patterns
         const isExcluded = exclusionPatterns.some(pattern => pattern.test(cleanedUrl));

         if (!isExcluded) {
           extractedUrls.add(cleanedUrl);
         }
       });
     }

     // Process nested parts
     if (part.parts && Array.isArray(part.parts)) {
       part.parts.forEach(subPart => processEmailPart(subPart));
     }
   }

   // Start processing from email payload
   if (email.payload) {
     processEmailPart(email.payload);
   } else {
       console.warn("Email payload was missing or empty for URL extraction:", email.id);
   }

   return Array.from(extractedUrls); // Convert Set back to Array
}

// --- checkUrlsAgainstDatabase function remains the same ---
// --- checkUrlsAgainstDatabase function modified to only store malicious URLs ---
async function checkUrlsAgainstDatabase(emails) {
  // Load CSV database of malicious URLs
  let maliciousUrls = [];
  try {
      maliciousUrls = await loadMaliciousUrlDatabase();
  } catch (error) {
      console.error("Failed to load malicious URL database. URL checks will be skipped.", error);
      // Return emails unmodified if DB fails to load
      return emails.map(email => ({
          ...email,
          urls: [], // Clear all URLs since we can't check them
          securityDetails: {
              ...email.securityDetails,
              urlCheck: {
                  pass: true, // Assume pass if check cannot be performed
                  details: 'URL check skipped: database unavailable.'
              }
          }
      }));
  }

  if (maliciousUrls.length === 0) {
    console.warn("Malicious URL database is empty or failed to load. URL checks might not be effective.");
  }

  // Check each email's URLs against the database
  return emails.map(email => {
    let detectedMaliciousUrls = [];
    let checkedUrlsCount = 0;

    if (email.urls && email.urls.length > 0) {
      checkedUrlsCount = email.urls.length;
      email.urls.forEach(url => {
        // Use .some() for efficiency: stop checking patterns for a URL once a match is found
        const isMalicious = maliciousUrls.some(entry => {
           if (!entry.url || typeof entry.url !== 'string') return false; // Skip invalid entries
           // Check if the email URL *includes* the pattern from the database.
           return url.includes(entry.url.trim()) && 
                  (entry.type === 'phishing' || entry.type === 'defacement' || entry.type === 'malware');
        });

        if (isMalicious) {
          detectedMaliciousUrls.push(url);
        }
      });
    }

    // Update email object
    const pass = detectedMaliciousUrls.length === 0;
    const details = pass
        ? `Checked ${checkedUrlsCount} URL(s). No known malicious URLs detected.`
        : `${detectedMaliciousUrls.length} potentially malicious URL(s) detected out of ${checkedUrlsCount} checked.`;

    const updatedEmail = {
      ...email,
      // Only store malicious URLs instead of all URLs
      urls: detectedMaliciousUrls, // This is the key change
      securityDetails: {
        ...email.securityDetails,
        urlCheck: {
          pass: pass,
          details: details,
          maliciousUrlsDetected: detectedMaliciousUrls.length // Just store the count for reference
        }
      }
    };

    // Update overall security status if malicious URLs were found and it was previously safe
    if (!pass && updatedEmail.securityStatus !== 'malicious') {
       // Check if NLP already flagged it as high confidence phishing
       if (!updatedEmail.isHighConfidencePhishing) {
            updatedEmail.securityStatus = 'malicious'; // Mark as malicious due to URL
       }
    }

    return updatedEmail;
  });
}

// --- loadMaliciousUrlDatabase function remains the same ---
function loadMaliciousUrlDatabase() {
  return new Promise((resolve, reject) => {
    const results = [];
    // Ensure the path is correctly resolved from the current file's directory
    const csvFilePath = path.resolve(__dirname, '..', 'data', 'malicious_phish.csv');
    // console.log("Attempting to load malicious URL database from:", csvFilePath); // Debugging line

    // Check if file exists before attempting to read
    if (!fs.existsSync(csvFilePath)) {
        console.error(`Error: Malicious URL database file not found at ${csvFilePath}`);
        return resolve([]); // Resolve with empty array if file doesn't exist
    }

    fs.createReadStream(csvFilePath)
      .on('error', (error) => { // Handle errors during stream creation (e.g., permissions)
          console.error(`Error creating read stream for ${csvFilePath}:`, error);
          reject(error); // Reject the promise on stream creation error
      })
      .pipe(csv()) // Assumes standard CSV format with headers
      .on('data', (data) => {
          // Basic validation: ensure 'url' and 'type' properties exist
           if (data.url && data.type) {
             results.push(data);
           } else {
             // console.warn("Skipping invalid row in CSV:", data); // Log invalid rows if needed
           }
      })
      .on('end', () => {
          console.log(`Successfully loaded ${results.length} entries from malicious URL database.`);
          resolve(results); // Resolve with the array of data
      })
      .on('error', (error) => { // Handle errors during CSV parsing
          console.error(`Error parsing malicious URL database file ${csvFilePath}:`, error);
          // Depending on desired behavior, could resolve([]) or reject(error)
          resolve([]); // Resolve with empty array to allow processing to continue
      });
  });
}