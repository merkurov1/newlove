-- ============================================================================
-- Pierrot isolated Personal Assistant profile (Telegram)
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- One Telegram sender id maps to one opaque profile UUID. Conversation
-- transcripts and long-term memories are stored in their own tables and are
-- always filtered by that profile UUID. Nothing here is joined to owner
-- history, Brain, projects, decisions, analytics or Telegram owner tables.
--
-- Access is deny-by-default: RLS is enabled, no anon/authenticated policies are
-- created, and only the service role may read or write. No elevated-privilege
-- function is defined.
-- ============================================================================

begin;

create table if not exists public.pierrot_assistant_profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  display_name text,
  language text not null default 'ru',
  memory_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pierrot_assistant_profiles_telegram_user_id_check
    check (telegram_user_id > 0),
  constraint pierrot_assistant_profiles_display_name_check
    check (display_name is null or char_length(display_name) between 1 and 120),
  constraint pierrot_assistant_profiles_language_check
    check (language ~ '^[A-Za-z-]{2,16}$')
);

comment on table public.pierrot_assistant_profiles is
  'Opaque server-side profile for the isolated Telegram personal assistant. Telegram id is a routing key, never an authentication factor.';

-- The migration is additive and repeatable. The explicit seed keeps the
-- allowlisted profile ready for review without exposing its UUID in code.
insert into public.pierrot_assistant_profiles (telegram_user_id, display_name)
values (291983727, 'Светлана Георгиевна')
on conflict (telegram_user_id) do nothing;

create table if not exists public.pierrot_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.pierrot_assistant_profiles (id) on delete cascade,
  message_id text not null,
  role text not null,
  content text not null,
  language text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pierrot_assistant_messages_message_id_check
    check (message_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  constraint pierrot_assistant_messages_role_check
    check (role in ('user', 'assistant')),
  constraint pierrot_assistant_messages_content_check
    check (char_length(content) between 1 and 12000),
  constraint pierrot_assistant_messages_profile_message_uidx
    unique (profile_id, message_id)
);

comment on table public.pierrot_assistant_messages is
  'Profile-scoped conversation transcript for the isolated personal assistant. Never mixed with owner or public Pierrot transcripts.';

create index if not exists pierrot_assistant_messages_profile_created_idx
  on public.pierrot_assistant_messages (profile_id, created_at desc);

create table if not exists public.pierrot_assistant_memories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.pierrot_assistant_profiles (id) on delete cascade,
  content text not null,
  status text not null default 'active',
  source_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pierrot_assistant_memories_content_check
    check (char_length(content) between 1 and 4000),
  constraint pierrot_assistant_memories_status_check
    check (status in ('active', 'forgotten')),
  constraint pierrot_assistant_memories_source_message_id_check
    check (
      source_message_id is null or
      source_message_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
    )
);

comment on table public.pierrot_assistant_memories is
  'Long-term memory explicitly saved by the isolated personal assistant user. Disabled memory stops new rows but keeps existing history.';

create index if not exists pierrot_assistant_memories_profile_status_created_idx
  on public.pierrot_assistant_memories (profile_id, status, created_at desc);

alter table public.pierrot_assistant_profiles enable row level security;
alter table public.pierrot_assistant_messages enable row level security;
alter table public.pierrot_assistant_memories enable row level security;

-- Deny by default. No anon/authenticated policy exists, and direct privileges
-- are removed. Only the server-side service role can access these tables.
revoke all on table public.pierrot_assistant_profiles from public, anon, authenticated;
revoke all on table public.pierrot_assistant_messages from public, anon, authenticated;
revoke all on table public.pierrot_assistant_memories from public, anon, authenticated;

grant all on table public.pierrot_assistant_profiles to service_role;
grant all on table public.pierrot_assistant_messages to service_role;
grant all on table public.pierrot_assistant_memories to service_role;

commit;
