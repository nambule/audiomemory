import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function findGame(gameId) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();
    
    if (error && error.code !== 'PGRST116') return null;
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
    return null;
  }
}

async function saveGame(game) {
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
  
  const { error } = await supabase
    .from('games')
    .upsert(gameData, { onConflict: 'game_id' });
  
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gameId } = req.query;
    const { type, data } = req.body;
    
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
}