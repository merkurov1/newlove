-- Create vigil_hearts table for The Vigil interactive installation
CREATE TABLE IF NOT EXISTS vigil_hearts (
  id INTEGER PRIMARY KEY CHECK (id >= 1 AND id <= 5),
  owner_name TEXT,
  owner_id UUID,
  last_lit_at TIMESTAMPTZ DEFAULT NOW(),
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial 5 hearts (all dead/vacant)
INSERT INTO vigil_hearts (id, owner_name, owner_id, last_lit_at, is_locked)
VALUES 
  (1, NULL, NULL, NOW() - INTERVAL '25 hours', FALSE),
  (2, NULL, NULL, NOW() - INTERVAL '25 hours', FALSE),
  (3, NULL, NULL, NOW() - INTERVAL '25 hours', FALSE),
  (4, NULL, NULL, NOW() - INTERVAL '25 hours', FALSE),
  (5, NULL, NULL, NOW() - INTERVAL '25 hours', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE vigil_hearts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read hearts
CREATE POLICY "Anyone can view hearts"
  ON vigil_hearts
  FOR SELECT
  USING (true);

-- Policy: Anyone can update hearts (for clicking/lighting)
CREATE POLICY "Anyone can light hearts"
  ON vigil_hearts
  FOR UPDATE
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE vigil_hearts;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vigil_hearts_updated_at
  BEFORE UPDATE ON vigil_hearts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
