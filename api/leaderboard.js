import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
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
    
    // Get top 5 and ensure current game is included
    let leaderboard = allGames.slice(0, 5);
    
    if (currentGameId) {
      const currentGame = allGames.find(g => g.gameId === currentGameId);
      if (currentGame && !leaderboard.find(g => g.gameId === currentGameId)) {
        // Current game not in top 5, add it to the list
        leaderboard = [...leaderboard.slice(0, 4), currentGame];
        // Sort by rank to maintain order
        leaderboard.sort((a, b) => a.rank - b.rank);
      }
    }
    
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}