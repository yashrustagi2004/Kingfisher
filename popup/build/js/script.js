document.addEventListener('DOMContentLoaded', function() {
    // Add click event listeners to all nav items
    const navItems = document.querySelectorAll('.nav-item');
    
    // Set first item as active by default
    navItems[0].classList.add('active');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
        });
    });
    
    // Add click handler for delete account button
    const deleteButton = document.querySelector('.delete-account');
    deleteButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            alert('Account deletion request submitted.');
        }
    });

    // Adjust content height in mobile view
    function adjustMobileLayout() {
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const content = document.querySelector('.content');
            content.style.height = `calc(100% - ${sidebar.offsetHeight}px)`;
        } else {
            document.querySelector('.content').style.height = '100%';
        }
    }

    // Call on resize and initially
    window.addEventListener('resize', adjustMobileLayout);
    adjustMobileLayout();
});