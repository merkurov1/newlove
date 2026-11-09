-- Pierrot unified histories, sessions and message provenance
-- Date: 2026-11-09
--
-- Additive migration. Nothing is deleted or rewritten:
--   * one permanent MAIN history per owner;
--   * one permanent history per project;
--   * sessions are episodes inside a history;
--   * messages keep their original id, text, timestamp and conversation id;
--   * history/session provenance is added next to the legacy model.
--
-- The legacy `pierrot_conversations` rows stay as provenance and as the
-- physical storage of existing messages. New sessions reuse the history's
-- canonical conversation, so "New chat" never creates a new history.
--
-- Run scripts/pierrot/history-backfill.mjs afterwards to create histories,
-- sessions and message links. This file only defines the schema/functions.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Histories
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_histories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('main', 'project')),
  project_id uuid references public.pierrot_projects(id) on delete cascade,
  canonical_conversation_id text
    references public.pierrot_conversations(id) on delete set null,
  title text not null default '',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  next_message_sequence bigint not null default 0
    check (next_message_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pierrot_histories_shape_check check (
    (type = 'main' and project_id is null)
    or (type = 'project' and project_id is not null)
  )
);

-- One MAIN per owner and one history per project. Partial unique indexes are
-- the concurrency guard: even two simultaneous first opens cannot create two.
create unique index if not exists pierrot_histories_main_uidx
  on public.pierrot_histories (owner_user_id)
  where type = 'main';

create unique index if not exists pierrot_histories_project_uidx
  on public.pierrot_histories (project_id)
  where type = 'project';

create index if not exists pierrot_histories_owner_type_idx
  on public.pierrot_histories (owner_user_id, type, updated_at desc);

comment on table public.pierrot_histories is
  'Permanent Pierrot histories: exactly one MAIN per owner and one canonical history per project. Sessions live inside a history.';

