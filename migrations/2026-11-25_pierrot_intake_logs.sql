-- ============================================================================
-- Pierrot private Food & Beverage Tracker
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- One row = one consumed product. The original owner message is retained in
-- raw_text; source_message_id + item_index make retries idempotent. Timestamps
-- are stored in UTC. The owner's IANA timezone is stored alongside the row so
-- day boundaries can be reconstructed honestly.
--
-- This table is deliberately separate from Brain / RAG / media and is never
-- ingested into the public knowledge base.
-- ============================================================================

begin;

create table if not exists public.intake_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('food', 'drink')),
  item_name text not null check (char_length(item_name) between 1 and 120),
  quantity numeric(10, 2),
  unit text check (unit is null or char_length(unit) <= 40),
  raw_text text not null check (char_length(raw_text) between 1 and 4000),
  occurred_at timestamptz not null,
  timezone text,
  source_message_id text,
  -- Position of this product inside the source message. Together with the
  -- message id it prevents the same message from being recorded twice.
  item_index integer not null default 0 check (item_index between 0 and 50),
  confidence numeric(4, 3) not null default 0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  constraint intake_logs_quantity_check check (quantity is null or quantity >= 0)
);

create unique index if not exists intake_logs_source_item_uidx
  on public.intake_logs (user_id, source_message_id, item_index)
  where source_message_id is not null;

create index if not exists intake_logs_user_occurred_idx
  on public.intake_logs (user_id, occurred_at desc);

create index if not exists intake_logs_user_type_occurred_idx
  on public.intake_logs (user_id, type, occurred_at desc);

create index if not exists intake_logs_created_idx
  on public.intake_logs (created_at desc);

alter table public.intake_logs enable row level security;

-- No anonymous access. An authenticated owner can read and manage only their
-- own rows; the server uses the service role for the chat lifecycle.
revoke all on public.intake_logs from anon;
grant select, insert, update, delete on public.intake_logs to authenticated;

drop policy if exists intake_logs_owner_select on public.intake_logs;
create policy intake_logs_owner_select
  on public.intake_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists intake_logs_owner_insert on public.intake_logs;
create policy intake_logs_owner_insert
  on public.intake_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists intake_logs_owner_update on public.intake_logs;
create policy intake_logs_owner_update
  on public.intake_logs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists intake_logs_owner_delete on public.intake_logs;
create policy intake_logs_owner_delete
  on public.intake_logs
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.intake_logs is
  'Owner-only private food and drink intake log. Never part of public Brain/RAG. Timestamps are UTC; timezone stores the owner IANA zone used for day boundaries.';

commit;
