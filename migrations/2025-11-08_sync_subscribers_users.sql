-- Migration: Create public.users table and sync with subscribers
-- Date: 2025-11-08
-- Purpose: Create user profiles table and subscription management

-- Create public.users table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  name TEXT,
  bio TEXT,
  website TEXT,
  is_subscribed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Populate public.users from auth.users
INSERT INTO public.users (id, email, name, created_at)
SELECT 
  id::text,
  email,
  raw_user_meta_data->>'name',
  created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
CREATE INDEX IF NOT EXISTS users_username_idx ON public.users (username);
CREATE INDEX IF NOT EXISTS users_is_subscribed_idx ON public.users (is_subscribed);

-- Create trigger to sync subscription status
CREATE OR REPLACE FUNCTION sync_user_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS NOT NULL THEN
      UPDATE public.users 
      SET is_subscribed = NEW."isActive"
      WHERE id = NEW."userId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on subscribers table
DROP TRIGGER IF EXISTS sync_user_subscription_trigger ON public.subscribers;
CREATE TRIGGER sync_user_subscription_trigger
  AFTER INSERT OR UPDATE ON public.subscribers
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_status();

-- Sync existing subscription data
UPDATE public.users u
SET is_subscribed = true
FROM public.subscribers s
WHERE s."userId" = u.id AND s."isActive" = true;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop and recreate to ensure idempotency)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
CREATE POLICY "Users can view all profiles"
  ON public.users FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Grant permissions
GRANT SELECT ON public.users TO authenticated, anon;
GRANT INSERT, UPDATE (username, name, bio, website, is_subscribed) ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

COMMENT ON TABLE public.users IS 'User profiles and metadata';
COMMENT ON COLUMN public.users.id IS 'Links to auth.users.id';
COMMENT ON COLUMN public.users.is_subscribed IS 'Synced with subscribers.isActive via trigger';
