-- Enable RLS (no-op if already enabled) and create a permissive SELECT policy for testing.
-- NOTE: This makes temple_log readable by anyone. Use only for debugging/testing.

ALTER TABLE IF EXISTS public.temple_log ENABLE ROW LEVEL SECURITY;

-- Create a simple policy allowing public SELECT (policy name uses underscore, no spaces)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'temple_log' AND policyname = 'public_read_on_temple_log'
  ) THEN
    EXECUTE 'CREATE POLICY public_read_on_temple_log ON public.temple_log FOR SELECT USING (true)';
  END IF;
END$$;

-- If you prefer a policy that allows only authenticated users, use this instead:
-- CREATE POLICY authenticated_read_on_temple_log ON public.temple_log
--   FOR SELECT
--   USING (auth.uid() IS NOT NULL);
