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

  const getToken = () => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(["token"], (result) => {
        if (result.token) {
          resolve(result.token);
        } else {
          reject(new Error("Token not found."));
        }
      });
    });
  };

  const navItems = document.querySelectorAll(".nav-item");
  const contentTitle = document.getElementById("content-title");
  const contentBody = document.getElementById("content-body");

  const routes = {
    home: async () => {
      contentTitle.innerText = "Gmail Emails";
      contentBody.innerHTML = "<p>Loading your latest Gmail messages...</p>";

      try {
        const token = await getToken();

        const response = await fetch(
          "http://localhost:4000/api/gmail/extract",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          }
        );

        const data = await response.json();

        if (response.ok && data.success) {
          const emails = data.emails;

          if (emails.length > 0) {
            contentBody.innerHTML = `
          <ul>
            ${emails
              .map(
                (email) => `
              <li>
                <strong>From:</strong> ${email.from}<br>
                <strong>Subject:</strong> ${email.subject}<br>
                <strong>Date:</strong> ${email.date}<br>
                <em>${email.snippet}</em>
              </li>`
              )
              .join("")}
          </ul>
        `;
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
      contentBody.innerHTML = "<p>Loading...</p>";
      try {
        const token = await getToken();
        const response = await fetch(
          "http://localhost:4000/settings/trusted-domains",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await response.json();
        const domains = data.domains || [];
        contentBody.innerHTML = `<ul>${domains
          .map((domain) => `<li>${domain}</li>`)
          .join("")}</ul>`;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading trusted domains: ${error.message}</p>`;
      }
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
            alert("Account successfully deleted.");
            window.close();
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