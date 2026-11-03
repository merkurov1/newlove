-- ============================================================================
-- Art Engine — Stage 1 Vault storage
--
-- STATUS: PROPOSED. Apply manually. This file does not touch Selection and
-- does not create new tables.
--
-- Why:
--   1. `lots.ai_content` is the publishable dossier and has been overwritten
--      by the old upsert flow. Art Engine needs a private JSONB state for
--      ingestion attempts, identity proposals, research/evidence, editorial
--      drafts and publication history.
--   2. `parse_logs` already exists but is unused. It needs a payload column to
--      store the structured extraction, parser name/version, warnings, image
--      candidates and a bounded raw HTML excerpt for every attempt.
-- ============================================================================

begin;

alter table public.lots
  add column if not exists vault jsonb not null default '{}'::jsonb;

alter table public.parse_logs
  add column if not exists payload jsonb;

create index if not exists parse_logs_url_created_idx
  on public.parse_logs (url, created_at desc);

comment on column public.lots.vault is
  'Private Art Engine state: ingestion, identity, research, evidence, editorial versions, publication history. Never expose through public APIs.';

comment on column public.parse_logs.payload is
  'Structured append-only parser attempt: parser/version, result, warnings, errors, image candidates, lot_id, bounded raw HTML excerpt.';

commit;
