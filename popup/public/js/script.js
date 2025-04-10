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

  function setupEmailPopupListeners() {
    const modal = document.getElementById('emailModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const emailItems = document.querySelectorAll('.email-item');
    
    // Add click event to each email item
    emailItems.forEach(item => {
      item.addEventListener('click', function() {
        const index = this.getAttribute('data-index');
        showEmailDetails(index);
      });
    });
    
    // Close modal when clicking the X button
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
      });
    }
    
    // Close modal when clicking outside the content
    window.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
  
  // Function to show email details in modal
  function showEmailDetails(index) {
    // Make sure we have the email data
    if (!window.emailData || !window.emailData[index]) return;
    
    const email = window.emailData[index];
    const modal = document.getElementById('emailModal');
    const modalContent = document.getElementById('modalContent');
    
    // Update modal content
    document.getElementById('modalTitle').textContent = email.subject;
    
    modalContent.innerHTML = `
      <div class="email-meta"><strong>From:</strong> ${email.from}</div>
      <div class="email-meta"><strong>Date:</strong> ${email.date}</div>
      <div class="email-meta"><strong>Subject:</strong> ${email.subject}</div>
      
      <div style="margin: 15px 0; padding: 10px; background-color: #f9f9f9; border-left: 4px solid #ccc;">
        ${email.snippet}
      </div>
      
      <div class="security-details">
        <h4>Security Analysis</h4>
        <div style="margin-bottom: 10px;">
          <strong>Overall Status: </strong>
          <span style="color: ${email.securityStatus === 'safe' ? '#4CAF50' : '#F44336'}; font-weight: bold;">
            ${email.securityStatus === 'safe' ? 'SAFE' : 'SUSPICIOUS'}
          </span>
        </div>
        
        <div class="security-item">
          <strong>SPF (Sender Policy Framework): </strong>
          <span class="${email.securityDetails.spf.pass ? 'security-pass' : 'security-fail'}">
            ${email.securityDetails.spf.pass ? 'PASS' : 'FAIL'} 
            (${email.securityDetails.spf.details || 'Unknown'})
          </span>
          <div style="font-size: 12px; margin-top: 3px; color: #666;">
            Verifies that the sender's email server is authorized to send email from that domain.
          </div>
        </div>
        
        <div class="security-item">
          <strong>DKIM (DomainKeys Identified Mail): </strong>
          <span class="${email.securityDetails.dkim.pass ? 'security-pass' : 'security-fail'}">
            ${email.securityDetails.dkim.pass ? 'PASS' : 'FAIL'}
            (${email.securityDetails.dkim.details || 'Unknown'})
          </span>
          <div style="font-size: 12px; margin-top: 3px; color: #666;">
            Ensures the email content hasn't been tampered with during transit.
          </div>
        </div>
        
        <div class="security-item">
          <strong>DMARC (Domain-based Message Authentication): </strong>
          <span class="${email.securityDetails.dmarc.pass ? 'security-pass' : 'security-fail'}">
            ${email.securityDetails.dmarc.pass ? 'PASS' : 'FAIL'}
            (${email.securityDetails.dmarc.details || 'Unknown'})
          </span>
          <div style="font-size: 12px; margin-top: 3px; color: #666;">
            Provides instructions for how to handle emails that fail SPF or DKIM checks.
          </div>
        </div>
      </div>
    `;
    
    // Show the modal
    modal.style.display = 'block';
  }

  const navItems = document.querySelectorAll(".nav-item");
  const contentTitle = document.getElementById("content-title");
  const contentBody = document.getElementById("content-body");


  const routes = {
    home: async () => {
      contentTitle.innerText = "Gmail Emails";
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
                  font-size: 12px;
                  margin-left: 10px;
                }
                .malicious-tag {
                  background-color: #F44336;
                  color: white;
                  padding: 3px 8px;
                  border-radius: 4px;
                  font-size: 12px;
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
              </style>
              
              <!-- Modal/Popup container -->
              <div id="emailModal" class="modal">
                <div class="modal-content">
                  <span class="close-button" id="closeModalBtn">&times;</span>
                  <h3 id="modalTitle">Email Details</h3>
                  <div id="modalContent"></div>
                </div>
              </div>
              
              <ul class="email-list" id="emailListContainer">
                ${emails
                  .map((email, index) => `
                  <li class="email-item" data-index="${index}">
                    <div class="email-meta">
                      <strong>From:</strong> ${email.from}
                      <span class="${email.securityStatus === 'safe' ? 'safe-tag' : 'malicious-tag'}">
                        ${email.securityStatus === 'safe' ? 'SAFE' : 'SUSPICIOUS'}
                      </span>
                    </div>
                    <div class="email-meta"><strong>Subject:</strong> ${email.subject}</div>
                    <div class="email-meta"><strong>Date:</strong> ${email.date}</div>
                  </li>`)
                  .join("")}
              </ul>
            `;
            
            // Store email data in a variable accessible to our event handlers
            window.emailData = emails;
            
            // Add event listeners after DOM elements are created
            setupEmailPopupListeners();
          } else {
            contentBody.innerHTML = "<p>No emails found.</p>";
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
              <li class="domain-item">
                ${domain}
                <button class="remove-domain-btn" data-domain="${domain}">Remove</button>
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
        domainsList.innerHTML = "<p>No trusted domains found.</p>";
      }
    } catch (error) {
      domainsList.innerHTML = `<p>Error loading trusted domains: ${error.message}</p>`;
    }
  };

  loadTrustedDomains();
},


    analysis: async () => {
      contentTitle.innerText = "Analysis";
      contentBody.innerHTML = "<p>Loading...</p>";
      try {
        const response = await fetch("http://localhost:4000/settings/analysis");
        const data = await response.json();
        contentBody.innerHTML = `
          <p>Total Emails Scanned: ${data.totalEmailsScanned}</p>
          <p>Suspicious Emails: ${data.suspiciousEmails}</p>
          <p>Trusted Emails: ${data.trustedEmails}</p>
        `;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading analysis data: ${error.message}</p>`;
      }
    },

    "malicious-domains": async () => {
      contentTitle.innerText = "Malicious Domains";
      contentBody.innerHTML = "<p>Loading...</p>";
      try {
        const response = await fetch(
          "http://localhost:4000/settings/malicious-domains"
        );
        const data = await response.json();
        const malicious = data.malicious || [];
        contentBody.innerHTML = `<ul>${malicious
          .map((domain) => `<li>${domain}</li>`)
          .join("")}</ul>`;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading malicious domains: ${error.message}</p>`;
      }
    },

    tips: async () => {
      contentTitle.innerText = "Tips";
      contentBody.innerHTML = "<p>Loading...</p>";
      try {
        const response = await fetch("http://localhost:4000/settings/tips");
        const data = await response.json();
        const tips = data.tips || [];
        contentBody.innerHTML = `<ul>${tips
          .map((tip) => `<li>${tip}</li>`)
          .join("")}</ul>`;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading tips: ${error.message}</p>`;
      }
    },

    "about-us": async () => {
      contentTitle.innerText = "About Us";
      contentBody.innerHTML = "<p>Loading...</p>";
      try {
        const response = await fetch("http://localhost:4000/settings/about-us");
        const data = await response.json();
        const about = data.about || [];
        contentBody.innerHTML = `<ul>${about
          .map((ab) => `<li>${ab}</li>`)
          .join("")}</ul>`;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading tips: ${error.message}</p>`;
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