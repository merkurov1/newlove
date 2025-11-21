-- Fix permissions for vigil_hearts table

-- Drop all existing policies
DROP POLICY IF EXISTS "Anyone can view hearts" ON vigil_hearts;
DROP POLICY IF EXISTS "Anyone can light hearts" ON vigil_hearts;
DROP POLICY IF EXISTS "Anyone can create hearts" ON vigil_hearts;

-- Disable and re-enable RLS to reset
ALTER TABLE vigil_hearts DISABLE ROW LEVEL SECURITY;
ALTER TABLE vigil_hearts ENABLE ROW LEVEL SECURITY;

-- Recreate with proper permissions
CREATE POLICY "Anyone can view hearts"
  ON vigil_hearts
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can light hearts"
  ON vigil_hearts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can create hearts"
  ON vigil_hearts
  FOR INSERT
  WITH CHECK (true);

-- Grant necessary table permissions to anon and authenticated roles
GRANT SELECT, UPDATE, INSERT ON vigil_hearts TO anon;
GRANT SELECT, UPDATE, INSERT ON vigil_hearts TO authenticated;
