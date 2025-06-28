const socket = io();

// Game state
let gameId = null;
let playerName = '';
let categories = [];
let currentRound = 0;
let currentLetter = '';
let roundTimer = null;
let timeLeft = 120;
let isGameCreator = false; // Joined players are not game creators
let hasSubmitted = false; // Track if player has submitted this round

// DOM elements
const joinForm = document.getElementById('join-form');
const waitingRoom = document.getElementById('waiting-room');
const gamePlay = document.getElementById('game-play');
const results = document.getElementById('results');
const headerSubtitle = document.getElementById('header-subtitle');
const errorMessage = document.getElementById('error-message');

// LocalStorage keys
const GAME_DATA_KEY = 'slfgame_data';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await window.i18n.init();
    setupEventListeners();
    setupQRScanner();
    checkURLParameters();
    checkForStoredGameData();
});

// Listen for language changes
window.addEventListener('languageChanged', (event) => {
    updatePlayersListText();
});

function saveGameData() {
    const gameData = {
        gameId,
        playerName,
        categories,
        currentRound,
        currentLetter,
        socketId: socket.id,
        timestamp: Date.now()
    };
    localStorage.setItem(GAME_DATA_KEY, JSON.stringify(gameData));
}

function loadGameData() {
    const stored = localStorage.getItem(GAME_DATA_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing stored game data:', e);
            clearGameData();
        }
    }
    return null;
}

function clearGameData() {
    localStorage.removeItem(GAME_DATA_KEY);
}

function checkForStoredGameData() {
    const stored = loadGameData();
    if (stored) {
        // Check if data is not too old (1 hour)
        const isRecent = (Date.now() - stored.timestamp) < (60 * 60 * 1000);
        if (isRecent && stored.gameId && stored.playerName) {
            // Attempt to reconnect
            attemptReconnection(stored);
            return;
        } else {
            clearGameData();
        }
    }
    
    // Show join form if no valid stored data
    showSection('join-form');
}

function attemptReconnection(storedData) {
    gameId = storedData.gameId;
    playerName = storedData.playerName;
    categories = storedData.categories || [];
    currentRound = storedData.currentRound || 0;
    currentLetter = storedData.currentLetter || '';
    
    console.log('Attempting to reconnect to game:', gameId, 'as player:', playerName);
    
    // Show connecting message
    showError('Reconnecting to game...');
    
    // Wait for socket to connect then attempt reconnect
    if (socket.connected) {
        socket.emit('reconnect', {
            gameId,
            playerName,
            oldSocketId: storedData.socketId
        });
    } else {
        socket.on('connect', () => {
            socket.emit('reconnect', {
                gameId,
                playerName,
                oldSocketId: storedData.socketId
            });
        });
    }
}

function setupEventListeners() {
    // Join game form
    document.getElementById('joinGameForm').addEventListener('submit', (e) => {
        e.preventDefault();
        joinGame();
    });

    // Stop round
    document.getElementById('stop-round-btn').addEventListener('click', () => {
        stopRound();
    });

    // Leave game functionality is handled by existing buttons in the UI
}

function setupQRScanner() {
    const scanBtn = document.getElementById('scan-qr-btn');
    const modal = document.getElementById('qr-scanner-modal');
    const closeBtn = document.getElementById('close-scanner');
    const video = document.getElementById('qr-video');
    
    scanBtn.addEventListener('click', () => {
        openQRScanner();
    });
    
    closeBtn.addEventListener('click', () => {
        closeQRScanner();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeQRScanner();
        }
    });
}

async function openQRScanner() {
    const modal = document.getElementById('qr-scanner-modal');
    const video = document.getElementById('qr-video');
    const status = document.getElementById('scanner-status');
    
    modal.classList.remove('hidden');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
        video.play();
        
        status.textContent = window.i18n.t('pointCameraAtQR') || 'Point your camera at the QR code';
        
        // Simple QR detection (in production, use a proper QR library like jsQR)
        detectQRCode(video);
        
    } catch (err) {
        console.error('Error accessing camera:', err);
        status.textContent = 'Camera access denied or not available';
    }
}

