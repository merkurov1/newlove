-- Telegram Flow publishing modes.
--
-- Run manually in the Supabase SQL editor. The bot stores only the selected
-- mode and an expiry; message content is never written here.

create table if not exists public.telegram_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,
  mode text not null check (mode in ('note', 'link', 'article', 'media')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (telegram_user_id, telegram_chat_id)
);

create index if not exists telegram_flow_sessions_expiry_idx
  on public.telegram_flow_sessions (expires_at);

alter table public.telegram_flow_sessions enable row level security;

revoke all on table public.telegram_flow_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_flow_sessions to service_role;

-- Optional cleanup. Safe to omit if pg_cron is not configured.
create or replace function public.cleanup_telegram_flow_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.telegram_flow_sessions where expires_at < now();
$$;

revoke all on function public.cleanup_telegram_flow_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_telegram_flow_sessions() to service_role;
