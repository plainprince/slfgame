import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Ollama } from 'ollama'
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Configure Ollama client
const ollama = new Ollama({
  host: 'http://localhost:11434'
});

// File path for storing games data
const GAMES_FILE_PATH = path.join(__dirname, 'games.json');

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
                validationCache: undefined
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

async function isAnswerValid(answer, letter, category) {
    if (!answer || typeof answer !== 'string') return false;
    if (!answer.startsWith(letter)) return false;

    const response = await ollama.chat({
        model: 'llama3.2:1b',
        messages: [
            { role: 'system', content: 'You are validating answers for Stadt Land Fluss (City Country River). Answer ONLY with "true" or "false" (lowercase, no punctuation). NO OTHER TEXT.\n\nCategory definitions:\n- Stadt/City: Cities, towns, villages worldwide\n- Land/Country: Countries, states, regions worldwide  \n- Fluss/River: Rivers, streams, waterways worldwide\n- Name: First names, given names of people\n- Tier/Animal: Any animals, including mammals, birds, fish, insects, etc.\n\nBe accurate but not overly strict. Accept:\n- Well-known places/animals/names in any language\n- Alternative spellings and names\n- Historical or mythological names if appropriate\n\nReject only clearly wrong categories (e.g. "Berlin" for Animal, "Lion" for City).' },
            { role: 'user', content: `Is "${answer}" a valid answer for category "${category}"?` }
        ],
    })

    console.log('AI Response:', response.message.content)
    
    // Clean and normalize the response
    const cleanResponse = response.message.content.trim().toLowerCase();
    console.log('Cleaned Response:', cleanResponse)
    
    // Check if the response contains 'true' (more flexible matching)
    const isValid = cleanResponse.includes('true');
    console.log('Is Valid:', isValid)
    
    return isValid;
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

    // join game
    socket.on('join', (data) => {
        const gameId = data.gameId;
        const name = data.name;

        if (!games[gameId]) {
            socket.emit('error', { error: 'Game not found' });
            return;
        }

        // Check if player already exists
        const existingPlayer = games[gameId].players.find(p => p.name === name);
        if (existingPlayer) {
            socket.emit('error', { error: 'Player name already taken' });
            return;
        }

        // Add player to game
        games[gameId].players.push({
            id: socket.id,
            name: name,
            score: 0
        });

        socket.join(gameId);
        playerName = name;
        currentGameId = gameId;

        // Notify all players in the game
        io.to(gameId).emit('playerJoined', {
            playerName: name,
            players: games[gameId].players.map(p => ({ name: p.name, score: p.score }))
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

        // Check if this is the game creator
        if (game.creatorId !== socket.id) {
            socket.emit('error', { error: 'Only the game creator can start rounds' });
            return;
        }

        if (game.players.length < 1) {
            socket.emit('error', { error: 'Need at least 1 player to start' });
            return;
        }

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

        // Clear any existing timer
        if (game.roundTimer) {
            clearTimeout(game.roundTimer);
            game.roundTimer = null;
        }

        io.to(gameId).emit('roundStarted', {
            round: game.currentRound,
            letter: randomLetter,
            categories: game.categories,
            gameId: gameId // Include gameId for display during game
        });

        console.log(`Round ${game.currentRound} started in game ${gameId} with letter ${randomLetter}`);
    });

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

        // Notify moderator about hand raised
        io.to(game.creatorId).emit('handRaised', {
            playerName: playerName,
            answers: answers
        });

        // Notify all players that someone raised their hand
        io.to(gameId).emit('handRaisedNotification', {
            playerName: playerName
        });

        console.log(`Player ${playerName} raised hand in game ${gameId}`);
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
            // Hand approved - end the round
            console.log(`Hand approved by moderator in game ${gameId}`);
            endRound(gameId);
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

        // Only the game creator can stop rounds
        if (game.creatorId !== socket.id) {
            socket.emit('error', { error: 'Only the game creator can stop the round' });
            return;
        }

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

        // Only the game creator can end the game
        if (game.creatorId !== socket.id) {
            socket.emit('error', { error: 'Only the game creator can end the game' });
            return;
        }

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
            gameState: game.gameState
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // No special handling needed - players can reconnect without status tracking
    });
});

// Clean up old games periodically
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    Object.keys(games).forEach(gameId => {
        const game = games[gameId];
        if (now - game.createdAt > maxAge) {
            console.log(`Cleaning up old game: ${gameId}`);
            delete games[gameId];
        }
    });
}, 60 * 60 * 1000); // Check every hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});