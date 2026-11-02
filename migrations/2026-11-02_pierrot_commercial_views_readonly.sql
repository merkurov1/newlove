-- Migration: keep Pierrot analytics views read-only for the service role
-- Date: 2026-11-02
--
-- The database default privileges grant DML on newly created objects to
-- service_role. Analytics views must remain SELECT-only even for that role.
-- This migration affects only `pierrot_v_*` views and preserves their
-- security_invoker setting.

DO $$
DECLARE
  view_name TEXT;
BEGIN
  FOR view_name IN
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name LIKE 'pierrot_v_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', view_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', view_name);
  END LOOP;
END $$;
