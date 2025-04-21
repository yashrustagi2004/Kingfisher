/* global chrome */
import React, { useEffect, useState } from "react";
import "../styles/loginComponent.css";

const API_BASE_URL = "http://localhost:4000"; // Adjust if deployed

function LoginComponent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [autoCheckEmails, setAutoCheckEmails] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["token", "userId", "enabled"], async (result) => {
      if (result.token && result.userId) {
        setIsLoggedIn(true);
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${result.token}` },
        });
        const user = await userRes.json();
        setUserInfo({ ...user, googleId: result.userId });
        fetchAutoCheckStatus(result.userId);
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
          try {
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const user = await res.json();

            chrome.storage.local.set(
              {
                token,
                userId: user.sub,
                enabled: true,
              },
              () => console.log("User data saved to storage")
            );

            await fetch(`${API_BASE_URL}/auth/google/userinfo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...user, token }),
            });

            setUserInfo({ ...user, googleId: user.sub });
            setIsLoggedIn(true);
            fetchAutoCheckStatus(user.sub);
          } catch (err) {
            console.error("Failed to fetch/send user info:", err);
          }
        }
      });
    }
  };

  const fetchAutoCheckStatus = async (googleId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/gmail/auto-check-status?googleId=${googleId}`);
      const data = await response.json();
      if (data.success) {
        setAutoCheckEmails(data.autoCheckEmails);
      }
    } catch (error) {
      console.error("Error fetching auto-check status:", error);
    }
  };

  const toggleAutoCheck = async (enabled) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/gmail/toggle-auto-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleId: userInfo.googleId,
          autoCheckEmails: enabled,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAutoCheckEmails(enabled);
        showNotification(`Auto-check ${enabled ? "enabled" : "disabled"} successfully`);
        if (enabled) {
          chrome.storage.local.get("token", async (result) => {
            await fetch(`${API_BASE_URL}/api/gmail/force-check`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                googleId: userInfo.googleId,
                token: result.token,
              }),
            });
          });
        }
      } else {
        showNotification("Failed to update setting", "error");
      }
    } catch (err) {
      console.error("Error toggling auto-check:", err);
      showNotification("Error updating setting", "error");
    }
  };

  const handleToggleChange = (e) => {
    const newState = e.target.checked;
    setIsEnabled(newState);
    chrome.storage.local.set({ enabled: newState }, () => {
      console.log("Extension toggled:", newState);
    });
  };

  const handleSettingsClick = () => {
    if (!isEnabled) return;
    chrome.tabs.create({ url: "settings.html" });
  };

  const handleLogout = () => {
    chrome.storage.local.clear(() => {
      setIsLoggedIn(false);
      setUserInfo(null);
      setAutoCheckEmails(false);
    });
  };

  const showNotification = (message, type = "success") => {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);
    setTimeout(() => (notification.style.opacity = "1"), 10);
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => document.body.removeChild(notification), 500);
    }, 3000);
  };

  return (
    <div className="container">
      <div className="login-card">
        <div className="brand">Kingfisher</div>

        {!isLoggedIn ? (
          <button id="login-btn" className="login-btn" onClick={handleLoginClick}>
            Sign in with Google
          </button>
        ) : (
          <>
            <div className="user-info">
              <div className="user-details">
                <div className="user-name">{userInfo?.name}</div>
                <div className="user-email">{userInfo?.email}</div>
              </div>
            </div>

            <div className="settings-container">
              <div className="toggle-container">
                <label className="toggle-switch">
                  <span className="toggle-label">Auto-check emails</span>
                  <input
                    type="checkbox"
                    id="autoCheckToggle"
                    checked={autoCheckEmails}
                    onChange={(e) => toggleAutoCheck(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
                <div className="toggle-description">
                  When enabled, emails will be checked automatically in the background
                </div>
              </div>
            </div>

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
                style={{
                  cursor: isEnabled ? "pointer" : "not-allowed",
                  opacity: isEnabled ? 1 : 0.5,
                }}
                title={isEnabled ? "Settings" : "Disabled while extension is OFF"}
              />
              <button id="logoutBtn" className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LoginComponent;
