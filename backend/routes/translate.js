// routes/translate.js
const express = require('express');
const router = express.Router();
const { translateIfNeeded } = require('../controllers/translateController');

// Route for translating email content
router.post('/translate', translateIfNeeded);

// ✅ New route to log translated data to your terminal
router.post('/translate/log', (req, res) => {
    console.log("📨 Logged translation:");
    console.log("  Subject:", req.body.emailSubject);
    console.log("  Original Language:", req.body.originalLanguage);
    console.log("  Content (English):", req.body.emailContentEnglish);
    console.log("--------------------------------------------------");
    res.status(200).json({ message: "Logged to terminal" });
  });

module.exports = router;