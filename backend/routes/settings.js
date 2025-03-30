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

// Delete Account
router.delete("/delete-account/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    await User.findByIdAndDelete(userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
