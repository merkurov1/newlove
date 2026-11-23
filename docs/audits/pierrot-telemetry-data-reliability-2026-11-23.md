# Pierrot telemetry data reliability report

Date: 2026-11-23  
Task: `3acbb43f-f516-4a27-b935-856f21cf4bf8`  
Scope: `lib/ai/telemetryReport.ts`, `/admin/pierrot/ai-costs`, tests and a read-only
diagnosis of two `GET /rest/v1/pierrot_events` HTTP 500 responses on
2026-11-22 around 10:22:15 UTC.

No production schema change, no production write, no test row, no deploy and no
private message content were used. No Supabase/Vercel management API was called.

## 1. Signal A — message count silently became zero

The report read `pierrot_events` with:

```ts
.select('id', { count: 'exact', head: true })
.eq('event_name', 'assistant_replied')
.gte('created_at', filters.from)
.lte('created_at', filters.to)
```

The result was consumed as:

```ts
let messages = 0;
if (!messagesResult.error && typeof messagesResult.count === 'number') {
  messages = messagesResult.count;
}
```

Consequences:

- a missing count, a `null` count and any query error all became `0`;
- the UI therefore showed a real-looking zero message volume;
- `limitations` did not mention the failed source;
- `available: true` still described the report as healthy;
- the same code path could not distinguish “no messages in this period” from
  “the message source failed”.

This is a silent data-quality failure, not a styling issue.

## 2. Signal B — two `pierrot_events` HTTP 500 responses

Observed signal supplied by the owner: two `GET /rest/v1/pierrot_events`
responses with HTTP 500 on 2026-11-22 around 10:22:15 UTC.

### Repository evidence

- PR #69 (`47273612`, merged 2026-11-22T09:59:14Z) brought the telemetry report
  that introduced the report consumer (`/admin/pierrot/ai-costs`).
- The first observed 500 is about 23 minutes after that merge.
- The report runs the `pierrot_events` count once per page render, plus a
  separate `pierrot_llm_calls` read.
- The report count is a `HEAD` request in `@supabase/postgrest-js` 2.119
  (`head: true` → `method = 'HEAD'`). The supplied log says `GET`. Therefore
  one of two things is true:
  1. the log viewer/gateway recorded `HEAD` as `GET`, and the report count is
     the failing request; or
  2. the method is literal, and the failing GET came from another
     `pierrot_events` reader such as the dashboard/observatory/website dataset
     page, while the report count bug is an independent but concurrent defect.

The repository and sandbox do not contain API gateway logs, Postgres logs,
request identifiers, query strings or an `EXPLAIN` plan, so this report does not
invent a unique root cause. The available evidence is enough to fix the
reporting contract and to define the exact read-only checks that would close
the log correlation.

### Candidate GET readers and plan risk

The repository has no index on `pierrot_events (created_at)` alone. Existing
indexes are:

- `pierrot_events_conversation_idx (conversation_id, created_at)`
- `pierrot_events_name_idx (event_name, created_at DESC)`
- `pierrot_events_history_idx (history_id, created_at DESC)`
- `pierrot_events_session_idx (session_id, created_at DESC)`

The telemetry count filters by `event_name` **and** `created_at`, so
`pierrot_events_name_idx` is the expected access path. The dashboard and
observatory readers instead filter by a `created_at` range and order by
`created_at`; without a leading `created_at` index, PostgreSQL can require a
sequential scan plus sort. On a growing event table this can produce a
statement timeout (`57014`), which PostgREST surfaces as HTTP 500. That is a
plausible cause for literal GET failures, not a confirmed one.

Other possible 500 classes that only logs can separate: statement timeout,
PostgREST schema-cache error, transient database/network failure. The code fix
below is correct for all of them because the report no longer converts any of
them into `0`.

## 3. Report contract after the fix

`lib/ai/telemetryReport.ts` now exposes:

- `totals.messages: number | null`;
- `messagesAvailable: boolean`;
- `messagesError: string | null`;
- `completeness: 'complete' | 'partial' | 'unavailable'`.

