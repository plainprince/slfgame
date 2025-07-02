const socket = io();

// Game state
let gameId = '';
let categories = ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'];
let currentRound = 0;
let currentLetter = '';
let moderatorName = '';
let roundStopLoading = false; // Track loading state

// DOM elements
const gameSetup = document.getElementById('game-setup');
const splitView = document.getElementById('split-view');
const results = document.getElementById('results');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await window.i18n.init();
    setupEventListeners();
    initializeCategories();
    
    // Initialize button states
    updateStopRoundButton();
});

// Listen for language changes
window.addEventListener('languageChanged', (event) => {
    initializeCategories();
    // Update stop round button text
    updateStopRoundButton();
});

function setupEventListeners() {
    // Create game form
    document.getElementById('createForm').addEventListener('submit', (e) => {
        e.preventDefault();
        createGame();
    });

    // Category input
    document.getElementById('category-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCategory();
        }
    });

    // Back button
    document.querySelector('.back-btn').addEventListener('click', () => {
        location.href = '/';
    });

    // Game controls
    document.getElementById('start-game-btn-mod').addEventListener('click', startGameRound);
    document.getElementById('stop-round-btn-mod').addEventListener('click', stopRound);
    document.getElementById('end-game-btn-mod').addEventListener('click', endGame);
    document.getElementById('next-round-btn').addEventListener('click', startGameRound);
}

function initializeCategories() {
    const container = document.getElementById('categories-container');
    container.innerHTML = '';
    categories.forEach(category => {
        addCategoryTag(category);
    });
}

function addCategory() {
    const input = document.getElementById('category-input');
    const category = input.value.trim();
    
    if (category && !categories.includes(category)) {
        categories.push(category);
        addCategoryTag(category);
        input.value = '';
    }
}

function addCategoryTag(category) {
    const container = document.getElementById('categories-container');
    const tag = document.createElement('div');
    tag.className = 'category-tag';
    tag.innerHTML = `
        ${category}
        <span class="remove" data-category="${category}">&times;</span>
    `;
    
    // Add event listener for the remove button
    const removeBtn = tag.querySelector('.remove');
    removeBtn.addEventListener('click', () => {
        removeCategory(category);
    });
    
    container.appendChild(tag);
}

function removeCategory(category) {
    categories = categories.filter(c => c !== category);
    initializeCategories();
}

async function createGame() {
    moderatorName = document.getElementById('moderator-name').value.trim();
    
    if (!moderatorName) {
        alert(window.i18n.t('pleaseEnterName'));
        return;
    }

    if (categories.length === 0) {
        alert(window.i18n.t('addAtLeastOneCategory'));
        return;
    }

    // Create game with moderator playing mode
    socket.emit('createGame', { 
        categories,
        moderatorPlaying: true
    });
}

function startGameRound() {
    if (!gameId) return;
    socket.emit('startGameRound', { gameId });
}

function stopRound() {
    if (roundStopLoading) return; // Prevent double clicking
    socket.emit('stopRound', { gameId });
}

async function endGame() {
    const confirmed = confirm(window.i18n.t('confirmEndGame'));
    if (confirmed) {
        socket.emit('endGame', { gameId });
    }
}

function showSection(section) {
    // Hide all sections
    gameSetup.classList.add('hidden');
    splitView.classList.add('hidden');
    results.classList.add('hidden');

    // Show requested section
    document.getElementById(section).classList.remove('hidden');
}

function updatePlayersList(players) {
    const playerList = document.getElementById('player-list-mod');
    const playersCount = document.getElementById('players-count-mod');
    const startBtn = document.getElementById('start-game-btn-mod');
    
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
    
    const playerText = players.length === 1 ? window.i18n.t('player') : window.i18n.t('playersJoined');
    playersCount.textContent = `${players.length} ${playerText}`;
    
    // Enable start button if at least 1 player (moderator will also join as player)
    startBtn.disabled = players.length < 1;
}

