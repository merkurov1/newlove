-- Migration: Authentication role consolidation
-- Date: 2026-11-03
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Canonical application role: public.users.role (USER | ADMIN).
-- public.user_roles remains as a legacy/compatibility record and is not the
-- authority used by server-side authorization. This migration only preserves
-- existing administrators and documents the contract; it does not demote or
-- delete any account.

begin;

-- If an account is recorded as ADMIN in the legacy role tables, preserve that
-- administrator status in the canonical column before any cleanup.
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

-- Empty roles are ordinary users. Existing USER/ADMIN values are untouched.
update public.users
set role = 'USER',
    updated_at = now()
where role is null or btrim(role) = '';

alter table public.users
  alter column role set default 'USER';

comment on column public.users.role is
  'Authoritative application role: USER or ADMIN. Server authorization must read this column, never user_metadata.role.';

comment on table public.user_roles is
  'Legacy role assignments retained for compatibility/audit. Not authoritative for server authorization.';

commit;
