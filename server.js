const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Simple in-memory lock to prevent concurrent file writes
let fileLock = false;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'games.json');

app.use(express.json());
app.use(express.static('.'));

// Load games data
async function loadGames() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create empty array but don't overwrite existing data
      console.log('Creating new games.json file');
      await saveGames([]);
      return [];
    }
    console.error('Error loading games:', error);
    return [];
  }
}

// Save games data with simple locking
async function saveGames(games) {
  // Wait for any existing write to complete
  while (fileLock) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  fileLock = true;
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(games, null, 2));
  } catch (error) {
    console.error('Error saving games:', error);
    throw error;
  } finally {
    fileLock = false;
  }
}

// Start new game
app.post('/api/game/start', async (req, res) => {
  try {
    const games = await loadGames();
    const gameId = uuidv4();
    const playerId = req.body.playerId || `anon_${Date.now()}`;
    
    const newGame = {
      gameId,
      playerId,
      startTime: new Date().toISOString(),
      lastActionTime: new Date().toISOString(),
      finalScore: 0,
      finalLevel: 1,
      totalFlips: 0,
      status: 'active',
      events: [{
        timestamp: new Date().toISOString(),
        type: 'game_start',
        data: { level: 1 }
      }]
    };
    
    games.push(newGame);
    await saveGames(games);
    
    res.json({ gameId, playerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log game event
app.post('/api/game/:gameId/event', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { type, data } = req.body;
    
    const games = await loadGames();
    const game = games.find(g => g.gameId === gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const event = {
      timestamp: new Date().toISOString(),
      type,
      data
    };
    
    game.events.push(event);
    game.lastActionTime = event.timestamp;
    
    // Update game state based on event
    if (data.flips !== undefined) game.totalFlips = data.flips;
    if (data.level !== undefined) game.finalLevel = data.level;
    if (data.score !== undefined) game.finalScore = data.score;
    if (type === 'game_end') {
      if (data.won) {
        game.status = 'won';
      } else if (data.abandoned) {
        game.status = 'abandoned';
      } else {
        game.status = 'lost';
      }
    }
    
    await saveGames(games);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const games = await loadGames();
    const completedGames = games.filter(g => g.status === 'won' || g.status === 'lost' || g.status === 'abandoned');
    
    // Sort by score (desc), then by time (asc) for ties
    const leaderboard = completedGames
      .sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        const aTime = new Date(a.lastActionTime) - new Date(a.startTime);
        const bTime = new Date(b.lastActionTime) - new Date(b.startTime);
        return aTime - bTime;
      })
      .slice(0, 10)
      .map((game, index) => ({
        rank: index + 1,
        playerId: game.playerId,
        score: game.finalScore,
        level: game.finalLevel,
        flips: game.totalFlips,
        duration: Math.round((new Date(game.lastActionTime) - new Date(game.startTime)) / 1000),
        date: new Date(game.startTime).toLocaleDateString(),
        time: new Date(game.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fullDate: game.startTime
      }));
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player rank
app.get('/api/game/:gameId/rank', async (req, res) => {
  try {
    const { gameId } = req.params;
    const games = await loadGames();
    const currentGame = games.find(g => g.gameId === gameId);
    
    if (!currentGame) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const completedGames = games.filter(g => g.status === 'won' || g.status === 'lost' || g.status === 'abandoned');
    
    // Sort by score (desc), then by time (asc) for ties
    const sorted = completedGames.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      const aTime = new Date(a.lastActionTime) - new Date(a.startTime);
      const bTime = new Date(b.lastActionTime) - new Date(b.startTime);
      return aTime - bTime;
    });
    
    const rank = sorted.findIndex(g => g.gameId === gameId) + 1;
    const totalGames = sorted.length;
    
    res.json({ 
      rank: rank || totalGames + 1, 
      totalGames,
      percentile: totalGames > 0 ? Math.round(((totalGames - rank + 1) / totalGames) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup old active games (older than 1 hour)
async function cleanupOldGames() {
  try {
    const games = await loadGames();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let cleaned = 0;
    
    games.forEach(game => {
      if (game.status === 'active' && game.lastActionTime < oneHourAgo) {
        game.status = 'abandoned';
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      await saveGames(games);
      console.log(`Cleaned up ${cleaned} old active games`);
    }
  } catch (error) {
    console.error('Error cleaning up old games:', error);
  }
}

// Clean up on startup and every hour
cleanupOldGames();
setInterval(cleanupOldGames, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Audio Memory Game server running on port ${PORT}`);
});