function displayResults(resultsData) {
    const content = document.getElementById('results-content');
    
    // Create results table
    let html = `
        <div style="margin-bottom: 2rem;">
            <h3>${window.i18n.t('round')} ${resultsData.round} - ${window.i18n.t('letter')} "${resultsData.letter}"</h3>
        </div>
        <table class="results-table">
            <thead>
                <tr>
                    <th>${window.i18n.t('player')}</th>
    `;
    
    // Add category headers
    resultsData.categories.forEach(category => {
        html += `<th>${category}</th>`;
    });
    html += `<th>${window.i18n.t('roundScore')}</th><th>${window.i18n.t('totalScore')}</th></tr></thead><tbody>`;
    
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
            
            html += `<td>
                <div class="answer-container">
                    <span class="${cssClass}">${answer || '-'}</span>
                    ${answer ? `
                        <div class="feedback-buttons">
                            <button class="feedback-btn thumbs-up" data-answer="${answer}" data-category="${category}" data-letter="${resultsData.letter}" data-ai-said="${isValid}" data-user-says="true" title="Correct validation">👍</button>
                            <button class="feedback-btn thumbs-down" data-answer="${answer}" data-category="${category}" data-letter="${resultsData.letter}" data-ai-said="${isValid}" data-user-says="false" title="Incorrect validation">👎</button>
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
        </div>
    `;
    
    content.innerHTML = html;
    
    // Add event listeners for feedback buttons
    content.querySelectorAll('.feedback-btn').forEach(button => {
        button.addEventListener('click', () => {
            const answer = button.dataset.answer;
            const category = button.dataset.category;
            const letter = button.dataset.letter;
            const aiSaid = button.dataset.aiSaid === 'true';
            const userSays = button.dataset.userSays === 'true';
            submitFeedback(answer, category, letter, aiSaid, userSays);
        });
    });
}

function showFinalResults(data) {
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
            <button class="btn btn-primary return-home-btn" style="margin-top: 1rem;">
                ${window.i18n.t('returnToHome')}
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Add event listener for return home button
    const returnHomeBtn = content.querySelector('.return-home-btn');
    if (returnHomeBtn) {
        returnHomeBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    // Hide next round button
    document.getElementById('next-round-btn').style.display = 'none';
    
    showSection('results');
}

// Socket event listeners
socket.on('gameCreated', (data) => {
    gameId = data.gameId;
    categories = data.categories;
    
    // Update persistent game info
    document.getElementById('persistent-game-id-mod').textContent = gameId;
    
    // Set up iframe to join the game as a player
    const iframe = document.getElementById('player-iframe');
    iframe.src = `/join/${gameId}?name=${encodeURIComponent(moderatorName)}&auto=true`;
    
    showSection('split-view');
    
    // Initialize with empty player list
    updatePlayersList([]);
});

socket.on('playerJoined', (data) => {
    updatePlayersList(data.players);
});

socket.on('roundStarted', (data) => {
    currentRound = data.round;
    currentLetter = data.letter;
    categories = data.categories;
    
    // Update persistent game ID (ensure it stays visible)
    const persistentGameId = document.getElementById('persistent-game-id-mod');
    if (persistentGameId) {
        persistentGameId.textContent = data.gameId;
    }
    
    // Update moderator UI
    document.getElementById('current-round-mod').textContent = currentRound;
    document.getElementById('current-letter-mod').textContent = currentLetter;
    document.getElementById('round-info-mod').classList.remove('hidden');
    
    // Show stop round button, hide start button during play
    document.getElementById('stop-round-btn-mod').classList.remove('hidden');
    document.getElementById('start-game-btn-mod').style.display = 'none';
    document.getElementById('next-round-btn').style.display = 'none';
    
    // Reset loading state
    roundStopLoading = false;
    updateStopRoundButton();
    
    // For random rooms, the 3-second timeout is handled in the player iframe
    if (data.isRandomRoom) {
        console.log('Round started in random room - 3 second timeout will be enforced');
    }
});

socket.on('handRaisedNotification', (data) => {
    if (data.autoApproved) {
        console.log(`Hand auto-approved in random room: ${data.playerName}`);
        // The round will end automatically, no action needed from moderator
        
        // Show notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-weight: 500;
        `;
        notification.textContent = `✋ ${data.playerName} raised hand - round ending!`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    } else {
        // In moderator playing mode, automatically approve any hand that is raised
        // This implements the school-style rule where the first person to finish wins
        socket.emit('approveHand', { gameId, approved: true });
        
        // Show notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-weight: 500;
        `;
        notification.textContent = `✋ ${data.playerName} raised hand - auto-approved!`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
});

socket.on('roundEnded', (data) => {
    // Hide stop round button, show next round button after round ends
    document.getElementById('stop-round-btn-mod').classList.add('hidden');
    document.getElementById('start-game-btn-mod').style.display = 'inline-block';
    document.getElementById('next-round-btn').style.display = 'inline-block';
    
    // Ensure loading overlay is hidden
    hideLoadingOverlay();
    
    // Display results
    displayResults(data);
    showSection('results');
});

socket.on('gameEnded', (data) => {
    console.log('Game ended, received data:', data);
    showFinalResults(data);
});

socket.on('error', (data) => {
    console.error('Socket error:', data);
    alert(`Error: ${data.error}`);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('roundStopLoading', (loading) => {
    roundStopLoading = loading;
    updateStopRoundButton();
});

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
            <div class="loading-text">${window.i18n.t('stoppingRound')}</div>
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
    const stopBtn = document.getElementById('stop-round-btn-mod');
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

        // Buttons
        modalHTML += '<div style="display: flex; gap: 12px; justify-content: center;">';
        
        if (type === 'confirm') {
            modalHTML += `
                <button id="modal-cancel" class="modal-btn modal-cancel-btn" style="
                    padding: 10px 20px;
                    border: 2px solid #dc3545;
                    background: white;
                    color: #dc3545;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                ">
                    Cancel
                </button>
                <button id="modal-ok" class="modal-btn modal-ok-btn" style="
                    padding: 10px 20px;
                    border: 2px solid #28a745;
                    background: #28a745;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                ">
                    OK
                </button>
            `;
        } else {
            modalHTML += `
                <button id="modal-ok" class="modal-btn modal-ok-btn" style="
                    padding: 10px 24px;
                    border: 2px solid #007bff;
                    background: #007bff;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
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

// Track feedback state for each answer
const feedbackState = new Map(); // Map of answerKey -> { thumbsUp: boolean, thumbsDown: boolean }

function getAnswerKey(answer, category, letter) {
    return `${answer}_${category}_${letter}`;
}

// Feedback submission function
async function submitFeedback(answer, category, letter, aiSaid, userSays) {
    const answerKey = getAnswerKey(answer, category, letter);
    const currentState = feedbackState.get(answerKey) || { thumbsUp: false, thumbsDown: false };
    
    // Check if this is a negative feedback submission or undo
    if (!userSays) { // Thumbs down
        if (currentState.thumbsDown) {
            // Already submitted negative feedback, ask for confirmation to undo
            const confirmed = await createModal('confirm', window.i18n.t('confirmUndoNegativeFeedback'));
            if (!confirmed) {
                return;
            }
        } else {
            // First time submitting negative feedback, ask for confirmation
            const confirmed = await createModal('confirm', window.i18n.t('confirmNegativeFeedback'));
            if (!confirmed) {
                return;
            }
        }
    }
    
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
            // Update feedback state
            if (userSays) {
                currentState.thumbsUp = !currentState.thumbsUp;
                currentState.thumbsDown = false;
            } else {
                currentState.thumbsDown = !currentState.thumbsDown;
                currentState.thumbsUp = false;
            }
            feedbackState.set(answerKey, currentState);
            
            // Update button visual states
            updateFeedbackButtonStates(answer, category, letter);
            
            console.log('Feedback submitted successfully');
        } else {
            console.error('Failed to submit feedback');
        }
    } catch (error) {
        console.error('Error submitting feedback:', error);
    }
}

function updateFeedbackButtonStates(answer, category, letter) {
    const answerKey = getAnswerKey(answer, category, letter);
    const state = feedbackState.get(answerKey) || { thumbsUp: false, thumbsDown: false };
    
    const buttons = document.querySelectorAll(`button[data-answer="${answer}"][data-category="${category}"][data-letter="${letter}"]`);
    
    buttons.forEach(btn => {
        if (btn.classList.contains('thumbs-up')) {
            if (state.thumbsUp) {
                btn.style.backgroundColor = '#28a745';
                btn.style.color = 'white';
                btn.style.opacity = '1';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.opacity = '1';
            }
        } else if (btn.classList.contains('thumbs-down')) {
            if (state.thumbsDown) {
                btn.style.backgroundColor = '#dc3545';
                btn.style.color = 'white';
                btn.style.opacity = '0.7';
                btn.style.filter = 'grayscale(50%)';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.opacity = '1';
                btn.style.filter = '';
            }
        }
    });
} 