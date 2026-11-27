# Temple / Vigil migration reconciliation — 2026-11-27

Read-only comparison of `migrations/*.sql` with the managed
`supabase_migrations.schema_migrations` history in production project
`txvkqcitalfbjytmnawq`.

## Method and constraint

The execution environment for this change has **no production database
credentials**. Secrets were not read and no management API was called. The
comparison below uses the live findings supplied with the task plus repository
inspection. The authoritative, repeatable check is:

```bash
DATABASE_URL=postgres://... node scripts/temple/reconcile-migrations.mjs
```

It is read-only and prints matched, source-only and production-only versions,
Temple/Vigil objects, policies, client grants and SECURITY DEFINER functions.
`sql/audit/temple_vigil_schema.sql` adds constraints, indexes, triggers and
Realtime membership.

## Classification

The repository has 117 SQL files under `migrations/` (115 at the time of the
live audit, plus the two new forward migrations in this change). Production
lists 16 managed versions. The naming schemes differ:

- repo: `YYYY-MM-DD_descriptive_name.sql`
- production: `YYYYMMDDHHMMSS_descriptive_name`

Most repo files are historical/manual scripts or one-off diagnostics, not
one-to-one managed versions. They must not be bulk-applied.

## Temple / Vigil files

| Repo file                                        | Production status                                                                   | Classification                                                      | Action                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-11-16_vigil_spark_cooldown.sql`            | Table `vigil_spark_claims` exists, but no matching managed version by this filename | Applied outside managed history (or recorded under another version) | Do **not** re-run blindly. `create table if not exists` makes it harmless, but history must be backfilled only after confirming the exact version row. |
| `2026-11-24_telegram_group_vigil.sql`            | `telegram_group_vigil_sessions` / `_participants` absent                            | Optional group-Vigil capability                                     | **Not applied.** Treat as unreleased until product confirms the feature. The code is present but the tables are intentionally missing in production.   |
| `2026-11-25_temple_chronicles_public_memory.sql` | Recorded as `20261125104045`                                                        | Managed, applied                                                    | No re-run. A new forward migration fixes the remaining stale policy and makes the signal idempotent.                                                   |
| `2026-11-26_vigil_lifetime_metrics.sql`          | No `vigil_spark_stats`, no `vigil_spark_metrics`                                    | Genuinely missing                                                   | Covered by `2026-11-27_vigil_spark_metrics_reconcile.sql` (idempotent). The historical file can remain as the source record.                           |
| `2026-11-27_temple_analytics.sql`                | Not present                                                                         | New forward migration                                               | Private analytics tables, RLS, no client grants.                                                                                                       |
| `2026-11-27_temple_privacy_hardening.sql`        | Not present                                                                         | New forward migration                                               | Stale policy removal, column grants, Realtime removal, cap removal, trigger idempotency and EXECUTE revocation.                                        |
| `2026-11-27_vigil_spark_metrics_reconcile.sql`   | Not present                                                                         | New forward migration                                               | Managed history for the missing Vigil lifetime metrics. Idempotent with `2026-11-26`.                                                                  |

## Known production drift

| Finding                                                                 | Evidence                                                                  | Resolution                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_select_on_temple_log` still exists                              | live audit of `pg_policies`                                               | `2026-11-27_temple_privacy_hardening.sql` drops it and every older public-read policy name.                                                                                                                             |
| `record_temple_chronicle_signal()` executable by `anon`/`authenticated` | Supabase advisor                                                          | Trigger function is redefined with `search_path = ''`; EXECUTE revoked from `public`, `anon`, `authenticated`; retained for `service_role` and trigger firing.                                                          |
| `temple_log` had public SELECT on raw rows                              | advisor / grants                                                          | RLS remains enabled and all client grants are revoked. The feed routes use the service role and project allowlisted columns.                                                                                            |
| `vigil_hearts` public SELECT exposes `owner_id` and `intention`         | advisor / grants                                                          | Public SELECT is column-level only: `id, owner_name, last_lit_at, is_locked, created_at, updated_at`. The raw row is removed from `supabase_realtime`; the public-safe `temple_chronicle_signals` is the realtime hint. |
| `vigil_hearts` five-heart product cap                                   | `check (id <= 5)` in the original manual SQL and `heartId > 5` in the API | Cap removed in the migration and the route. Per-identity 24h cooldown and per-IP limiter preserved.                                                                                                                     |
| `vigil_spark_claims` has 5 legacy rows                                  | live fact                                                                 | The 5 rows are data, not a cap. They are preserved.                                                                                                                                                                     |
| `telegram_group_vigil_*` absent                                         | live fact                                                                 | Deliberately not applied; no route consumer was enabled for this release.                                                                                                                                               |

## Application order (owner-run, after review)

```bash
# 1. Inspect first.
psql "$DATABASE_URL" -f sql/audit/temple_vigil_schema.sql
DATABASE_URL="$DATABASE_URL" node scripts/temple/reconcile-migrations.mjs

# 2. Apply only the reviewed forward files, in order.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-11-27_temple_privacy_hardening.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-11-27_temple_analytics.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-11-27_vigil_spark_metrics_reconcile.sql

# 3. Re-run the audits and the advisor checks.
```

Never reset the database, drop/recreate tables, rewrite history or delete
historical rows. Existing duplicate chronicle signals are preserved and
reported by the audit for a separate, reviewed decision.

## Remaining blocker

No production credentials were available, so none of the forward migrations
were applied and the 16 managed versions could not be enumerated from the live
project in this run. The owner must run the read-only script, review
source-only/production-only output, then apply the three forward files. Until
then the acceptance criterion “no unapplied Temple migration remains” is
`not_verified`.
