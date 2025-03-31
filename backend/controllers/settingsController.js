const User = require("../models/user");

exports.getHomeData = async (req, res) => {
  const homeData = {
    message: "Welcome to the Email Security Dashboard!",
    totalUsers: 500, // Replace with actual DB count
    totalScannedEmails: 10001, // Replace with actual DB data
  };
  res.json(homeData);
};

exports.getTrustedDomains = async (req, res) => {
  return res.json({ domains: ["gmail.com", "outlook.com"] });
};

exports.addTrustedDomain = async (req, res) => {
  const { domain } = req.body;
  console.log("Add domain:", domain);
  res.json({ success: true });
};

exports.getAnalysis = (req, res) => {
  const data = {
    totalEmailsScanned: 123,
    suspiciousEmails: 12,
    trustedEmails: 111,
  };
  return res.json(data);
};

exports.getMaliciousDomains = (req, res) => {
  const malicious = ["phishy.com", "scamlink.net"];
  return res.json({ malicious });
};

exports.getTips = (req, res) => {
  const tips = [
    "Never click on suspicious links.",
    "Verify sender email addresses.",
    "Use two-factor authentication.",
  ];
  return res.json({ tips });
};

exports.deleteAccount = async (req, res) => {
  try {
    const googleId = req.params.googleId;

    if (!googleId) {
      return res.status(400).json({ success: false, message: "Google ID is missing" });
    }

    const deleted = await User.findOneAndDelete({ googleId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
