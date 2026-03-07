CREATE TABLE IF NOT EXISTS game_rooms (
  room_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_updated_at
ON game_rooms (updated_at DESC);
