const express = require("express");
const router = express.Router();
const { handleGoogleUserInfo } = require("../controllers/authController");

router.post("/google/userinfo", handleGoogleUserInfo);

module.exports = router;
