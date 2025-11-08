-- Migration: Sync subscribers table with users table
-- Date: 2025-11-08
-- Purpose: Add necessary columns to subscribers for proper user-subscriber sync

-- Ensure subscribers table has all necessary columns
DO $$
BEGIN
  -- Add email column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN email TEXT;
  END IF;

  -- Add userId column if missing (links to auth.users.id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'userId'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN "userId" TEXT;
  END IF;

  -- Add isActive column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE public.subscribers ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add id column as TEXT if it's currently BIGINT
  -- First check if id is BIGINT and convert if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscribers' 
    AND column_name = 'id' 
    AND data_type = 'bigint'
  ) THEN
    -- This is a destructive operation - only run if you can lose subscriber data!
    -- Comment out if you have important data
    -- TRUNCATE TABLE public.subscribers;
    -- ALTER TABLE public.subscribers DROP COLUMN id;
    -- ALTER TABLE public.subscribers ADD COLUMN id TEXT PRIMARY KEY;
    
    -- Safe alternative: add text_id column and migrate later
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'text_id'
    ) THEN
      ALTER TABLE public.subscribers ADD COLUMN text_id TEXT;
    END IF;
  END IF;
END $$;

-- Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_unique_idx 
  ON public.subscribers (email) 
  WHERE email IS NOT NULL;

-- Create index on userId for faster lookups
CREATE INDEX IF NOT EXISTS subscribers_userId_idx 
  ON public.subscribers ("userId");

-- Create index on isActive for filtering
CREATE INDEX IF NOT EXISTS subscribers_isActive_idx 
  ON public.subscribers ("isActive");

-- Add users table subscription status if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_subscribed'
  ) THEN
    ALTER TABLE public.users ADD COLUMN is_subscribed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create trigger to sync users.is_subscribed with subscribers.isActive
CREATE OR REPLACE FUNCTION sync_user_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscriber is activated/deactivated, update users table
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

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS sync_user_subscription_trigger ON public.subscribers;
CREATE TRIGGER sync_user_subscription_trigger
  AFTER INSERT OR UPDATE ON public.subscribers
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_status();

-- Sync existing data: update users.is_subscribed based on subscribers
UPDATE public.users u
SET is_subscribed = true
FROM public.subscribers s
WHERE s."userId" = u.id AND s."isActive" = true;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.subscribers TO authenticated;
GRANT SELECT, UPDATE (is_subscribed) ON public.users TO authenticated;

COMMENT ON COLUMN public.users.is_subscribed IS 'Auto-synced with subscribers.isActive via trigger';
COMMENT ON COLUMN public.subscribers.userId IS 'Links to auth.users.id (if user is registered)';
COMMENT ON COLUMN public.subscribers.email IS 'Subscriber email address';
COMMENT ON COLUMN public.subscribers.isActive IS 'Whether subscription is active (confirmed)';
