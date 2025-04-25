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
  // We'll handle force refresh differently now - returning true means fetch from Gmail
  // False means either use cached result or fetch from database directly
  if (forceRefresh) return false; // Don't refresh from Gmail when forceRefresh is true

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

  let lastCheckTimestampMs = 0; // Timestamp in milliseconds
  let existingResults = null;
  let userEmail = null; // Declare variable to store user's email

  try {
    // Find user settings or create default ones
    const settings = await UserSettings.findOne({ googleId }) ||
                     await new UserSettings({ googleId }).save(); // Ensure settings exist

    // Get the most recently saved results for this user
    existingResults = await EmailResult.findOne({ googleId }).sort({ lastUpdated: -1 }).limit(1);

    // --- Handle forceRefresh ---
    // If forceRefresh is true, we skip the 'shouldRefresh' logic and directly return DB results.
    if (forceRefresh && existingResults) {
      console.log(`[${googleId}] Force refresh requested. Returning latest results from database directly.`);
      return res.json({
        success: true,
        emails: existingResults.emails || [],
        fromCache: false, // Not from Gmail cache
        fromDbRefresh: true, // Indicate this came from a DB refresh triggered by force
        lastUpdated: existingResults.lastUpdated,
        lastEmailTimestamp: existingResults.lastEmailTimestamp // The timestamp of the latest email *in the DB*
      });
    }

    // Store the timestamp of the latest email processed in the *previous* run
    if (existingResults && existingResults.lastEmailTimestamp) {
      lastCheckTimestampMs = existingResults.lastEmailTimestamp;
       console.log(`[${googleId}] Last processed email timestamp (ms): ${lastCheckTimestampMs} (${new Date(lastCheckTimestampMs).toISOString()})`);
    } else {
         console.log(`[${googleId}] No previous email timestamp found.`);
    }


    // --- Check if refresh from GMAIL is needed ---
    const needsRefreshFromGmail = await shouldRefreshEmails(googleId, false); // Pass false for forceRefresh here

    // If auto-check is ON, and it's NOT time to refresh, and we HAVE previous results, return cached DB results
    if (settings.autoCheckEmails && !needsRefreshFromGmail && existingResults) {
      console.log(`[${googleId}] Returning cached emails from DB (last updated: ${existingResults.lastUpdated})`);
      return res.json({
        success: true,
        emails: existingResults.emails || [],
        fromCache: true, // Indicate results are from DB cache
        lastUpdated: existingResults.lastUpdated,
        lastEmailTimestamp: existingResults.lastEmailTimestamp
      });
    }

    // --- Proceed with fetching from Gmail ---
    console.log(`[${googleId}] Refresh needed (autoCheck=${settings.autoCheckEmails}, needsRefresh=${needsRefreshFromGmail}). Fetching new emails from Gmail.`);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Get user's own email address to detect self-sent emails
    try {
      const userInfoResponse = await gmail.users.getProfile({ userId: "me" });
      userEmail = userInfoResponse.data.emailAddress.toLowerCase();
      console.log(`[${googleId}] User email identified as: ${userEmail}`);
    } catch (error) {
      console.error(`[${googleId}] Failed to retrieve user email:`, error);
      // Continue without user email - self-sent email detection will be skipped
    }

    // Build the Gmail query
    let query = "category:primary";
    if (lastCheckTimestampMs > 0) {
      // Convert milliseconds timestamp to seconds for the Gmail API query
      const lastCheckTimestampSec = Math.floor(lastCheckTimestampMs / 1000);
      query += ` after:${lastCheckTimestampSec}`;
      console.log(`[${googleId}] Fetching emails using query: "${query}" (timestamp: ${lastCheckTimestampSec} / ${new Date(lastCheckTimestampMs).toISOString()})`);
    } else {
       console.log(`[${googleId}] Fetching recent primary emails (no previous timestamp). Query: "${query}"`);
    }

    // Fetch message list and trusted domains concurrently
    const [messagesRes, trustedDomainsDoc] = await Promise.all([
      gmail.users.messages.list({ userId: "me", maxResults: 50, q: query }), // Limit results for safety
      TrustedDomains.findOne({ googleId })
    ]);

    const trustedDomains = trustedDomainsDoc?.Domains || [];
    const messages = messagesRes.data.messages || [];

    // --- Handle case where NO new messages are found by the query ---
    if (messages.length === 0) {
      console.log(`[${googleId}] No new messages found via Gmail API since last check.`);
      // Update lastChecked timestamp even if no emails were fetched
      await UserSettings.findOneAndUpdate(
        { googleId },
        { lastChecked: new Date() },
        { new: true, upsert: true }
      );
      // Return the existing results from the database
      return res.json({
        success: true,
        emails: existingResults?.emails || [],
        fromCache: false, // Not from cache, but no new emails
        lastUpdated: existingResults?.lastUpdated || new Date(), // Use existing or current time
        lastEmailTimestamp: lastCheckTimestampMs // Timestamp remains unchanged
      });
    }

    console.log(`[${googleId}] Found ${messages.length} potential new message(s). Fetching details.`);

    // Fetch full details for each message ID
    const batchRequests = messages.map(message =>
      gmail.users.messages.get({ userId: "me", id: message.id, format: "full" })
    );
    const emailResponses = await Promise.all(batchRequests);

    let newlyProcessedEmails = []; // Store emails processed in *this run*
    // Initialize the max timestamp for *this run* with the previous max.
    // We will update it only if we find an email with a genuinely newer timestamp.
    let maxTimestampThisRun = lastCheckTimestampMs;

    // --- Process each fetched email ---
    for (const response of emailResponses) {
      const msg = response.data;
      const messageId = msg.id;
      // Gmail internalDate is a string representing milliseconds since epoch
      const internalDateMs = parseInt(msg.internalDate, 10);

      // ***** THE FIX: Client-side timestamp check *****
      // Ensure we only process emails STRICTLY newer than the last one recorded.
      // This prevents reprocessing the exact same email fetched due to second-level granularity of 'after:'.
      if (lastCheckTimestampMs > 0 && internalDateMs <= lastCheckTimestampMs) {
           console.log(`[${googleId}] Skipping email ID ${messageId} - timestamp (${internalDateMs}) is not newer than last recorded (${lastCheckTimestampMs}).`);
           continue; // Skip to the next email
      }
      // ************************************************

      // If the email passed the timestamp check, update the max timestamp *for this run*
      if (internalDateMs > maxTimestampThisRun) {
          maxTimestampThisRun = internalDateMs;
      }

      // --- Extract email details ---
      const headers = msg.payload.headers;
      const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
      const senderEmail = fromHeader.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0]?.toLowerCase() || "";
      const domainMatch = fromHeader.match(/@([^>\s]+)/);
      const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

      // Check if sender domain is trusted
      if (senderDomain && trustedDomains.includes(senderDomain)) {
        console.log(`[${googleId}] Skipping email ID ${messageId} from trusted domain: ${senderDomain}`);
        continue;
      }

      // Check if it's a self-sent email (only if userEmail was successfully retrieved)
      const isSelfSent = userEmail && senderEmail === userEmail;

      const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "(No Subject)";
      const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value;
      const snippet = msg.snippet || "";

      // --- Perform security checks ---
      const securityStatusInfo = parseAuthenticationHeadersOptimized(headers); // Placeholder
      const urls = extractUrlsFromEmail(msg); // Placeholder
      const textContent = extractTextContent(msg.payload);

      // Translate if necessary
      const translatedSnippet = await logTranslationIfNeeded(snippet, "Snippet", subject);
      const translatedBody = await logTranslationIfNeeded(textContent, "Body", subject);
      const combinedText = `${translatedSnippet}\n${translatedBody}`;

      // Run NLP model
      const { confidence, prediction } = await runNlpModel(combinedText);
      const isHighConfidencePhishing = prediction === 1 && confidence >= 0.9;

      // Determine initial security status based on headers, then override if NLP is highly confident
      let finalSecurityStatus = securityStatusInfo.status;
      if (isHighConfidencePhishing) {
          finalSecurityStatus = 'malicious';
          console.log(`[${googleId}] Email ID ${messageId} ("${subject}") flagged as high-confidence phishing by NLP.`);
      }

      // Adjust status for self-sent emails (make them safe unless NLP strongly disagrees)
      if (isSelfSent) {
        console.log(`[${googleId}] Detected self-sent email ID ${messageId}: "${subject}"`);
        if (!isHighConfidencePhishing) {
          finalSecurityStatus = 'safe'; // Override to safe for self-sent, unless NLP flags it
        }
      }

      // Prepare security details object
      const securityDetails = {
          ...securityStatusInfo.details,
          nlpCheck: {
              pass: prediction !== 1,
              details: prediction === 1
                  ? `Potential phishing detected (${Math.round(confidence * 100)}% confidence)`
                  : `No phishing detected (${Math.round(confidence * 100)}% confidence)`
          }
          // urlCheck details will be added by checkUrlsAgainstDatabase
      };

       // Add self-sent explanation if applicable
       if (isSelfSent) {
         securityDetails.selfSent = {
           pass: true, // Considered "passing" the self-sent check
           details: "This email was sent from your own account. Authentication headers might be incomplete, potentially causing warnings, but it's generally safe unless flagged otherwise (e.g., by NLP)."
         };
       }


      // Add to the list of emails processed in this specific run
      newlyProcessedEmails.push({
        subject,
        from: fromHeader,
        date: dateHeader,
        internalDate: internalDateMs, // Store the millisecond timestamp
        messageId: messageId,
        snippet,
        securityStatus: finalSecurityStatus, // Initial status before URL check
        securityDetails,
        urls,
        nlpConfidence: confidence,
        nlpPrediction: prediction,
        isHighConfidencePhishing: isHighConfidencePhishing,
        isSelfSent: isSelfSent,
        googleId: googleId // Pass googleId for URL checker logging if needed
      });
    }
    // --- End processing loop for new emails ---

    // If no emails actually passed the timestamp filter and processing
    if (newlyProcessedEmails.length === 0) {
         console.log(`[${googleId}] No emails processed in this run (all were older or skipped).`);
         // Update lastChecked timestamp
         await UserSettings.findOneAndUpdate(
            { googleId }, { lastChecked: new Date() }, { new: true, upsert: true }
         );
         // Return existing results
         return res.json({
            success: true,
            emails: existingResults?.emails || [],
            fromCache: false,
            lastUpdated: existingResults?.lastUpdated || new Date(),
            lastEmailTimestamp: lastCheckTimestampMs // Timestamp unchanged
         });
    }

    console.log(`[${googleId}] Processed ${newlyProcessedEmails.length} new email(s) after timestamp filter.`);

    // --- Check URLs (modifies securityStatus/details IN PLACE if malicious URL found) ---
    const checkedNewEmails = await checkUrlsAgainstDatabase(newlyProcessedEmails); // Placeholder

    // --- Update analyses Data ---
    const newlyProcessedCount = checkedNewEmails.length;
    let newlyMaliciousCount = 0;
    const newMaliciousSenders = new Set();

    checkedNewEmails.forEach(email => {
      // Check the *final* security status AFTER URL checks
      if (email.securityStatus === 'malicious') {
        newlyMaliciousCount++;
        const fromEmailMatch = email.from.match(/[\w\.-]+@[\w\.-]+\.\w+/);
        if (fromEmailMatch) {
            newMaliciousSenders.add(fromEmailMatch[0]);
        } else {
            newMaliciousSenders.add(email.from); // Fallback
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
          $set: { lastUpdated: new Date() }
        };
        if (newMaliciousSenders.size > 0) {
          analysesUpdate.$addToSet = { maliciousSenders: { $each: Array.from(newMaliciousSenders) } };
        }
        await Useranalyses.findOneAndUpdate(
          { googleId: googleId },
          analysesUpdate,
          { upsert: true, new: true }
        );
        console.log(`[${googleId}] Updated analyses: +${newlyProcessedCount} processed, +${newlyMaliciousCount} malicious.`);
      } catch (analysesError) {
        console.error(`[${googleId}] Failed to update user analyses data:`, analysesError);
      }
    }
    // --- End analyses Update ---

    // --- Combine, Save Results, Update Settings, Send Response ---
    const existingEmails = existingResults?.emails || [];
    // Combine newly processed emails with previously stored ones
    let combinedEmails = [...checkedNewEmails, ...existingEmails];

    // Sort by internal date (descending - newest first)
    combinedEmails.sort((a, b) => b.internalDate - a.internalDate);

    // Deduplicate based on messageId just in case (belt and suspenders)
    const uniqueEmailsMap = new Map();
    combinedEmails.forEach(email => {
        if (!uniqueEmailsMap.has(email.messageId)) {
            uniqueEmailsMap.set(email.messageId, email);
        }
    });
    let uniqueCombinedEmails = Array.from(uniqueEmailsMap.values());

    // Sort again after deduplication
     uniqueCombinedEmails.sort((a, b) => b.internalDate - a.internalDate);


    // Limit the total number of stored emails
    const MAX_STORED_EMAILS = 100; // Or get from config
    if (uniqueCombinedEmails.length > MAX_STORED_EMAILS) {
        uniqueCombinedEmails = uniqueCombinedEmails.slice(0, MAX_STORED_EMAILS);
        console.log(`[${googleId}] Trimmed combined email list to ${MAX_STORED_EMAILS} emails.`);
    }

    const now = new Date();
    const updateData = {
      googleId,
      emails: uniqueCombinedEmails,
      lastUpdated: now,
      // IMPORTANT: Save the highest timestamp found *in this run*
      lastEmailTimestamp: maxTimestampThisRun
    };

    // Save the combined & potentially truncated results
    await EmailResult.findOneAndUpdate(
      { googleId }, updateData, { new: true, upsert: true }
    );
    console.log(`[${googleId}] Saved/Updated ${uniqueCombinedEmails.length} unique emails. Newest timestamp for next check: ${maxTimestampThisRun} (${new Date(maxTimestampThisRun).toISOString()})`);

    // Update the last time an automatic check was performed
    await UserSettings.findOneAndUpdate(
      { googleId }, { lastChecked: now }, { new: true, upsert: true }
    );

    // Send the final list back to the client
    res.json({
      success: true,
      emails: uniqueCombinedEmails,
      fromCache: false, // Data is fresh from Gmail
      lastUpdated: now,
      lastEmailTimestamp: maxTimestampThisRun // Return the latest timestamp used
    });

  } catch (err) {
    console.error(`[${googleId}] Error processing emails:`, err);
    // Handle specific authentication errors
    if (err.code === 401 || (err.response && err.response.status === 401)) {
     return res.status(401).json({ success: false, error: 'Authentication failed. Please log in again.', requiresReAuth: true });
    }
    // Generic error handling
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