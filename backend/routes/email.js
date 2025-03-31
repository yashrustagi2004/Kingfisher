const express = require("express");
const router = express.Router();
const emailController = require("../controllers/emailController.js");

router.post("/gmail/extract", emailController.getGmailEmails);

module.exports = router;