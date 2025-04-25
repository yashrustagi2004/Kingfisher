document.addEventListener("DOMContentLoaded", function () {
  function getTokenAndUserId() {
    return new Promise((resolve, reject) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get(["token", "userId"], (result) => {
          if (result.token && result.userId) {
            resolve({ token: result.token, userId: result.userId });
          } else {
            reject(new Error("Token or userId not found in storage."));
          }
        });
      } else {
        reject(new Error("chrome.storage.local is not available."));
      }
    });
  }
    // Add a notification function to script.js if not already there
  function showNotification(message, type = 'success') {
    // Check if notification container exists, if not create it
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.id = 'notification-container';
      notificationContainer.style.position = 'fixed';
      notificationContainer.style.top = '20px';
      notificationContainer.style.right = '20px';
      notificationContainer.style.zIndex = '9999';
      document.body.appendChild(notificationContainer);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.backgroundColor = type === 'success' ? '#4CAF50' : '#F44336';
    notification.style.color = 'white';
    notification.style.padding = '12px 16px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    notification.textContent = message;
    
    // Add to container
    notificationContainer.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 10);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notificationContainer.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // Email popup setup function
  function setupEmailPopupListeners() {
    const emailItems = document.querySelectorAll('.email-item');
    const modal = document.getElementById('emailModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    // Add click event to each email item
    emailItems.forEach(item => {
      item.addEventListener('click', function() {
        const index = this.getAttribute('data-index');
        const email = window.emailData[index];
        
        // Set modal title
        modalTitle.textContent = email.subject;
        
        // Build modal content
        modalContent.innerHTML = `
        <div class="email-details">
          <p><strong>From:</strong> ${email.from}</p>
          <p><strong>Date:</strong> ${email.date}</p>
          <p><strong>Status:</strong> 
            <span class="${email.securityStatus === 'safe' ? 'security-pass' : 'security-fail'}">
              ${email.securityStatus === 'safe' ? 'SAFE' : 'SUSPICIOUS'}
            </span>
          </p>
          <p><strong>Snippet:</strong> ${email.snippet}</p>
        </div>
        
        <div class="security-details">
          <h4>Security Details</h4>
          <div class="security-item ${email.securityDetails.spf.pass ? 'security-pass' : 'security-fail'}">
            <strong>SPF:</strong> ${email.securityDetails.spf.details}
          </div>
          <div class="security-item ${email.securityDetails.dkim.pass ? 'security-pass' : 'security-fail'}">
            <strong>DKIM:</strong> ${email.securityDetails.dkim.details}
          </div>
          <div class="security-item ${email.securityDetails.dmarc.pass ? 'security-pass' : 'security-fail'}">
            <strong>DMARC:</strong> ${email.securityDetails.dmarc.details}
          </div>
          ${email.securityDetails.urlCheck ? `
          <div class="security-item ${email.securityDetails.urlCheck.pass ? 'security-pass' : 'security-fail'}">
            <strong>URL Check:</strong> ${email.securityDetails.urlCheck.details}
          </div>
          ` : ''}
          ${email.securityDetails.nlpCheck ? `
          <div class="security-item ${email.securityDetails.nlpCheck.pass ? 'security-pass' : 'security-fail'}">
            <strong>NLP Check:</strong> ${email.securityDetails.nlpCheck.details}
          </div>
          ` : ''}
        </div>
        
        ${email.urls && email.urls.length > 0 ? `
        <div class="url-section">
          <h4>URLs in this email (${email.urls.length})</h4>
          <ul class="url-list">
            ${email.urls.map(url => `<li class="url-item">${url}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
      `;
              
        // Show modal
        modal.style.display = 'block';
      });
    });
    
    // Close modal on close button click
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
      });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  const navItems = document.querySelectorAll(".nav-item");
  const contentTitle = document.getElementById("content-title");
  const contentBody = document.getElementById("content-body");


  const routes = {
    home: async () => {
      contentTitle.innerText = "Emails";
      contentBody.innerHTML = "<p>Loading your latest Gmail messages...</p>";
      
      try {
        const { token, userId } = await getTokenAndUserId();
    
        const response = await fetch(
          "http://localhost:4000/api/gmail/extract",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token: token, googleId: userId }),
          }
        );
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          const emails = data.emails;
          
          // Show cache status if applicable
          let cacheNotice = '';
          if (data.fromCache) {
            const lastUpdated = new Date(data.lastUpdated);
            const formattedDate = lastUpdated.toLocaleString();
            cacheNotice = `
              <div class="cache-notice">
                <span>Showing cached results from ${formattedDate}</span>
                <button id="refreshBtn" class="refresh-btn">Refresh Now</button>
              </div>
            `;
          }
          
          if (emails.length > 0) {
            // Add CSS for the email list and popup
            contentBody.innerHTML = `
              <style>
                .email-list {
                  list-style-type: none;
                  padding: 0;
                }
                .email-item {
                  border: 1px solid #ddd;
                  border-radius: 8px;
                  margin-bottom: 10px;
                  padding: 15px;
                  cursor: pointer;
                  transition: background-color 0.2s;
                }
                .email-item:hover {
                  background-color: #f5f5f5;
                }
                .safe-tag {
                  background-color: #4CAF50;
                  color: white;
                  padding: 3px 8px;
                  border-radius: 4px;
                  font-size: 16px;
                  margin-left: 10px;
                }
                .malicious-tag {
                  background-color: #F44336;
                  color: white;
                  padding: 3px 8px;
                  border-radius: 4px;
                  font-size: 16px;
                  margin-left: 10px;
                }
                .email-meta {
                  margin-bottom: 8px;
                }
                
                /* Modal/Popup Styles */
                .modal {
                  display: none;
                  position: fixed;
                  z-index: 1000;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0,0,0,0.4);
                  overflow: auto;
                }
                .modal-content {
                  background-color: #fefefe;
                  margin: 10% auto;
                  padding: 20px;
                  border: 1px solid #888;
                  border-radius: 8px;
                  width: 80%;
                  max-width: 600px;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .close-button {
                  color: #aaa;
                  float: right;
                  font-size: 28px;
                  font-weight: bold;
                  cursor: pointer;
                }
                .close-button:hover {
                  color: black;
                }
                .security-details {
                  margin-top: 15px;
                  padding: 10px;
                  background-color: #f8f8f8;
                  border-radius: 4px;
                }
                .security-item {
                  margin: 8px 0;
                  padding: 5px;
                  border-radius: 4px;
                }
                .security-pass {
                  color: #4CAF50;
                }
                .security-fail {
                  color: #F44336;
                }
                .url-list {
                  margin-top: 15px;
                  padding: 0;
                  list-style-type: none;
                }
                .url-item {
                  padding: 8px;
                  border-bottom: 1px solid #eee;
                  word-break: break-all;
                }
                .url-section {
                  margin-top: 15px;
                }
                .url-section h4 {
                  margin-bottom: 10px;
                },
                .cache-notice {
                  background-color: #f0f8ff;
                  border: 1px solid #cce5ff;
                  border-radius: 4px;
                  padding: 10px;
                  margin-bottom: 15px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .refresh-btn {
                  background-color: #4285f4;
                  color: white;
                  border: none;
                  padding: 6px 12px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  transition: background-color 0.3s;
                }
                .refresh-btn:hover {
                  background-color: #3367d6;
                }
                .loading-spinner {
                  display: inline-block;
                  width: 16px;
                  height: 16px;
                  border: 2px solid rgba(255,255,255,0.3);
                  border-radius: 50%;
                  border-top-color: #fff;
                  animation: spin 1s ease-in-out infinite;
                  margin-left: 8px;
                }
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              </style>
              
              <!-- Modal/Popup container -->
              <div id="emailModal" class="modal">
                <div class="modal-content">
                  <span class="close-button" id="closeModalBtn">&times;</span>
                  <h3 id="modalTitle">Email Details</h3>
                  <div id="modalContent"></div>
                </div>
              </div>
              
              ${cacheNotice}
              
              <ul class="email-list" id="emailListContainer">
                ${emails
                  .map((email, index) => `
                  <li class="email-item" data-index="${index}" style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; padding: 15px; cursor: pointer; transition: background-color 0.2s;">
                    <div class="email-meta" style="margin-bottom: 8px; font-size: 16px;">
                      <strong>From:</strong> ${email.from}
                      <span class="${email.securityStatus === 'safe' ? 'safe-tag' : 'malicious-tag'}">
                        ${email.securityStatus === 'safe' ? 'SAFE' : 'SUSPICIOUS'}
                      </span>
                    </div>
                    <div class="email-meta" style="margin-bottom: 8px; font-size: 16px;"><strong>Subject:</strong> ${email.subject}</div>
                    <div class="email-meta" style="margin-bottom: 8px; font-size: 16px;"><strong>Date:</strong> ${email.date}</div>
                    ${email.urls && email.urls.length > 0 ? 
                      `<div class="email-meta"><strong>URLs:</strong> ${email.urls.length} found</div>` : 
                      ''}
                  </li>`)
                  .join("")}
              </ul>
            `;
            
            // Store email data in a variable accessible to our event handlers
            window.emailData = emails;
            
            // Add event listeners after DOM elements are created
            setupEmailPopupListeners();
            
            // Add refresh button functionality if showing cached data
            if (data.fromCache) {
              document.getElementById('refreshBtn').addEventListener('click', async function(e) {
                const refreshBtn = e.target;
                
                // Show loading state
                refreshBtn.innerHTML = 'Refreshing <span class="loading-spinner"></span>';
                refreshBtn.disabled = true;
                
                try {
                  const { token, userId } = await getTokenAndUserId();
                  
                  // Force a refresh
                  const forceResponse = await fetch(
                    "http://localhost:4000/api/gmail/force-check",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ token: token, googleId: userId }),
                    }
                  );
                  
                  if (forceResponse.ok) {
                    showNotification('Email data refreshed successfully');
                    // Re-render the home view with fresh data
                    routes.home();
                  } else {
                    throw new Error('Failed to refresh data');
                  }
                } catch (error) {
                  console.error('Error refreshing data:', error);
                  showNotification('Failed to refresh data', 'error');
                  
                  // Reset button state
                  refreshBtn.innerHTML = 'Refresh Now';
                  refreshBtn.disabled = false;
                }
              });
            }
          } else {
            contentBody.innerHTML = `
              ${cacheNotice}
              <p>No emails found.</p>
            `;
            
            // Add refresh button functionality if showing cached data
            if (data.fromCache) {
              document.getElementById('refreshBtn').addEventListener('click', async function() {
                routes.home(); // Reload the page
              });
            }
          }
        } else {
          contentBody.innerHTML = `<p>Error: ${
            data.error || "Unable to fetch emails."
          }</p>`;
        }
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading emails: ${error.message}</p>`;
      }
    },

    "trusted-domains": async () => {
      contentTitle.innerText = "Trusted Domains";
      contentBody.innerHTML = `
        <div class="input-container">
          <input type="text" id="domain-input" placeholder="Enter the domain" />
          <button id="insert-domain-btn">Insert</button>
        </div>
        <div id="domains-list">
          <p>Loading trusted domains...</p>
        </div>
      `;

      document.getElementById("insert-domain-btn").addEventListener("click", async () => {
        const domainInput = document.getElementById("domain-input");
        const domain = domainInput.value.trim();

        if (!domain) {
          alert("Please enter a domain");
          return;
        }

        try {
          const { userId } = await getTokenAndUserId();
          const response = await fetch("http://localhost:4000/settings/trusted-domains", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": userId,
            },
            body: JSON.stringify({ domain })
          });

          const data = await response.json();

          if (response.ok && data.success) {
            domainInput.value = "";
            loadTrustedDomains();
          } else {
            alert(`Failed to add domain: ${data.message || "Unknown error"}`);
          }
        } catch (error) {
          alert(`Error adding domain: ${error.message}`);
        }
  });
  
  // Function to load trusted domains
  const loadTrustedDomains = async () => {
    const domainsList = document.getElementById("domains-list");
    try {
      const { userId } = await getTokenAndUserId();
      const response = await fetch("http://localhost:4000/settings/trusted-domains", {
        headers: { Authorization: userId },
      });
      const data = await response.json();
      const domains = data.domains || [];

      if (domains.length > 0) {
        domainsList.innerHTML = `
          <ul class="domains-list">
            ${domains.map(domain => `
              <li class="domain-item" style="font-size:18px;">
                ${domain}
                <button class="remove-domain-btn" style="font-size:16px; padding:10px 20px;" data-domain="${domain}">Remove</button>
              </li>`).join("")}
          </ul>
        `;

        document.querySelectorAll(".remove-domain-btn").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            const domainToRemove = e.target.getAttribute("data-domain");
            try {
              const { userId } = await getTokenAndUserId();
              const baseURL = "http://localhost:4000/settings";
              const deleteURL = `${baseURL}/${encodeURIComponent(domainToRemove)}`;
              const response = await fetch(deleteURL, {
                method: "DELETE",
                headers: {
                  "Authorization": userId,
                }
              });
              const data = await response.json();

              if (response.ok && data.success) {
                loadTrustedDomains();
              } else {
                alert(`Failed to remove domain: ${data.message || "Unknown error"}`);
              }
            } catch (error) {
              alert(`Error removing domain: ${error.message}`);
            }
          });
        });
      } else {
       domainsList.innerHTML = '<p style="font-size:16px;">No trusted domains found.</p>';
      }
    } catch (error) {
      domainsList.innerHTML = `<p>Error loading trusted domains: ${error.message}</p>`;
    }
  };

  loadTrustedDomains();
},


    analysis: async () => {
      contentTitle.innerText = "Analysis";
      contentBody.innerHTML = "<p>Loading...</p>"; // Set loading state initially

      try {
          const authData = await getTokenAndUserId();
          const googleId = authData.userId;

          if (!googleId) { // Double check just in case getTokenAndUserId didn't throw
              contentBody.innerHTML = "<p>Error: User Google ID not available. Please log in.</p>";
              console.error("User Google ID is missing for analysis request after auth check.");
              return;
          }

          const response = await fetch("http://localhost:4000/settings/analysis", {
              headers: { 'Authorization': googleId }
          });

          if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
              throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (data.success) {
              const total = data.totalEmailsScanned || 0; // Use 0 if null/undefined
              const suspicious = data.suspiciousEmails || 0; // Use 0 if null/undefined
              const nonSuspicious = total - suspicious;
              const maliciousSenders = data.maliciousSenders || []; // Use empty array if null/undefined
              const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never';

              // --- Construct the HTML content ---
              let htmlContent = `
      <div style="background-color: #fcebef; padding: 40px; border-radius: 12px; font-family: 'Segoe UI', sans-serif; color: #222;">
        <div style="display: flex; justify-content: center; align-items: flex-start; flex-wrap: wrap; gap: 40px;">

          <div style="font-size: 16px; max-width: 420px; line-height: 1.8; background: #fff; padding: 24px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
            <h3 style="color: #222; font-weight: bold; margin-bottom: 16px; font-size: 20px;">📊 Analysis Summary</h3>
            <p style="margin: 6px 0;"><strong>Total Emails Scanned:</strong> ${total}</p>
            <p style="margin: 6px 0;"><strong>Suspicious Emails Detected:</strong> ${suspicious}</p>
            <p style="margin: 6px 0;"><strong>Last Updated:</strong> ${lastUpdated}</p>

            <div style="margin-top: 25px;">
              <h3 style="color: #222; font-weight: bold; margin-bottom: 10px; font-size: 18px;">🚨 Known Malicious Senders (${maliciousSenders.length})</h3>
              ${maliciousSenders.length > 0
                  ? `<ul style="padding-left: 20px; font-size: 15px; color: #333; margin: 0;">
                      ${maliciousSenders.map(sender => `<li style="margin-bottom: 6px;">${sender}</li>`).join('')}
                    </ul>`
                  : '<p style="color: #666;">No malicious senders identified yet.</p>'
              }
            </div>
          </div>

          <div style="width: 380px; height: 380px; background: #fff; padding: 24px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
            ${total > 0 
                ? '<canvas id="analysisPieChart" style="width: 100% !important; height: 100% !important;"></canvas>' 
                : '<p style="text-align: center; margin-top: 120px; color: #999;">No emails scanned yet to display chart.</p>'}
          </div>
        </div>
      </div>
    `;

              contentBody.innerHTML = htmlContent; // Set the HTML first

              // --- Create the Pie Chart (only if total > 0) ---
              if (total > 0) {
                  const ctx = document.getElementById('analysisPieChart');
                  if (ctx) { // Ensure the canvas element exists
                      new Chart(ctx, {
                          type: 'pie',
                          data: {
                              labels: ['Safe/Other Emails', 'Suspicious Emails'],
                              datasets: [{
                                  data: [nonSuspicious, suspicious],
                                  backgroundColor: [
                                      'rgba(75, 192, 192, 0.6)', // Greenish for safe/other
                                      'rgba(255, 99, 132, 0.6)'  // Reddish for suspicious
                                  ],
                                  borderColor: [
                                      'rgba(75, 192, 192, 1)',
                                      'rgba(255, 99, 132, 1)'
                                  ],
                                  borderWidth: 1
                              }]
                          },
                          options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: {
                              padding: 10 // Optional: Add some internal padding
                            },
                            plugins: {
                              legend: {
                                position: 'top',
                                labels: {
                                  font: {
                                    size: 16 // ⬅️ Makes the legend text larger and more readable
                                  },
                                  padding: 20 // ⬅️ Adds spacing between legend items
                                }
                              },
                              title: {
                                display: true,
                                text: 'Email Scan Distribution',
                                font: {
                                  size: 18 // ⬅️ Make the title slightly bigger
                                },
                                padding: {
                                  top: 10,
                                  bottom: 20
                                }
                              },
                              tooltip: {
                                bodyFont: {
                                  size: 14
                                },
                                titleFont: {
                                  size: 16
                                }
                              }
                            }
                          }
                      });
                  }
              }
              // --- End Create Pie Chart ---

          } else {
              // Backend returned success: false
              contentBody.innerHTML = `<p>Failed to load analysis data: ${data.message || 'An unknown error occurred on the server.'}</p>`;
              console.error("Backend reported failure for analysis:", data);
          }

      } catch (error) {
          // Handle errors from getTokenAndUserId, fetch, or JSON parsing
          contentBody.innerHTML = `<p>Error loading analysis data: ${error.message}</p>`;
          console.error("Error in analysis process:", error);
      }
    },

    // "malicious-domains": async () => {
    //   contentTitle.innerText = "Malicious Domains";
    //   contentBody.innerHTML = "<p>Loading...</p>";
    //   try {
    //     const response = await fetch(
    //       "http://localhost:4000/settings/malicious-domains"
    //     );
    //     const data = await response.json();
    //     const malicious = data.malicious || [];
    //     contentBody.innerHTML = `<ul>${malicious
    //       .map((domain) => `<li>${domain}</li>`)
    //       .join("")}</ul>`;
    //   } catch (error) {
    //     contentBody.innerHTML = `<p>Error loading malicious domains: ${error.message}</p>`;
    //   }
    // },

    tips: async () => {
      contentTitle.innerText = "Tips";
      contentBody.innerHTML = "<p>Loading...</p>";
      
      try {
        const response = await fetch("http://localhost:4000/settings/tips");
        const data = await response.json();
        const tips = data.tips || [];
        
        contentBody.innerHTML = `
          <div class="info-container">
            <ul class="info-list">
              ${tips.map((tip) => `<li class="info-item">${tip}</li>`).join("")}
            </ul>
          </div>
          <style>
            .info-container {
              background-color: #f8f9fa;
              border-radius: 12px;
              border: 1px solid #e1e4e8;
              padding: 20px;
              margin: 15px 0;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            }
            .info-list {
              list-style-type: none;
              padding: 0;
              margin: 0;
            }
            .info-item {
              padding: 12px 0;
              border-bottom: 1px solid rgb(11, 12, 12);
              font-size: 15px;
              line-height: 1.5;
              color: #24292e;
            }
            .info-item:last-child {
              border-bottom: none;
            }
            .info-item:before {
              content: "💡";
              margin-right: 10px;
            }
          </style>
        `;
      } catch (error) {
        contentBody.innerHTML = `
          <div class="error-container">
            <p>Error loading tips: ${error.message}</p>
          </div>
          <style>
            .error-container {
              background-color: #ffeef0;
              border-radius: 12px;
              border: 1px solid #f1b0b7;
              padding: 15px;
              color: #d73a49;
              font-size: 14px;
            }
          </style>
        `;
      }
    },

    "about-us": async () => {
      contentTitle.innerText = "About Us";
        contentBody.innerHTML = "<p>Loading...</p>";
        
        try {
          const response = await fetch("http://localhost:4000/settings/about-us");
          const data = await response.json();
          const about = data.about || [];
          
          contentBody.innerHTML = `
            <div class="info-container">
              <ul class="info-list">
                ${about.map((ab) => `<li class="info-item">${ab}</li>`).join("")}
              </ul>
            </div>
            <style>
              .info-container {
                background-color: #f8f9fa;
                border-radius: 12px;
                border: 1px solid #e1e4e8;
                padding: 20px;
                margin: 15px 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
              }
              .info-list {
                list-style-type: none;
                padding: 0;
                margin: 0;
              }
              .info-item {
                padding: 12px 0;
                border-bottom: 1px solid rgb(11, 12, 12);
                font-size: 15px;
                line-height: 1.5;
                color: #24292e;
              }
              .info-item:last-child {
                border-bottom: none;
              }
              .info-item:before {
                content: "✨";
                margin-right: 10px;
              }
            </style>
          `;
        } catch (error) {
          contentBody.innerHTML = `
            <div class="error-container">
              <p>Error loading about us information: ${error.message}</p>
            </div>
            <style>
              .error-container {
                background-color: #ffeef0;
                border-radius: 12px;
                border: 1px solid #f1b0b7;
                padding: 15px;
                color: #d73a49;
                font-size: 14px;
              }
            </style>
          `;
        }
    },
    "delete-account": async () => {
  if (
    confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    )
  ) {
    try {
      const { token, userId } = await getTokenAndUserId();

      const response = await fetch(
        `http://localhost:4000/settings/delete-account/${userId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        // ✅ Clear local storage after deletion
        chrome.storage.local.clear(() => {
          alert("Account successfully deleted.");
          window.close(); // ✅ Close the tab/window after deletion
        });
      } else {
        alert(`Failed to delete account: ${data.message}`);
      }
    } catch (err) {
      alert("Error deleting account: " + err.message);
      console.error(err);
    }
  }
},
  };

  navItems.forEach((item) => {
    const route = item.textContent.trim().toLowerCase().replace(/\s+/g, "-");
    item.setAttribute("data-route", route);
    item.addEventListener("click", function () {
      navItems.forEach((nav) => nav.classList.remove("active"));
      this.classList.add("active");
      if (routes[route]) {
        routes[route]();
      } else {
        contentTitle.innerText = "Unknown Route";
        contentBody.innerHTML = "<p>The selected route does not exist.</p>";
      }
    });
  });

  routes["home"]();
});