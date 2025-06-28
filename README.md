# Stadt Land Fluss - Online Multiplayer Game

A modern web-based implementation of the classic German word game "Stadt Land Fluss" (Stop the Bus). Play with friends in real-time!

## 🎮 How to Play

Stadt Land Fluss is a classic word game where players compete to find words in different categories that start with a specific letter.

### Game Rules

1. **Setup**: One player creates a game and shares the Game ID with friends
2. **Rounds**: Each round, players get a random letter (A-Z, excluding Q, X, Y)
3. **Categories**: Fill in words for each category that start with the given letter
4. **Time Limit**: You have 2 minutes per round (or until someone calls "Stop!")
5. **Scoring**:
   - **20 points**: Unique answer (only you have that word)
   - **10 points**: Duplicate answer (others have the same word)
   - **0 points**: Invalid answer or no answer

### Default Categories
- **Stadt** (City)
- **Land** (Country)
- **Fluss** (River)
- **Name** (First Name)
- **Tier** (Animal)

You can customize categories when creating a game!

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or bun

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd slfgame
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Start the server:
```bash
npm start
# or
node index.js
```

4. Open your browser and go to `http://localhost:3000`

## 🎯 How to Use

### Creating a Game
1. Click "Create Game" on the homepage
2. Customize categories (optional) - add/remove as needed
3. Click "Create Game" to generate a unique Game ID
4. Share the Game ID with friends
5. Start the round when everyone has joined

### Joining a Game
1. Click "Join Game" on the homepage
2. Enter the Game ID provided by the game creator
3. Enter your name
4. Wait for the game creator to start the round

### During Gameplay
1. When a round starts, you'll see the letter and categories
2. Fill in words that start with the given letter for each category
3. Submit your answers before time runs out
4. You can call "Stop Round" to end early
5. View results and scores after each round

## 🛠 Technical Details

### Backend (Node.js + Socket.IO)
- Express.js web server
- Socket.IO for real-time communication
- In-memory game state management
- Automatic game cleanup

### Frontend (Vanilla HTML/CSS/JS)
- Responsive design
- Real-time updates
- Modern UI with smooth animations
- Mobile-friendly interface

### Features
- ✅ Real-time multiplayer gameplay
- ✅ Custom categories
- ✅ Automatic scoring system
- ✅ Timer with visual progress
- ✅ Player connection status
- ✅ Game state persistence during rounds
- ✅ Responsive design for mobile/desktop
- ✅ Automatic game cleanup

## 🎨 Game Screenshots

### Main Menu
Beautiful gradient interface with easy navigation

### Game Creation
- Custom category management
- Real-time player list
- Game ID sharing

### Gameplay
- Large letter display
- Visual timer with progress bar
- Clean answer input forms
- Submission progress tracking

### Results
- Detailed scoring breakdown
- Color-coded answer validation
- Round and total scores

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### Game Settings
- Round timer: 2 minutes (120 seconds)
- Automatic cleanup: 24 hours for old games, 5 minutes for empty games
- Excluded letters: Q, X, Y (too difficult)

## 🤝 Contributing

Feel free to contribute to this project! Some ideas for improvements:

- [ ] Add more language support
- [ ] Implement persistent leaderboards
- [ ] Add sound effects
- [ ] Create tournament mode
- [ ] Add AI opponent
- [ ] Implement word validation API

## 📝 License

This project is open source and available under the [CC-BY-NC-SA 4.0 License](LICENSE).

## 🎉 Have Fun!

Enjoy playing Stadt Land Fluss with your friends! The game is designed to be as close as possible to the traditional paper version you know and love.

---

**Game ID sharing tip**: The game creator can simply share their Game ID via text message, Discord, or any other communication method. No registration required!
