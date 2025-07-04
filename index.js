import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Ollama } from 'ollama'
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load configuration from config.env
dotenv.config({ path: './config.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const USE_AI_VALIDATION = process.env.USE_AI_VALIDATION === 'true';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

// Configure Ollama client (only if AI validation is enabled)
let ollama = null;
if (USE_AI_VALIDATION) {
    ollama = new Ollama({
        host: OLLAMA_HOST
    });
    console.log(`AI validation enabled using model: ${OLLAMA_MODEL} at ${OLLAMA_HOST}`);
} else {
    console.log('AI validation disabled');
}

// File path for storing games data
const GAMES_FILE_PATH = path.join(__dirname, 'games.json');
const FEEDBACK_FILE = 'feedback.json';

// Initialize random public rooms (000000-000099)
function initializeRandomRooms() {
    for (let i = 0; i <= 99; i++) {
        const gameId = i.toString().padStart(6, '0');
        initialGames[gameId] = {
            id: gameId,
            categories: ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'], // Default SLFNT categories
            players: [],
            currentRound: 0,
            currentLetter: '',
            currentRoundAnswers: {},
            gameState: 'waiting',
            roundTimer: null,
            createdAt: Date.now(),
            creatorId: null, // No specific creator for random rooms
            playersAtRoundStart: [],
            handRaised: null,
            moderatorPlaying: false,
            isRandomRoom: true, // Mark as random room for special behavior
            autoStartTimer: null, // Timer for auto-starting next round
            handRaiseTimeouts: new Map() // Track hand raise timeouts per player
        };
    }
    console.log('Initialized 100 random public rooms (000000-000099)');
}

// Find the best random room for a player (least full room under 10 players)
function findBestRandomRoom() {
    for (let i = 0; i <= 99; i++) {
        const gameId = i.toString().padStart(6, '0');
        if (games[gameId] && games[gameId].players.length < 10) {
            return gameId;
        }
    }
    return null; // All rooms are full
}

// Function to save games to JSON file
async function saveGamesToFile(gamesData) {
    try {
        // Create a clean copy of games data without circular references and non-serializable data
        const cleanGamesData = {};
        
        Object.entries(gamesData).forEach(([gameId, game]) => {
            cleanGamesData[gameId] = {
                ...game,
                // Remove non-serializable properties
                roundTimer: null,
                validationCache: undefined,
                // Ensure createdAt is preserved
                createdAt: game.createdAt || Date.now()
            };
        });

        await fs.writeFile(GAMES_FILE_PATH, JSON.stringify(cleanGamesData, null, 2));
        console.log('Games data saved to file');
    } catch (error) {
        console.error('Error saving games to file:', error);
    }
}

// Function to load games from JSON file
async function loadGamesFromFile() {
    try {
        const data = await fs.readFile(GAMES_FILE_PATH, 'utf8');
        const loadedGames = JSON.parse(data);
        console.log('Games data loaded from file');
        return loadedGames;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No existing games file found, starting with empty games object');
            return {};
        }
        console.error('Error loading games from file:', error);
        return {};
    }
}

// Load existing games on startup
const initialGames = await loadGamesFromFile();

// Create a proxy to monitor changes to the games object
let games = new Proxy(initialGames, {
    set(target, property, value) {
        // Set the property
        target[property] = value;
        
        // Save to file whenever games object changes
        saveGamesToFile(target);
        
        return true;
    },
    
    deleteProperty(target, property) {
        // Delete the property
        delete target[property];
        
        // Save to file whenever games object changes
        saveGamesToFile(target);
        
        return true;
    }
});

// Load/save feedback functions
async function saveFeedbackToFile(feedbackData) {
    try {
        await fs.writeFile(FEEDBACK_FILE, JSON.stringify(feedbackData, null, 2));
        console.log('Feedback data saved to file');
    } catch (error) {
        console.error('Error saving feedback data:', error);
    }
}

async function loadFeedbackFromFile() {
    try {
        const data = await fs.readFile(FEEDBACK_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('Creating new feedback file');
        const initialData = { feedback: {} };
        await saveFeedbackToFile(initialData);
        return initialData;
    }
}

// Load existing feedback on startup
let feedbackData = await loadFeedbackFromFile();

async function isAnswerValid(answer, letter, category) {
    if (!answer || typeof answer !== 'string') return false;
    if (!answer.startsWith(letter)) return false;

    // Check feedback database first
    const answerKey = `${answer.trim().toLowerCase()}_${category.toLowerCase()}_${letter.toLowerCase()}`;
    
    if (feedbackData.feedback.hasOwnProperty(answerKey)) {
        console.log('Found feedback entry:', answerKey, '=', feedbackData.feedback[answerKey]);
        return feedbackData.feedback[answerKey];
    }

    // If AI validation is disabled, accept all answers that start with the correct letter
    if (!USE_AI_VALIDATION) {
        console.log('AI validation disabled, accepting answer:', answer);
        return true;
    }

    // If AI validation is enabled but ollama is not available, fall back to accepting answers
    if (!ollama) {
        console.log('AI validation enabled but Ollama not available, accepting answer:', answer);
        return true;
    }

    // Use AI validation
    try {
        const response = await ollama.chat({
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: 'You are validating answers for Stadt Land Fluss (City Country River). Answer ONLY with "true" or "false" (lowercase, no punctuation). NO OTHER TEXT.\n\nCategory definitions:\n- Stadt/City: Cities, towns, villages worldwide\n- Land/Country: Countries, states, regions worldwide  \n- Fluss/River: Rivers, streams, waterways worldwide\n- Name: First names, given names of people\n- Tier/Animal: Any animals, including mammals, birds, fish, insects, etc.\n\nBe accurate but not overly strict. Accept:\n- Well-known places/animals/names in any language\n- Alternative spellings and names\n- Historical or mythological names if appropriate\n\nReject only clearly wrong categories (e.g. "Berlin" for Animal, "Lion" for City).' },
                { role: 'user', content: `Is "${answer}" a valid answer for category "${category}"?` }
            ],
        });

        console.log('AI Response:', response.message.content);
        
        // Clean and normalize the response
        const cleanResponse = response.message.content.trim().toLowerCase();
        console.log('Cleaned Response:', cleanResponse);
        
        // Check if the response contains 'true' (more flexible matching)
        const isValid = cleanResponse.includes('true');
        console.log('Is Valid:', isValid);
        
        return isValid;
    } catch (error) {
        console.error('Error during AI validation:', error);
        // On error, fall back to accepting the answer
        return true;
    }
}