function closeQRScanner() {
    const modal = document.getElementById('qr-scanner-modal');
    const video = document.getElementById('qr-video');
    
    modal.classList.add('hidden');
    
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
}

function detectQRCode(video) {
    // Placeholder for QR detection
    // In production, you'd use jsQR library or similar
    // For now, we'll just show a message
    const status = document.getElementById('scanner-status');
    status.innerHTML = 'QR scanning not implemented yet.<br>Please enter Game ID manually.';
}

function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    
    // Check if we're on a share link (/join/123456)
    if (pathParts[1] === 'join' && pathParts[2]) {
        const gameId = pathParts[2];
        document.getElementById('game-id').value = gameId;
    }
    
    // Check for error parameter
    const error = urlParams.get('error');
    if (error) {
        showError(error);
    }
}

function leaveGame() {
    if (confirm(window.i18n.t('confirmLeaveGame') || 'Are you sure you want to leave the game?')) {
        clearGameData();
        socket.disconnect();
        window.location.href = '/';
    }
}

function joinGame() {
    const gameIdInput = document.getElementById('game-id');
    const playerNameInput = document.getElementById('player-name');
    
    gameId = gameIdInput.value.trim();
    playerName = playerNameInput.value.trim();
    
    if (!gameId || !playerName) {
        showError('Please enter both Game ID and your name');
        return;
    }
    
    hideError();
    socket.emit('join', { gameId, name: playerName });
}

function submitAnswers() {
    if (hasSubmitted) {
        console.log('Already submitted, skipping...');
        return; // Don't submit twice
    }
    
    const answers = {};
    const form = document.getElementById('answers-form');
    const inputs = form.querySelectorAll('input');
    
    console.log('Submitting answers, found', inputs.length, 'inputs');
    
    inputs.forEach(input => {
        const value = input.value.trim();
        answers[input.dataset.category] = value;
        console.log(`${input.dataset.category}: "${value}"`);
    });

    console.log('Final answers object:', answers);
    socket.emit('submitAnswers', { gameId, answers });
    hasSubmitted = true;
}

