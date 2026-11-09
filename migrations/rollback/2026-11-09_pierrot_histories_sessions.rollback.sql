-- Rollback for 2026-11-09_pierrot_histories_sessions.sql
--
-- This removes only the additive history/session layer. It never deletes a
-- legacy conversation, message, event, project or memory row.
--
-- Before running, export the new tables if you may need the provenance again:
--   copy public.pierrot_histories to '/tmp/pierrot_histories.csv' csv header;
--   copy public.pierrot_sessions to '/tmp/pierrot_sessions.csv' csv header;

drop trigger if exists pierrot_events_fill_scope on public.pierrot_events;
drop trigger if exists pierrot_messages_fill_scope on public.pierrot_messages;

drop function if exists public.pierrot_fill_event_scope();
drop function if exists public.pierrot_fill_message_scope();

drop function if exists public.pierrot_append_message_v2(text, text, text, text, text, text, uuid, uuid);
drop function if exists public.pierrot_link_conversation_messages(uuid, uuid, text);
drop function if exists public.pierrot_create_session(uuid, text, text);
drop function if exists public.pierrot_ensure_project_history(uuid);
drop function if exists public.pierrot_ensure_main_history(uuid);

-- Restore the legacy retention function (without history-awareness).
create or replace function public.purge_expired_pierrot_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.pierrot_conversations
  where expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

drop index if exists public.pierrot_events_session_idx;
drop index if exists public.pierrot_events_history_idx;
alter table public.pierrot_events drop column if exists session_id;
alter table public.pierrot_events drop column if exists history_id;

drop index if exists public.pierrot_messages_history_session_idx;
drop index if exists public.pierrot_messages_history_idx;
drop index if exists public.pierrot_messages_history_sequence_uidx;
alter table public.pierrot_messages drop column if exists history_sequence;
alter table public.pierrot_messages drop column if exists session_id;
alter table public.pierrot_messages drop column if exists history_id;

drop table if exists public.pierrot_history_migration_runs;
drop table if exists public.pierrot_sessions;
drop table if exists public.pierrot_histories;

-- The canonical MAIN conversation rows remain (they are ordinary conversation
-- rows and may contain messages written after the switch). Delete them only
-- manually after exporting, never as part of an automatic rollback.
