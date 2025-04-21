// models/tokenStorage.js
const mongoose = require('mongoose');

const tokenStorageSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  refreshToken: {
    type: String,
    required: false // Changed from required: true to handle Chrome extension case
  },
  accessToken: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TokenStorage', tokenStorageSchema);