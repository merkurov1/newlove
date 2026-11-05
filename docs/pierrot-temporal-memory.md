# Pierrot Temporal Memory, Brain Status, Skill Foundry and Decision Observatory

**Date:** 2026-11-19  
**Status:** implemented in the repository; database migrations are **prepared but not applied**.

This document describes the production behaviour, the commands, the status model,
the cache, the manual migration order and the known limitations.

---

## 1. What the repository actually had

Audit findings before this work:

- `public.pierrot_decisions` already stored owner decisions with
  `kind`, `title`, `content`, `rationale`, `status`, `project`, `tags`,
  `source_refs`, `conversation_id`, `message_id`, `review_at`, `decided_at`,
  `created_at`, `updated_at` and `superseded_by`.
- `migrations/2026-11-17_pierrot_memory_records.sql` existed but had **not**
  been applied. It only expanded the kind/status checks and added two indexes.
- The memory UI and API existed, but search was `ILIKE` only. There were no
  memory embeddings, no archive view, no contradiction handling beyond refusing
  “вместо”, and no automatic maintenance.
- Brain retrieval already used `BAAI/bge-m3`, 1024-dimensional vectors,
  pgvector, and the `brain_search_hybrid` RPC. That infrastructure was reused;
  memory embeddings live in a **separate** table and never mix with
  `knowledge_chunks`.
- The owner workspace start page had metrics and a memory trigger, but no Brain
  status block and no cached status snapshot.
- There was no Skill Foundry module and no Decision Observatory page.

The application cannot query the production database from this repository
session. The statements above are based on the code and migrations present in
the repository, not on a live schema dump.

---

## 2. Temporal Memory model

`pierrot_decisions` remains the single source of truth. No duplicate memory
table was added.

### Kinds

The existing decision kinds are fully supported:

`decision`, `position`, `preference`, `constraint`, `task`,
`rejected_recommendation`

plus the owner-memory kinds:

`memory`, `saved`, `reminder`

### Statuses

`current`, `completed`, `archived`, `superseded`, `rejected`, `uncertain`

### Fields

The existing columns are kept. The additive migration adds:

- `importance` (0..1)
- `confidence` (0..1)
- `valid_from`
- `valid_until`
- `last_referenced_at`
- `archived_reason`

`superseded_by` links a replaced record to its replacement. `review_at` remains
the reminder due date. Old rows receive safe defaults; nothing is rewritten.

### Lifecycle rules

- Completed tasks and reminders become `completed`; they stay in history.
- “Забудь” archives. It never deletes.
- “Удали навсегда” is the only physical delete. It removes the record and its
  memory embedding.
- A replacement creates a new record and marks the old one `superseded` with
  `superseded_by`. The old body is never overwritten.
- An apparent contradiction creates the new record as `uncertain` and leaves
  the old one untouched.
- Long-term preferences/principles are never archived merely because of age.
- Temporary `saved` notes become cleanup candidates after 30 days (90 days for
  high-importance notes). Only low-importance, non-draft notes are archived
  automatically.

---

## 3. Commands

Natural-language commands are detected deterministically by
`lib/pierrot/memory/intent.ts`; model context is used only where the command is
genuinely ambiguous.

| Meaning               | Russian                       | English                     |
| --------------------- | ----------------------------- | --------------------------- |
| create durable memory | «Запомни…»                    | “Remember…”                 |
| temporary note        | «Сохрани…»                    | “Save…”                     |
| reminder              | «Напомни…»                    | “Remind me…”                |
| list                  | «Что у нас в памяти?»         | “Show my memory”            |
| search                | «Найди в памяти…»             | “Search my memory…”         |
| decision history      | «Что мы решали по поводу…»    | “What did we decide about…” |
| current state         | «Что сейчас актуально по…»    | “What is current about…”    |
| complete              | «Заверши…», «Это уже сделано» | “Complete…”, “This is done” |
| archive               | «Архивируй…»                  | “Archive…”                  |
| forget (archive)      | «Забудь про…»                 | “Forget…”                   |
| cleanup preview       | «Покажи, что можно почистить» | “What can I clean up?”      |
| safe cleanup          | «Почисти память»              | “Clean up memory”           |
| restore               | «Верни в память…»             | “Restore…”                  |
| permanent delete      | «Удали навсегда…»             | “Delete permanently…”       |

Ambiguity rule: when a destructive or replacement command matches zero records
or several records, nothing is changed and Pierrot asks which record was meant.
A successful confirmation is only produced after the database operation
succeeded.

“Забудь” and “почисти память” never physically delete anything.

---

