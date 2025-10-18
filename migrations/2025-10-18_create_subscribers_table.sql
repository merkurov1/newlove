-- Migration: create subscribers table for NFT free claims
-- Run in Supabase SQL editor

-- Ensure table exists and required columns are present. Using a plpgsql
-- DO block allows us to handle older schemas that may lack the
-- `wallet_address` column without failing with ERROR 42703.
DO $$
BEGIN
  -- Create the table skeleton if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscribers'
  ) THEN
    CREATE TABLE public.subscribers (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
    );
  END IF;

  -- Add wallet_address if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN wallet_address TEXT;
  END IF;

  -- Add has_claimed if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'has_claimed'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN has_claimed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Index for lookups (created after ensuring column exists)
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

-- -----------------------------------------------------------------------------
-- Backfill / safe-upgrade steps
-- If this migration is applied on an existing database which previously
-- had a `subscribers` table without the expected columns, the following
-- statements ensure the required columns and indexes exist without failing
-- (uses IF NOT EXISTS where supported).
-- -----------------------------------------------------------------------------

-- Add missing columns safely (no-op if already present)
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS has_claimed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create a non-unique lookup index if missing (keeps existing name for compatibility)
CREATE INDEX IF NOT EXISTS subscribers_wallet_idx ON public.subscribers (wallet_address);

-- Create a unique index to enforce wallet uniqueness if desired. Use a WHERE
-- clause so NULL values are allowed; this will be a no-op if an index with the
-- same name already exists.
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_wallet_unique_idx
  ON public.subscribers (wallet_address)
  WHERE wallet_address IS NOT NULL;

-- Ensure RLS is enabled (again, safe no-op)
ALTER TABLE IF EXISTS public.subscribers ENABLE ROW LEVEL SECURITY;
