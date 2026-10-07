-- items
create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('note','article','link','photo','video','quote')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  visibility text not null default 'private' check (visibility in ('private','public')),
  lang text not null default 'ru',
  slug text,
  title text,
  body_md text,
  source_url text,
  ai_allowed boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(lang, slug)
);

create table if not exists public.item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  version integer not null,
  title text,
  body_md text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique(item_id, version)
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_key text not null,
  mime text,
  width integer,
  height integer,
  alt text,
  created_at timestamptz not null default now()
);

create table if not exists public.distributions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  channel text not null check (channel in ('telegram','mastodon','bluesky')),
  status text not null default 'pending' check (status in ('pending','posted','updated','failed','deleted')),
  external_id text,
  payload_hash text,
  attempts integer not null default 0,
  last_error text,
  posted_at timestamptz,
  unique(item_id, channel)
);

create table if not exists public.ingest_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  source text,
  received_at timestamptz not null default now(),
  item_id uuid references public.items(id) on delete set null
);

create table if not exists public.link_snapshots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  url text not null,
  fetched_at timestamptz,
  http_status integer,
  html_key text,
  text_key text,
  content_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_status_visibility
  on public.items(status, visibility);

create index if not exists idx_items_published_at
  on public.items(published_at desc);

create index if not exists idx_items_lang_slug
  on public.items(lang, slug);

create index if not exists idx_item_versions_item_id
  on public.item_versions(item_id, version desc);

create index if not exists idx_distributions_item_id_channel
  on public.distributions(item_id, channel);

create index if not exists idx_ingest_log_key
  on public.ingest_log(idempotency_key);

alter table public.items enable row level security;
alter table public.item_versions enable row level security;
alter table public.media enable row level security;
alter table public.distributions enable row level security;
alter table public.ingest_log enable row level security;

create policy "public read published items"
on public.items
for select
to public
using (status = 'published' and visibility = 'public');

create policy "service role all access items"
on public.items
for all
using (true)
with check (true);

create policy "service role all access item_versions"
on public.item_versions
for all
using (true)
with check (true);

create policy "service role all access media"
on public.media
for all
using (true)
with check (true);

create policy "service role all access distributions"
on public.distributions
for all
using (true)
with check (true);

create policy "service role all access ingest_log"
on public.ingest_log
for all
using (true)
with check (true);
