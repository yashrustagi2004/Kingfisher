// controllers/translateController.js
const axios = require('axios');

const libreTranslateURL = 'http://localhost:3000';

const detectLanguage = async (text) => {
  const res = await axios.post(`${libreTranslateURL}/detect`, {
    q: text
  });
  return res.data[0]?.language || 'en';
};

const translateIfNeeded = async (req, res) => {
  try {
    const { subject, content } = req.body;

    const allText = `${subject} ${content}`.trim();
    const lang = await detectLanguage(allText);

    // No translation needed
    if (lang === 'en') {
      return res.json({ subject, content, originalLang: lang });
    }

    const translated = await axios.post(`${libreTranslateURL}/translate`, {
      q: allText,
      source: lang,
      target: 'en',
      format: 'text',
    });

    const translatedText = translated.data.translatedText;

    // Attempt to split back to subject and content (best-effort)
    const [translatedSubject, ...rest] = translatedText.split(' ');
    const translatedContent = rest.join(' ');

    res.json({
      subject: translatedSubject || subject, // fallback just in case
      content: translatedContent || translatedText,
      originalLang: lang,
    });

  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: 'Translation failed' });
  }
};


// 🆕 New controller to log translated email
const logTranslatedEmail = (req, res) => {
  const { subject, content, originalLang } = req.body;

  console.log("\n📨 Translated Email Logged:");
  console.log("Subject:", subject);
  console.log("Content (translated to English):", content);
  console.log("Original Language:", originalLang);

  console.log("--------------------------------------------------");

  res.status(200).json({ success: true });
};

module.exports = {
  translateIfNeeded,
  logTranslatedEmail
};
