// services/emailCheckService.js

const { google } = require('googleapis');
const UserSettings = require('../models/userSettings');
const EmailResult = require('../models/emailResults');
const User = require('../models/user');
const refreshTokenManager = require('./refreshTokenManager'); // You'll need to implement this
const { getGmailEmails } = require('../controllers/emailController');

/**
 * Background service to check emails for users with auto-check enabled
 * This function should be called on a schedule, e.g., via a cron job
 */
async function runBackgroundEmailChecks() {
  try {
    console.log('Starting background email checks');
    
    // Find all users with auto-check enabled
    const usersWithAutoCheck = await UserSettings.find({ autoCheckEmails: true });
    console.log(`Found ${usersWithAutoCheck.length} users with auto-check enabled`);
    
    // Check if any users need an email refresh based on their check frequency
    const now = new Date();
    const usersNeedingRefresh = usersWithAutoCheck.filter(settings => {
      if (!settings.lastChecked) return true;
      
      const hoursSinceLastCheck = (now - settings.lastChecked) / (1000 * 60 * 60);
      return hoursSinceLastCheck >= settings.checkFrequency;
    });
    
    console.log(`${usersNeedingRefresh.length} users need a refresh`);
    
    // Process each user that needs a refresh
    for (const settings of usersNeedingRefresh) {
      try {
        // Get user information
        const user = await User.findOne({ googleId: settings.googleId });
        if (!user) {
          console.warn(`User with Google ID ${settings.googleId} not found`);
          continue;
        }
        
        // Get a fresh access token (you'll need to implement refreshTokenManager)
        const token = await refreshTokenManager.getAccessToken(settings.googleId);
        if (!token) {
          console.warn(`Could not get access token for user ${user.email}`);
          continue;
        }
        
        // Create mock request and response objects to use with the controller
        const req = {
          body: {
            token,
            googleId: settings.googleId
          }
        };
        
        let emailResults = null;
        
        // Create a custom response object to capture the controller's response
        const res = {
          json: (data) => {
            if (data.success) {
              emailResults = data.emails;
            }
          },
          status: () => {
            return {
              json: () => {} // No-op for error case
            };
          }
        };
        
        // Call the email controller function
        await getGmailEmails(req, res);
        
        // If we got results, update the database
        if (emailResults) {
          // Update the email results in the database
          await EmailResult.findOneAndUpdate(
            { googleId: settings.googleId },
            { 
              googleId: settings.googleId,
              emails: emailResults,
              lastUpdated: new Date()
            },
            { new: true, upsert: true }
          );
          
          // Update the last checked timestamp
          await UserSettings.findOneAndUpdate(
            { googleId: settings.googleId },
            { lastChecked: new Date() }
          );
          
          console.log(`Successfully checked emails for ${user.email}`);
        }
      } catch (userError) {
        console.error(`Error processing user ${settings.googleId}:`, userError);
        // Continue with the next user
      }
    }
    
    console.log('Completed background email checks');
  } catch (error) {
    console.error('Error in background email checks:', error);
  }
}

module.exports = { runBackgroundEmailChecks };