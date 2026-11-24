-- Telegram Mini App shared Vigil (group-scoped).
--
-- Additive only. These tables are intentionally private: RLS is enabled, no
-- policies are created, and anon/authenticated receive no grants. The server
-- route writes through the service role after verifying signed initData.
--
-- Group participation is deliberately separate from public.vigil_hearts and
-- never contributes to the individual supporter count.

create table if not exists public.telegram_group_vigil_sessions (
  group_chat_id text not null,
  chat_instance text not null,
  chat_type text not null check (chat_type in ('group', 'supergroup')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_chat_id, chat_instance)
);

create table if not exists public.telegram_group_vigil_participants (
  group_chat_id text not null,
  chat_instance text not null,
  telegram_user_id text not null,
  joined_at timestamptz not null default now(),
  primary key (group_chat_id, chat_instance, telegram_user_id)
);

comment on table public.telegram_group_vigil_sessions is
  'Private Telegram group Vigil sessions. Bound to signed chat_instance.';

comment on table public.telegram_group_vigil_participants is
  'Private group Vigil participation. Identities never leave the server.';

alter table public.telegram_group_vigil_sessions enable row level security;
alter table public.telegram_group_vigil_participants enable row level security;

revoke all on table public.telegram_group_vigil_sessions from anon, authenticated;
revoke all on table public.telegram_group_vigil_participants from anon, authenticated;

grant all on table public.telegram_group_vigil_sessions to service_role;
grant all on table public.telegram_group_vigil_participants to service_role;
