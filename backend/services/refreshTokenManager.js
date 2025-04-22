// services/refreshTokenManager.js
const TokenStorage = require('../models/tokenStorage');
const axios = require('axios');

// You might need to add the Google OAuth configuration
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const refreshTokenManager = {
  // Store initial tokens after authentication
  storeInitialTokens: async (googleId, refreshToken, accessToken, expiresIn) => {
    try {
      // Calculate expiration time
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      
      // Build update object
      const updateData = {
        accessToken,
        expiresAt,
        updatedAt: Date.now()
      };
      
      // Only include refreshToken if it exists
      if (refreshToken) {
        updateData.refreshToken = refreshToken;
      }
      
      // Find and update or create new token document
      await TokenStorage.findOneAndUpdate(
        { googleId },
        updateData,
        { upsert: true, new: true }
      );
      
      console.log(`Tokens stored for user ${googleId}`);
      return true;
    } catch (error) {
      console.error('Error storing tokens:', error);
      throw error;
    }
  },
  
  // Get tokens for a user, refreshing if necessary
  getValidAccessToken: async (googleId) => {
    try {
      // Find tokens in database
      const tokenData = await TokenStorage.findOne({ googleId });
      
      if (!tokenData) {
        throw new Error('No tokens found for this user');
      }
      
      // Check if token is expired or about to expire (within 5 minutes)
      const isExpired = new Date(tokenData.expiresAt) <= new Date(Date.now() + 5 * 60 * 1000);
      
      if (isExpired) {
        // If token is expired and we have a refresh token, refresh it
        if (tokenData.refreshToken) {
          return await refreshTokenManager.refreshAccessToken(googleId);
        } else {
          // If we don't have a refresh token, we can't refresh automatically
          throw new Error('Token expired and no refresh token available');
        }
      } else {
        // Return existing access token
        return {
          accessToken: tokenData.accessToken,
          expiresAt: tokenData.expiresAt
        };
      }
    } catch (error) {
      console.error('Error getting valid access token:', error);
      throw error;
    }
  },
  
  // Refresh the access token using the refresh token
  refreshAccessToken: async (googleId) => {
    try {
      // Get current token data
      const tokenData = await TokenStorage.findOne({ googleId });
      
      if (!tokenData || !tokenData.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      // Make request to Google to refresh token
      const response = await axios.post(GOOGLE_TOKEN_URL, {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refreshToken,
        grant_type: 'refresh_token'
      });
      
      // Extract new tokens
      const { access_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      
      // Update in database
      const updatedTokenData = await TokenStorage.findOneAndUpdate(
        { googleId },
        {
          accessToken: access_token,
          expiresAt,
          updatedAt: Date.now()
        },
        { new: true }
      );
      
      console.log(`Access token refreshed for user ${googleId}`);
      
      return {
        accessToken: updatedTokenData.accessToken,
        expiresAt: updatedTokenData.expiresAt
      };
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }
};

module.exports = refreshTokenManager;