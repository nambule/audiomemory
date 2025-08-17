import 'dotenv/config';

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start new game
app.post('/api/game/start', async (req, res) => {
  try {
    const gameId = uuidv4();
    const playerId = req.body.playerId || `anon_${Date.now()}`;
    
    const newGame = {
      game_id: gameId,
      player_id: playerId,
      start_time: new Date().toISOString(),
      last_action_time: new Date().toISOString(),
      final_score: 0,
      final_level: 1,
      total_flips: 0,
      status: 'active',
      events: [{
        timestamp: new Date().toISOString(),
        type: 'game_start',
        data: { level: 1 }
      }]
    };
    
    const { error } = await supabase
      .from('games')
      .upsert(newGame, { onConflict: 'game_id' });
    
    if (error) throw error;
    
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
    
    // Find game
    const { data: gameData, error: findError } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();
    
    if (findError || !gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const game = {
      gameId: gameData.game_id,
      playerId: gameData.player_id,
      startTime: gameData.start_time,
      lastActionTime: gameData.last_action_time,
      finalScore: gameData.final_score,
      finalLevel: gameData.final_level,
      totalFlips: gameData.total_flips,
      status: gameData.status,
      events: gameData.events || []
    };
    
    const event = {
      timestamp: new Date().toISOString(),
      type,
      data
    };
    
    game.events.push(event);
    game.lastActionTime = event.timestamp;
    
    // Update game state
    if (data.flips !== undefined) game.totalFlips = data.flips;
    if (data.level !== undefined) game.finalLevel = data.level;
    if (data.score !== undefined && !data.abandoned) {
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
    
    const { error } = await supabase
      .from('games')
      .upsert({
        game_id: game.gameId,
        player_id: game.playerId,
        start_time: game.startTime,
        last_action_time: game.lastActionTime,
        final_score: game.finalScore,
        final_level: game.finalLevel,
        total_flips: game.totalFlips,
        status: game.status,
        events: game.events
      }, { onConflict: 'game_id' });
    
    if (error) throw error;
    
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
    
    let leaderboard = allGames.slice(0, 5);
    
    if (currentGameId) {
      const currentGame = allGames.find(g => g.gameId === currentGameId);
      if (currentGame && !leaderboard.find(g => g.gameId === currentGameId)) {
        // Add current game and keep top 5 by rank
        leaderboard.push(currentGame);
        leaderboard.sort((a, b) => a.rank - b.rank);
        leaderboard = leaderboard.slice(0, 5);
      }
    }
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update player name
app.post('/api/game/:gameId/update-player', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body;
    
    if (!playerName || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }
    
    const { error } = await supabase
      .from('games')
      .update({ player_id: playerName.trim() })
      .eq('game_id', gameId);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player rank
app.get('/api/game/:gameId/rank', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const { data: gameData, error: findError } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();
    
    if (findError || !gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const currentGame = {
      gameId: gameData.game_id,
      playerId: gameData.player_id,
      finalScore: gameData.final_score
    };
    
    const { data: games, error } = await supabase
      .from('games')
      .select('game_id, final_score, start_time, last_action_time')
      .in('status', ['won', 'lost', 'abandoned'])
      .order('final_score', { ascending: false })
      .order('start_time', { ascending: true });
    
    if (error) {
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

app.listen(PORT, () => {
  console.log(`Audio Memory Game server running on port ${PORT}`);
});