async function calculateScores(gameId, letter) {
    const game = games[gameId];
    if (!game || !game.currentRoundAnswers) return;

    const roundScores = {};
    
    // Cache validation results to avoid duplicate AI calls
    game.validationCache = {};

    // Initialize scores for this round
    game.players.forEach(player => {
        roundScores[player.name] = 0;
    });

    // Calculate scores for each category
    for (const category of game.categories) {
        const categoryAnswers = {};
        const validAnswers = [];

        // Collect all valid answers for this category
        for (const player of game.players) {
            const playerAnswer = game.currentRoundAnswers[player.name]?.[category];
            if (playerAnswer) {
                // Create cache key
                const cacheKey = `${playerAnswer}_${letter}_${category}`;
                
                // Check cache first, then validate if needed
                let isValid;
                if (game.validationCache[cacheKey] !== undefined) {
                    isValid = game.validationCache[cacheKey];
                } else {
                    isValid = await isAnswerValid(playerAnswer, letter, category);
                    game.validationCache[cacheKey] = isValid;
                }
                
                if (isValid) {
                    const normalizedAnswer = playerAnswer.trim().toLowerCase();
                    if (!categoryAnswers[normalizedAnswer]) {
                        categoryAnswers[normalizedAnswer] = [];
                    }
                    categoryAnswers[normalizedAnswer].push(player.name);
                    validAnswers.push({ player: player.name, answer: normalizedAnswer });
                }
            }
        }

        // Award points based on uniqueness
        Object.entries(categoryAnswers).forEach(([answer, players]) => {
            const points = players.length === 1 ? 20 : 10; // 20 for unique, 10 for duplicate
            players.forEach(playerName => {
                roundScores[playerName] += points;
            });
        });
    }

    // Update total scores
    Object.entries(roundScores).forEach(([playerName, roundScore]) => {
        const player = game.players.find(p => p.name === playerName);
        if (player) {
            player.score += roundScore;
        }
    });

    return roundScores;
}

