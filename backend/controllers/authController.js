// controllers/authController.js
const User = require("../models/user");
const TrustedDomains = require("../models/trusted");
const TokenStorage = require('../models/tokenStorage');
const refreshTokenManager = require('../services/refreshTokenManager');

exports.handleGoogleUserInfo = async (req, res) => {
  const { sub, email, name, picture, token } = req.body;
  try {
    // Check if user exists
    let user = await User.findOne({ googleId: sub });
    if (!user) {
      // Create new user
      user = new User({ googleId: sub, email, name, picture });
      await user.save();
      console.log("New user created:", user);
    } else {
      console.log("Existing user found:", user);
    }
    
    // Check for trusted domains entry
    let trustedEntry = await TrustedDomains.findOne({ googleId: sub });
    if (!trustedEntry) {
      // Create a new entry with an empty Domains array
      trustedEntry = new TrustedDomains({ googleId: sub, Domains: [] });
      await trustedEntry.save();
    }
    
    // Store token if provided
    if (token) {
      await refreshTokenManager.storeInitialTokens(
        sub, // googleId
        null, // Chrome extension auth doesn't provide refresh tokens
        token, // access token
        3600  // Default expiry of 1 hour if not specified
      );
    }
    
    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Error in Google authentication:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.handleGoogleCallback = async (req, res) => {
  try {
    // This function would be called during the OAuth callback flow
    // Extract tokens and user profile from the OAuth response
    const { token, tokens, userProfile } = req.body; // Handle both formats
    
    if (tokens && tokens.refresh_token) {
      // If full OAuth tokens object is provided
      await refreshTokenManager.storeInitialTokens(
        userProfile.sub, // googleId
        tokens.refresh_token,
        tokens.access_token,
        tokens.expires_in
      );
    } else if (token) {
      // If only access token is provided (Chrome extension case)
      await refreshTokenManager.storeInitialTokens(
        userProfile.sub, // googleId
        null,
        token,
        3600 // Default expiry
      );
    }
    
    // Redirect or respond as needed in your OAuth flow
    res.status(200).json({ success: true, message: 'Authentication successful' });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Add a method to refresh tokens if needed
exports.refreshTokens = async (req, res) => {
  try {
    const { googleId } = req.body;
    
    if (!googleId) {
      return res.status(400).json({ success: false, error: 'Google ID is required' });
    }
    
    const newTokens = await refreshTokenManager.refreshAccessToken(googleId);
    res.status(200).json({ success: true, tokens: newTokens });
  } catch (err) {
    console.error("Error refreshing token:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get stored tokens for a user
exports.getTokens = async (req, res) => {
  try {
    const { googleId } = req.params;
    
    if (!googleId) {
      return res.status(400).json({ success: false, error: 'Google ID is required' });
    }
    
    const tokenData = await TokenStorage.findOne({ googleId });
    if (!tokenData) {
      return res.status(404).json({ success: false, error: 'No tokens found for this user' });
    }
    
    res.status(200).json({ success: true, tokens: tokenData });
  } catch (err) {
    console.error("Error retrieving tokens:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Add a method to get a valid access token
exports.getAccessToken = async (req, res) => {
  try {
    const { googleId } = req.params;
    
    if (!googleId) {
      return res.status(400).json({ success: false, error: 'Google ID is required' });
    }
    
    const tokenData = await refreshTokenManager.getValidAccessToken(googleId);
    res.status(200).json({ success: true, accessToken: tokenData.accessToken });
  } catch (err) {
    console.error("Error getting access token:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};