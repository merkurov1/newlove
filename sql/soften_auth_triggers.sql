-- soften_auth_triggers.sql
-- Safe wrapper for auth.users triggers to avoid failing user creation when role-assignment or claim setting errors occur.
-- Intended to be run in Supabase SQL Editor by a privileged user.
-- This script:
-- 1) Creates a small table public.auth_trigger_errors for logging trigger exceptions.
-- 2) Replaces existing functions assign_default_user_role and set_jwt_role_claim with safe wrappers
--    that catch exceptions and log them instead of propagating to the calling transaction.
-- NOTE: Test in staging before applying to production. If you already have these functions,
-- this script will replace them. Keep backups if needed.

BEGIN;

-- 1) create log table
CREATE TABLE IF NOT EXISTS public.auth_trigger_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  trigger_name text,
  user_id uuid,
  error_message text,
  detail jsonb
);

-- 2) safe assign_default_user_role
CREATE OR REPLACE FUNCTION public.assign_default_user_role_safe() RETURNS trigger AS $$
DECLARE
  user_role_id uuid;
BEGIN
  BEGIN
    SELECT id INTO user_role_id FROM public.roles WHERE upper(name) = 'USER' LIMIT 1;
    IF user_role_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, user_role_id);
      EXCEPTION WHEN unique_violation THEN
        -- ignore duplicate assignment
        NULL;
      END;
    END IF;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but do not abort the auth.users insertion
    BEGIN
      INSERT INTO public.auth_trigger_errors (trigger_name, user_id, error_message, detail)
      VALUES ('assign_default_user_role_safe', NEW.id, SQLERRM, jsonb_build_object('errdetail', PG_EXCEPTION_DETAIL(), 'errhint', PG_EXCEPTION_HINT()));
    EXCEPTION WHEN OTHERS THEN
      -- if logging fails, ignore silently
      NULL;
    END;
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach or replace trigger
DROP TRIGGER IF EXISTS trg_assign_default_role_safe ON auth.users;
CREATE TRIGGER trg_assign_default_role_safe
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_default_user_role_safe();

-- 3) safe set_jwt_role_claim (best-effort; avoid interfering with token creation)
CREATE OR REPLACE FUNCTION public.set_jwt_role_claim_safe() RETURNS trigger AS $$
DECLARE
  rname text;
BEGIN
  BEGIN
    -- pick one role name for the user (if multiple, pick first)
    SELECT upper(r.name) INTO rname
    FROM public.roles r
    JOIN public.user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = NEW.id
    LIMIT 1;
    IF rname IS NOT NULL THEN
      PERFORM set_config('jwt.claims.role', rname, true);
    END IF;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Log and continue; don't break user creation
    BEGIN
      INSERT INTO public.auth_trigger_errors (trigger_name, user_id, error_message, detail)
      VALUES ('set_jwt_role_claim_safe', NEW.id, SQLERRM, jsonb_build_object('errdetail', PG_EXCEPTION_DETAIL(), 'errhint', PG_EXCEPTION_HINT()));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_jwt_claim_safe ON auth.users;
CREATE TRIGGER trg_set_jwt_claim_safe
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_jwt_role_claim_safe();

COMMIT;

-- Usage notes:
-- * This script intentionally avoids raising exceptions from trigger functions so that
--   auth.users insertion is not blocked by ancillary logic (role assignment / claim setting).
-- * After applying, monitor public.auth_trigger_errors for any entries and fix underlying
--   role/permission issues proactively.
-- * If your use-case requires the JWT claim to be present in the initial token, consider
--   an alternative approach (e.g., deferring role-dependent behavior to server-side lookups
--   using the service_role key, or ensuring the claim-setting runs in the same transaction
--   that mints the token — which may require custom Supabase setup).
