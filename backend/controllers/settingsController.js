const User = require("../models/user");
const TrustedDomains = require("../models/trusted");
const EmailResult = require("../models/emailResults");
const UserSettings = require("../models/userSettings");
const TokenStorage = require("../models/tokenStorage");
const UserAnalysis = require('../models/userAnalysis');

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

exports.getAnalysis = async (req, res) => {
  try {
    // Use googleId from request parameter or header (ensure consistency)
    const googleId = req.params.googleId || req.headers.authorization; // Adjust as needed

    if (!googleId) {
      return res.status(400).json({ success: false, message: "No Google ID provided." });
    }

    const analysisData = await UserAnalysis.findOne({ googleId: googleId });

    if (analysisData) {
      // Map database fields to the expected response fields
      res.status(200).json({
        success: true,
        totalEmailsScanned: analysisData.totalEmailsProcessed,
        suspiciousEmails: analysisData.maliciousEmailsCount, // Map maliciousEmailsCount to suspiciousEmails
        // You could add the senders list if needed by the frontend:
        maliciousSenders: analysisData.maliciousSenders,
        lastUpdated: analysisData.lastUpdated
      });
    } else {
      // No analysis data found for this user yet, return defaults
      res.status(200).json({
        success: true,
        totalEmailsScanned: 0,
        suspiciousEmails: 0,
        // maliciousSenders: [],
        lastUpdated: null // Or new Date(0) or omit
      });
    }
  } catch (error) {
    console.error("Error getting analysis data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve analysis data.",
      error: error.message,
    });
  }
};

exports.getMaliciousDomains = (req, res) => {
  const malicious = ["phishy.com", "scamlink.net"];
  return res.json({ malicious });
};

exports.getTips = (req, res) => {
  const tips = [
    "Think before you click — avoid links or attachments from unknown or unexpected sources.",
    "Double-check the sender's email address, especially for messages that request sensitive information.",
    "Protect your accounts with two-factor authentication (2FA) wherever possible.",
    "Keep your operating system, browser, and antivirus software regularly updated to guard against known threats.",
    "Never share personal information like passwords, PINs, or OTPs through email or over the phone.",
    "Use strong, unique passwords for every account — and consider using a reputable password manager.",
    "Watch out for emails with urgent, threatening, or emotional language — it’s a common phishing tactic.",
    "Hover over links to preview URLs before clicking, and avoid shortened or suspicious-looking links.",
    "Report suspicious emails to your IT team or email provider — helping others stay safe too.",
  ];
  return res.json({ tips });
};

exports.getAboutUs = (req, res) => {
  const about = [
    "Welcome to Kingfisher — your trusted ally in the fight against phishing threats.",
    "Our mission is to create a safer digital world by empowering users with awareness and equipping systems with intelligent, cutting-edge technology.",
    "Phishing attacks continue to evolve, using deceptive emails to trick individuals into revealing sensitive information like passwords, financial credentials, and personal data.",
    "Traditional rule-based systems often fall short in identifying these sophisticated tactics.",
    "To tackle this, Kingfisher is developing an advanced phishing email detection system powered by Natural Language Processing (NLP) and Machine Learning.",
    "Our solution intelligently analyzes email content, identifies subtle patterns and red flags, and accurately classifies emails as legitimate or malicious.",
    "By reducing false positives and improving detection accuracy, we aim to strengthen email security and protect users from ever-changing phishing attacks.",
    "At Kingfisher, we believe that a secure inbox is the first step to a secure digital life."
  ];
  return res.json({ about });
};

exports.deleteAccount = async (req, res) => {
  try {
    const googleId = req.params.googleId;
    if (!googleId) {
      return res.status(400).json({ success: false, message: "Google ID is missing" });
    }
    
    // Delete all user data across all collections
    const deletionPromises = [
      User.findOneAndDelete({ googleId }),
      TrustedDomains.findOneAndDelete({ googleId }),
      EmailResult.findOneAndDelete({ googleId }),
      UserSettings.findOneAndDelete({ googleId }),
      TokenStorage.findOneAndDelete({googleId}),
      UserAnalysis.findOneAndDelete({ googleId })
      // Add any other collections that store user data
    ];
    
    // Wait for all deletion operations to complete
    const results = await Promise.all(deletionPromises);
    
    // Check if user was found and deleted
    if (!results[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Log successful deletion of each data type
    console.log(`✅ User data deleted for Google ID: ${googleId}`);
    
    res.json({ success: true, message: "Account and all related data deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};