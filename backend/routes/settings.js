const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");


// Trusted Domains Routes
router.get("/trusted-domains", settingsController.getTrustedDomains);
router.post("/trusted-domains", settingsController.addTrustedDomain);
router.delete("/:domain", settingsController.removeTrustedDomain);

// Analysis Route
router.get("/analysis", settingsController.getAnalysis);

// Malicious Domains Route
router.get("/malicious-domains", settingsController.getMaliciousDomains);

// Tips Route
router.get("/tips", settingsController.getTips);

router.get("/about-us", settingsController.getAboutUs)
// Delete Account Route
router.delete("/delete-account/:googleId", settingsController.deleteAccount);

router.post("/update-frequency", settingsController.updateCheckFrequency);

module.exports = router;
