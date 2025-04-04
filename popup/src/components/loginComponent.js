/* global chrome */

import React, { useState } from "react";
import "../styles/loginComponent.css";

function LoginComponent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLoginClick = () => {
    if (chrome?.identity?.getAuthToken) {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error("Auth Error:", chrome.runtime.lastError);
        } else {
          console.log("Access token:", token);
          setIsLoggedIn(true);

          try {
            // ✅ Fetch user info
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            const userInfo = await res.json();
            console.log("User Info:", userInfo);

            // ✅ Store token and userId locally
            chrome.storage.local.set({ token, userId: userInfo.sub }, () => {
              console.log("Token saved to storage");
            });

            // ✅ Send to backend
            await fetch("http://localhost:4000/auth/google/userinfo", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ ...userInfo, token }),
            });
          } catch (err) {
            console.error("Failed to fetch or send user info:", err);
          }
        }
      });
    } else {
      console.warn("chrome.identity is not available.");
    }
  };

  const handleSettingsClick = () => {
    chrome.tabs.create({ url: "settings.html" });
  };

  return (
    <div className="container">
      <div className="login-card">
        <div className="brand">Kingfisher</div>

        {!isLoggedIn ? (
          <button id="login-btn" className="login-btn" onClick={handleLoginClick}>
            Login
          </button>
        ) : (
          <div id="logged-in-options">
            <label className="toggle-switch">
              <input type="checkbox" id="toggle-btn" />
              <span className="slider"></span>
            </label>
            <img
              src="setting.png"
              id="settings-icon"
              alt="Settings"
              onClick={handleSettingsClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginComponent;
