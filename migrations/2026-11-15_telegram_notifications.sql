-- Telegram notification preferences and delivery deduplication.
--
-- Run manually in the Supabase SQL editor. These tables are service-role only.

create table if not exists public.telegram_notification_preferences (
  telegram_user_id bigint not null,
  category text not null check (
    category in ('human_requests', 'flow', 'art_engine', 'pierrot', 'system')
  ),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (telegram_user_id, category)
);

create table if not exists public.telegram_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  category text not null,
  event_key text not null,
  delivered boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (telegram_user_id, event_key)
);

create index if not exists telegram_notification_deliveries_created_idx
  on public.telegram_notification_deliveries (created_at desc);

alter table public.telegram_notification_preferences enable row level security;
alter table public.telegram_notification_deliveries enable row level security;

revoke all on table public.telegram_notification_preferences from public, anon, authenticated;
revoke all on table public.telegram_notification_deliveries from public, anon, authenticated;

grant select, insert, update, delete on table public.telegram_notification_preferences to service_role;
grant select, insert, update, delete on table public.telegram_notification_deliveries to service_role;
