-- Migration: Add token expiry for subscriber_tokens
-- Date: 2025-11-08
-- Purpose: Add expiration to newsletter subscription tokens (7 days)

-- Add expires_at column
ALTER TABLE public.subscriber_tokens 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Set default expiry to 7 days from created_at for existing tokens
UPDATE public.subscriber_tokens 
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

-- Create index for efficient cleanup
CREATE INDEX IF NOT EXISTS subscriber_tokens_expires_at_idx 
ON public.subscriber_tokens (expires_at);

-- Function to clean up expired tokens (optional, can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.subscriber_tokens
  WHERE expires_at < NOW() AND used = true;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_expired_tokens() TO service_role;

COMMENT ON COLUMN public.subscriber_tokens.expires_at IS 'Token expiration time (7 days from creation)';
COMMENT ON FUNCTION cleanup_expired_tokens() IS 'Cleanup expired and used tokens';