Rules:

| Source state                          | `totals.messages` | `messagesAvailable` | `completeness` |
| ------------------------------------- | ----------------- | ------------------- | -------------- |
| real count `0`                        | `0`               | `true`              | `complete`     |
| real count `> 0`                      | count             | `true`              | `complete`     |
| count error / thrown query            | `null`            | `false`             | `partial`      |
| count missing (`null` without error)  | `null`            | `false`             | `partial`      |
| call telemetry error or missing table | preserved         | as computed         | `unavailable`  |

When the message source fails:

- the failing `pierrot_events` source is appended to `limitations`;
- the limitation explicitly says the total is unknown, not zero;
- the report stays usable for call rows but is marked `partial`;
- the UI renders `Messages = unknown`, not `0`.

The analogous `pierrot_llm_calls` read no longer throws out of the page for a
non-migration error. It returns `available: false`,
`unavailableReason: 'telemetry_read_failed'` and a limitation with the source
error. A missing telemetry table still returns
`telemetry_migration_not_applied`.

No model routing, generation, prompt, provider fallback or database schema was
changed.

## 4. Production log correlation still required (read-only)

These checks were **not executed**: the sandbox has no production credentials
and the execution contract forbids management APIs. Run them read-only from the
owner console if the incident must be closed at database level.

1. API gateway logs, window `2026-11-22T10:22:10Z`–`2026-11-22T10:22:20Z`,
   path `/rest/v1/pierrot_events`, status `500`:
   - record method (`GET` or `HEAD`), full query string, select list, filters,
     `x-request-id`/request id, role and user agent;
   - compare the two request query strings. Identical filters mean a repeated
     page render or prefetch; different `offset` values mean pagination.
2. Postgres logs for the same window:
   - error code, statement text and duration;
   - `57014` means timeout; `42P01`/`PGRST205` means missing table/schema cache;
     other codes follow their own path.
3. Confirm production indexes:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'pierrot_events'
order by indexname;
```

4. Read-only plan for the count shape (replace timestamps with the log values):

```sql
explain (analyze, buffers, format json)
select count(*)
from public.pierrot_events
where event_name = 'assistant_replied'
  and created_at >= timestamptz '2026-11-22T10:15:15Z'
  and created_at <= timestamptz '2026-11-22T10:22:15Z';
```

5. Read-only plan for a literal GET range reader if its filters match the log:

```sql
explain (analyze, buffers, format json)
select conversation_id, event_name, event_key, payload, created_at
from public.pierrot_events
where created_at >= timestamptz '2026-11-15T00:00:00Z'
  and created_at <= timestamptz '2026-11-22T00:00:00Z'
order by created_at asc
limit 1000 offset 0;
```

If the plan shows a sequential scan plus sort and the duration approaches the
role statement timeout, the minimal additive follow-up is an index on
`pierrot_events (created_at)` (or the exact ordering variant confirmed by the
plan), created concurrently outside a transaction and applied only after owner
approval. No migration was added in this task because the logs do not yet prove
that index is the incident cause.

## 5. Test coverage added

`lib/ai/__tests__/telemetryReport.test.ts`:

- real `count = 0` stays `0`;
- positive count stays the count;
- count query error → `messages = null`, `messagesAvailable = false`,
  `messagesError`, `completeness = 'partial'`, source limitation present;
- `count = null` without error → unknown, not zero;
- thrown count query → unknown, not zero;
- partial report keeps call rows and totals;
- calls query error → `available = false` instead of thrown page failure;
- missing telemetry migration remains explicit.

`app/admin/pierrot/(workspace)/ai-costs/__tests__/page.test.tsx`:

- real zero renders as `0`;
- unavailable source renders `unknown`, shows the partial-report notice and
  never renders the message total as `0`.

## 6. Impact

Before the fix, a `pierrot_events` count failure could tell the owner “0
messages” while provider attempts existed. That corrupts the messages-to-calls
comparison and any cost-per-message reasoning. After the fix the dashboard says
`unknown` and `partial`, so the owner can tell “no messages” from “no data”.
