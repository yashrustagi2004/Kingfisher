/* global chrome */
import React, { useEffect, useState } from "react";
import "../styles/loginComponent.css";

function LoginComponent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    // Check token and toggle state on load
    chrome.storage.local.get(["token", "userId", "enabled"], (result) => {
      if (result.token && result.userId) {
        setIsLoggedIn(true);
      }
      if (result.enabled !== undefined) {
        setIsEnabled(result.enabled);
      }
    });
  }, []);

  const handleLoginClick = () => {
    if (chrome?.identity?.getAuthToken) {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error("Auth Error:", chrome.runtime.lastError);
        } else {
          console.log("Access token:", token);
          setIsLoggedIn(true);

          try {
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${token}` },
            });

            const userInfo = await res.json();
            console.log("User Info:", userInfo);

            chrome.storage.local.set(
              {
                token,
                userId: userInfo.sub,
                enabled: true, // default toggle to ON
              },
              () => {
                console.log("User data saved to storage");
              }
            );

            await fetch("http://localhost:4000/auth/google/userinfo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...userInfo, token }),
            });
          } catch (err) {
            console.error("Failed to fetch/send user info:", err);
          }
        }
      });
    } else {
      console.warn("chrome.identity is not available.");
    }
  };

  const handleSettingsClick = () => {
    if (!isEnabled) return; // Block if extension is off
    chrome.tabs.create({ url: "settings.html" });
  };
  

  const handleToggleChange = (e) => {
    const newState = e.target.checked;
    setIsEnabled(newState);
    chrome.storage.local.set({ enabled: newState }, () => {
      console.log("Extension toggled:", newState);
    });
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
              <input
                type="checkbox"
                id="toggle-btn"
                checked={isEnabled}
                onChange={handleToggleChange}
              />
              <span className="slider"></span>
            </label>
            <img
  src="setting.png"
  id="settings-icon"
  alt="Settings"
  onClick={handleSettingsClick}
  style={{ cursor: isEnabled ? "pointer" : "not-allowed", opacity: isEnabled ? 1 : 0.5 }}
  title={isEnabled ? "Settings" : "Disabled while extension is OFF"}
/>

          </div>
        )}
      </div>
    </div>
  );
}

export default LoginComponent;
