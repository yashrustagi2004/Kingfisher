const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Get Trusted Domains (Static or from DB)
router.get("/trusted-domains", async (req, res) => {
    // Example hardcoded
    return res.json({ domains: ["gmail.com", "outlook.com"] });
  });
  

// Add Trusted Domain
router.post("/trusted-domains", async (req, res) => {
  const { domain } = req.body;
  console.log("Add domain:", domain);
  // Save to DB if needed
  res.json({ success: true });
});

// Get Analysis (Placeholder)
router.get("/analysis", (req, res) => {
  const data = {
    totalEmailsScanned: 123,
    suspiciousEmails: 12,
    trustedEmails: 111,
  };
  return res.json(data);
});

// Get Malicious Domains
router.get("/malicious-domains", (req, res) => {
  const malicious = ["phishy.com", "scamlink.net"];
  return res.json({ malicious });
});

// Get Tips
router.get("/tips", (req, res) => {
  const tips = [
    "Never click on suspicious links.",
    "Verify sender email addresses.",
    "Use two-factor authentication.",
  ];
  return res.json({ tips });
});

// Delete Account by Google ID
router.delete('/delete-account/:googleId', async (req, res) => {
    try {
      const googleId = req.params.googleId;
  
      if (!googleId) {
        return res.status(400).json({ success: false, message: 'Google ID is missing' });
      }
  
      const deleted = await User.findOneAndDelete({ googleId });
  
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
  
      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
      console.error('❌ Error deleting account:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });
    

module.exports = router;
