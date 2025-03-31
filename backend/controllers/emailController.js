const { google } = require("googleapis");

// Extract emails using Gmail API
exports.getGmailEmails = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "No token provided." });
  }

  try {
    // Setup OAuth client with token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch latest 10 emails from Gmail inbox
    const messagesRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      q: "in:inbox",
    });

    const messages = messagesRes.data.messages || [];

    // Get detailed email data (subject, sender, snippet, date, etc.)
    const emailDetails = await Promise.all(
      messages.map(async (message) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });

        const headers = msg.data.payload.headers;

        const subject = headers.find((h) => h.name === "Subject")?.value;
        const from = headers.find((h) => h.name === "From")?.value;
        const date = headers.find((h) => h.name === "Date")?.value;
        const snippet = msg.data.snippet;

        return { subject, from, date, snippet };
      })
    );

    res.json({
      success: true,
      emails: emailDetails,
    });
  } catch (err) {
    console.error("Error fetching emails:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};