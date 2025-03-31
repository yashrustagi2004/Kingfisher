const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");

// Home Route
router.get("/home", settingsController.getHomeData);

// Trusted Domains Routes
router.get("/trusted-domains", settingsController.getTrustedDomains);
router.post("/trusted-domains", settingsController.addTrustedDomain);

// Analysis Route
router.get("/analysis", settingsController.getAnalysis);

// Malicious Domains Route
router.get("/malicious-domains", settingsController.getMaliciousDomains);

// Tips Route
router.get("/tips", settingsController.getTips);

// Delete Account Route
router.delete("/delete-account/:googleId", settingsController.deleteAccount);

module.exports = router;
