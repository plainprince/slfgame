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
let handRaised = false; // Track if this player has raised their hand
let someoneRaisedHand = false; // Track if anyone has raised their hand

// Track feedback state for each answer
const feedbackState = new Map(); // Map of answerKey -> { submitted: boolean, isPositive: boolean }

function getAnswerKey(answer, category, letter) {
    return `${answer}_${category}_${letter}`;
}

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
    checkURLParameters();
    checkForStoredGameData();
});

// Listen for language changes
window.addEventListener('languageChanged', (event) => {
    updatePlayersListText();
    updateShowHandButton(); // Update the show hand button text
    updateDynamicTexts(); // Update any other dynamic texts
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

    // Show hand button (replaces stop round)
    document.getElementById('show-hand-btn').addEventListener('click', () => {
        showHand();
    });

    // Leave game buttons
    document.querySelectorAll('.leave-game-btn').forEach(button => {
        button.addEventListener('click', () => {
            leaveGame();
        });
    });
}

function extractGameIdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        
        // Check if it's a valid join URL: /join/123456
        if (pathParts[1] === 'join' && pathParts[2]) {
            const gameId = pathParts[2];
            // Validate game ID format (6 digits)
            if (/^\d{6}$/.test(gameId)) {
                return gameId;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const nameFromUrl = urlParams.get('name');
    const autoJoin = urlParams.get('auto');
    const random = urlParams.get('random');
    
    // Check for random room joining
    if (random === 'true' && nameFromUrl) {
        document.getElementById('player-name').value = decodeURIComponent(nameFromUrl);
        setTimeout(() => {
            joinRandomGame();
        }, 1000);
        return;
    }
    
    // Check if we're on a share link (/join/123456)
    if (pathParts[1] === 'join' && pathParts[2]) {
        const gameId = pathParts[2];
        document.getElementById('game-id').value = gameId;
    }
    
    // Pre-fill name if provided
    if (nameFromUrl) {
        document.getElementById('player-name').value = decodeURIComponent(nameFromUrl);
    }
    
    // Auto-join if specified (for moderate-play mode)
    if (autoJoin === 'true' && pathParts[2] && nameFromUrl) {
        setTimeout(() => {
            joinGame();
        }, 1000); // Small delay to ensure everything is loaded
    }
    
    // Check for error parameter
    const error = urlParams.get('error');
    if (error) {
        showError(error);
    }
}

async function leaveGame() {
    const confirmed = await createModal('confirm', window.i18n.t('confirmLeaveGame') || 'Are you sure you want to leave the game?');
    if (confirmed) {
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
        showError(window.i18n.t('pleaseEnterBothFields'));
        return;
    }
    
    hideError();
    socket.emit('join', { gameId, name: playerName });
}

function joinRandomGame() {
    const playerNameInput = document.getElementById('player-name');
    playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showError('Please enter your name');
        return;
    }
    
    hideError();
    socket.emit('joinRandom', { name: playerName });
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

// New function to show hand
function showHand() {
    const answers = {};
    const form = document.getElementById('answers-form');
    const inputs = form.querySelectorAll('input');
    
    // Collect answers
    inputs.forEach(input => {
        const value = input.value.trim();
        answers[input.dataset.category] = value;
    });

    // Validate answers locally first
    let isValid = true;
    let invalidReason = '';

    for (const category of categories) {
        const answer = answers[category];
        if (!answer || !answer.trim()) {
            isValid = false;
            invalidReason = `Please fill in an answer for ${category}`;
            break;
        }
        if (!answer.trim().toUpperCase().startsWith(currentLetter)) {
            isValid = false;
            invalidReason = `Your ${category} answer "${answer}" must start with ${currentLetter}`;
            break;
        }
    }

    if (!isValid) {
        showError(invalidReason);
        return;
    }

    // Send show hand request
    socket.emit('showHand', { gameId, answers });
    handRaised = true;
    
    // Update UI to show hand is raised
    updateShowHandButton();
}

function updateShowHandButton() {
    const showHandBtn = document.getElementById('show-hand-btn');
    const feedbackDiv = document.getElementById('show-hand-feedback');
    if (!showHandBtn) return;

    if (handRaised) {
        showHandBtn.style.display = 'inline-block';
        showHandBtn.textContent = window.i18n.t('handRaised');
        showHandBtn.disabled = true;
        showHandBtn.style.backgroundColor = '#28a745';
        showHandBtn.title = window.i18n.t('handRaisedWaiting');
        showHandBtn.classList.remove('pulse');
        
        if (feedbackDiv) {
            feedbackDiv.textContent = window.i18n.t('handRaisedWaiting');
            feedbackDiv.className = 'show-hand-feedback warning';
        }
    } else if (someoneRaisedHand) {
        showHandBtn.style.display = 'inline-block';
        showHandBtn.textContent = window.i18n.t('someoneRaisedHand');
        showHandBtn.disabled = true;
        showHandBtn.style.backgroundColor = '#6c757d';
        showHandBtn.title = window.i18n.t('someoneElseRaisedFirst');
        showHandBtn.classList.remove('pulse');
        
        if (feedbackDiv) {
            feedbackDiv.textContent = window.i18n.t('someoneElseRaisedFirst');
            feedbackDiv.className = 'show-hand-feedback warning';
        }
    } else {
        // Reset to validation-based visibility
        validateAndUpdateShowHandButton();
    }
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

function updateDynamicTexts() {
    // Update submission text if visible
    const submissionText = document.getElementById('submission-text');
    if (submissionText && submissionText.textContent.includes('Fill in')) {
        submissionText.textContent = window.i18n.t('fillAnswers');
    }
    
    // Update feedback text if visible
    const feedbackDiv = document.getElementById('show-hand-feedback');
    if (feedbackDiv && currentLetter) {
        const currentText = feedbackDiv.textContent;
        if (currentText.includes('Fill in all answers') || currentText.includes('Fülle alle Antworten')) {
            feedbackDiv.textContent = window.i18n.t('fillAllAnswersToRaise', { letter: currentLetter });
        }
    }
}

function showLoadingScreen(message) {
    // Remove any existing loading screen
    hideLoadingScreen();
    
    // Create loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: white;
    `;
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = `
        width: 60px;
        height: 60px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top: 4px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
    `;
    
    // Create message
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        font-size: 18px;
        text-align: center;
        max-width: 300px;
        line-height: 1.4;
    `;
    
    // Add spinner animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(messageDiv);
    document.body.appendChild(loadingOverlay);
}

function hideLoadingScreen() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
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
            <div class="answer-input-container">
                <input type="text" id="answer-${category}" data-category="${category}" 
                       placeholder="${window.i18n.t('enterWith')} ${category.toLowerCase()} ${window.i18n.t('startingWith')} ${currentLetter}">
                <button type="button" class="clear-answer-btn" data-category="${category}" 
                        title="${window.i18n.t('clearAnswerTooltip')}" aria-label="${window.i18n.t('clearAnswer')}">
                    ✕
                </button>
            </div>
        `;
        form.appendChild(div);
    });
    
    console.log('Answer form created with', form.querySelectorAll('input').length, 'inputs');
    
    // Always hide the old stop round button for players
    const stopBtn = document.getElementById('stop-round-btn');
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }

    // Show the new show hand button
    const showHandBtn = document.getElementById('show-hand-btn');
    if (showHandBtn) {
        showHandBtn.style.display = 'inline-block';
        updateShowHandButton();
    }

    // Add real-time validation listeners to all inputs
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            validateAndUpdateShowHandButton();
        });
        input.addEventListener('blur', () => {
            validateAndUpdateShowHandButton();
        });
    });

    // Add clear answer button functionality
    const clearButtons = form.querySelectorAll('.clear-answer-btn');
    clearButtons.forEach(button => {
        button.addEventListener('click', () => {
            const category = button.dataset.category;
            const input = document.getElementById(`answer-${category}`);
            if (input) {
                input.value = '';
                input.focus();
                validateAndUpdateShowHandButton();
            }
        });
    });

    // Initial validation and set initial feedback
    const feedbackDiv = document.getElementById('show-hand-feedback');
    if (feedbackDiv) {
        feedbackDiv.textContent = window.i18n.t('fillAllAnswersToRaise', { letter: currentLetter });
        feedbackDiv.className = 'show-hand-feedback';
    }
    validateAndUpdateShowHandButton();
}

function validateAnswers() {
    const form = document.getElementById('answers-form');
    if (!form) return { isValid: false, reason: 'No form found' };
    
    const inputs = form.querySelectorAll('input');
    let isValid = true;
    let invalidReason = '';

    for (const input of inputs) {
        const category = input.dataset.category;
        const answer = input.value.trim();
        
        if (!answer) {
            isValid = false;
            invalidReason = window.i18n.t('pleaseFillAnswer', { category });
            break;
        }
        
        if (!answer.toUpperCase().startsWith(currentLetter)) {
            isValid = false;
            invalidReason = window.i18n.t('answerMustStartWith', { category, answer, letter: currentLetter });
            break;
        }
    }

    return { isValid, reason: invalidReason };
}

function validateAndUpdateShowHandButton() {
    const showHandBtn = document.getElementById('show-hand-btn');
    const feedbackDiv = document.getElementById('show-hand-feedback');
    if (!showHandBtn) return;

    // Don't show button if someone already raised hand or if this player already raised hand
    if (handRaised || someoneRaisedHand) {
        updateShowHandButton();
        return;
    }

    const validation = validateAnswers();
    updateInputValidationStates();
    
    if (validation.isValid) {
        // All answers valid - show button and enable it
        showHandBtn.style.display = 'inline-block';
        showHandBtn.disabled = false;
        showHandBtn.textContent = window.i18n.t('showHand');
        showHandBtn.style.backgroundColor = '#007bff';
        showHandBtn.title = window.i18n.t('readyToRaiseHand');
        showHandBtn.classList.add('pulse');
        
        if (feedbackDiv) {
            feedbackDiv.textContent = window.i18n.t('readyToRaiseHand');
            feedbackDiv.className = 'show-hand-feedback success';
        }
    } else {
        // Invalid answers - hide button completely
        showHandBtn.style.display = 'none';
        showHandBtn.classList.remove('pulse');
        showHandBtn.title = validation.reason;
        
        if (feedbackDiv) {
            feedbackDiv.textContent = validation.reason;
            feedbackDiv.className = 'show-hand-feedback error';
        }
    }
}

function updateInputValidationStates() {
    const form = document.getElementById('answers-form');
    if (!form) return;
    
    const inputs = form.querySelectorAll('input');
    
    inputs.forEach(input => {
        const answer = input.value.trim();
        
        // Remove all validation classes first
        input.classList.remove('valid', 'invalid', 'empty');
        
        if (!answer) {
            input.classList.add('empty');
        } else if (answer.toUpperCase().startsWith(currentLetter)) {
            input.classList.add('valid');
        } else {
            input.classList.add('invalid');
        }
    });
}

function startTimer() {
    // Timer functionality completely removed
}

function displayResults(resultsData) {
    const content = document.getElementById('results-content');
    
    let html = `
        <h2>${window.i18n.t('resultsRound')} ${resultsData.currentRound}</h2>
        <p><strong>${window.i18n.t('letter')}:</strong> ${resultsData.letter}</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 2rem;">
            <thead>
                <tr style="background-color: #f8f9fa;">
                    <th style="border: 1px solid #ddd; padding: 0.75rem; text-align: left;">${window.i18n.t('player')}</th>
    `;
    
    resultsData.categories.forEach(category => {
        html += `<th style="border: 1px solid #ddd; padding: 0.75rem; text-align: left;">${category}</th>`;
    });
    
    html += `
                    <th style="border: 1px solid #ddd; padding: 0.75rem; text-align: left;">${window.i18n.t('roundScore')}</th>
                    <th style="border: 1px solid #ddd; padding: 0.75rem; text-align: left;">${window.i18n.t('totalScore')}</th>
                </tr>
            </thead>
            <tbody>
    `;
    
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
            
            html += `<td>
                <div class="answer-container">
                    <span class="${cssClass}">${answer || '-'}</span>
                    ${answer ? `
                        <div class="feedback-buttons">
                            <button class="feedback-btn thumbs-down" data-answer="${answer}" data-category="${category}" data-letter="${resultsData.letter}" data-ai-said="${isValid}" data-user-says="${!isValid}" title="AI got this wrong">👎</button>
                        </div>
                    ` : ''}
                </div>
            </td>`;
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
            <p><span class="answer-valid">●</span> ${window.i18n.t('uniqueAnswer')}</p>
            <p><span class="answer-duplicate">●</span> ${window.i18n.t('duplicateAnswer')}</p>
            <p><span class="answer-invalid">●</span> ${window.i18n.t('invalidAnswer')}</p>
            <p style="margin-top: 10px;"><strong>👎</strong> ${window.i18n.t('clickToReportErrors')}</p>
        </div>
    `;
    
    content.innerHTML = html;
    
    // DON'T submit automatic positive feedback anymore to avoid overwriting
    // Only submit feedback when user explicitly clicks buttons
    
    // Add event listeners for thumbs down buttons
    content.querySelectorAll('.thumbs-down').forEach(button => {
        const answerKey = getAnswerKey(button.dataset.answer, button.dataset.category, button.dataset.letter);
        const currentState = feedbackState.get(answerKey);
        
        // Set initial visual state based on current feedback state
        if (currentState && currentState.submitted) {
            if (!currentState.isPositive) {
                // Negative feedback was submitted
                button.style.backgroundColor = '#dc3545';
                button.style.color = 'white';
                button.style.opacity = '0.7';
                button.style.filter = 'grayscale(50%)';
                button.title = window.i18n.t('feedbackSubmitted') + ' - Click to undo';
            }
        }
        
        button.addEventListener('click', async () => {
            const answer = button.dataset.answer;
            const category = button.dataset.category;
            const letter = button.dataset.letter;
            const aiSaid = button.dataset.aiSaid === 'true';
            const userSays = button.dataset.userSays === 'true';
            
            const answerKey = getAnswerKey(answer, category, letter);
            const currentState = feedbackState.get(answerKey) || { submitted: false, isPositive: false };
            
            // Check if button is already in submitted negative state
            if (currentState.submitted && !currentState.isPositive) {
                // Ask for confirmation to undo negative feedback
                const confirmed = await createModal('confirm', window.i18n.t('confirmUndoNegativeFeedback'));
                if (!confirmed) {
                    return;
                }
                
                // Restore button to original state
                button.style.backgroundColor = '';
                button.style.color = '';
                button.style.opacity = '1';
                button.style.filter = '';
                button.title = 'AI got this wrong';
                
                // Submit positive feedback to undo the negative (AI was right)
                await submitFeedback(answer, category, letter, aiSaid, true);
                
                // Update feedback state
                feedbackState.set(answerKey, { submitted: true, isPositive: true });
            } else {
                // First time submitting negative feedback, ask for confirmation
                const confirmed = await createModal('confirm', window.i18n.t('confirmNegativeFeedback'));
                if (!confirmed) {
                    return;
                }
                
                // Submit negative feedback (AI was wrong)
                await submitFeedback(answer, category, letter, aiSaid, userSays);
                
                // Set button to submitted state with red/grayed appearance
                button.style.backgroundColor = '#dc3545';
                button.style.color = 'white';
                button.style.opacity = '0.7';
                button.style.filter = 'grayscale(50%)';
                button.title = window.i18n.t('feedbackSubmitted') + ' - Click to undo';
                
                // Update feedback state
                feedbackState.set(answerKey, { submitted: true, isPositive: false });
            }
        });
    });
}

// Socket event listeners
socket.on('playerJoined', (data) => {
    // This means we successfully joined
    // For random rooms, gameId will be set by the server response
    if (data.isRandomRoom) {
        gameId = data.gameId || gameId; // Set gameId from server if available
    }
    
    document.getElementById('game-id-display').textContent = gameId;
    
    // Save game data to localStorage
    saveGameData();
    
    // Get game state to show categories
    socket.emit('getGameState', { gameId });
    
    updatePlayersList(data.players);
    showSection('waiting-room');
    hideError();
    
    // Show info for random rooms
    if (data.isRandomRoom) {
        const subtitle = document.getElementById('header-subtitle');
        if (subtitle) {
            subtitle.textContent = `Playing with randoms in room ${gameId}`;
        }
        
        // Silent name takeover in random rooms - no notification needed
    }
});

socket.on('gameState', (data) => {
    categories = data.categories;
    currentRound = data.currentRound;
    currentLetter = data.currentLetter;
    
    // Update game data
    saveGameData();
    
    // Show categories
    const gameCategories = document.getElementById('game-categories');
    if (gameCategories) {
        gameCategories.innerHTML = '';
        categories.forEach(category => {
            const tag = document.createElement('div');
            tag.className = 'category-tag';
            tag.textContent = category;
            gameCategories.appendChild(tag);
        });
    }
    
    updatePlayersList(data.players);
    
    // Handle different game states
    if (data.gameState === 'playing' && data.currentLetter) {
        // Game is in progress, show game play
        document.getElementById('current-round').textContent = currentRound;
        document.getElementById('current-letter').textContent = currentLetter;
        
        // Update game ID display during game
        const gameIdDisplay = document.getElementById('game-id-display');
        if (gameIdDisplay) {
            gameIdDisplay.textContent = gameId;
        }
        
        createAnswersForm();
        showSection('game-play');
        
        // Show message for mid-round join
        showError(window.i18n.t('joinedMidRound', { round: currentRound, letter: currentLetter }));
        setTimeout(hideError, 7000);
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
    handRaised = false; // Reset hand status for new round
    someoneRaisedHand = false; // Reset hand status for new round
    
    // Update game ID display during game
    const gameIdDisplay = document.getElementById('game-id-display');
    if (gameIdDisplay) {
        gameIdDisplay.textContent = data.gameId;
    }
    
    // Save updated game data
    saveGameData();
    
    // Update UI
    document.getElementById('current-round').textContent = currentRound;
    document.getElementById('current-letter').textContent = currentLetter;
    
    // Create answer form
    createAnswersForm();
    
    // Reset submission status
    document.getElementById('submission-text').textContent = window.i18n.t('fillAnswers');
    document.getElementById('submission-progress').style.width = '0%';
    
    // Players should NOT have stop round button - only moderators/creators
    const stopRoundBtn = document.getElementById('stop-round-btn');
    if (stopRoundBtn) {
        stopRoundBtn.style.display = 'none';
    }
    
    // For random rooms, disable show hand button initially (3 second delay)
    if (data.isRandomRoom) {
        const showHandBtn = document.getElementById('show-hand-btn');
        if (showHandBtn) {
            showHandBtn.disabled = true;
            showHandBtn.textContent = 'Hand raising disabled (3s)';
        }
        const feedbackDiv = document.getElementById('show-hand-feedback');
        if (feedbackDiv) {
            feedbackDiv.textContent = 'Hand raising will be enabled in 3 seconds...';
            feedbackDiv.className = 'show-hand-feedback warning';
        }
    }
    
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
    // Show loading screen
    showLoadingScreen(window.i18n.t('roundEndingCalculating'));
    
    // Round is being stopped early, auto-submit current answers
    if (!hasSubmitted) {
        console.log('Round being stopped early, auto-submitting current answers...');
        submitAnswers();
    }
});

socket.on('roundEnded', (data) => {
    // Hide loading screen
    hideLoadingScreen();
    
    // Clear timer
    if (roundTimer) {
        clearInterval(roundTimer);
        roundTimer = null;
    }
    
    // Hide stop round button when round ends (should already be hidden for players)
    const stopRoundBtn = document.getElementById('stop-round-btn');
    if (stopRoundBtn) {
        stopRoundBtn.style.display = 'none';
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
            <h2>🎉 ${window.i18n.t('gameOver')}!</h2>
            <h3>${window.i18n.t('finalScores')}</h3>
        </div>
        <table class="results-table">
            <thead>
                <tr>
                    <th>${window.i18n.t('rank')}</th>
                    <th>${window.i18n.t('player')}</th>
                    <th>${window.i18n.t('finalScore')}</th>
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
                <td><strong>${player.score} ${window.i18n.t('pts')}</strong></td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        <div style="text-align: center; margin-top: 2rem;">
            <p>${window.i18n.t('thanksForPlaying')}</p>
            <p id="redirect-countdown" style="color: #666; margin-top: 1rem;">${window.i18n.t('returningToHome', { countdown: 5 })}</p>
        </div>
    `;
    
    content.innerHTML = html;
    showSection('results');
    headerSubtitle.textContent = window.i18n.t('gameOver');
    
    // Countdown and redirect to home page
    let countdown = 5;
    const countdownElement = document.getElementById('redirect-countdown');
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownElement) {
            countdownElement.textContent = window.i18n.t('returningToHome', { countdown });
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
    showError(window.i18n.t('connectionLost'));
    
    // Show join screen as fallback
    setTimeout(() => {
        if (!socket.connected) {
            showError(window.i18n.t('connectionLostRejoin'));
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

// Custom modal system
function createModal(type, message, options = {}) {
    return new Promise((resolve) => {
        // Remove any existing modal
        const existingModal = document.querySelector('.custom-modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease-out;
        `;

        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 20px;
            max-width: 90vw;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            animation: slideIn 0.3s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0 10px;
            box-sizing: border-box;
        `;

        // Icon based on type
        const icons = {
            alert: '⚠️',
            confirm: '❓',
            prompt: '✏️',
            success: '✅',
            error: '❌'
        };

        const icon = icons[type] || icons.alert;

        let modalHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">${icon}</div>
                <div style="font-size: 16px; color: #333; line-height: 1.4;">${message}</div>
            </div>
        `;

        // Buttons - use CSS media query approach
        const isSmallScreen = window.innerWidth < 350;
        const buttonContainerStyle = isSmallScreen ? 
            'display: flex; flex-direction: column; gap: 8px; align-items: stretch; width: 100%; box-sizing: border-box;' :
            'display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; width: 100%; box-sizing: border-box;';
        
        modalHTML += `<div style="${buttonContainerStyle}">`;
        
        if (type === 'confirm') {
            const buttonStyle = isSmallScreen ? `
                padding: 12px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                width: 100%;
                box-sizing: border-box;
                margin: 0;
            ` : `
                padding: 10px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                min-width: 80px;
                flex: 1;
                max-width: 120px;
            `;
            
            modalHTML += `
                <button id="modal-cancel" class="modal-btn modal-cancel-btn" style="
                    border: 2px solid #dc3545;
                    background: white;
                    color: #dc3545;
                    ${buttonStyle}
                ">
                    Cancel
                </button>
                <button id="modal-ok" class="modal-btn modal-ok-btn" style="
                    border: 2px solid #28a745;
                    background: #28a745;
                    color: white;
                    ${buttonStyle}
                ">
                    OK
                </button>
            `;
        } else {
            modalHTML += `
                <button id="modal-ok" class="modal-btn modal-ok-btn" style="
                    padding: 12px 24px;
                    border: 2px solid #007bff;
                    background: #007bff;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                    min-width: 120px;
                    ${isSmallScreen ? 'width: 100%; box-sizing: border-box;' : 'max-width: 200px;'}
                ">
                    OK
                </button>
            `;
        }

        modalHTML += '</div>';
        modal.innerHTML = modalHTML;
        overlay.appendChild(modal);

        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: scale(0.8) translateY(-20px); opacity: 0; }
                to { transform: scale(1) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(overlay);

        // Event listeners
        const handleClose = (result) => {
            overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
            modal.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                overlay.remove();
                style.remove();
                resolve(result);
            }, 200);
        };

        const okBtn = document.getElementById('modal-ok');
        const cancelBtn = document.getElementById('modal-cancel');

        if (okBtn) {
            okBtn.addEventListener('click', () => {
                handleClose(true);
            });
            
            // Add hover effects for OK button
            okBtn.addEventListener('mouseenter', () => {
                if (okBtn.style.backgroundColor === '#28a745') {
                    okBtn.style.backgroundColor = '#218838';
                } else if (okBtn.style.backgroundColor === '#007bff') {
                    okBtn.style.backgroundColor = '#0056b3';
                }
            });
            okBtn.addEventListener('mouseleave', () => {
                if (okBtn.style.border.includes('#28a745')) {
                    okBtn.style.backgroundColor = '#28a745';
                } else if (okBtn.style.border.includes('#007bff')) {
                    okBtn.style.backgroundColor = '#007bff';
                }
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                handleClose(false);
            });
            
            // Add hover effects for Cancel button
            cancelBtn.addEventListener('mouseenter', () => {
                if (cancelBtn.style.border.includes('#dc3545')) {
                    cancelBtn.style.backgroundColor = '#dc3545';
                    cancelBtn.style.color = 'white';
                }
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.backgroundColor = 'white';
                if (cancelBtn.style.border.includes('#dc3545')) {
                    cancelBtn.style.color = '#dc3545';
                }
            });
        }

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleClose(type === 'confirm' ? false : true);
            }
        });

        // Handle Enter and Escape keys
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleClose(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClose(type === 'confirm' ? false : true);
            }
        };

        document.addEventListener('keydown', handleKeydown);
        
        // Clean up event listener when modal closes
        const originalResolve = resolve;
        resolve = (result) => {
            document.removeEventListener('keydown', handleKeydown);
            originalResolve(result);
        };
    });
}

