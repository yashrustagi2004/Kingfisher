// emailResults.js
const mongoose = require('mongoose');

const emailResultSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    index: true
  },
  processedIds: { // You might not strictly need this if timestamp logic works well
    type: [String] // Keep for potential future use or different strategies
  },
  lastEmailTimestamp: { // Timestamp of the newest email processed in the last run
    type: Number, // Store as milliseconds since epoch
    default: 0,
    index: true // Index for faster retrieval
  },
  emails: [{
    subject: String,
    from: String,
    date: String, // Keep the original date header string for display
    internalDate: Number, // Store the internal message date (ms) for sorting/filtering
    messageId: String, // Store message ID for reference
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
emailResultSchema.index({ googleId: 1, lastEmailTimestamp: -1 }); // Add index for timestamp lookup

module.exports = mongoose.model("EmailResult", emailResultSchema);