-- Migration: Authentication identity source of truth and RPC hardening
-- Date: 2026-11-20
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Scope (read-only audit of the repository and the prepared auth migrations):
--   * public.users.role is the canonical application role. Every server-side
--     check (lib/serverAuth.ts, /api/auth/me, /api/user/role, /api/admin/*)
--     already reads it and never trusts user_metadata.role.
--   * public.user_roles / public.roles are legacy compatibility/audit tables.
--     The application has no read call site for them.
--   * public.is_current_user_admin() still ORed the legacy tables, so an RLS
--     admin policy could disagree with server authorization. This migration
--     makes the RLS predicate read the same canonical column.
--   * public.get_my_user_roles() is SECURITY DEFINER and was granted to
--     authenticated. No application code calls it: roles reach the client via
--     /api/auth/me, which uses the service-role client after verifying the
--     caller. The narrowest fix is to remove it from the Data API.
--
-- No rows are deleted. No account is demoted. Existing legacy administrators
-- are preserved in users.role before the predicate becomes canonical-only.
--
-- Ordering: review/apply 2026-11-03_auth_role_consolidation.sql first if it has
-- not been applied yet. This migration repeats its non-destructive ADMIN
-- preservation rule so it is also safe on its own.
--
-- Verification: scripts/security/verify-supabase-exposure.mjs
-- Rollback: restore the previous is_current_user_admin() body only if the
-- canonical users.role backfill has been verified; the RPC revoke should stay.

begin;

-- ----------------------------------------------------------------------------
-- 1. Preserve legacy administrators in the canonical column.
--    This only promotes accounts already recorded as ADMIN in user_roles;
--    ordinary users, USER rows and all other profile data are untouched.
-- ----------------------------------------------------------------------------
update public.users u
set role = 'ADMIN',
    updated_at = now()
where upper(coalesce(u.role, '')) <> 'ADMIN'
  and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id::text = u.id
      and upper(r.name) = 'ADMIN'
  );

-- Empty/NULL roles are treated as USER by the predicate and server code; no
-- bulk UPDATE is needed here.

-- ----------------------------------------------------------------------------
-- 2. One admin predicate for both RLS and server code.
--    The function stays SECURITY DEFINER so it can read users.role under RLS,
--    but it is only executable by authenticated/service_role and always scopes
--    the lookup to auth.uid(). It cannot be used to inspect another user's role.
-- ----------------------------------------------------------------------------
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()::text
      and upper(coalesce(u.role, '')) = 'ADMIN'
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

comment on function public.is_current_user_admin() is
  'RLS admin predicate. Reads only public.users.role for auth.uid(); legacy user_roles is not authoritative.';

-- ----------------------------------------------------------------------------
-- 3. Remove the unused SECURITY DEFINER RPC from the authenticated Data API.
--    The function is kept for service-role/ops use, with a fixed search_path.
--    App roles continue to come from /api/auth/me (verified session + service
--    role lookup) instead of a browser-callable RPC.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.get_my_user_roles()') is not null then
    execute 'alter function public.get_my_user_roles() set search_path = public, pg_temp';
    execute 'revoke all on function public.get_my_user_roles() from public, anon, authenticated';
    execute 'grant execute on function public.get_my_user_roles() to service_role';
    execute $comment$
      comment on function public.get_my_user_roles() is
        'Legacy self-role helper. Service-role only; authenticated EXECUTE is intentionally revoked because the application reads roles through /api/auth/me.'
    $comment$;
  end if;
end;
$$;

-- The arbitrary-user variant must never be callable from the Data API either.
do $$
begin
  if to_regprocedure('public.get_my_user_roles(uuid)') is not null then
    execute 'revoke all on function public.get_my_user_roles(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.get_my_user_roles(uuid) to service_role';
  end if;

  if to_regprocedure('public.get_my_user_roles_any(text)') is not null then
    execute 'revoke all on function public.get_my_user_roles_any(text) from public, anon, authenticated';
    execute 'grant execute on function public.get_my_user_roles_any(text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Document the table contracts. RLS remains enabled, and these tables keep
--    no anon/authenticated grants, so they do not need permissive policies:
--      * user_roles / roles  -> legacy; no anon/authenticated grants
--        (see 2026-10-30_security_hardening_private_data.sql);
--      * wallet_auth_nonces  -> service-role-only single-use login challenges.
--    Adding a SELECT policy without a grant would change nothing; adding a grant
--    would expose role/audit data. Neither is part of this fix.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_roles') is not null then
    execute $comment$
      comment on table public.user_roles is
        'Legacy role assignments retained for compatibility/audit. Not authoritative for application or RLS authorization; service_role only.'
    $comment$;
  end if;

  if to_regclass('public.wallet_auth_nonces') is not null then
    execute $comment$
      comment on table public.wallet_auth_nonces is
        'Single-use SIWE challenges. RLS enabled; no anon/authenticated grants; service-role only. No policy is required because the Data API roles have no table privilege.'
    $comment$;
  end if;
end;
$$;

commit;
