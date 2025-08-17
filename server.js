import 'dotenv/config';

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase-config.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// Load games data from Supabase
async function loadGames() {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('start_time', { ascending: false });
    
    if (error) {
      console.error('Error loading games:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error loading games:', error);
    return [];
  }
}

// Create or update a game in Supabase
async function saveGame(game) {
  try {
    const gameData = {
      game_id: game.gameId,
      player_id: game.playerId,
      start_time: game.startTime,
      last_action_time: game.lastActionTime,
      final_score: game.finalScore,
      final_level: game.finalLevel,
      total_flips: game.totalFlips,
      status: game.status,
      events: game.events
    };
    
    console.log('Attempting to save game:', gameData.game_id);
    const { data, error } = await supabase
      .from('games')
      .upsert(gameData, { onConflict: 'game_id' });
    
    if (error) {
      console.error('Error saving game:', error);
      throw error;
    }
    
    console.log('Game saved successfully:', gameData.game_id);
  } catch (error) {
    console.error('Error saving game:', error);
    throw error;
  }
}

// Find a game by ID
async function findGame(gameId) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error finding game:', error);
      return null;
    }
    
    if (!data) return null;
    
    return {
      gameId: data.game_id,
      playerId: data.player_id,
      startTime: data.start_time,
      lastActionTime: data.last_action_time,
      finalScore: data.final_score,
      finalLevel: data.final_level,
      totalFlips: data.total_flips,
      status: data.status,
      events: data.events || []
    };
  } catch (error) {
    console.error('Error finding game:', error);
    return null;
  }
}

// Start new game
app.post('/api/game/start', async (req, res) => {
  try {
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
    
    await saveGame(newGame);
    
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
    console.log('Event received:', { gameId, type, data });
    
    const game = await findGame(gameId);
    
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
    if (data.score !== undefined && !data.abandoned) {
      console.log('Updating score from', game.finalScore, 'to', data.score);
      game.finalScore = data.score;
    }
    if (type === 'game_end') {
      if (data.won) {
        game.status = 'won';
      } else if (data.abandoned) {
        game.status = 'abandoned';
      } else {
        game.status = 'lost';
      }
    }
    
    await saveGame(game);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { currentGameId } = req.query;
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .in('status', ['won', 'lost', 'abandoned'])
      .order('final_score', { ascending: false })
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('Error loading leaderboard:', error);
      return res.status(500).json({ error: error.message });
    }
    
    const allGames = (games || []).map((game, index) => ({
      rank: index + 1,
      playerId: game.player_id,
      gameId: game.game_id,
      score: game.final_score,
      level: game.final_level,
      flips: game.total_flips,
      duration: Math.round((new Date(game.last_action_time) - new Date(game.start_time)) / 1000),
      date: new Date(game.start_time).toLocaleDateString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      time: new Date(game.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      fullDate: game.start_time
    }));
    
    // Get top 5 and ensure current game is included
    let leaderboard = allGames.slice(0, 5);
    
    if (currentGameId) {
      const currentGame = allGames.find(g => g.gameId === currentGameId);
      console.log('Looking for current game:', currentGameId, 'Found:', !!currentGame);
      if (currentGame) {
        console.log('Current game score:', currentGame.score, 'rank:', currentGame.rank);
        if (!leaderboard.find(g => g.gameId === currentGameId)) {
          // Current game not in top 5, add it to the list
          leaderboard = [...leaderboard.slice(0, 4), currentGame];
          // Sort by rank to maintain order
          leaderboard.sort((a, b) => a.rank - b.rank);
          console.log('Added current game to leaderboard');
        } else {
          console.log('Current game already in top 5');
        }
      }
    }
    
    console.log('Returning leaderboard with', leaderboard.length, 'games');
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player rank
app.get('/api/game/:gameId/rank', async (req, res) => {
  try {
    const { gameId } = req.params;
    const currentGame = await findGame(gameId);
    
    if (!currentGame) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const { data: games, error } = await supabase
      .from('games')
      .select('game_id, final_score, start_time, last_action_time')
      .in('status', ['won', 'lost', 'abandoned'])
      .order('final_score', { ascending: false })
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('Error loading games for ranking:', error);
      return res.status(500).json({ error: error.message });
    }
    
    const rank = (games || []).findIndex(g => g.game_id === gameId) + 1;
    const totalGames = (games || []).length;
    
    res.json({ 
      rank: rank || totalGames + 1, 
      totalGames,
      percentile: totalGames > 0 ? Math.round(((totalGames - rank + 1) / totalGames) * 100) : 0,
      playerId: currentGame.playerId,
      gameId: currentGame.gameId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup old active games (older than 1 hour)
async function cleanupOldGames() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('games')
      .update({ status: 'abandoned' })
      .eq('status', 'active')
      .lt('last_action_time', oneHourAgo)
      .select();
    
    if (error) {
      console.error('Error cleaning up old games:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log(`Cleaned up ${data.length} old active games`);
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
  console.log('Supabase URL:', process.env.SUPABASE_URL);
  console.log('Supabase Key configured:', !!process.env.SUPABASE_ANON_KEY);
});