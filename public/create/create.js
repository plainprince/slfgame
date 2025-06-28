// Custom modal system to replace browser alerts
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
            padding: 24px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            animation: slideIn 0.3s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

        if (type === 'prompt') {
            modalHTML += `
                <input type="text" id="modal-input" placeholder="${options.placeholder || ''}" 
                       value="${options.defaultValue || ''}"
                       style="
                           width: 100%;
                           padding: 12px;
                           border: 2px solid #e0e0e0;
                           border-radius: 8px;
                           font-size: 14px;
                           margin-bottom: 20px;
                           box-sizing: border-box;
                           outline: none;
                           transition: border-color 0.2s;
                       "
                       onfocus="this.style.borderColor='#007bff'"
                       onblur="this.style.borderColor='#e0e0e0'">
            `;
        }

        // Buttons
        modalHTML += '<div style="display: flex; gap: 12px; justify-content: center;">';
        
        if (type === 'confirm') {
            modalHTML += `
                <button id="modal-cancel" style="
                    padding: 10px 20px;
                    border: 2px solid #dc3545;
                    background: white;
                    color: #dc3545;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#dc3545'; this.style.color='white';"
                   onmouseout="this.style.background='white'; this.style.color='#dc3545';">
                    Cancel
                </button>
                <button id="modal-ok" style="
                    padding: 10px 20px;
                    border: 2px solid #28a745;
                    background: #28a745;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#218838';"
                   onmouseout="this.style.background='#28a745';">
                    OK
                </button>
            `;
        } else if (type === 'prompt') {
            modalHTML += `
                <button id="modal-cancel" style="
                    padding: 10px 20px;
                    border: 2px solid #6c757d;
                    background: white;
                    color: #6c757d;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#6c757d'; this.style.color='white';"
                   onmouseout="this.style.background='white'; this.style.color='#6c757d';">
                    Cancel
                </button>
                <button id="modal-ok" style="
                    padding: 10px 20px;
                    border: 2px solid #007bff;
                    background: #007bff;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#0056b3';"
                   onmouseout="this.style.background='#007bff';">
                    OK
                </button>
            `;
        } else {
            modalHTML += `
                <button id="modal-ok" style="
                    padding: 10px 24px;
                    border: 2px solid #007bff;
                    background: #007bff;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#0056b3';"
                   onmouseout="this.style.background='#007bff';">
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

        // Focus input if prompt
        if (type === 'prompt') {
            setTimeout(() => {
                const input = document.getElementById('modal-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        }

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
        const input = document.getElementById('modal-input');

        if (okBtn) {
            okBtn.addEventListener('click', () => {
                if (type === 'prompt') {
                    handleClose(input ? input.value : '');
                } else {
                    handleClose(true);
                }
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                handleClose(type === 'prompt' ? null : false);
            });
        }

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleClose(type === 'confirm' ? false : type === 'prompt' ? null : true);
            }
        });

        // Handle Enter and Escape keys
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (type === 'prompt') {
                    handleClose(input ? input.value : '');
                } else {
                    handleClose(true);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClose(type === 'confirm' ? false : type === 'prompt' ? null : true);
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

// Override default browser dialogs
window.alert = (message) => createModal('alert', message);
window.confirm = (message) => createModal('confirm', message);
window.prompt = (message, defaultValue = '') => createModal('prompt', message, { defaultValue });

// Additional utility functions for different alert types
window.showSuccess = (message) => createModal('success', message);
window.showError = (message) => createModal('error', message);

const socket = io();

// Game state
let gameId = '';
let categories = ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'];
let currentRound = 0;
let currentLetter = '';
let roundTimer = null;
let isGameCreator = true; // Creator is always the moderator
let handRaisedData = null; // Store hand raised data for moderator approval
let roundStopLoading = false; // Track loading state

// LocalStorage keys
const GAME_DATA_KEY = 'slfgame_data';

// DOM elements
const gameSetup = document.getElementById('game-setup');
const waitingRoom = document.getElementById('waiting-room');
const gamePlay = document.getElementById('game-play');
const results = document.getElementById('results');
const headerSubtitle = document.getElementById('header-subtitle');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Clear any existing game data since this is game creation
    localStorage.removeItem(GAME_DATA_KEY);
    
    await window.i18n.init();
    initializeCategories();
    setupEventListeners();
    setupShareFunctionality();
    
    // Initialize button states
    updateStopRoundButton();
});

// Listen for language changes
window.addEventListener('languageChanged', (event) => {
    initializeCategories();
    updatePlayersListText();
});

function initializeCategories() {
    // Initialize default categories if empty
    if (categories.length === 0 && window.i18n && window.i18n.initialized) {
        categories = window.i18n.getDefaultCategories();
    }
    
    const container = document.getElementById('categories-container');
    container.innerHTML = '';
    
    categories.forEach(category => {
        addCategoryTag(category);
    });
}

function addCategoryTag(category) {
    const container = document.getElementById('categories-container');
    const tag = document.createElement('div');
    tag.className = 'category-tag';
    tag.innerHTML = `
        ${category}
        <span class="remove" onclick="removeCategory('${category}')">&times;</span>
    `;
    container.appendChild(tag);
}

function removeCategory(category) {
    categories = categories.filter(c => c !== category);
    initializeCategories();
}

function setupEventListeners() {
    // Category input
    const categoryInput = document.getElementById('category-input');
    categoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = categoryInput.value.trim();
            if (value && !categories.includes(value)) {
                categories.push(value);
                addCategoryTag(value);
                categoryInput.value = '';
            }
        }
    });

    // Create game form
    document.getElementById('createForm').addEventListener('submit', (e) => {
        e.preventDefault();
        createGame();
    });

    // Start game button
    document.getElementById('start-game-btn').addEventListener('click', () => {
        startGameRound();
    });

    // Stop round
    document.getElementById('stop-round-btn').addEventListener('click', () => {
        stopRound();
    });

    // Next round
    document.getElementById('next-round-btn').addEventListener('click', () => {
        startGameRound();
    });

    // End game
    document.getElementById('end-game-btn').addEventListener('click', () => {
        endGame();
    });

    // End game functionality is handled by existing button in the UI
}

function setupShareFunctionality() {
    // Copy share link button
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        copyShareLink();
    });

    // Copy game ID button
    document.getElementById('copy-id-btn').addEventListener('click', () => {
        copyGameId();
    });
}

function generateQRCode(gameId) {
    const qrContainer = document.getElementById('qr-code');
    
    // Create share URL
    const shareUrl = `${window.location.origin}/join/${gameId}`;
    
    // Function to actually generate the QR code
    const generateQR = () => {
        if (typeof QRCode !== 'undefined') {
            // Clear any existing QR code
            qrContainer.innerHTML = '';
            
            // Create QR code using qrcodejs library
            new QRCode(qrContainer, {
                text: shareUrl,
                width: 120,
                height: 120,
                colorDark: '#667eea',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            // Fallback if library not loaded
            generateSimpleQR(qrContainer, shareUrl);
        }
    };
    
    // Check if QRCode library is loaded, if not wait for it
    if (typeof QRCode !== 'undefined') {
        generateQR();
    } else {
        // Wait for library to load with a timeout
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds maximum wait
        
        const checkLibrary = () => {
            attempts++;
            if (typeof QRCode !== 'undefined') {
                generateQR();
            } else if (attempts < maxAttempts) {
                setTimeout(checkLibrary, 100);
            } else {
                console.warn('QRCode library failed to load, using fallback');
                generateSimpleQR(qrContainer, shareUrl);
            }
        };
        
        checkLibrary();
    }
}

function generateSimpleQR(container, text) {
    // Create a simple placeholder
    container.innerHTML = `
        <div style="
            width: 120px;
            height: 120px;
            background-color: #667eea;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            font-size: 12px;
            text-align: center;
            font-family: Arial, sans-serif;
        ">
            <div>QR Code</div>
            <div>(Scan with phone)</div>
        </div>
    `;
    
    // Store the URL for potential use
    container.dataset.url = text;
}

function generatePersistentQRCode(gameId) {
    const container = document.getElementById('persistent-qr-code');
    if (!container) return;
    
    const shareUrl = `${window.location.origin}/join/${gameId}`;
    
    // Try to use QRCode library if available
    const generateQR = () => {
        try {
            if (typeof QRCode !== 'undefined') {
                container.innerHTML = '';
                new QRCode(container, {
                    text: shareUrl,
                    width: 60,
                    height: 60,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                // Fallback to simple QR placeholder
                container.innerHTML = `
                    <div style="
                        width: 60px;
                        height: 60px;
                        background-color: #667eea;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        color: white;
                        font-size: 8px;
                        text-align: center;
                        font-family: Arial, sans-serif;
                        border-radius: 4px;
                    ">
                        <div>QR</div>
                        <div>Code</div>
                    </div>
                `;
            }
        } catch (error) {
            console.warn('QR Code generation failed, using fallback:', error);
            container.innerHTML = `
                <div style="
                    width: 60px;
                    height: 60px;
                    background-color: #667eea;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    color: white;
                    font-size: 8px;
                    text-align: center;
                    font-family: Arial, sans-serif;
                    border-radius: 4px;
                ">
                    <div>QR</div>
                    <div>Code</div>
                </div>
            `;
        }
    };

    // Check if QRCode library is loaded
    if (typeof QRCode !== 'undefined') {
        generateQR();
    } else {
        // Wait a bit for library to load, then fallback if needed
        const checkLibrary = () => {
            if (typeof QRCode !== 'undefined') {
                generateQR();
            } else {
                setTimeout(() => {
                    if (typeof QRCode !== 'undefined') {
                        generateQR();
                    } else {
                        container.innerHTML = `
                            <div style="
                                width: 60px;
                                height: 60px;
                                background-color: #667eea;
                                display: flex;
                                flex-direction: column;
                                justify-content: center;
                                align-items: center;
                                color: white;
                                font-size: 8px;
                                text-align: center;
                                font-family: Arial, sans-serif;
                                border-radius: 4px;
                            ">
                                <div>QR</div>
                                <div>Code</div>
                            </div>
                        `;
                    }
                }, 500);
            }
        };
        setTimeout(checkLibrary, 100);
    }
}

async function copyShareLink() {
    const shareUrl = `${window.location.origin}/join/${gameId}`;
    try {
        await navigator.clipboard.writeText(shareUrl);
        showSuccess('Share link copied to clipboard!');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Share link copied to clipboard!');
    }
}

async function copyGameId() {
    try {
        await navigator.clipboard.writeText(gameId);
        showSuccess('Game ID copied to clipboard!');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = gameId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Game ID copied to clipboard!');
    }
}

async function createGame() {
    if (categories.length === 0) {
        await alert(window.i18n.t('addAtLeastOneCategory'));
        return;
    }

    socket.emit('createGame', { categories });

    document.getElementById('end-game-btn').style.display = 'block';
}

function startGameRound() {
    if (!gameId) return;
    socket.emit('startGameRound', { gameId });
}

function submitAnswers() {
    const answers = {};
    const form = document.getElementById('answers-form');
    const inputs = form.querySelectorAll('input');
    
    inputs.forEach(input => {
        answers[input.dataset.category] = input.value.trim();
    });

    socket.emit('submitAnswers', { gameId, answers });
}

function stopRound() {
    if (roundStopLoading) return; // Prevent double clicking
    socket.emit('stopRound', { gameId });
}

async function endGame() {
    const confirmed = await confirm(window.i18n.t('confirmEndGame'));
    if (confirmed) {
        console.log('Sending endGame event for gameId:', gameId);
        socket.emit('endGame', { gameId });
    }
}

function showSection(section) {
    // Hide all sections
    gameSetup.classList.add('hidden');
    waitingRoom.classList.add('hidden');
    gamePlay.classList.add('hidden');
    results.classList.add('hidden');

    // Show requested section
    document.getElementById(section).classList.remove('hidden');
    
    // Update header
    switch(section) {
        case 'game-setup':
            headerSubtitle.textContent = window.i18n.t('createYourGame');
            break;
        case 'waiting-room':
            headerSubtitle.textContent = window.i18n.t('waitingForPlayers');
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
    const startBtn = document.getElementById('start-game-btn');
    
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
    
    // Enable start button if at least 1 player
    startBtn.disabled = players.length < 1;
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
socket.on('gameCreated', (data) => {
    gameId = data.gameId;
    categories = data.categories;
    
    // Update game info
    document.getElementById('game-id-display').textContent = gameId;
    
    // Generate QR code for the share link
    generateQRCode(gameId);
    
    // Show categories
    const gameCategories = document.getElementById('game-categories');
    gameCategories.innerHTML = '';
    categories.forEach(category => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.textContent = category;
        gameCategories.appendChild(tag);
    });
    
    showSection('waiting-room');
    
    // Initialize with empty player list
    updatePlayersList([]);
});

socket.on('gameEnded', (data) => {
    // Clear timer
    if (roundTimer) {
        clearInterval(roundTimer);
        roundTimer = null;
    }
    
    console.log('Game ended, received data:', data);
    
    // Hide persistent game info since game is over
    const persistentGameInfo = document.getElementById('persistent-game-info');
    if (persistentGameInfo) {
        persistentGameInfo.style.display = 'none';
    }
    
    // Clear localStorage since game is over
    localStorage.removeItem(GAME_DATA_KEY);
    
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
            <button onclick="localStorage.removeItem('${GAME_DATA_KEY}'); window.location.href='/'" class="btn btn-primary" style="margin-top: 1rem;">
                Return to Home
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Hide next round button and show only home button
    document.getElementById('next-round-btn').style.display = 'none';
    
    showSection('results');
    headerSubtitle.textContent = 'Game Over';
}

socket.on('playerJoined', (data) => {
    updatePlayersList(data.players);
});

// Removed playerDisconnected handler - no longer tracking online/offline status

socket.on('roundStarted', (data) => {
    currentRound = data.round;
    currentLetter = data.letter;
    categories = data.categories;
    
    // Update persistent game ID display
    const persistentGameId = document.getElementById('persistent-game-id');
    if (persistentGameId) {
        persistentGameId.textContent = data.gameId;
    }
    
    // Generate persistent QR code
    generatePersistentQRCode(data.gameId);
    
    // Show persistent game info
    const persistentGameInfo = document.getElementById('persistent-game-info');
    if (persistentGameInfo) {
        persistentGameInfo.style.display = 'flex';
    }
    
    // Update UI
    document.getElementById('current-round').textContent = currentRound;
    document.getElementById('current-letter').textContent = currentLetter;
    
    // Show stop round button, hide next round button during play
    document.getElementById('stop-round-btn').style.display = 'inline-block';
    document.getElementById('next-round-btn').style.display = 'none';
    
    // Reset loading state
    roundStopLoading = false;
    updateStopRoundButton();
    
    // Start timer (no time limit)
    startTimer();
    
    showSection('game-play');
});

socket.on('roundStopping', () => {
    // Round is being stopped early - teacher initiated this, so just wait
    console.log('Round stopping...');
});

socket.on('roundEnded', (data) => {
    // Clear timer
    if (roundTimer) {
        clearInterval(roundTimer);
        roundTimer = null;
    }
    
    // Hide stop round button, show next round button after round ends
    document.getElementById('stop-round-btn').style.display = 'none';
    document.getElementById('next-round-btn').style.display = 'inline-block';
    
    // Ensure loading overlay is hidden
    hideLoadingOverlay();
    
    // Display results
    displayResults(data);
    showSection('results');
});

socket.on('error', (data) => {
    console.error('Socket error:', data);
    showError(`Error: ${data.error}`);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect', () => {
    console.log('Connected to server');
});

// Handle page refresh/close
window.addEventListener('beforeunload', () => {
    if (roundTimer) {
        clearInterval(roundTimer);
    }
});

// Clear localStorage when navigating away from create page
window.addEventListener('beforeunload', (e) => {
    // Clear game data when leaving create page
    localStorage.removeItem(GAME_DATA_KEY);
});

// New function to handle hand approval
function approveHand(approved) {
    if (!handRaisedData) return;
    
    socket.emit('approveHand', { gameId, approved });
    
    // Hide the hand approval modal
    hideHandApprovalModal();
    handRaisedData = null;
}

function showHandApprovalModal(data) {
    // Remove any existing modal
    const existingModal = document.querySelector('.hand-approval-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'hand-approval-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
        padding: 20px;
        box-sizing: border-box;
    `;

    let answersHtml = '';
    categories.forEach(category => {
        const answer = data.answers[category] || '';
        answersHtml += `<p style="margin: 8px 0; word-break: break-word;"><strong>${category}:</strong> ${answer}</p>`;
    });

    modal.innerHTML = `
        <div style="
            background: white; 
            border-radius: 12px; 
            padding: 20px; 
            max-width: 500px; 
            width: 100%; 
            max-height: 90vh; 
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        ">
            <h3 style="margin: 0 0 16px 0; text-align: center; color: #333;">✋ ${data.playerName} raised their hand!</h3>
            <div style="margin: 16px 0; max-height: 300px; overflow-y: auto;">
                <h4 style="margin: 0 0 12px 0; color: #666;">Their answers:</h4>
                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
                    ${answersHtml}
                </div>
            </div>
            <div style="
                display: flex; 
                flex-direction: column;
                gap: 12px; 
                margin-top: 20px;
            ">
                <button onclick="approveHand(false)" style="
                    padding: 12px 20px;
                    border: 2px solid #dc3545;
                    background: white;
                    color: #dc3545;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 500;
                    transition: all 0.2s;
                    width: 100%;
                " onmouseover="this.style.background='#dc3545'; this.style.color='white';"
                   onmouseout="this.style.background='white'; this.style.color='#dc3545';">
                    ❌ Deny (Invalid Answers)
                </button>
                <button onclick="approveHand(true)" style="
                    padding: 12px 20px;
                    border: 2px solid #28a745;
                    background: #28a745;
                    color: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 500;
                    transition: all 0.2s;
                    width: 100%;
                " onmouseover="this.style.background='#218838';"
                   onmouseout="this.style.background='#28a745';">
                    ✅ Approve (End Round)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    handRaisedData = data;
}

function hideHandApprovalModal() {
    const modal = document.querySelector('.hand-approval-modal');
    if (modal) {
        modal.remove();
    }
}

function showLoadingOverlay() {
    // Remove any existing overlay
    hideLoadingOverlay();
    
    // Create loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'round-stop-loading';
    
    overlay.innerHTML = `
        <div class="loading-spinner">
            <div class="loading-dots">⋯</div>
            <div class="loading-text">Stopping Round...</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('round-stop-loading');
    if (overlay) {
        overlay.remove();
    }
}

function updateStopRoundButton() {
    const stopBtn = document.getElementById('stop-round-btn');
    if (!stopBtn) return;

    if (roundStopLoading) {
        showLoadingOverlay();
        stopBtn.disabled = true;
    } else {
        // Don't hide loading overlay here - let it stay until results are shown
        stopBtn.innerHTML = window.i18n.t('stopRound');
        stopBtn.disabled = false;
    }
}

// New socket event handlers
socket.on('handRaised', (data) => {
    // Show hand approval modal to moderator
    showHandApprovalModal(data);
});

socket.on('handRaisedNotification', (data) => {
    // Show notification that someone raised their hand
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007bff;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 9999;
        font-weight: 500;
    `;
    notification.textContent = `✋ ${data.playerName} raised their hand!`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
});

socket.on('handProcessed', () => {
    hideHandApprovalModal();
    handRaisedData = null;
});

socket.on('roundStopLoading', (loading) => {
    roundStopLoading = loading;
    updateStopRoundButton();
});

