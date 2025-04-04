const User = require("../models/user");
const TrustedDomains = require("../models/trusted");

exports.handleGoogleUserInfo = async (req, res) => {
  const { sub, email, name, picture } = req.body;
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
    let trustedEntry = await TrustedDomains.findOne({ googleId: sub });
    if (!trustedEntry) {
    // Create a new entry with an empty Domains array
    trustedEntry = new TrustedDomains({ googleId: sub, Domains: [] });
    await trustedEntry.save();
    }
    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Error saving user:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
