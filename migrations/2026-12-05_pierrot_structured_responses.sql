-- Pierrot structured responses: persist the validated visual composition next
-- to the Markdown transcript.
--
-- Safety: additive only. The Markdown `content` column remains authoritative
-- and every existing row keeps rendering as Markdown. The new column is
-- optional; if it is absent, the application falls back to Markdown.

alter table public.pierrot_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pierrot_messages'::regclass
      and conname = 'pierrot_messages_metadata_object_check'
  ) then
    alter table public.pierrot_messages
      add constraint pierrot_messages_metadata_object_check
      check (jsonb_typeof(metadata) = 'object');
  end if;
end
$$;

comment on column public.pierrot_messages.metadata is
  'Optional structured payload (validated PierrotResponse, provenance). Markdown content remains the fallback and primary transcript.';

-- Event-indexed provenance for a response can be queried without scanning
-- large JSON payloads. Partial index keeps it cheap.
create index if not exists pierrot_messages_metadata_response_idx
  on public.pierrot_messages ((metadata ? 'response'))
  where metadata ? 'response';
