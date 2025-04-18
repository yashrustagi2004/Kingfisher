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
    return res.status(400).json({ error: "No Google ID provided" });
  }

  try {
    // Setup OAuth client with token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Parallel API calls for better performance
    const [messagesRes, trustedDomainsDoc] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        maxResults: 30, // Fetch more since we'll filter some out
        q: "category:primary", // Filter to only include primary inbox
      }),
      TrustedDomains.findOne({ googleId })
    ]);

    const trustedDomains = trustedDomainsDoc?.Domains || [];
    const messages = messagesRes.data.messages || [];
    
    if (messages.length === 0) {
      return res.json({
        success: true,
        emails: [],
      });
    }

    // Batch request emails in parallel instead of serial fetches
    const batchRequests = messages.slice(0, 20).map(message => 
      gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata", // Only get headers, not full message content
        metadataHeaders: ["From", "Subject", "Date", "Authentication-Results", 
                          "ARC-Authentication-Results", "DKIM-Signature", 
                          "X-Google-DKIM-Signature", "Received-SPF"]
      })
    );

    const emailResponses = await Promise.all(batchRequests);
    
    // Process all fetched emails
    let processedEmails = [];
    let processedCount = 0;

    for (const response of emailResponses) {
      if (processedCount >= 10) break;

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