// New socket event handlers for hand functionality
socket.on('handRaised', (data) => {
    // This is sent to the moderator only - players get handRaisedNotification
});

socket.on('handRaisedNotification', (data) => {
    someoneRaisedHand = true;
    updateShowHandButton();
    
    if (data.playerName !== playerName) {
        showError(window.i18n.t('playerRaisedHand', { playerName: data.playerName }));
        setTimeout(hideError, 3000);
    }
});

socket.on('handDenied', () => {
    // This player's hand was denied - clear their form and reset
    handRaised = false;
    someoneRaisedHand = false;
    
    // Clear the form
    const form = document.getElementById('answers-form');
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove('valid', 'invalid', 'empty');
        input.classList.add('empty');
    });
    
    // Update button visibility immediately after clearing
    validateAndUpdateShowHandButton();
    
    showError(window.i18n.t('handWasDenied'));
    setTimeout(hideError, 5000);
});

socket.on('handProcessed', () => {
    // Reset hand status for next attempt
    someoneRaisedHand = false;
    validateAndUpdateShowHandButton();
});

socket.on('handRaisingEnabled', () => {
    // Enable hand raising after 3 seconds in random rooms
    const showHandBtn = document.getElementById('show-hand-btn');
    if (showHandBtn) {
        showHandBtn.disabled = false;
    }
    validateAndUpdateShowHandButton();
});