## 4. Hybrid semantic search

### Embeddings

- Model: existing `BAAI/bge-m3` (OpenRouter), 1024 dimensions.
- Table: `public.pierrot_memory_embeddings` (one row per decision).
- Written on create/update of title or content. Only that record is re-embedded.
- Deleted when the record is physically deleted (also `ON DELETE CASCADE`).
- If the provider is unavailable, the record is still saved and gets
  `status = pending`; lexical search keeps working.

### Search

`searchMemory()`:

1. builds one query embedding (reused from the short-lived embedding cache if
   Brain retrieves the same query in the same request);
2. calls `pierrot_memory_search` (vector + lexical + filters);
3. falls back to bounded lexical ranking when the RPC or provider is absent;
4. deduplicates records;
5. searches active memory by default;
6. consults the archive when history is requested, when the user asks for
   history, or when fewer than three relevant active records remain.

Filters: `kind`, `status`, `project`, `tags`, `importance`, `limit`.
Results include status, dates, project, `superseded_by` and whether the archive
was searched.

### Indexing old records

`POST /api/pierrot/memory/index` processes at most 20 records per call, stops
after three consecutive provider failures, and does not schedule itself again.
`GET /api/pierrot/memory/index` reports ready/pending/failed counts.

---

## 5. Chat context

`buildMemoryContext()` now has two levels:

- **Permanent Core** — up to 8 high-importance preferences, constraints,
  positions, decisions and durable facts;
- **Dynamic Retrieval** — up to 8 records relevant to the current query, plus
  open tasks.

The archive is not mixed into every prompt. The block states whether semantic
or lexical retrieval was used and whether the archive was consulted. The total
is capped at 6,000 characters.

Owner memory is loaded only for a server-verified owner. Public/visitor
conversations never call this function. If memory is unavailable, the main chat
continues and the model is told that memory was not checked.

---

## 6. Memory Steward

`lib/pierrot/memory/steward.ts` is deterministic and on-demand. It does not run
in a job, loop, cron or heartbeat.

It detects:

- obvious duplicate pairs (same kind, near-identical wording);
- expired temporary notes and long-overdue reminders;
- tasks whose own text says they are completed;
- possible contradictions (opposite negation or different explicit numbers);
- `superseded` records without a replacement link.

Safe action: archive clearly expired, low-importance temporary notes. Ambiguous
cases are returned as candidates and require the owner’s decision. Nothing is
deleted.

Write-time maintenance is limited to duplicate detection, replacement linking,
contradiction marking and a bounded archive of at most five expired notes.

---

## 7. Brain Status

Endpoint: `GET /api/pierrot/brain-status` (cached) and `POST` (on-demand check).
Owner-only.

### States

- **Stable** — storage and retrieval available; no pending index, conflicts or
  stale temporary records.
- **Attention** — indexed but there are conflicts, stale temporary notes,
  overdue tasks or failed embeddings.
- **Updating** — records are saved but waiting for embeddings.
- **Degraded** — storage or retrieval is unavailable, or the index schema is
  missing.

The phrase is generated deterministically from counts. No LLM call and no
artificial quality percentage.

### Cache

- Durable snapshot: `public.pierrot_brain_status_snapshots`, one row per owner.
- TTL: 10 minutes.
- Process-local last-known snapshot as a fallback when the database is briefly
  unavailable.
- Invalidated after create/update/archive/delete/restore and after indexing.
- Opening a new chat reads the snapshot; it does not traverse the whole memory
  or generate embeddings.
- If a refresh cannot read storage, the last known snapshot is returned with
  `state = degraded`, `stale = true` and the old timestamp.

### Detail view

The start-screen block opens a compact detail panel with subsystem states,
active/archive counts, open tasks, conflicts, index counts, last check and three
actions: “Проверить сейчас”, “Показать кандидатов на очистку” and
“Проиндексировать”.

---

## 8. Skill Foundry

Skills are separate from memory and from Brain documents.

- `pierrot_skills` — registry and current status;
- `pierrot_skill_versions` — immutable versions;
- `pierrot_skill_runs` — deterministic control-test results.

A skill contains name, description, purpose, conditions, inputs, steps, tools,
constraints, expected result, tests, examples and a version.

Lifecycle:

1. draft;
2. deterministic structural test (required sections, bounded steps, no obvious
   permission bypass, dangerous tools must have an approval constraint);
3. approval only after a passing test;
4. active;
5. disable;
6. rollback selects a previously tested version; versions are never deleted.

