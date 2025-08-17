-- Create the games table in your Supabase database
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  game_id VARCHAR(255) UNIQUE NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  last_action_time TIMESTAMPTZ NOT NULL,
  final_score INTEGER DEFAULT 0,
  final_level INTEGER DEFAULT 1,
  total_flips INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'abandoned')),
  events JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_player_id ON games(player_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_final_score ON games(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at 
    BEFORE UPDATE ON games 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();