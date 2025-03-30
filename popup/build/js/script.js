document.addEventListener('DOMContentLoaded', function () {
  // Utility to get token and userId
  function getTokenAndUserId() {
    return new Promise((resolve, reject) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get(['token', 'userId'], (result) => {
          if (result.token && result.userId) {
            resolve({ token: result.token, userId: result.userId });
          } else {
            reject(new Error('Token or userId not found in storage.'));
          }
        });
      } else {
        reject(new Error('chrome.storage.local is not available.'));
      }
    });
  }

  // Utility to get only the token
  const getToken = () => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['token'], (result) => {
        if (result.token) {
          resolve(result.token);
        } else {
          reject(new Error('Token not found.'));
        }
      });
    });
  };

  // Navigation and content rendering
  const navItems = document.querySelectorAll('.nav-item');
  const contentTitle = document.getElementById('content-title');
  const contentBody = document.getElementById('content-body');

  const routes = {
    'trusted-domains': async () => {
      contentTitle.innerText = 'Trusted Domains';
      contentBody.innerHTML = '<p>Loading...</p>';
      try {
        const token = await getToken();
        const response = await fetch('http://localhost:4000/settings/trusted-domains', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        const domains = data.domains || [];
        contentBody.innerHTML = `
          <ul>
            ${domains.map((domain) => `<li>${domain}</li>`).join('')}
          </ul>
        `;
      } catch (error) {
        contentBody.innerHTML = `<p>Error loading trusted domains: ${error.message}</p>`;
      }
    },

    analysis: () => {
      contentTitle.innerText = 'Analysis';
      contentBody.innerHTML = '<p>Analysis content will be loaded here.</p>';
    },

    'malicious-domains': () => {
      contentTitle.innerText = 'Malicious Domains';
      contentBody.innerHTML = '<p>Malicious domains content will be loaded here.</p>';
    },

    tips: () => {
      contentTitle.innerText = 'Tips';
      contentBody.innerHTML = '<p>Tips content will be loaded here.</p>';
    },

    'about-us': () => {
      contentTitle.innerText = 'About Us';
      contentBody.innerHTML = '<p>About us content will be loaded here.</p>';
    },

    'delete-account': async () => {
      if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        try {
          const { token, userId } = await getTokenAndUserId();

          const response = await fetch(`http://localhost:4000/settings/delete-account/${userId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          const data = await response.json();

          if (response.ok && data.success) {
            alert('Account successfully deleted.');
            window.close(); // 👈 Closes the tab
          } else {
            alert(`Failed to delete account. Server responded with status ${response.status}: ${data.message}`);
          }
        } catch (err) {
          alert('Error deleting account: ' + err.message);
          console.error(err);
        }
      }
    },
  };

  // Set up navigation clicks
  navItems.forEach((item) => {
    const route = item.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    item.setAttribute('data-route', route);

    item.addEventListener('click', function () {
      navItems.forEach((nav) => nav.classList.remove('active'));
      this.classList.add('active');

      if (routes[route]) {
        routes[route]();
      } else {
        contentTitle.innerText = 'Unknown Route';
        contentBody.innerHTML = '<p>The selected route does not exist.</p>';
      }
    });
  });

  // Load the default route
  routes['trusted-domains']();
});
