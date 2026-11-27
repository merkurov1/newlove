-- ============================================================================
-- 2026-11-27 Cast privacy, idempotency, capture lifetime and provenance
--
-- Additive only. This migration does NOT delete, redact or rewrite any casts
-- row. Historical anonymous rows are inventoried separately and cleaned only
-- after the owner approves that plan (see docs/temple/CAST_PRIVACY_CLEANUP.md).
--
-- Contents
--   1. casts: server-owned status, consent, idempotency, provenance, capture
--      lifetime/consumption and email delivery bookkeeping.
--   2. Cross-instance rate limiting for the expensive Cast endpoints.
--   3. RLS hygiene: drop the legacy permissive policies on casts and keep the
--      Data API closed. The application uses the service role only.
--
-- Rollback: migrations/rollback/2026-11-27_cast_privacy_idempotency.rollback.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. casts — additive columns
-- ----------------------------------------------------------------------------

alter table if exists public.casts
  add column if not exists status text not null default 'anonymous',
  add column if not exists retention_consent boolean not null default false,
  add column if not exists idempotency_key text,
  add column if not exists analysis_metadata jsonb,
  add column if not exists capture_token_nonce text,
  add column if not exists capture_token_expires_at timestamptz,
  add column if not exists capture_consumed_at timestamptz,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivered_at timestamptz;

comment on column public.casts.status is
  'Server-resolved protocol status: anonymous | identified | telegram_pending. Never taken from the client.';
comment on column public.casts.retention_consent is
  'True only when a verified owner explicitly asked to keep the raw answers.';
comment on column public.casts.idempotency_key is
  'Client-generated submission key. One key yields at most one record and one AI request.';
comment on column public.casts.analysis_metadata is
  'Private provenance: provider, model, prompt version, temperature, request id, token usage.';

-- At most one record per idempotency key. Partial index keeps legacy rows
-- (which have no key) unaffected.
create unique index if not exists casts_idempotency_key_uidx
  on public.casts (idempotency_key)
  where idempotency_key is not null;

create index if not exists casts_status_created_at_idx
  on public.casts (status, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. rate_limit_counters — shared counters for AI analysis and capture
-- ----------------------------------------------------------------------------

create table if not exists public.rate_limit_counters (
  bucket text primary key,
  window_start timestamptz not null,
  count integer not null
);

comment on table public.rate_limit_counters is
  'Private cross-instance rate limit counters. Keys are SHA-256 digests, never raw IPs or user ids. Service role only.';

alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_counters to service_role;

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  if p_bucket is null or length(p_bucket) = 0 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limit_counters as c (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set count = case
          when c.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else c.count + 1
        end,
        window_start = case
          when c.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else c.window_start
        end
  returning c.count, c.window_start into v_count, v_window_start;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);

  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- 3. RLS hygiene for casts
--    Grants are already revoked in 2026-10-30_security_hardening_private_data.
--    The remaining permissive policies are dead weight and a hazard if a grant
--    is ever restored, so remove them. Service role bypasses RLS by design.
-- ----------------------------------------------------------------------------

alter table if exists public.casts enable row level security;
revoke all on table public.casts from anon, authenticated;
grant all on table public.casts to service_role;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'casts'
  loop
    execute format(
      'drop policy if exists %I on public.casts',
      policy_row.policyname
    );
  end loop;
end;
$$;

commit;
