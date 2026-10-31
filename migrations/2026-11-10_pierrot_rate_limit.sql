-- Migration: cross-instance Pierrot rate limiting
-- Date: 2026-11-10
--
-- The in-memory limiter remains as a fallback, but Vercel requests may land on
-- different instances. This table/RPC provides one atomic bucket per key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pierrot_rate_limits (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS pierrot_rate_limits_window_idx
  ON public.pierrot_rate_limits (window_started_at);

ALTER TABLE public.pierrot_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pierrot_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pierrot_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.pierrot_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_started timestamptz;
  v_window integer := GREATEST(1, LEAST(COALESCE(p_window_seconds, 60), 86400));
  v_max integer := GREATEST(1, LEAST(COALESCE(p_max_requests, 1), 100000));
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 300 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pierrot_rate_limits AS limits (key, window_started_at, request_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
  SET
    request_count = CASE
      WHEN limits.window_started_at < now() - make_interval(secs => v_window)
        THEN 1
      ELSE limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - make_interval(secs => v_window)
        THEN now()
      ELSE limits.window_started_at
    END
  RETURNING limits.request_count, limits.window_started_at
    INTO v_count, v_started;

  allowed := v_count <= v_max;
  remaining := GREATEST(v_max - v_count, 0);
  retry_after := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_started + make_interval(secs => v_window) - now())))::integer
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.pierrot_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_rate_limit(text, integer, integer)
  TO service_role;

COMMENT ON TABLE public.pierrot_rate_limits IS
  'Server-only cross-instance rate-limit buckets. Old rows are removed by the retention cron.';
COMMENT ON FUNCTION public.pierrot_rate_limit(text, integer, integer) IS
  'Atomic fixed-window rate limit for Pierrot web, Telegram and human-presence endpoints.';
