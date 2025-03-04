/* global chrome */

import React, { useState } from 'react';
import '../styles/loginComponent.css'; 

function LoginComponent() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const handleLoginClick = () => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            } else {
                console.log('Access token:', token);
                setIsLoggedIn(true);
                // Store token and proceed
            }
        });
    };

    const handleSettingsClick = () => {
  
        window.location.href = 'http://localhost:3000';
    };

    return (
        <div className="container">
            <div className="login-card">
                <div className="brand">Kingfisher</div>

                {!isLoggedIn && (
                    <button id="login-btn" className="login-btn" onClick={handleLoginClick}>
                        Login
                    </button>
                )}

                {isLoggedIn && (
                    <div id="logged-in-options">
                        <label className="toggle-switch">
                            <input type="checkbox" id="toggle-btn" />
                            <span className="slider"></span>
                        </label>
                        <img
                            src="../assets/settings.png"
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