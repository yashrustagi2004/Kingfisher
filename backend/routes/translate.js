// routes/translate.js
const express = require('express');
const router = express.Router();
const { translateIfNeeded, logTranslatedEmail } = require('../controllers/translateController');

// Route for translating email content
router.post('/translate', translateIfNeeded);

// ✅ New route to log translated data to your terminal
router.post('/translate/log', (req, res) => {
    console.log("📨 Logged translation:\n", JSON.stringify(req.body, null, 2));
    res.status(200).json({ message: "Logged to terminal" });
  });
  

module.exports = router;
