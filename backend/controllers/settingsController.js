const User = require("../models/user");
const TrustedDomains = require("../models/trusted")

exports.getTrustedDomains = async (req, res) => {
  try {
    const trustedData = await TrustedDomains.findAll();
    if (!trustedData || !trustedData.domains) {
      return res.status(404).json({ message: "No trusted domains found" });
    }
    res.status(200).json({ trustedDomains: trustedData.domains });
  } catch (error) {
    console.error("Error fetching trusted domains:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.addTrustedDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    console.log("Add domain:", domain);

    if (!domain) {
      return res.status(400).json({ success: false, message: "Domain is required" });
    }

    // Find the trusted domains document (assuming a single document stores the array)
    let trustedData = await TrustedDomains.findOne();

    if (!trustedData) {
      // If no document exists, create a new one
      trustedData = new TrustedDomains({ domains: [domain] });
    } else {
      // Add the domain if it doesn’t already exist
      if (!trustedData.domains.includes(domain)) {
        trustedData.domains.push(domain);
      } else {
        return res.status(400).json({ success: false, message: "Domain already exists" });
      }
    }

    // Save the updated document
    await trustedData.save();

    res.status(201).json({ success: true, message: "Domain added successfully", domains: trustedData.domains });
  } catch (error) {
    console.error("Error adding trusted domain:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
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
