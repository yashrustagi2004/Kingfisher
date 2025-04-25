// scripts/resetChecks.js
const mongoose = require('mongoose');
const UserSettings = require('../models/userSettings');
require('dotenv').config();

async function resetLastCheckedTimestamps() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Update all users to reset their lastChecked timestamp
    const result = await UserSettings.updateMany(
      {}, // Match all documents
      { $set: { lastChecked: null } } // Reset lastChecked
    );
    
    console.log(`Reset lastChecked for ${result.modifiedCount} users`);
    
    // Disconnect
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error resetting timestamps:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  resetLastCheckedTimestamps()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { resetLastCheckedTimestamps };