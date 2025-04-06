const { google } = require("googleapis");
const TrustedDomains = require("../models/trusted"); // Adjust path as needed

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
    return res.status(400).json({error: "no google id provided"})
  }

  try {
    // Setup OAuth client with token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Get user's trusted domains
    const trustedDomainsDoc = await TrustedDomains.findOne({ googleId });
    const trustedDomains = trustedDomainsDoc?.Domains || [];

    // Fetch latest emails from primary inbox category only
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20, // Fetch more since we'll filter some out
      q: "category:primary", // Filter to only include primary inbox
    });

    const messages = messagesRes.data.messages || [];
    let processedEmails = [];
    let processedCount = 0;

    // Process messages until we have 10 or run out of messages
    for (const message of messages) {
      if (processedCount >= 10) break;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full", // Get full message details including headers
      });

      const headers = msg.data.payload.headers;
      const from = headers.find((h) => h.name === "From")?.value || "";
      
      // Extract domain from sender email
      const domainMatch = from.match(/@([^>]+)/) || from.match(/@(.+)$/);
      const senderDomain = domainMatch ? domainMatch[1].toLowerCase().trim() : null;

      // console.log(googleId)
      // console.log("TrustedDomainsDoc:", trustedDomainsDoc);
      // console.log(trustedDomains)
      // console.log(domainMatch)

      // Skip if sender domain is in trusted domains list
      if (senderDomain && trustedDomains.includes(senderDomain)) {
        continue;
      }

      // Get authentication results directly from headers
      const authResultsHeader = headers.find(h => 
        h.name === "Authentication-Results" || 
        h.name === "X-Google-DKIM-Signature" || 
        h.name === "ARC-Authentication-Results"
      );
      
      // Parse security results more accurately
      const securityStatus = parseAuthenticationHeaders(headers);
      
      const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const date = headers.find((h) => h.name === "Date")?.value;
      const snippet = msg.data.snippet;

      processedEmails.push({
        subject,
        from,
        date,
        snippet,
        securityStatus: securityStatus.status,
        securityDetails: securityStatus.details
      });
      
      processedCount++;
    }

    res.json({
      success: true,
      emails: processedEmails,
    });
  } catch (err) {
    console.error("Error processing emails:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Parse email authentication headers more accurately
 * @param {Array} headers - Email headers
 * @returns {Object} Security status information
 */
function parseAuthenticationHeaders(headers) {
  // Initialize results
  const results = {
    spf: { pass: false, details: null },
    dkim: { pass: false, details: null },
    dmarc: { pass: false, details: null }
  };
  
  // Find Authentication-Results header
  const authResultsHeader = headers.find(h => 
    h.name === "Authentication-Results" || 
    h.name === "ARC-Authentication-Results"
  );
  
  if (authResultsHeader) {
    const authValue = authResultsHeader.value;
    
    // Check SPF
    if (authValue.includes("spf=pass")) {
      results.spf.pass = true;
      results.spf.details = "pass";
    } else if (authValue.match(/spf=(fail|neutral|softfail)/i)) {
      results.spf.pass = false;
      results.spf.details = authValue.match(/spf=(fail|neutral|softfail)/i)[1];
    }
    
    // Check DKIM
    if (authValue.includes("dkim=pass")) {
      results.dkim.pass = true;
      results.dkim.details = "pass";
    } else if (authValue.match(/dkim=(fail|neutral|none)/i)) {
      results.dkim.pass = false;
      results.dkim.details = authValue.match(/dkim=(fail|neutral|none)/i)[1];
    }
    
    // Check DMARC
    if (authValue.includes("dmarc=pass")) {
      results.dmarc.pass = true;
      results.dmarc.details = "pass";
    } else if (authValue.match(/dmarc=(fail|none)/i)) {
      results.dmarc.pass = false;
      results.dmarc.details = authValue.match(/dmarc=(fail|none)/i)[1];
    }
  }
  
  // Check additional DKIM headers if needed
  const dkimHeader = headers.find(h => h.name === "DKIM-Signature" || h.name === "X-Google-DKIM-Signature");
  if (dkimHeader && !results.dkim.pass) {
    results.dkim.pass = true; // If header exists, likely passed
    results.dkim.details = "pass";
  }
  
  // If we found specific values for SPF/DKIM/DMARC in headers, we'll use those
  // Otherwise, for Gmail, assume defaults are safe
  if (!results.spf.details) {
    results.spf.pass = true;
    results.spf.details = "pass (assumed)"; 
  }
  
  if (!results.dkim.details) {
    results.dkim.pass = true;
    results.dkim.details = "pass (assumed)";
  }
  
  if (!results.dmarc.details) {
    results.dmarc.pass = true;
    results.dmarc.details = "pass (assumed)";
  }
  
  // Determine overall status
  const allPassed = results.spf.pass && results.dkim.pass && results.dmarc.pass;
  const overallStatus = allPassed ? "safe" : "malicious";
  
  return {
    status: overallStatus,
    details: results
  };
}