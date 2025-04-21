const express = require("express");
const router = express.Router();
const emailController = require("../controllers/emailController.js");

router.post("/gmail/extract", emailController.getGmailEmails);

// New routes for auto-check functionality
router.post("/gmail/toggle-auto-check", emailController.toggleAutoCheck);
router.get("/gmail/auto-check-status", emailController.getAutoCheckStatus);
router.post("/gmail/force-check", emailController.forceCheckEmails);

module.exports = router;