socket.on('handRaisedNotification', (data) => {
    if (data.autoApproved) {
        // In random rooms, show loading screen and notification that round is ending
        showLoadingScreen(window.i18n.t('playerRaisedHandEnding', { playerName: data.playerName }));
        const feedbackDiv = document.getElementById('show-hand-feedback');
        if (feedbackDiv) {
            feedbackDiv.textContent = `${data.playerName} raised hand - round ending!`;
            feedbackDiv.className = 'show-hand-feedback warning';
        }
    } else {
        someoneRaisedHand = true;
        updateShowHandButton();
    }
});

// Enhanced feedback submission function with state tracking
async function submitFeedback(answer, category, letter, aiSaid, userSays) {
    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                answer: answer,
                category: category,
                letter: letter,
                aiSaid: aiSaid,
                userSays: userSays
            })
        });
        
        if (response.ok) {
            console.log('Feedback submitted successfully:', {
                answer, category, letter, aiSaid, userSays
            });
            
            const answerKey = getAnswerKey(answer, category, letter);
            feedbackState.set(answerKey, { 
                submitted: true, 
                isPositive: userSays === aiSaid // Positive if user agrees with AI
            });
        } else {
            console.error('Failed to submit feedback');
        }
    } catch (error) {
        console.error('Error submitting feedback:', error);
    }
}

document.querySelector('#back-btn').addEventListener('click', () => {
    window.location.href = '/';
});