A second path is deterministic detection: “Из памяти” in the Skill Foundry scans
for at least three similar memory records, prepares a draft with conditions,
steps, tests and an explicit list of unclear gaps, then waits for the owner. It
does not create or approve anything automatically.

Approved skills are offered to the owner chat through a bounded prompt block
when their text matches the request. No skill executes automatically, bypasses
owner authorization or gains new tool permissions.

UI: `/admin/pierrot/skills` (owner workspace).

---

## 9. Decision Observatory

UI: `/admin/decision-observatory`, next to Editorial Radar, in the existing
admin style.

- Manual run only; the page never starts an analysis on open.
- Reads `pierrot_decisions` and `pierrot_decision_events`.
- Stores each report in `pierrot_decision_observatory_runs`.
- Shows assumption, expected result, observed result, confirmations,
  discrepancies, confidence and conclusions.
- Explicitly separates “confirmed”, “supported”, “temporal only” and
  “insufficient”.
- States that temporal order is not proof of causality.
- Shows “insufficient data” when there are too few decisions or no events.

---

## 10. Migrations

Prepared only. **Not applied.**

Apply manually in this order:

1. `migrations/2026-11-17_pierrot_memory_records.sql`
   (kind/status expansion; may already be applied)
2. `migrations/2026-11-19_pierrot_temporal_memory.sql`
   (temporal fields, embeddings, hybrid RPC, status snapshot)
3. `migrations/2026-11-19_pierrot_skills.sql`
4. `migrations/2026-11-19_pierrot_decision_observatory.sql`

### Verification SQL

```sql
-- Columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pierrot_decisions'
  and column_name in (
    'importance', 'confidence', 'valid_from', 'valid_until',
    'last_referenced_at', 'archived_reason', 'superseded_by'
  );

-- Embedding index
select to_regclass('public.pierrot_memory_embeddings');

-- RPC
select proname
from pg_proc
where proname = 'pierrot_memory_search';

-- Status snapshot
select to_regclass('public.pierrot_brain_status_snapshots');

-- Skills
select to_regclass('public.pierrot_skills'),
       to_regclass('public.pierrot_skill_versions'),
       to_regclass('public.pierrot_skill_runs');

-- Observatory
select to_regclass('public.pierrot_decision_observatory_runs');
```

### Behaviour until the migration is applied

- Memory CRUD continues on the legacy columns.
- “Complete/archive” may return `memory_migration_required` instead of claiming
  success.
- Search uses lexical fallback and reports
  `reason: migration_not_applied`.
- Brain Status shows **Attention** or **Degraded** and says the semantic index
  is not ready.
- Skill and Observatory pages return a clear “unavailable” state instead of
  pretending the feature works.

---

## 11. Operations and diagnostics

- `GET /api/pierrot/memory?view=summary` — counts and pending index.
- `GET /api/pierrot/memory?view=index` — embedding index state.
- `GET /api/pierrot/memory?view=steward` — cleanup candidates.
- `POST /api/pierrot/memory/steward` — apply safe cleanup only.
- `POST /api/pierrot/memory/index` — bounded indexing.
- `GET /api/pierrot/brain-status` — cached status.
- `POST /api/pierrot/brain-status` — on-demand check.
- `GET /api/admin/decision-observatory` — latest report (does not run).
- `POST /api/admin/decision-observatory` — manual run.

Logs contain operation names and error codes only. Memory text, embeddings and
private prompts are never written to normal logs.

There are **no new cron entries, workers, polling loops, heartbeats or
background AI jobs**.

---

## 12. Costs and limits

New external calls:

- one embedding per memory create/update where title or content changed;
- one embedding per semantic memory search query (reused from the query cache
  when Brain embeds the same text in the same request);
- no embeddings for Brain Status;
- no LLM calls for Brain Status, steward, cleanup, skill tests or the
  observatory;
- manual index batches are capped at 20 records and stop after three failures.

No new paid service was added. The existing OpenRouter embedding provider and
Supabase/pgvector are reused.

---

## 13. Known limitations

- Migrations are not applied by this repository session. The semantic path,
  archive UI, skill UI and observatory become fully live only after the manual
  steps above.
- The original production schema could not be queried here; the migration is
  written to be additive and idempotent, but should be reviewed on staging.
- Duplicate/contradiction detection is lexical/trigram-based, not an LLM judge.
  Ambiguous cases are review candidates.
- The observatory can only use outcomes that were actually stored. It cannot
  infer external results that were never recorded.
- Telegram owners without a real `auth.users` UUID still cannot use owner memory
  because `pierrot_decisions.user_id` is an auth users foreign key.
- Reminders have no push delivery by design.
