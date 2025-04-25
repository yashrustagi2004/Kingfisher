// models/userSettings.js
const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  autoCheckEmails: {
    type: Boolean,
    default: false
  },
  lastChecked: {
    type: Date,
    default: null
  },
  checkFrequency: {
    type: Number, // Hours between checks
    default: 0.0167
  }
});

module.exports = mongoose.model("UserSettings", userSettingsSchema);