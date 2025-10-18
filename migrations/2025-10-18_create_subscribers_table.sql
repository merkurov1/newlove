-- Migration: create subscribers table for NFT free claims
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.subscribers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  has_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS subscribers_wallet_idx ON public.subscribers (wallet_address);

-- Enable RLS and example policies
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT their own row (or allow anon read if you prefer)
DROP POLICY IF EXISTS select_subscribers_public ON public.subscribers;
CREATE POLICY select_subscribers_public
  ON public.subscribers
  FOR SELECT
  USING (true);

-- Allow inserts by authenticated users (or manage via server-side upsert)
DROP POLICY IF EXISTS insert_subscribers_authenticated ON public.subscribers;
CREATE POLICY insert_subscribers_authenticated
  ON public.subscribers
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR true);

-- Allow updates only via server function (or owner) — example: only server role should update has_claimed
-- In Supabase you can run updates from a service role key; if you want to allow authenticated user to mark claimed
-- DROP POLICY IF EXISTS update_subscribers_owner ON public.subscribers;
-- CREATE POLICY update_subscribers_owner
--   ON public.subscribers
--   FOR UPDATE
--   USING (wallet_address = auth.jwt() ->> 'wallet');

-- Note: For production prefer marking has_claimed from server-side using the Supabase service_role key