function stopRound() {
    socket.emit('stopRound', { gameId });
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showSection(section) {
    // Hide all sections
    joinForm.classList.add('hidden');
    waitingRoom.classList.add('hidden');
    gamePlay.classList.add('hidden');
    results.classList.add('hidden');

    // Show requested section
    document.getElementById(section).classList.remove('hidden');
    
    // Update header
    switch(section) {
        case 'join-form':
            headerSubtitle.textContent = window.i18n.t('joinGameTitle');
            break;
        case 'waiting-room':
            headerSubtitle.textContent = window.i18n.t('waitingForStart');
            break;
        case 'game-play':
            headerSubtitle.textContent = `${window.i18n.t('round')} ${currentRound} - ${window.i18n.t('letter')} ${currentLetter}`;
            break;
        case 'results':
            headerSubtitle.textContent = window.i18n.t('roundResults');
            break;
    }
}

function updatePlayersList(players) {
    const playerList = document.getElementById('player-list');
    const playersCount = document.getElementById('players-count');
    
    playerList.innerHTML = '';
    
    players.forEach(player => {
        const li = document.createElement('li');
        li.className = 'player-item';
        li.innerHTML = `
            <div>
                <span class="player-name">${player.name}</span>
            </div>
            <span class="player-score">${player.score} ${window.i18n.t('pts')}</span>
        `;
        playerList.appendChild(li);
    });
    
    updatePlayersListText(players.length);
}

function updatePlayersListText(count = null) {
    const playersCount = document.getElementById('players-count');
    if (playersCount) {
        const playerCount = count !== null ? count : document.querySelectorAll('.player-item').length;
        const playerText = playerCount === 1 ? window.i18n.t('player') : window.i18n.t('playersJoined');
        playersCount.textContent = `${playerCount} ${playerText}`;
    }
}

function createAnswersForm() {
    const form = document.getElementById('answers-form');
    form.innerHTML = '';
    
    console.log('Creating answer form for categories:', categories);
    
    categories.forEach(category => {
        const div = document.createElement('div');
        div.className = 'answer-group';
        div.innerHTML = `
            <label for="answer-${category}">${category}:</label>
            <input type="text" id="answer-${category}" data-category="${category}" 
                   placeholder="${window.i18n.t('enterWith')} ${category.toLowerCase()} ${window.i18n.t('startingWith')} ${currentLetter}">
        `;
        form.appendChild(div);
    });
    
    console.log('Answer form created with', form.querySelectorAll('input').length, 'inputs');
    
    // Hide stop round button for joined players
    const stopBtn = document.getElementById('stop-round-btn');
    if (stopBtn) {
        stopBtn.style.display = isGameCreator ? 'inline-block' : 'none';
    }
}

function startTimer() {
    // Timer functionality completely removed
}

function displayResults(resultsData) {
    const content = document.getElementById('results-content');
    
    // Create results table
    let html = `
        <div style="margin-bottom: 2rem;">
            <h3>Round ${resultsData.round} - Letter "${resultsData.letter}"</h3>
        </div>
        <table class="results-table">
            <thead>
                <tr>
                    <th>Player</th>
    `;
    
    // Add category headers
    resultsData.categories.forEach(category => {
        html += `<th>${category}</th>`;
    });
    html += `<th>Round Score</th><th>Total Score</th></tr></thead><tbody>`;
    
    // Add player rows
    const players = Object.keys(resultsData.answers[resultsData.categories[0]] || {});
    players.forEach(playerName => {
        html += `<tr><td><strong>${playerName}</strong></td>`;
        
        // Add answers for each category
        resultsData.categories.forEach(category => {
            const answerData = resultsData.answers[category][playerName];
            const answer = answerData?.answer || '';
            const isValid = answerData?.valid || false;
            
            let cssClass = 'answer-invalid';
            if (isValid) {
                // Check if it's unique or duplicate
                const sameAnswers = Object.values(resultsData.answers[category])
                    .filter(a => a.answer.toLowerCase() === answer.toLowerCase() && a.valid).length;
                cssClass = sameAnswers === 1 ? 'answer-valid' : 'answer-duplicate';
            }
            
            html += `<td><span class="${cssClass}">${answer || '-'}</span></td>`;
        });
        
        // Add scores
        const roundScore = resultsData.scores[playerName] || 0;
        const totalScore = resultsData.totalScores.find(p => p.name === playerName)?.score || 0;
        html += `<td><strong>${roundScore}</strong></td><td><strong>${totalScore}</strong></td>`;
        html += `</tr>`;
    });
    
    html += `</tbody></table>`;
    
    // Add legend
    html += `
        <div style="margin-top: 2rem; font-size: 0.9rem;">
            <p><span class="answer-valid">●</span> Unique answer (20 points)</p>
            <p><span class="answer-duplicate">●</span> Duplicate answer (10 points)</p>
            <p><span class="answer-invalid">●</span> Invalid answer (0 points)</p>
        </div>
    `;
    
    content.innerHTML = html;
}

// Socket event listeners
socket.on('playerJoined', (data) => {
    // This means we successfully joined
    document.getElementById('game-id-display').textContent = gameId;
    
    // Save game data to localStorage
    saveGameData();
    
    // Get game state to show categories
    socket.emit('getGameState', { gameId });
    
    updatePlayersList(data.players);
    showSection('waiting-room');
    hideError();
});

socket.on('gameState', (data) => {
    categories = data.categories;
    currentRound = data.currentRound;
    currentLetter = data.currentLetter;
    
    // Update game data
    saveGameData();
    
    // Show categories
    const gameCategories = document.getElementById('game-categories');
    gameCategories.innerHTML = '';
    categories.forEach(category => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.textContent = category;
        gameCategories.appendChild(tag);
    });
    
    updatePlayersList(data.players);
    
    // Handle different game states
    if (data.gameState === 'playing' && data.currentLetter) {
        // Game is in progress, show game play
        document.getElementById('current-round').textContent = currentRound;
        document.getElementById('current-letter').textContent = currentLetter;
        createAnswersForm();
        showSection('game-play');
    } else {
        showSection('waiting-room');
    }
    
    hideError();
});

socket.on('playerReconnected', (data) => {
    updatePlayersList(data.players);
    showError('Player reconnected: ' + data.playerName);
    setTimeout(hideError, 3000);
});

