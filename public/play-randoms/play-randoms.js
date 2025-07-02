const socket = io();

// DOM elements
const nameForm = document.getElementById('name-form');
const joiningState = document.getElementById('joining-state');
const errorMessage = document.getElementById('error-message');
const playRandomsForm = document.getElementById('playRandomsForm');
const playerNameInput = document.getElementById('player-name');
const backBtn = document.getElementById('back-btn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await window.i18n.init();
    setupEventListeners();
});

function setupEventListeners() {
    // Form submission
    playRandomsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        startPlayingWithRandoms();
    });

    // Back button
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    // Enter key on input
    playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            startPlayingWithRandoms();
        }
    });

    // Auto-focus on name input
    playerNameInput.focus();
}

function startPlayingWithRandoms() {
    const playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showError(window.i18n.t('pleaseEnterName') || 'Please enter your name');
        return;
    }

    if (playerName.length < 2) {
        showError('Name must be at least 2 characters long');
        return;
    }

    if (playerName.length > 20) {
        showError('Name must be 20 characters or less');
        return;
    }

    // Hide error and show loading state
    hideError();
    showJoiningState();

    // Simulate a brief delay for better UX, then redirect
    setTimeout(() => {
        // Redirect to join page with random room logic
        window.location.href = `/join?random=true&name=${encodeURIComponent(playerName)}`;
    }, 1500);
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showJoiningState() {
    nameForm.classList.add('hidden');
    joiningState.classList.remove('hidden');
    
    // Update header subtitle
    const headerSubtitle = document.getElementById('header-subtitle');
    if (headerSubtitle) {
        headerSubtitle.textContent = window.i18n.t('findingRoom') || 'Finding you a room...';
    }
}

function showNameForm() {
    nameForm.classList.remove('hidden');
    joiningState.classList.add('hidden');
    
    // Reset header subtitle
    const headerSubtitle = document.getElementById('header-subtitle');
    if (headerSubtitle) {
        headerSubtitle.textContent = window.i18n.t('playWithRandomsTitle') || 'Play with Random Players';
    }
}

// Handle socket connection for potential future features
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('error', (data) => {
    console.error('Socket error:', data);
    showError(data.error || 'Connection error occurred');
    showNameForm();
}); 