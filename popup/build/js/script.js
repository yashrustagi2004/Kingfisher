document.addEventListener('DOMContentLoaded', function () {
  const navItems = document.querySelectorAll('.nav-item');
  const contentTitle = document.getElementById('content-title');
  const contentBody = document.getElementById('content-body');

  const routes = {
    'trusted-domains': async () => {
      try {
        const token = await getToken();
        const response = await fetch('http://localhost:4000/settings/trusted-domains', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        contentTitle.innerText = 'Trusted Domains';
        contentBody.innerHTML = `
          <ul>
            ${data.domains.map((domain) => `<li>${domain}</li>`).join('')}
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
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert('Account successfully deleted.');
      } else {
        alert('Failed to delete account.');
      }
    } catch (error) {
      alert('Error deleting account: ' + error.message);
    }
  }
},

  };

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

  navItems.forEach((item) => {
    item.addEventListener('click', function () {
      const route = this.dataset.route;
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
