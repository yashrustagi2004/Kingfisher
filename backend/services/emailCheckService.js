// services/emailCheckService.js
const UserSettings = require('../models/userSettings');
const TokenStorage = require('../models/tokenStorage');
const { google } = require('googleapis');
const { getGmailEmails } = require('../controllers/emailController');

async function runBackgroundEmailChecks() {
  console.log('Starting background email checks');
  
  try {
    // Find all users with auto-check enabled
    const usersWithAutoCheck = await UserSettings.find({ autoCheckEmails: true });
    console.log(`Found ${usersWithAutoCheck.length} users with auto-check enabled`);
    
    if (usersWithAutoCheck.length === 0) return;
    
    let refreshCount = 0;
    
    // Process each user
    for (const userSettings of usersWithAutoCheck) {
      const { googleId, lastChecked, checkFrequency } = userSettings;
      
      // Get current time
      const now = new Date();
      
      // Calculate time since last check in minutes (not hours)
      const minutesSinceLastCheck = lastChecked 
        ? (now - new Date(lastChecked)) / (1000 * 60)
        : Number.MAX_SAFE_INTEGER; // If never checked, force a refresh
      
      // Debug output for this specific user
      console.log(`User ${googleId}: ${minutesSinceLastCheck.toFixed(2)} minutes since last check (frequency: ${checkFrequency} hours)`);
      
      // Convert frequency from hours to minutes for comparison
      const frequencyMinutes = checkFrequency * 60;
      
      // Check if enough time has passed - use 1 minute as minimum refresh interval
      const needsRefresh = minutesSinceLastCheck >= Math.max(1, frequencyMinutes);
      
      if (needsRefresh) {
        console.log(`User ${googleId} needs a refresh`);
        refreshCount++;
        
        try {
          // Get the user's tokens
          const tokenData = await TokenStorage.findOne({ googleId });
          
          if (!tokenData || !tokenData.accessToken) {
            console.log(`Skipping user ${googleId}: No valid token found`);
            continue;
          }
          
          // Check if token is expired
          if (tokenData.expiresAt < now) {
            console.log(`Token expired for user ${googleId}, attempting refresh`);
            
            // If no refresh token available, skip
            if (!tokenData.refreshToken) {
              console.log(`Skipping user ${googleId}: No refresh token available`);
              continue;
            }
            
            // Refresh the token
            try {
              const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
              );
              
              oauth2Client.setCredentials({
                refresh_token: tokenData.refreshToken
              });
              
              const { credentials } = await oauth2Client.refreshAccessToken();
              
              // Update token in database
              await TokenStorage.findOneAndUpdate(
                { googleId },
                {
                  accessToken: credentials.access_token,
                  expiresAt: new Date(Date.now() + credentials.expires_in * 1000)
                }
              );
              
              tokenData.accessToken = credentials.access_token;
              console.log(`Successfully refreshed token for user ${googleId}`);
            } catch (refreshError) {
              console.error(`Failed to refresh token for user ${googleId}:`, refreshError);
              continue;
            }
          }
          
          // Create mock request and response objects
          const mockReq = {
            body: {
              token: tokenData.accessToken,
              googleId,
              forceRefresh: false
            }
          };
          
          let emailsProcessed = false;
          const mockRes = {
            json: (data) => {
              console.log(`Successfully processed emails for user ${googleId}: ${data.emails.length} emails`);
              emailsProcessed = true;
            },
            status: (code) => ({
              json: (data) => {
                console.error(`Error (${code}) processing emails for user ${googleId}:`, data.error);
              }
            })
          };
          
          // Process emails
          await getGmailEmails(mockReq, mockRes);
          
          // Update lastChecked timestamp if emails were successfully processed
          if (emailsProcessed) {
            await UserSettings.findOneAndUpdate(
              { googleId },
              { lastChecked: new Date() }
            );
          }
          
        } catch (userError) {
          console.error(`Error processing user ${googleId}:`, userError);
        }
      }
    }
    
    console.log(`${refreshCount} users needed a refresh`);
    
  } catch (error) {
    console.error('Error in background email checks:', error);
  }
  
  console.log('Completed background email checks');
}

module.exports = { runBackgroundEmailChecks };