// models/userAnalyses.js
const mongoose = require('mongoose');

const userAnalysesSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true, // Each user should have only one analysis document
    index: true
  },
  totalEmailsProcessed: {
    type: Number,
    default: 0
  },
  maliciousEmailsCount: {
    type: Number,
    default: 0
  },
  maliciousSenders: { // Store unique sender addresses
    type: [String],
    default: []
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Update lastUpdated timestamp automatically on save/update
userAnalysesSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

userAnalysesSchema.pre('findOneAndUpdate', function(next) {
  this.set({ lastUpdated: new Date() });
  next();
});


module.exports = mongoose.model('UserAnalyses', userAnalysesSchema);