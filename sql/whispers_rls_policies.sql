-- RLS policies for `whispers` table
-- Run this AFTER creating the `whispers` table.

-- Enable Row Level Security
ALTER TABLE public.whispers ENABLE ROW LEVEL SECURITY;

-- POLICY: allow INSERT from authenticated users who set user_id to their own uid (or NULL)
-- This allows users authenticated via Supabase to insert their own whisper (if you later enable client-side inserts).
CREATE POLICY whispers_insert_authenticated ON public.whispers
  FOR INSERT
  USING ( auth.role() = 'authenticated' )
  WITH CHECK ( (auth.role() = 'authenticated' AND (new.user_id IS NULL OR new.user_id::text = auth.uid())) );

-- POLICY: allow SELECT only to the owner (authenticated users can select their own rows)
-- Note: server/service-role bypasses RLS and can read everything.
CREATE POLICY whispers_select_owner ON public.whispers
  FOR SELECT
  USING ( auth.role() = 'authenticated' AND auth.uid() = user_id::text );

-- POLICY: allow UPDATE only to the owner (so a user can update their own whisper)
CREATE POLICY whispers_update_owner ON public.whispers
  FOR UPDATE
  USING ( auth.role() = 'authenticated' AND auth.uid() = user_id::text )
  WITH CHECK ( true );

-- POLICY: allow DELETE only to the owner
CREATE POLICY whispers_delete_owner ON public.whispers
  FOR DELETE
  USING ( auth.role() = 'authenticated' AND auth.uid() = user_id::text );

-- Important notes:
-- 1) Server-side code using the Supabase SERVICE_ROLE_KEY bypasses RLS. Keep that key secret.
-- 2) If you expect anonymous Telegram-only users (no Supabase auth) to create whispers directly from the client, you'll need a different pattern (e.g., client uploads to storage and server API inserts using service role, or mint a short-lived signed token).
-- 3) After running this, client-side SELECT/UPDATE/DELETE will be restricted to owners; admin server code should continue to work via service role.
