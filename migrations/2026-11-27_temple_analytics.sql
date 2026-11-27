-- Temple analytics: private event store and visit sessions.
--
-- Additive only. This migration never reads, rewrites, deletes or backfills
-- temple_log rows. Historical anonymous rows remain unknown: they are not
-- converted into visitors, sessions or D1/D7 cohorts.
--
-- Privacy model
-- -------------
-- * visitor_key is an HMAC digest of a random guest cookie or a verified
--   identity namespace. Raw Telegram ids, Supabase UUIDs, emails and display
--   names are never stored.
-- * session_key is a random opaque UUID. A session lasts 30 minutes of
--   inactivity and is reused across refreshes.
-- * event_key is unique, so a retried request cannot inflate an action.
-- * RLS is enabled with no policies; anon/authenticated receive no grants.
--   Only the server route (service role) reads or writes these tables.
--
-- The owner-only report is served by GET /api/temple/analytics. Raw rows are
-- never returned to a client.

begin;

create table if not exists public.temple_analytics_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_name text not null
    check (event_name in (
      'session_start',
      'page_view',
      'ritual_open',
      'ritual_nav',
      'ritual_complete'
    )),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  visitor_key text not null,
  session_key text not null,
  identity_kind text not null default 'guest'
    check (identity_kind in ('guest', 'supabase', 'telegram')),
  channel text not null default 'web'
    check (channel in ('web', 'telegram')),
  source text,
  path text,
  ritual text
);

comment on table public.temple_analytics_events is
  'Private Temple analytics event store. visitor_key is an HMAC pseudonym; no raw ids, names, emails or messages are stored. Service-role only.';

comment on column public.temple_analytics_events.event_key is
  'Idempotency key. Retried requests with the same key are ignored.';

create index if not exists temple_analytics_events_occurred_idx
  on public.temple_analytics_events (occurred_at desc);

create index if not exists temple_analytics_events_visitor_idx
  on public.temple_analytics_events (visitor_key, occurred_at desc);

create index if not exists temple_analytics_events_session_idx
  on public.temple_analytics_events (session_key, occurred_at desc);

create index if not exists temple_analytics_events_name_idx
  on public.temple_analytics_events (event_name, occurred_at desc);

create table if not exists public.temple_analytics_sessions (
  session_key text primary key,
  visitor_key text not null,
  identity_kind text not null default 'guest'
    check (identity_kind in ('guest', 'supabase', 'telegram')),
  channel text not null default 'web'
    check (channel in ('web', 'telegram')),
  source text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.temple_analytics_sessions is
  'Private Temple visit sessions. A 30-minute inactivity window is enforced by the server cookie; refreshing does not create a new session. Service-role only.';

create index if not exists temple_analytics_sessions_visitor_idx
  on public.temple_analytics_sessions (visitor_key, started_at desc);

create index if not exists temple_analytics_sessions_started_idx
  on public.temple_analytics_sessions (started_at desc);

alter table public.temple_analytics_events enable row level security;
alter table public.temple_analytics_sessions enable row level security;

revoke all on table public.temple_analytics_events from public, anon, authenticated;
revoke all on table public.temple_analytics_sessions from public, anon, authenticated;

grant all on table public.temple_analytics_events to service_role;
grant all on table public.temple_analytics_sessions to service_role;

-- The identity column owns a sequence. Keep it off client roles and available
-- to the service-role route that inserts events.
revoke all on sequence public.temple_analytics_events_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.temple_analytics_events_id_seq
  to service_role;

-- No other sequence is exposed: sessions use a text primary key.

commit;
