const User = require("../models/user");

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

    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Error saving user:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
