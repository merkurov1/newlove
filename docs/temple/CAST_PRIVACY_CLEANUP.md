# Cast privacy cleanup — gated plan (not executed)

Status: **plan only**. Nothing in this document has been run against production.
The owner must approve the cleanup separately before any `UPDATE`/`DELETE`.

Related code: `app/api/cast/route.ts`, `app/api/cast/capture/route.ts`,
`migrations/2026-11-27_cast_privacy_idempotency.sql`.

## 1. What the audit of 2026-11-26 established

- `casts` held 43 rows; all 43 contained `answers`.
- 34 of those rows were `status = 'anonymous'` and all of them still had answers.
- The current code stores no answers for anonymous protocols. Historical rows
  therefore disagree with the current privacy contract and must be treated as
  legacy over-retention.

No answers, email addresses, user ids or record ids are reproduced in this
repository, in logs or in reports.

## 2. Target retention rule

| Identity | Raw answers | Reading / archetype | Email |
| --- | --- | --- | --- |
| Anonymous | never stored (new rows) | stored privately | never |
| `telegram_pending` | only the minimum needed to finish the operation; no long-term archive | stored privately | never |
| Identified (Supabase owner) | only with `retention_consent = true` | stored privately, owner-readable | stored, never public |
| Identified without consent | not stored | stored privately | stored, never published |

`telegram_pending` rows should be reduced to the analysis result plus the
delivery state; they must not become a shadow archive of answers.

## 3. Inventory query (read-only, aggregate only)

Run this on a read replica / SQL console. It returns counts, never content.

```sql
-- Aggregate inventory: no row content, no identifiers.
select
  coalesce(status, 'null')                        as status,
  (answers is not null and array_length(answers, 1) > 0) as has_answers,
  count(*)                                        as rows,
  min(created_at)                                 as oldest,
  max(created_at)                                 as newest
from public.casts
group by 1, 2
order by 1, 2;
```

Expected shape after the audit:

- `anonymous` + `has_answers = true` → the legacy backlog to be redacted;
- `identified` + `has_answers = true` → keep only where
  `retention_consent = true`; older rows have no consent flag and must be
  treated as not consented.

### Row-level selection (still no content)

```sql
-- Produces the exact id list for the future cleanup. Export it to the private
-- backup location, never to the repository or a ticket.
select id, created_at, status
from public.casts
where (status is null or status = 'anonymous')
  and answers is not null
  and array_length(answers, 1) > 0
order by created_at;
```

## 4. Backup before any change

1. Take a provider-side snapshot of `public.casts` (Supabase dashboard →
   database backups) and record its timestamp.
2. Export the selected rows to the owner's private storage (not the repo, not
   the PR, not a public bucket).
3. Verify the export row count equals the inventory count.
4. Only then schedule the redaction window.

## 5. Dependencies to check before redaction

- `temple_log` references a cast only through public trace rows; it does not
  store answers. Verify no trigger copies `casts.answers` elsewhere
  (`knowledge_map` keeps only the primary key).
- Analytics/export jobs: grep for `casts` and `answers` before running. No
  scheduled job may read this column.
- Support tooling: confirm no admin screen renders `answers`.

## 6. Proposed redaction (NOT executed)

```sql
-- GATED. Requires written owner approval and a verified backup.
begin;

update public.casts
set answers = '{}',
    retention_consent = false,
    analysis_metadata = coalesce(analysis_metadata, '{}'::jsonb)
      - 'rawAnswers'
where id in (/* exact ids from step 3 */);

commit;
```

Rules for the operation:

- `UPDATE` only. No `DELETE` in the first pass.
- Batch by id list, not by `status` alone, so the blast radius is exact.
- Record before/after counts in the run log.
- Re-run the aggregate inventory afterwards; `anonymous + has_answers` must be 0.
- Keep the backup until the owner confirms the result.

## 7. What this PR already does

- New anonymous rows never store answers.
- Identified rows store answers only with explicit consent; capture never adds
  answers.
- Permissive RLS policies on `casts` are dropped by the additive migration.
- The retention rule and this plan are documented, not executed.
