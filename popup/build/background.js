chrome.runtime.onInstalled.addListener(() => {
    console.log("Kingfisher extension installed.");
  });
  
  // Listener to handle messages from popup or content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_AUTH_TOKEN") {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error("Auth Error:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError });
        } else {
          console.log("Token retrieved:", token);
          sendResponse({ success: true, token });
        }
      });
  
      // Required for async sendResponse
      return true;
    }
  });
  