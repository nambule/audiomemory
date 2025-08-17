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

export default async function handler(req, res) {
  try {
    const { gameId } = req.query;
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
}