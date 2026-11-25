-- Temple Chronicles — public memory, opt-in identity and stable pagination.
--
-- This migration is additive. It does not rewrite, delete or backfill any
-- temple_log row. The new identity column defaults to false, so every legacy
-- name is treated as private until a visitor explicitly opts in on a later
-- ritual.
--
-- Realtime is delivered through a tiny public-safe signal table instead of the
-- raw temple_log row. The browser never receives user_id, email, a confession,
-- a raw Cast answer or any other private column. The allowlisted feed route
-- remains the only way to read event details.

begin;

alter table if exists public.temple_log
  add column if not exists is_public_identity boolean not null default false;

comment on column public.temple_log.is_public_identity is
  'Explicit visitor opt-in for showing the author name in the public chronicle. False by default; legacy rows are private.';

-- Keyset pagination: (created_at desc, id desc) is the stable cursor order.
create index if not exists temple_log_chronicles_order_idx
  on public.temple_log (created_at desc, id desc);

-- The ritual filter is case-insensitive over legacy spellings. An expression
-- index helps the bounded recent feed and the 30-day aggregate window without
-- changing how event types are stored.
create index if not exists temple_log_event_type_created_idx
  on public.temple_log ((upper(event_type)), created_at desc, id desc);

-- temple_log is now service-role only through the server routes. The browser
-- must not be able to read arbitrary legacy rows (including user_id, emails or
-- old confession text) even if it knows the anon key.
alter table if exists public.temple_log enable row level security;

drop policy if exists temple_log_public_read on public.temple_log;
drop policy if exists public_read_on_temple_log on public.temple_log;

revoke all on public.temple_log from anon, authenticated;
revoke all on public.temple_log from public;

-- One public-safe realtime signal per insert. It intentionally contains only
-- the event type, an optional opted-in name and a timestamp.
create table if not exists public.temple_chronicle_signals (
  id bigint generated always as identity primary key,
  log_id text not null,
  event_type text not null default '',
  public_name text,
  occurred_at timestamptz not null default now()
);

comment on table public.temple_chronicle_signals is
  'Public-safe Realtime signal for Temple Chronicles. Never contains user ids, emails, confessions or raw Cast answers.';

alter table public.temple_chronicle_signals enable row level security;

drop policy if exists temple_chronicle_signals_public_read
  on public.temple_chronicle_signals;
create policy temple_chronicle_signals_public_read
  on public.temple_chronicle_signals
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate, references, trigger
  on public.temple_chronicle_signals from anon, authenticated;
revoke all on public.temple_chronicle_signals from public;
grant select on public.temple_chronicle_signals to anon, authenticated;
grant all on public.temple_chronicle_signals to service_role;

create index if not exists temple_chronicle_signals_occurred_idx
  on public.temple_chronicle_signals (occurred_at desc);

create or replace function public.record_temple_chronicle_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.temple_chronicle_signals (
    log_id,
    event_type,
    public_name,
    occurred_at
  )
  values (
    coalesce(new.id::text, new.created_at::text, ''),
    coalesce(new.event_type, ''),
    case
      when new.is_public_identity is true
        and upper(coalesce(new.event_type, '')) not like 'ABSOLUTION%'
        then nullif(trim(new.author), '')
      else null
    end,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists temple_log_chronicle_signal on public.temple_log;
create trigger temple_log_chronicle_signal
  after insert on public.temple_log
  for each row
  execute function public.record_temple_chronicle_signal();

-- Realtime publication: add each table once; re-running is safe.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'temple_chronicle_signals'
  ) then
    alter publication supabase_realtime add table public.temple_chronicle_signals;
  end if;
end
$$;

commit;
