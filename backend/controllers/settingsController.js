const User = require("../models/user");
const TrustedDomains = require("../models/trusted")

exports.getTrustedDomains = async (req, res) => {
  try {
    const googleId = req.headers.authorization;

    if (!googleId) {
      return res.status(400).json({
        success: false,
        message: "No Google ID provided.",
      });
    }

    const trustedDomains = await TrustedDomains.findOne({ googleId: googleId });

    if (trustedDomains) {
      res.status(200).json({ success: true, domains: trustedDomains.Domains || [] });
    } else {
      res.status(200).json({ success: true, domains: [] });
    }
  } catch (error) {
    console.error("Error getting trusted domains:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve trusted domains.",
      error: error.message,
    });
  }
};

exports.addTrustedDomain = async (req, res) => {
  try {
    const googleId = req.headers.authorization;
    const { domain } = req.body;

    if (!googleId) {
      return res.status(400).json({
        success: false,
        message: "No Google ID provided.",
      });
    }

    let trustedDomains = await TrustedDomains.findOne({ googleId: googleId });

    if (!trustedDomains) {
      trustedDomains = new TrustedDomains({ googleId: googleId, Domains: [domain] });
    } else if (!trustedDomains.Domains.includes(domain)) {
      trustedDomains.Domains.push(domain);
    } else {
      return res.status(400).json({ success: false, message: "Domain already exists." });
    }

    await trustedDomains.save();

    res.status(201).json({ success: true, message: "Domain added successfully." });
  } catch (error) {
    console.error("Error adding trusted domain:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add trusted domain.",
      error: error.message,
    });
  }
};

exports.removeTrustedDomain = async (req, res) => {
  try {
    const googleId = req.headers.authorization;
    const domainToRemove = req.params.domain;

    console.log("Attempting to remove domain:", domainToRemove, "for user:", googleId);

    const result = await TrustedDomains.findOneAndUpdate(
      { googleId: googleId },
      { $pull: { Domains: domainToRemove } }
    );

    if (result) {
      console.log("Domain removal attempted for user:", googleId);
      res.status(200).json({ success: true, message: "Domain removed successfully." });
    } else {
      console.log("User domains not found for googleId:", googleId);
      return res.status(404).json({ success: false, message: "User domains not found." });
    }
  } catch (error) {
    console.error("Error removing trusted domain:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove domain.",
      error: error.message,
    });
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

exports.getAboutUs = (req, res) => {
  const about = [
    "We are kingfisher.",
    "We do anti fishing"
  ];
  return res.json({ about })
};

exports.deleteAccount = async (req, res) => {
  try {
    const googleId = req.params.googleId;

    if (!googleId) {
      return res.status(400).json({ success: false, message: "Google ID is missing" });
    }

    const Udeleted = await User.findOneAndDelete({ googleId });
    const TDdeleted= await TrustedDomains.findOneAndDelete({ googleId });
    if (!Udeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!TDdeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};