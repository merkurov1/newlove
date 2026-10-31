-- ============================================================================
-- 2026-10-31 repair newsletter subscriber schema
--
-- STATUS: PREPARED, NOT APPLIED.
-- Test on staging before production. Do not run against production from CI
-- without review.
--
-- Drift found on 2026-10-31 (production information_schema):
--   * public.subscribers has no "confirmedAt" and "unsubscribedAt";
--   * public.subscriber_tokens has no "usedAt" and no expires_at;
--   * migrations/2025-11-08_add_token_expiry.sql declares expires_at, but
--     that column is NOT present in the live schema;
--   * no migration in this repository creates subscriber_tokens, and
--     2025-10-18_create_subscribers_table.sql describes a different,
--     legacy NFT-oriented table (BIGINT id, no email/account columns).
--
-- Runtime impact before this migration:
--   * POST /api/subscribe           -> 42703 on select("...confirmedAt...");
--   * GET  /api/newsletter-confirm  -> 42703 on subscribers update;
--   * GET  /api/newsletter-unsubscribe -> 42703 on subscribers update;
--   * newsletter worker / processJob / admin confirmation mail
--                                  -> 42703 when inserting expires_at.
--
-- This migration is additive and idempotent. It does not delete rows and does
-- not send email. The only data backfill is:
--   * "confirmedAt" for rows that are ALREADY active (they were confirmed
--     before this column existed; leaving it NULL would demote them on the
--     next subscribe request);
--   * expires_at for legacy tokens, using the same 7-day TTL that the
--     application already uses for new tokens;
--   * "usedAt" for tokens already marked used (best effort: created_at).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. subscribers: lifecycle timestamps used by /subscribe and /confirm.
-- ----------------------------------------------------------------------------
alter table public.subscribers
  add column if not exists "confirmedAt" timestamptz,
  add column if not exists "unsubscribedAt" timestamptz;

comment on column public.subscribers."confirmedAt" is
  'Moment the double opt-in confirmation was completed; NULL while pending.';
comment on column public.subscribers."unsubscribedAt" is
  'Moment the subscriber used an unsubscribe link; NULL if not unsubscribed.';

-- Existing active subscribers were already confirmed before the column
-- existed. Preserve that state so a repeated subscribe request keeps
-- returning "already_confirmed" instead of demoting them to pending.
update public.subscribers
set "confirmedAt" = coalesce(
  "createdAt"::timestamptz,
  created_at,
  now()
)
where "isActive" = true
  and "confirmedAt" is null;

-- ----------------------------------------------------------------------------
-- 2. subscriber_tokens: expiry and consumption timestamps.
-- ----------------------------------------------------------------------------
alter table public.subscriber_tokens
  add column if not exists "usedAt" timestamptz,
  add column if not exists expires_at timestamptz;

comment on column public.subscriber_tokens."usedAt" is
  'Moment the token was consumed (confirmed or unsubscribed).';
comment on column public.subscriber_tokens.expires_at is
  'Token expiration time (7 days from creation for new tokens).';

-- Match migrations/2025-11-08_add_token_expiry.sql for legacy rows.
update public.subscriber_tokens
set expires_at = created_at + interval '7 days'
where expires_at is null;

update public.subscriber_tokens
set "usedAt" = created_at
where used = true
  and "usedAt" is null;

-- All new tokens must have an expiry; callers may omit the column safely.
alter table public.subscriber_tokens
  alter column expires_at set default (now() + interval '7 days');

alter table public.subscriber_tokens
  alter column expires_at set not null;

create index if not exists subscriber_tokens_expires_at_idx
  on public.subscriber_tokens (expires_at);

-- Used by "invalidate all previous confirmation tokens for this subscriber".
create index if not exists subscriber_tokens_subscriber_type_used_idx
  on public.subscriber_tokens (subscriber_id, type, used);

commit;
