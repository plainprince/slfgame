function showPrivacyNotice() {
    const notice = document.getElementById('privacyNotice');
    notice.style.display = 'block';
    
    // Auto-hide after 10 seconds
    privacyNoticeTimeout = setTimeout(() => {
        hidePrivacyNotice();
    }, 10000);
}

function hidePrivacyNotice() {
    const notice = document.getElementById('privacyNotice');
    notice.style.display = 'none';
}

function showPrivacyModal() {
    hidePrivacyNotice();
    const modal = document.getElementById('privacyModal');
    modal.style.display = 'flex';
}

function hidePrivacyModal() {
    const modal = document.getElementById('privacyModal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
document.getElementById('privacyModal').addEventListener('click', function(e) {
    if (e.target === this) {
        hidePrivacyModal();
    }
});

// Show privacy notice on page load
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('privacyNoticeSeen') !== 'true') {
        showPrivacyNotice();
    }else {
        hidePrivacyNotice();
    }
    
    // Add event listeners for privacy notice elements
    document.querySelector('.privacy-notice-close-link').addEventListener('click', () => {
        hidePrivacyNotice();
        localStorage.setItem('privacyNoticeSeen', 'true');
    });
    
    document.querySelector('.privacy-notice-link').addEventListener('click', (e) => {
        e.preventDefault();
        showPrivacyModal();
        localStorage.setItem('privacyNoticeSeen', 'true');
    });
    
    document.querySelector('.privacy-modal-close').addEventListener('click', () => {
        hidePrivacyModal();
        localStorage.setItem('privacyNoticeSeen', 'true');
    });
});