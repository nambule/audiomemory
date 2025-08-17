import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}