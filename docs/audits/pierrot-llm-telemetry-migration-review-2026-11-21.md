# Review: `2026-11-18_pierrot_llm_call_telemetry.sql`

Date: 2026-11-21  
Status: **reviewed, not applied**. No production schema change was made by this
task. Application requires a separate owner decision.

## What the migration creates

`public.pierrot_llm_calls` is an append-only, per-provider-attempt ledger:

- one row per HTTP attempt, including failed attempts and fallbacks;
- `attempt`, `is_retry` and `fallback_from` make retry and fallback visible
  separately;
- `input_tokens` / `output_tokens` / `total_tokens` are nullable together with
  `usage_source`; NULL means the provider did not report usage, not zero;
- `estimated_cost_usd` is nullable with `cost_source` and a versioned
  `pricing_version` / `pricing_source`;
- `provider_reported_cost_usd` stores only a cost returned by the provider
  (for example OpenRouter);
- no prompt, answer, history, RAG passage, vector or credential column exists;
- free-text columns are bounded by `CHECK` constraints.

## RLS and grants review

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is present.
- No `CREATE POLICY` is intentional: with RLS enabled and no policy, `anon` and
  `authenticated` cannot read or write rows.
- `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated` removes inherited
  table privileges.
- `GRANT ALL ON TABLE ... TO service_role` lets the server-side admin report and
  the telemetry writer use the service client. `service_role` bypasses RLS by
  design in Supabase, so the grant is the real access boundary.
- The admin page `/admin/pierrot/ai-costs` calls `requireAdmin()` and reads
  through the service client. There is no public API that exposes the table.
- Telemetry inserts never store request text. Provider adapters only pass
  counts, token usage, provider/model identifiers, latency and stable error
  codes.

Residual risk: any server code with the service-role key can read the table.
This is the same trust boundary as every other Pierrot table and must not be
exposed to a client bundle.

## Idempotency and partial-state risk

The migration is safe to re-run when the table is absent:

- `CREATE TABLE IF NOT EXISTS`;
- `CREATE INDEX IF NOT EXISTS`;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `REVOKE` and `GRANT` are
  idempotent.

It is **not** a forward-only column migration. If an older copy of the table
already exists, `CREATE TABLE IF NOT EXISTS` will not add missing columns or
replace old `CHECK` constraints. Before applying, run the preflight below. If a
partial table exists, stop and write a separate additive `ALTER TABLE` review
instead of editing production by hand.

## Preflight (read-only)

```sql
select to_regclass('public.pierrot_llm_calls') as table_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by ordinal_position;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls';
```

Expected before first application: `table_name` is `null` and both result sets
are empty.

## Safe application path (owner action only)

1. Take the normal Supabase project backup/snapshot.
2. Open a SQL session as the project owner (Supabase SQL editor or `psql` with
   a database URL kept outside the repository).
3. Run the preflight above.
4. Apply inside a transaction so a failure does not leave a half-created
   object:

```sql
begin;
\i migrations/2026-11-18_pierrot_llm_call_telemetry.sql
commit;
```

In the Supabase SQL editor, paste the file contents between `begin;` and
`commit;` instead of using `\i`.

5. Run the post-apply verification below.
6. Visit `/admin/pierrot/ai-costs` as an admin and confirm the page shows
   `available: true` behaviour (no amber “Telemetry is not available” banner).

Do **not** add this file to an automatic deployment hook, Prisma migration run
or Vercel build step. The repository does not apply it automatically.

## Post-apply verification (read-only)

```sql
-- Table exists, RLS is on, service_role is the only grantee.
select relrowsecurity from pg_class where oid = 'public.pierrot_llm_calls'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by grantee, privilege_type;

-- Empty immediately after apply.
select count(*) from public.pierrot_llm_calls;
```

After one real or synthetic non-production attempt, verify that NULL is
preserved:

```sql
select provider, model, attempt, is_retry, fallback_from, ok,
       input_tokens, output_tokens, total_tokens, usage_source,
       estimated_cost_usd, cost_source, latency_ms
from public.pierrot_llm_calls
order by occurred_at desc
limit 20;
```

A provider that did not return usage must show NULL tokens and
`usage_source = 'unknown'`. A model without a verified tariff must show
`estimated_cost_usd IS NULL` and `cost_source = 'unknown'`.

## Rollback

`migrations/rollback/2026-11-18_pierrot_llm_call_telemetry.rollback.sql` drops
the table. That also deletes every telemetry row. Export the rows first if they
are needed for an invoice reconciliation.

## Acceptance evidence for this task

- The migration was reviewed line by line and is reported here.
- No SQL was executed against production.
- The application already fails closed when the table is absent: inserts log a
  redacted warning, the answer path continues, and the admin page shows
  `telemetry_migration_not_applied` instead of fabricated zeros.
