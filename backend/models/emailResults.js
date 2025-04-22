// models/emailResults.js
const mongoose = require("mongoose");

const emailResultSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    index: true
  },
  emails: [{
    subject: String,
    from: String,
    date: String,
    snippet: String,
    securityStatus: String,
    securityDetails: Object,
    urls: [String]
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index for more efficient queries
emailResultSchema.index({ googleId: 1, lastUpdated: -1 });

module.exports = mongoose.model("EmailResult", emailResultSchema);