// Removed playerDisconnected handler - no longer tracking online/offline status

socket.on('roundStarted', (data) => {
    currentRound = data.round;
    currentLetter = data.letter;
    categories = data.categories;
    hasSubmitted = false; // Reset submission status for new round
    
    // Save updated game data
    saveGameData();
    
    // Update UI
    document.getElementById('current-round').textContent = currentRound;
    document.getElementById('current-letter').textContent = currentLetter;
    
    // Create answer form
    createAnswersForm();
    
    // Reset submission status
    document.getElementById('submission-text').textContent = 'Fill in your answers...';
    document.getElementById('submission-progress').style.width = '0%';
    
    // Start timer (no time limit now)
    startTimer();
    
    showSection('game-play');
});

socket.on('playerSubmitted', (data) => {
    const percentage = (data.submitted / data.total) * 100;
    document.getElementById('submission-text').textContent = 
        `${data.submitted}/${data.total} players submitted`;
    document.getElementById('submission-progress').style.width = `${percentage}%`;
});

socket.on('roundStopping', () => {
    // Round is being stopped early, auto-submit current answers
    if (!hasSubmitted) {
        console.log('Round being stopped early, auto-submitting current answers...');
        submitAnswers();
    }
});

socket.on('roundEnded', (data) => {
    // Clear timer
    if (roundTimer) {
        clearInterval(roundTimer);
        roundTimer = null;
    }
    
    // Display results
    displayResults(data);
    showSection('results');
});

socket.on('gameEnded', (data) => {
    // Clear timer
    if (roundTimer) {
        clearInterval(roundTimer);
        roundTimer = null;
    }
    
    console.log('Game ended, received data:', data);
    
    // Clear game data since game is over
    clearGameData();
    
    // Show final results inline
    showFinalResults(data);
});

function showFinalResults(data) {
    // Show final game results
    const content = document.getElementById('results-content');
    let html = `
        <div style="text-align: center; margin-bottom: 2rem;">
            <h2>🎉 Game Over!</h2>
            <h3>Final Scores</h3>
        </div>
        <table class="results-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Final Score</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.finalScores.forEach((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        html += `
            <tr>
                <td><strong>${medal} ${index + 1}</strong></td>
                <td><strong>${player.name}</strong></td>
                <td><strong>${player.score} pts</strong></td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        <div style="text-align: center; margin-top: 2rem;">
            <p>Thanks for playing Stadt Land Fluss!</p>
            <p id="redirect-countdown" style="color: #666; margin-top: 1rem;">Returning to home page in 5 seconds...</p>
        </div>
    `;
    
    content.innerHTML = html;
    showSection('results');
    headerSubtitle.textContent = 'Game Over';
    
    // Countdown and redirect to home page
    let countdown = 5;
    const countdownElement = document.getElementById('redirect-countdown');
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownElement) {
            countdownElement.textContent = `Returning to home page in ${countdown} seconds...`;
        }
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            clearGameData(); // Ensure data is cleared
            window.location.href = '/';
        }
    }, 1000);
}

socket.on('error', (data) => {
    console.error('Socket error:', data);
    showError(data.error);
    
    // If reconnection failed, show join screen
    if (data.error.includes('not found') || data.error.includes('Player not found')) {
        clearGameData();
        showSection('join-form');
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showError('Connection lost. Attempting to reconnect...');
    
    // Show join screen as fallback
    setTimeout(() => {
        if (!socket.connected) {
            showError('Connection lost. Please rejoin the game.');
            showSection('join-form');
        }
    }, 5000);
});

socket.on('connect', () => {
    console.log('Connected to server');
    hideError();
});

// Handle page refresh/close
window.addEventListener('beforeunload', () => {
    if (roundTimer) {
        clearInterval(roundTimer);
    }
});

// Clear localStorage when navigating to main page
window.addEventListener('beforeunload', (e) => {
    // Check if user is navigating to main page
    if (window.location.pathname === '/' || window.location.href.includes('index.html')) {
        clearGameData();
    }
});

// Clear localStorage when page loads if we're on main page
if (window.location.pathname === '/' || window.location.href.includes('index.html')) {
    clearGameData();
}