-- ---------------------------------------------------------------------------
-- 2. Sessions (episodes)
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_sessions (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null
    references public.pierrot_histories(id) on delete cascade,
  -- Physical conversation used for messages written into this session. For
  -- migrated sessions this is the history canonical conversation.
  conversation_id text
    references public.pierrot_conversations(id) on delete set null,
  -- Original conversation id for audit and old URL compatibility. Never
  -- rewritten and never used to create a second history.
  source_conversation_id text
    references public.pierrot_conversations(id) on delete set null,
  ordinal integer not null check (ordinal > 0),
  title text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  first_message_sequence bigint,
  last_message_sequence bigint,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pierrot_sessions_history_ordinal_uidx
  on public.pierrot_sessions (history_id, ordinal);

-- A legacy conversation can produce at most one session. New sessions have a
-- null source id and are therefore not constrained by this index.
create unique index if not exists pierrot_sessions_history_source_uidx
  on public.pierrot_sessions (history_id, source_conversation_id)
  where source_conversation_id is not null;

create index if not exists pierrot_sessions_history_date_idx
  on public.pierrot_sessions (history_id, started_at desc, ordinal desc);

create index if not exists pierrot_sessions_source_idx
  on public.pierrot_sessions (source_conversation_id);

create index if not exists pierrot_sessions_conversation_idx
  on public.pierrot_sessions (conversation_id, ordinal desc);

comment on table public.pierrot_sessions is
  'Conversation episodes inside a permanent history. A new session never creates a new history.';

-- ---------------------------------------------------------------------------
-- 3. Message provenance: history + session + stable global order
-- ---------------------------------------------------------------------------

alter table public.pierrot_messages
  add column if not exists history_id uuid
    references public.pierrot_histories(id) on delete set null;

alter table public.pierrot_messages
  add column if not exists session_id uuid
    references public.pierrot_sessions(id) on delete set null;

alter table public.pierrot_messages
  add column if not exists history_sequence bigint
    check (history_sequence is null or history_sequence > 0);

create unique index if not exists pierrot_messages_history_sequence_uidx
  on public.pierrot_messages (history_id, history_sequence)
  where history_sequence is not null;

create index if not exists pierrot_messages_history_idx
  on public.pierrot_messages (history_id, history_sequence desc);

create index if not exists pierrot_messages_history_session_idx
  on public.pierrot_messages (session_id, history_sequence);

comment on column public.pierrot_messages.history_id is
  'Permanent history this message belongs to. Null only for non-owner/legacy rows that were never assigned.';
comment on column public.pierrot_messages.session_id is
  'Episode inside the history. The original conversation_id remains untouched for audit.';
comment on column public.pierrot_messages.history_sequence is
  'Stable cursor order inside one history. message_index stays a per-conversation sequence.';

-- ---------------------------------------------------------------------------
-- 4. Event provenance
-- ---------------------------------------------------------------------------

alter table public.pierrot_events
  add column if not exists history_id uuid
    references public.pierrot_histories(id) on delete set null;

alter table public.pierrot_events
  add column if not exists session_id uuid
    references public.pierrot_sessions(id) on delete set null;

create index if not exists pierrot_events_history_idx
  on public.pierrot_events (history_id, created_at desc);

create index if not exists pierrot_events_session_idx
  on public.pierrot_events (session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Idempotent history/session helpers
-- ---------------------------------------------------------------------------

create or replace function public.pierrot_ensure_main_history(p_owner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history_id uuid;
  v_conversation_id text;
  v_session_token text;
  v_now timestamptz := now();
begin
  if p_owner_user_id is null then
    raise exception 'owner_required' using errcode = '22023';
  end if;

  -- Deterministic canonical conversation id. The conversation is the physical
  -- storage for new sessions; it is not itself a user-visible chat history.
  v_conversation_id := 'main-' || replace(p_owner_user_id::text, '-', '');
  v_session_token := gen_random_uuid()::text;

  insert into public.pierrot_conversations (
    id, session_id, status, consent_state, consent_version, language,
    start_page, started_at, updated_at, last_message_at, expires_at,
    next_message_sequence, identity_type, visitor_id, user_id,
    identity_verified_at, identity_source, mode, title
  )
  values (
    v_conversation_id, v_session_token, 'active', 'granted',
    'owner-history-v1', 'ru', '/admin/pierrot', v_now, v_now, null,
    v_now + interval '3650 days', 0, 'owner', null, p_owner_user_id,
    v_now, 'supabase_session', 'site', 'Главная история'
  )
  on conflict (id) do nothing;

  insert into public.pierrot_histories (
    owner_user_id, type, project_id, canonical_conversation_id, title,
    metadata, created_at, updated_at
  )
  values (
    p_owner_user_id, 'main', null, v_conversation_id, 'Главная история',
    jsonb_build_object('source', 'ensure_main_history'), v_now, v_now
  )
  on conflict do nothing;

  select id into v_history_id
  from public.pierrot_histories
  where owner_user_id = p_owner_user_id and type = 'main';

  if v_history_id is null then
    raise exception 'main_history_not_created';
  end if;

  -- Repair a dangling canonical pointer without deleting anything.
  update public.pierrot_histories h
  set canonical_conversation_id = coalesce(h.canonical_conversation_id, v_conversation_id),
      updated_at = v_now
  where h.id = v_history_id
    and (h.canonical_conversation_id is null
         or not exists (
           select 1 from public.pierrot_conversations c
           where c.id = h.canonical_conversation_id
         ));

  return v_history_id;
end;
$$;

create or replace function public.pierrot_ensure_project_history(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_history_id uuid;
  v_now timestamptz := now();
begin
  select id, owner_user_id, name, conversation_id
  into v_project
  from public.pierrot_projects
  where id = p_project_id;

  if not found or v_project.conversation_id is null then
    return null;
  end if;

  insert into public.pierrot_histories (
    owner_user_id, type, project_id, canonical_conversation_id, title,
    metadata, created_at, updated_at
  )
  values (
    v_project.owner_user_id, 'project', v_project.id,
    v_project.conversation_id, v_project.name,
    jsonb_build_object('source', 'ensure_project_history'), v_now, v_now
  )
  on conflict do nothing;

  select id into v_history_id
  from public.pierrot_histories
  where project_id = v_project.id and type = 'project';

  if v_history_id is not null then
    update public.pierrot_histories h
    set canonical_conversation_id = coalesce(h.canonical_conversation_id, v_project.conversation_id),
        title = case when h.title = '' then v_project.name else h.title end,
        updated_at = v_now
    where h.id = v_history_id;
  end if;

  return v_history_id;
end;
$$;

create or replace function public.pierrot_create_session(
  p_history_id uuid,
  p_title text default null,
  p_source_conversation_id text default null
)
returns table (
  id uuid,
  history_id uuid,
  conversation_id text,
  source_conversation_id text,
  ordinal integer,
  title text,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history record;
  v_session public.pierrot_sessions%rowtype;
  v_ordinal integer;
  v_now timestamptz := now();
begin
  select * into v_history
  from public.pierrot_histories h
  where h.id = p_history_id
  for update;

  if not found then
    raise exception 'history_not_found' using errcode = 'P0002';
  end if;

  if p_source_conversation_id is not null then
    select * into v_session
    from public.pierrot_sessions s
    where s.history_id = p_history_id
      and s.source_conversation_id = p_source_conversation_id
    limit 1;

    if found then
      return query
      select v_session.id, v_session.history_id, v_session.conversation_id,
             v_session.source_conversation_id, v_session.ordinal,
             v_session.title, v_session.started_at;
      return;
    end if;
  end if;

  select coalesce(max(s.ordinal), 0) + 1 into v_ordinal
  from public.pierrot_sessions s
  where s.history_id = p_history_id;

  insert into public.pierrot_sessions (
    history_id, conversation_id, source_conversation_id, ordinal, title,
    started_at, metadata, created_at, updated_at
  )
  values (
    p_history_id, v_history.canonical_conversation_id,
    p_source_conversation_id, v_ordinal,
    coalesce(nullif(trim(p_title), ''), 'Новая сессия'),
    v_now, jsonb_build_object('source', 'create_session'), v_now, v_now
  )
  returning * into v_session;

  update public.pierrot_histories h
  set updated_at = v_now
  where h.id = p_history_id;

  return query
  select v_session.id, v_session.history_id, v_session.conversation_id,
         v_session.source_conversation_id, v_session.ordinal,
         v_session.title, v_session.started_at;
end;
$$;

-- Link all still-unassigned messages of a conversation to a session and give
-- them stable history sequence numbers. Used when an old conversation is
-- opened after the main backfill, or for a conversation created before the
-- application deployment.
create or replace function public.pierrot_link_conversation_messages(
  p_history_id uuid,
  p_session_id uuid,
  p_conversation_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked integer;
  v_max bigint;
  v_next bigint;
  v_now timestamptz := now();
begin
  if p_history_id is null or p_session_id is null or p_conversation_id is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_history_id::text, 0));

  update public.pierrot_messages m
  set history_id = p_history_id,
      session_id = p_session_id
  where m.conversation_id = p_conversation_id
    and m.history_id is null;

  get diagnostics v_linked = row_count;

  select coalesce(max(m.history_sequence), 0) into v_max
  from public.pierrot_messages m
  where m.history_id = p_history_id;

  with target as (
    select m.id,
           row_number() over (order by m.created_at, m.conversation_id, m.message_index) as rn
    from public.pierrot_messages m
    where m.history_id = p_history_id
      and m.history_sequence is null
  )
  update public.pierrot_messages m
  set history_sequence = v_max + target.rn
  from target
  where m.id = target.id;

  select coalesce(max(m.history_sequence), 0) + 1 into v_next
  from public.pierrot_messages m
  where m.history_id = p_history_id;

  update public.pierrot_histories
  set next_message_sequence = greatest(next_message_sequence, v_next),
      updated_at = v_now
  where id = p_history_id;

  update public.pierrot_sessions s
  set message_count = coalesce(sub.count, 0),
      first_message_sequence = sub.first_seq,
      last_message_sequence = sub.last_seq,
      last_message_at = sub.last_at,
      updated_at = v_now
  from (
    select count(*)::int as count,
           min(m.history_sequence) as first_seq,
           max(m.history_sequence) as last_seq,
           max(m.created_at) as last_at
    from public.pierrot_messages m
    where m.session_id = p_session_id and m.history_id = p_history_id
  ) sub
  where s.id = p_session_id;

  return v_linked;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Atomic message append with history/session provenance
-- ---------------------------------------------------------------------------

create or replace function public.pierrot_append_message_v2(
  p_conversation_id text,
  p_session_id text,
  p_message_id text,
  p_role text,
  p_content text,
  p_provider text default null,
  p_history_id uuid default null,
  p_episode_id uuid default null
)
returns table (sequence bigint, content text, inserted boolean, history_sequence bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
  v_history_sequence bigint;
  v_content text;
  v_episode_history uuid;
  v_canonical text;
begin
  if p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_session_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_message_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'invalid_identifier' using errcode = '22023';
  end if;

  if p_role not in ('user', 'assistant') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 16000 then
    raise exception 'invalid_content_length' using errcode = '22001';
  end if;

  if p_provider is not null and p_provider not in ('gemini', 'deepseek', 'openrouter') then
    raise exception 'invalid_provider' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id, 0));

  perform 1
  from public.pierrot_conversations
  where id = p_conversation_id and session_id = p_session_id;

  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if p_history_id is not null then
    select canonical_conversation_id into v_canonical
    from public.pierrot_histories
    where id = p_history_id;

    if not found then
      raise exception 'history_not_found' using errcode = 'P0002';
    end if;

    if p_episode_id is null then
      raise exception 'session_required' using errcode = '22023';
    end if;

    select history_id into v_episode_history
    from public.pierrot_sessions
    where id = p_episode_id;

    if not found or v_episode_history <> p_history_id then
      raise exception 'session_not_found' using errcode = 'P0002';
    end if;

    -- New messages always live in the history's canonical conversation. The
    -- legacy source conversation remains provenance and is never rewritten.
    if v_canonical is not null and v_canonical <> p_conversation_id then
      raise exception 'conversation_not_in_history' using errcode = '22023';
    end if;
  end if;

  select m.message_index, m.content, m.history_sequence
  into v_sequence, v_content, v_history_sequence
  from public.pierrot_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if found then
    return query select v_sequence, v_content, false, v_history_sequence;
    return;
  end if;

  update public.pierrot_conversations
  set next_message_sequence = next_message_sequence + 1,
      last_message_at = now(),
      updated_at = now(),
      expires_at = case
        when identity_type = 'owner' then now() + interval '3650 days'
        else now() + interval '90 days'
      end
  where id = p_conversation_id and session_id = p_session_id
  returning next_message_sequence into v_sequence;

  if p_history_id is not null then
    update public.pierrot_histories
    set next_message_sequence = next_message_sequence + 1,
        updated_at = now()
    where id = p_history_id
    returning next_message_sequence into v_history_sequence;
  end if;

  insert into public.pierrot_messages (
    id, conversation_id, role, content, message_index, provider,
    history_id, session_id, history_sequence
  )
  values (
    p_message_id, p_conversation_id, p_role, p_content, v_sequence, p_provider,
    p_history_id, p_episode_id, v_history_sequence
  );

  if p_history_id is not null and p_episode_id is not null then
    update public.pierrot_sessions
    set message_count = message_count + 1,
        first_message_sequence = coalesce(first_message_sequence, v_history_sequence),
        last_message_sequence = v_history_sequence,
        last_message_at = now(),
        title = case
          when p_role = 'user'
               and (title is null or title = '' or title = 'Новая сессия')
            then left(p_content, 120)
          else title
        end,
        updated_at = now()
    where id = p_episode_id;
  end if;

  return query select v_sequence, p_content, true, v_history_sequence;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Automatic provenance for events and direct message inserts
-- ---------------------------------------------------------------------------

create or replace function public.pierrot_fill_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id text;
  v_history_id uuid;
  v_session_id uuid;
begin
  if new.history_id is not null then
    return new;
  end if;

  v_message_id := case
    when new.payload ? 'message_id' and new.payload->>'message_id' ~ '^[A-Za-z0-9_-]{8,64}$'
      then new.payload->>'message_id'
    when new.event_name in ('message_sent', 'assistant_replied', 'answer_feedback')
         and new.event_key ~ ':[A-Za-z0-9_-]{8,64}$'
      then substring(new.event_key from '([A-Za-z0-9_-]{8,64})$')
    else null
  end;

  if v_message_id is not null then
    select m.history_id, m.session_id
    into v_history_id, v_session_id
    from public.pierrot_messages m
    where m.id = v_message_id
    limit 1;
  end if;

  if v_history_id is null then
    select s.history_id, s.id
    into v_history_id, v_session_id
    from public.pierrot_sessions s
    where s.conversation_id = new.conversation_id
       or s.source_conversation_id = new.conversation_id
    order by s.ordinal desc
    limit 1;
  end if;

  new.history_id := v_history_id;
  new.session_id := v_session_id;
  return new;
end;
$$;

drop trigger if exists pierrot_events_fill_scope on public.pierrot_events;
create trigger pierrot_events_fill_scope
  before insert on public.pierrot_events
  for each row execute function public.pierrot_fill_event_scope();

create or replace function public.pierrot_fill_message_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history_id uuid;
  v_session_id uuid;
  v_sequence bigint;
begin
  if new.history_id is not null then
    return new;
  end if;

  select s.history_id, s.id
  into v_history_id, v_session_id
  from public.pierrot_sessions s
  where s.conversation_id = new.conversation_id
     or s.source_conversation_id = new.conversation_id
  order by s.ordinal desc
  limit 1;

  if v_history_id is null then
    return new;
  end if;

  update public.pierrot_histories
  set next_message_sequence = next_message_sequence + 1,
      updated_at = now()
  where id = v_history_id
  returning next_message_sequence into v_sequence;

  new.history_id := v_history_id;
  new.session_id := v_session_id;
  new.history_sequence := coalesce(new.history_sequence, v_sequence);

  update public.pierrot_sessions
  set message_count = message_count + 1,
      first_message_sequence = coalesce(first_message_sequence, new.history_sequence),
      last_message_sequence = new.history_sequence,
      last_message_at = coalesce(new.created_at, now()),
      title = case
        when new.role = 'user'
             and (title is null or title = '' or title = 'Новая сессия')
          then left(new.content, 120)
        else title
      end,
      updated_at = now()
  where id = v_session_id;

  return new;
end;
$$;

drop trigger if exists pierrot_messages_fill_scope on public.pierrot_messages;
create trigger pierrot_messages_fill_scope
  before insert on public.pierrot_messages
  for each row execute function public.pierrot_fill_message_scope();

-- ---------------------------------------------------------------------------
-- 8. Retention must never destroy permanent history
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_pierrot_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Permanent owner histories and every conversation used as session
  -- provenance are excluded. Visitor conversations keep their old retention.
  delete from public.pierrot_conversations c
  where c.expires_at < now()
    and c.identity_type <> 'owner'
    and not exists (
      select 1 from public.pierrot_histories h
      where h.canonical_conversation_id = c.id
    )
    and not exists (
      select 1 from public.pierrot_sessions s
      where s.conversation_id = c.id or s.source_conversation_id = c.id
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Migration run audit
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_history_migration_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned', 'dry_run', 'applied', 'failed', 'rolled_back')),
  report jsonb not null default '{}'::jsonb
    check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pierrot_history_migration_runs_created_idx
  on public.pierrot_history_migration_runs (created_at desc);

alter table public.pierrot_history_migration_runs enable row level security;
revoke all on table public.pierrot_history_migration_runs
  from public, anon, authenticated;
grant all on table public.pierrot_history_migration_runs to service_role;

-- ---------------------------------------------------------------------------
-- 10. RLS and grants
-- ---------------------------------------------------------------------------

alter table public.pierrot_histories enable row level security;
alter table public.pierrot_sessions enable row level security;

revoke all on table public.pierrot_histories from public, anon, authenticated;
revoke all on table public.pierrot_sessions from public, anon, authenticated;

grant all on table public.pierrot_histories to service_role;
grant all on table public.pierrot_sessions to service_role;

revoke all on function public.pierrot_ensure_main_history(uuid)
  from public, anon, authenticated;
revoke all on function public.pierrot_ensure_project_history(uuid)
  from public, anon, authenticated;
revoke all on function public.pierrot_create_session(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.pierrot_link_conversation_messages(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.pierrot_append_message_v2(text, text, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.pierrot_ensure_main_history(uuid) to service_role;
grant execute on function public.pierrot_ensure_project_history(uuid) to service_role;
grant execute on function public.pierrot_create_session(uuid, text, text) to service_role;
grant execute on function public.pierrot_link_conversation_messages(uuid, uuid, text) to service_role;
grant execute on function public.pierrot_append_message_v2(text, text, text, text, text, text, uuid, uuid)
  to service_role;

comment on function public.pierrot_ensure_main_history(uuid) is
  'Idempotently returns the owner MAIN history, creating its canonical conversation once.';
comment on function public.pierrot_create_session(uuid, text, text) is
  'Creates/returns a session inside an existing history. Never creates a history.';
comment on function public.pierrot_append_message_v2(text, text, text, text, text, text, uuid, uuid) is
  'Idempotent append with history/session provenance and a stable per-history cursor.';
