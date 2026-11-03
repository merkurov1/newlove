-- Rollback for 2026-11-03_art_engine_vault.sql
-- and 2026-11-03_art_engine_vault_rls.sql.
--
-- WARNING: dropping `vault` and `parse_logs.payload` destroys Art Engine
-- ingestion/research history. Export those columns before running this.

begin;

drop policy if exists "lots_admin_select" on public.lots;

create policy "Public Read Access"
  on public.lots
  for select
  to anon, authenticated
  using (true);

grant select on public.lots to anon;

drop index if exists public.parse_logs_url_created_idx;

alter table public.parse_logs
  drop column if exists payload;

alter table public.lots
  drop column if exists vault;

commit;