app.use(express.static(path.join(__dirname, 'public')));

// Add share link route for direct joining
app.get('/join/:gameId', (req, res) => {
    const gameId = req.params.gameId;
    
    // Check if game exists
    if (!games[gameId]) {
        // Redirect to main join page if game doesn't exist
        return res.redirect('/join?error=Game not found');
    }
    
    // Serve the join page with the game ID pre-filled
    res.sendFile(path.join(__dirname, 'public', 'join', 'index.html'));
});

// Add route for moderate-play mode
app.get('/moderate-play', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'moderate-play', 'index.html'));
});

// Add route for play-randoms page
app.get('/play-randoms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'play-randoms', 'index.html'));
});

// Feedback submission endpoint
app.post('/api/feedback', async (req, res) => {
    try {
        const { answer, category, letter, aiSaid, userSays } = req.body;
        
        if (!answer || !category || !letter || typeof aiSaid !== 'boolean' || typeof userSays !== 'boolean') {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Determine the correct validation based on user feedback
        // If user agrees (userSays === aiSaid): keep AI's decision
        // If user disagrees (userSays !== aiSaid): use opposite of AI's decision
        const isValid = userSays === aiSaid ? aiSaid : !aiSaid;
        
        // Create simplified key for the answer
        const answerKey = `${answer.trim().toLowerCase()}_${category.trim().toLowerCase()}_${letter.trim().toLowerCase()}`;
        
        // Always update feedback - the client now manages when to send feedback
        // to prevent unwanted overwrites
        feedbackData.feedback[answerKey] = isValid;
        
        // Save to file
        await saveFeedbackToFile(feedbackData);
        
        console.log('Feedback saved:', answerKey, '=', isValid, 
                   `(AI said: ${aiSaid}, User says: ${userSays}, Agreement: ${userSays === aiSaid})`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize random rooms
initializeRandomRooms();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let playerName = '';
    let currentGameId = '';

    // Handle reconnection with stored socket ID
    socket.on('reconnect', (data) => {
        const { gameId, playerName: name, oldSocketId } = data;
        
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];
        const player = game.players.find(p => p.name === name);
        
        if (player) {
            // Update player's socket ID
            const oldSocketId = player.id;
            player.id = socket.id;
            
            socket.join(gameId);
            playerName = name;
            currentGameId = gameId;
            
            console.log(`Player ${name} reconnected to game ${gameId} (old socket: ${oldSocketId}, new socket: ${socket.id})`);
            
            // Send current game state to reconnected player
            socket.emit('gameState', {
                gameId: gameId,
                categories: game.categories,
                players: game.players.map(p => ({ name: p.name, score: p.score })),
                currentRound: game.currentRound,
                gameState: game.gameState,
                currentLetter: game.currentLetter
            });
            
            // Notify all players of reconnection
            io.to(gameId).emit('playerReconnected', {
                playerName: name,
                players: game.players.map(p => ({ name: p.name, score: p.score }))
            });
            
        } else {
            socket.emit('error', { error: 'Player not found in game' });
        }
    });

    // Handle synchronization request
    socket.on('synchronize', (data) => {
        const { gameId, playerName: name } = data;
        
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];
        const player = game.players.find(p => p.name === name);
        
        if (player) {
            // Send current game state
            socket.emit('synchronized', {
                gameId: gameId,
                categories: game.categories,
                players: game.players.map(p => ({ name: p.name, score: p.score })),
                currentRound: game.currentRound,
                gameState: game.gameState,
                currentLetter: game.currentLetter,
                currentRoundAnswers: game.currentRoundAnswers[name] || {}
            });
            
            console.log(`Player ${name} synchronized with game ${gameId}`);
        } else {
            socket.emit('error', { error: 'Player not found in game' });
        }
    });

    // create game
    socket.on('createGame', (data) => {
        // Generate 6-digit game ID
        let gameId = Math.floor(100000 + Math.random() * 900000).toString();

        // Ensure unique game ID
        while (games[gameId]) {
            gameId = Math.floor(100000 + Math.random() * 900000).toString();
        }

        games[gameId] = {
            id: gameId,
            categories: data.categories || ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'],
            players: [],
            currentRound: 0,
            currentLetter: '',
            currentRoundAnswers: {},
            gameState: 'waiting', // waiting, playing, ended
            roundTimer: null,
            createdAt: Date.now(),
            creatorId: socket.id, // Track who created the game
            playersAtRoundStart: [], // Track players who were present when round started
            handRaised: null, // Track who raised their hand
            moderatorPlaying: data.moderatorPlaying || false // New mode where moderator also plays
        };

        socket.join(gameId);
        socket.emit('gameCreated', { gameId: gameId, categories: games[gameId].categories });
        console.log(`Game created: ${gameId}`);
    });

    // join random game
    socket.on('joinRandom', (data) => {
        const name = data.name;

        // Find the best random room
        const gameId = findBestRandomRoom();
        if (!gameId) {
            socket.emit('error', { error: 'All random rooms are full (max 10 players each)' });
            return;
        }

        const game = games[gameId];

        // In random rooms, allow name reuse by removing the old player
        const existingPlayerIndex = game.players.findIndex(p => p.name === name);
        const wasExistingPlayer = existingPlayerIndex !== -1;
        
        if (wasExistingPlayer) {
            const oldPlayer = game.players[existingPlayerIndex];
            console.log(`Player ${name} rejoining random room ${gameId}, removing old instance (score: ${oldPlayer.score})`);
            
            // Remove the old player from the game
            game.players.splice(existingPlayerIndex, 1);
            
            // Also remove from current round tracking if they were there
            if (game.playersAtRoundStart) {
                const roundStartIndex = game.playersAtRoundStart.indexOf(name);
                if (roundStartIndex !== -1) {
                    game.playersAtRoundStart.splice(roundStartIndex, 1);
                }
            }
            
            // Remove their answers if they had any
            if (game.currentRoundAnswers && game.currentRoundAnswers[name]) {
                delete game.currentRoundAnswers[name];
            }
            
            // Reset hand raising if this player had their hand raised
            if (game.handRaised === name) {
                game.handRaised = null;
                console.log(`Reset hand raised status for rejoining player ${name}`);
            }
        }

        // Add player to game
        game.players.push({
            id: socket.id,
            name: name,
            score: 0
        });

        socket.join(gameId);
        playerName = name;
        currentGameId = gameId;

        // If the game is currently playing, add this player to the round tracking
        // so they don't break the submission counting
        if (game.gameState === 'playing' && game.playersAtRoundStart) {
            game.playersAtRoundStart.push(name);
            // Don't pre-initialize answers - let them submit naturally
            console.log(`Player ${name} joined mid-round in random room ${gameId}, added to tracking`);
        }

        // Notify all players in the game
        io.to(gameId).emit('playerJoined', {
            playerName: name,
            players: game.players.map(p => ({ name: p.name, score: p.score })),
            isRandomRoom: true,
            gameId: gameId,
            isRejoin: wasExistingPlayer
        });

        if (wasExistingPlayer) {
            console.log(`Player ${name} replaced previous instance in random room ${gameId} (${game.players.length}/10 players)`);
        } else {
            console.log(`Player ${name} joined random room ${gameId} (${game.players.length}/10 players)`);
        }

        // Auto-start the first round when we have at least 2 players and the game hasn't started yet
        if (game.players.length >= 2 && game.currentRound === 0 && game.gameState === 'waiting') {
            console.log(`Auto-starting first round in random room ${gameId} with ${game.players.length} players`);
            setTimeout(() => {
                if (game.gameState === 'waiting' && game.players.length >= 2) {
                    startNewRound(gameId);
                }
            }, 3000); // 3-second delay to let players get ready
        }
    });

    // join game
    socket.on('join', (data) => {
        const gameId = data.gameId;
        const name = data.name;

        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];

        // Check if player already exists
        const existingPlayer = game.players.find(p => p.name === name);
        if (existingPlayer) {
            socket.emit('error', { error: 'Player name already taken' });
            return;
        }

        // Add player to game
        game.players.push({
            id: socket.id,
            name: name,
            score: 0
        });

        socket.join(gameId);
        playerName = name;
        currentGameId = gameId;

        // If the game is currently playing, add this player to the round tracking
        // so they don't break the submission counting
        if (game.gameState === 'playing' && game.playersAtRoundStart) {
            game.playersAtRoundStart.push(name);
            // Don't pre-initialize answers - let them submit naturally
            console.log(`Player ${name} joined mid-round in game ${gameId}, added to tracking`);
        }

        // Notify all players in the game
        io.to(gameId).emit('playerJoined', {
            playerName: name,
            players: game.players.map(p => ({ name: p.name, score: p.score }))
        });

        console.log(`Player ${name} joined game ${gameId}`);
    });

    // start game round
    socket.on('startGameRound', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];

        if (game.players.length < 1) {
            socket.emit('error', { error: 'Need at least 1 player to start' });
            return;
        }

        startNewRound(gameId);
    });

    // Function to start a new round (can be called manually or automatically)
    function startNewRound(gameId) {
        const game = games[gameId];
        if (!game) return;

        // Generate random letter (excluding difficult ones)
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !['Q', 'X', 'Y'].includes(l));
        const randomLetter = letters[Math.floor(Math.random() * letters.length)];

        game.currentRound++;
        game.currentLetter = randomLetter;
        game.currentRoundAnswers = {};
        game.gameState = 'playing';
        game.handRaised = null; // Reset hand raised status
        
        // Capture players who are present at round start - this fixes the counting issue
        game.playersAtRoundStart = game.players.map(p => p.name);

        // Clear any existing timers
        if (game.roundTimer) {
            clearTimeout(game.roundTimer);
            game.roundTimer = null;
        }
        if (game.autoStartTimer) {
            clearTimeout(game.autoStartTimer);
            game.autoStartTimer = null;
        }

        // Clear hand raise timeouts
        if (game.handRaiseTimeouts) {
            game.handRaiseTimeouts.forEach(timeout => clearTimeout(timeout));
            game.handRaiseTimeouts.clear();
        }

        io.to(gameId).emit('roundStarted', {
            round: game.currentRound,
            letter: randomLetter,
            categories: game.categories,
            gameId: gameId, // Include gameId for display during game
            isRandomRoom: game.isRandomRoom
        });

        // For random rooms, start the 3-second timeout for hand raising
        if (game.isRandomRoom) {
            setTimeout(() => {
                // Enable hand raising after 3 seconds
                io.to(gameId).emit('handRaisingEnabled');
            }, 3000);
        }

        console.log(`Round ${game.currentRound} started in game ${gameId} with letter ${randomLetter}`);
    }

    // submit answers
    socket.on('submitAnswers', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];
        if (game.gameState !== 'playing') {
            socket.emit('error', { error: 'Game is not in playing state' });
            return;
        }

        // Store player's answers
        game.currentRoundAnswers[playerName] = data.answers;

        // Check if all players who were present at round start have submitted
        const submittedCount = Object.keys(game.currentRoundAnswers).length;
        const totalPlayers = game.playersAtRoundStart.length;

        io.to(gameId).emit('playerSubmitted', {
            playerName: playerName,
            submitted: submittedCount,
            total: totalPlayers
        });

        console.log(`Player ${playerName} submitted answers (${submittedCount}/${totalPlayers})`);

        // If all players who started the round have submitted, end the round
        if (submittedCount >= totalPlayers) {
            endRound(gameId);
        }
    });

    // New: Show hand functionality
    socket.on('showHand', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];
        if (game.gameState !== 'playing') {
            socket.emit('error', { error: 'Game is not in playing state' });
            return;
        }

        // For random rooms, check if 3 seconds have passed since round start
        if (game.isRandomRoom) {
            const now = Date.now();
            const roundStartTime = now - (3000); // Assume round started 3+ seconds ago if we get here
            
            // Check if this player already has a timeout active
            if (game.handRaiseTimeouts && game.handRaiseTimeouts.has(playerName)) {
                socket.emit('error', { error: 'Please wait before showing hand again' });
                return;
            }
        }

        // Check if someone already has their hand raised
        if (game.handRaised && game.handRaised !== playerName) {
            socket.emit('error', { error: 'Someone else already has their hand raised' });
            return;
        }

        // Validate that all categories have answers starting with correct letter
        const answers = data.answers;
        let isValid = true;
        let invalidReason = '';

        for (const category of game.categories) {
            const answer = answers[category];
            if (!answer || !answer.trim()) {
                isValid = false;
                invalidReason = `Missing answer for ${category}`;
                break;
            }
            if (!answer.trim().toUpperCase().startsWith(game.currentLetter)) {
                isValid = false;
                invalidReason = `${category} answer "${answer}" doesn't start with ${game.currentLetter}`;
                break;
            }
        }

        if (!isValid) {
            socket.emit('error', { error: `Cannot show hand: ${invalidReason}` });
            return;
        }

        // Store answers and raise hand
        game.currentRoundAnswers[playerName] = answers;
        game.handRaised = playerName;

        // For random rooms, auto-approve the hand and trigger round ending
        if (game.isRandomRoom) {
            // Set 3-second timeout for this player
            if (!game.handRaiseTimeouts) {
                game.handRaiseTimeouts = new Map();
            }
            const timeout = setTimeout(() => {
                game.handRaiseTimeouts.delete(playerName);
            }, 3000);
            game.handRaiseTimeouts.set(playerName, timeout);

            console.log(`Player ${playerName} raised hand in random room ${gameId} - auto-approving`);
            
            // Notify all players that someone raised their hand and round is ending
            io.to(gameId).emit('handRaisedNotification', {
                playerName: playerName,
                autoApproved: true
            });

            // Trigger roundStopping to allow auto-submissions, then end round
            io.to(gameId).emit('roundStopping');
            
            // Wait for auto-submissions, then end the round
            setTimeout(() => {
                endRound(gameId);
            }, 500);
        } else {
            // Regular rooms - notify moderator for approval
            io.to(game.creatorId).emit('handRaised', {
                playerName: playerName,
                answers: answers
            });

            // Notify all players that someone raised their hand
            io.to(gameId).emit('handRaisedNotification', {
                playerName: playerName
            });

            console.log(`Player ${playerName} raised hand in game ${gameId}`);
        }
    });

    // Moderator approves/denies hand
    socket.on('approveHand', (data) => {
        const gameId = data.gameId;
        const approved = data.approved;
        
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];

        // Only the game creator can approve/deny hands
        if (game.creatorId !== socket.id && !game.moderatorPlaying) {
            socket.emit('error', { error: 'Only the game creator can approve hands' });
            return;
        }

        if (!game.handRaised) {
            socket.emit('error', { error: 'No hand is currently raised' });
            return;
        }

        if (approved) {
            // Hand approved - end the round with loading state
            console.log(`Hand approved by moderator in game ${gameId}`);
            
            // Show loading state to moderator
            socket.emit('roundStopLoading', true);

            // Notify all players that the round is being stopped
            io.to(gameId).emit('roundStopping');

            // Wait a short moment for auto-submissions, then end the round
            setTimeout(() => {
                endRound(gameId);
                // Hide loading state
                socket.emit('roundStopLoading', false);
            }, 500);
        } else {
            // Hand denied - clear answers and reset
            const playerName = game.handRaised;
            delete game.currentRoundAnswers[playerName];
            game.handRaised = null;
            
            // Notify the player that their hand was denied and clear their inputs
            const player = game.players.find(p => p.name === playerName);
            if (player) {
                io.to(player.id).emit('handDenied');
            }

            // Notify moderator that hand was processed
            io.to(game.creatorId).emit('handProcessed');

            console.log(`Hand denied by moderator in game ${gameId}, cleared answers for ${playerName}`);
        }
    });

    // stop round (only game creator can stop - with loading state)
    socket.on('stopRound', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];

        // Show loading state to moderator
        socket.emit('roundStopLoading', true);

        // Notify all players that the round is being stopped
        io.to(gameId).emit('roundStopping');

        // Wait a short moment for auto-submissions, then end the round
        setTimeout(() => {
            endRound(gameId);
            // Hide loading state
            socket.emit('roundStopLoading', false);
        }, 500);
    });

    // end game entirely
    socket.on('endGame', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];

        console.log(`Ending game ${gameId} - current state: ${game.gameState}, players: ${game.players.length}`);

        // Clear any running timer
        if (game.roundTimer) {
            clearTimeout(game.roundTimer);
            game.roundTimer = null;
        }

        // Force game state to ended regardless of current state
        game.gameState = 'ended';

        // Notify all players that the game has ended
        const gameEndedData = {
            gameId: gameId,
            finalScores: game.players.map(p => ({ name: p.name, score: p.score }))
                .sort((a, b) => b.score - a.score) // Sort by score descending
        };

        console.log(`Emitting gameEnded event for game ${gameId} to ${game.players.length} players:`, gameEndedData);
        console.log(`Players in game: ${game.players.map(p => `${p.name}(${p.id})`).join(', ')}`);

        // Emit to all sockets in the game room
        io.to(gameId).emit('gameEnded', gameEndedData);

        // Also emit to the creator specifically (in case they're not in the room as a player)
        socket.emit('gameEnded', gameEndedData);

        // Clean up the game after a short delay
        setTimeout(() => {
            if (games[gameId]) {
                console.log(`Game ended and cleaned up: ${gameId}`);
                delete games[gameId];
            }
        }, 5000); // Reduced to 5 seconds for faster cleanup
    });

    async function endRound(gameId) {
        const game = games[gameId];
        if (!game || game.gameState !== 'playing') return;

        // Clear timer
        if (game.roundTimer) {
            clearTimeout(game.roundTimer);
            game.roundTimer = null;
        }

        game.gameState = 'reviewing';

        // Auto-submit answers for players who haven't submitted yet
        game.players.forEach(player => {
            if (!game.currentRoundAnswers[player.name]) {
                // Create empty answers for players who didn't submit
                const emptyAnswers = {};
                game.categories.forEach(category => {
                    emptyAnswers[category] = '';
                });
                game.currentRoundAnswers[player.name] = emptyAnswers;
            }
        });

        // Calculate scores for this round
        const roundScores = await calculateScores(gameId, game.currentLetter);

        // Prepare results data
        const results = {
            round: game.currentRound,
            letter: game.currentLetter,
            categories: game.categories,
            answers: {},
            scores: roundScores,
            totalScores: game.players.map(p => ({ name: p.name, score: p.score }))
        };

        // Organize answers by category for display
        for (const category of game.categories) {
            results.answers[category] = {};
            for (const player of game.players) {
                const answer = game.currentRoundAnswers[player.name]?.[category] || '';
                
                // Use cached validation result if available
                let isValid = false;
                if (answer && game.validationCache) {
                    const cacheKey = `${answer}_${game.currentLetter}_${category}`;
                    isValid = game.validationCache[cacheKey] || false;
                }
                
                results.answers[category][player.name] = {
                    answer: answer,
                    valid: isValid
                };
            }
        }

        io.to(gameId).emit('roundEnded', results);

        // Reset for next round
        game.gameState = 'waiting';
        
        // For random rooms, auto-start the next round after 10 seconds
        if (game.isRandomRoom && game.players.length > 0) {
            // Clear any existing auto-start timer first
            if (game.autoStartTimer) {
                clearTimeout(game.autoStartTimer);
            }
            
            game.autoStartTimer = setTimeout(() => {
                if (game.gameState === 'waiting' && game.players.length > 0) {
                    console.log(`Auto-starting next round in random room ${gameId}`);
                    startNewRound(gameId);
                }
            }, 10000); // 10 seconds delay
        }
        
        console.log(`Round ${game.currentRound} ended in game ${gameId}`);
    }

    // get game state
    socket.on('getGameState', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        const game = games[gameId];
        socket.emit('gameState', {
            gameId: gameId,
            categories: game.categories,
            players: game.players.map(p => ({ name: p.name, score: p.score })),
            currentRound: game.currentRound,
            currentLetter: game.currentLetter,
            gameState: game.gameState
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // No special handling needed - players can reconnect without status tracking
    });
});

// Function to clean up old games
function cleanupOldGames() {
    const now = Date.now();
    const maxAge = 2 * 24 * 60 * 60 * 1000; // 2 days
    let cleanedCount = 0;

    Object.keys(games).forEach(gameId => {
        const game = games[gameId];
        // Don't clean up random rooms (000000-000099)
        if (game.isRandomRoom) {
            return;
        }
        if (game.createdAt && now - game.createdAt > maxAge) {
            console.log(`Cleaning up old game: ${gameId} (created ${new Date(game.createdAt).toISOString()})`);
            delete games[gameId];
            cleanedCount++;
        }
    });

    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old games`);
    }
}

// Clean up old games at startup
console.log('Performing initial cleanup of old games...');
cleanupOldGames();

// Clean up old games periodically every 5 minutes
setInterval(() => {
    cleanupOldGames();
}, 5 * 60 * 1000); // Check every 5 minutes

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});