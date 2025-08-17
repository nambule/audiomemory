# Audio Memory Game · Pro

An audio-based memory matching game with persistence and leaderboards.

## Features

- **Progressive Difficulty**: 31 levels from 4 cards to 64 cards
- **Audio-Based**: Match cards by their unique sound frequencies
- **5-Flip Limit**: Each card can only be flipped 5 times before game over
- **Persistence**: All game events are tracked and stored
- **Leaderboards**: Retro-style ranking system showing your position
- **Real-time Analytics**: Track every flip, match, and level completion

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Game Mechanics

- Click cards to hear their frequency
- Match pairs by finding cards with identical sounds
- Complete levels to progress (each level adds more pairs)
- Game ends if you flip any card 5 times without matching
- Win by completing all 31 levels (64 cards total)

## Scoring System

- **Flip Efficiency**: 50 pts (1 flip) down to 10 pts (5 flips)
- **Time Bonuses**: Faster level completion = more points
- **Leaderboard**: Compare your score with other players

## Data Tracked

Each game session records:
- Game start/end times
- Every card flip with timestamp and frequency
- Match/mismatch events
- Level completions with time bonuses
- Final score and ranking

All data is stored in `games.json` and can be easily exported or migrated to a database.

## API Endpoints

- `POST /api/game/start` - Start new game session
- `POST /api/game/:gameId/event` - Log game event
- `GET /api/leaderboard` - Get top 10 scores
- `GET /api/game/:gameId/rank` - Get player ranking

Enjoy the challenge! 🎵