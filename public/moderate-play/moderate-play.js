const socket = io();

// Game state
let gameId = '';
let categories = ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'];
let currentRound = 0;
let currentLetter = '';
let moderatorName = '';

// DOM elements
const gameSetup = document.getElementById('game-setup');
const splitView = document.getElementById('split-view');
const results = document.getElementById('results');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await window.i18n.init();
    setupEventListeners();
    initializeCategories();
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
        <span class="remove" onclick="removeCategory('${category}')">&times;</span>
    `;
    container.appendChild(tag);
}

function removeCategory(category) {
    categories = categories.filter(c => c !== category);
    initializeCategories();
}

async function createGame() {
    moderatorName = document.getElementById('moderator-name').value.trim();
    
    if (!moderatorName) {
        alert('Please enter your name');
        return;
    }

    if (categories.length === 0) {
        alert('Please add at least one category');
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
    socket.emit('stopRound', { gameId });
}

async function endGame() {
    const confirmed = confirm('Are you sure you want to end the game?');
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
            <span class="player-score">${player.score} pts</span>
        `;
        playerList.appendChild(li);
    });
    
    playersCount.textContent = `${players.length} players joined`;
    
    // Enable start button if at least 1 player (moderator will also join as player)
    startBtn.disabled = players.length < 1;
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

function showFinalResults(data) {
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
            <button onclick="window.location.href='/'" class="btn btn-primary" style="margin-top: 1rem;">
                Return to Home
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Hide next round button
    document.getElementById('next-round-btn').style.display = 'none';
    
    showSection('results');
}

// Socket event listeners
socket.on('gameCreated', (data) => {
    gameId = data.gameId;
    categories = data.categories;
    
    // Update game info
    document.getElementById('game-id-mod').textContent = gameId;
    
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
    
    // Update moderator UI
    document.getElementById('current-round-mod').textContent = currentRound;
    document.getElementById('current-letter-mod').textContent = currentLetter;
    document.getElementById('round-info-mod').classList.remove('hidden');
    
    // Show stop round button, hide start button during play
    document.getElementById('stop-round-btn-mod').classList.remove('hidden');
    document.getElementById('start-game-btn-mod').style.display = 'none';
    document.getElementById('next-round-btn').style.display = 'none';
});

socket.on('handRaisedNotification', (data) => {
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
    notification.textContent = `✋ ${data.playerName} finished first! (Auto-approved)`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
});

socket.on('roundEnded', (data) => {
    // Hide stop round button, show next round button after round ends
    document.getElementById('stop-round-btn-mod').classList.add('hidden');
    document.getElementById('start-game-btn-mod').style.display = 'inline-block';
    document.getElementById('next-round-btn').style.display = 'inline-block';
    
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