# Pierrot Owner Memory & Editorial Presentation

**Date:** 4 November 2026  
**Repository:** `merkurov1/newlove`  
**Scope:** main Owner Workspace PWA chat only. Dev Mode, public Pierrot, Telegram, PWA shell and streaming transport were not redesigned.

---

## 1. What was found

- `public.pierrot_decisions` already exists and has the right core fields:
  `kind`, `title`, `content`, `rationale`, `status`, `project`, `tags`,
  `source_refs`, `conversation_id`, `message_id`, `review_at`, `created_at`,
  `updated_at`.
- The table already has RLS enabled and **no public policies**, so service-role
  access is the intended boundary.
- Its existing checks allowed only:
  - kinds: `decision`, `position`, `preference`, `constraint`, `task`,
    `rejected_recommendation`;
  - statuses: `current`, `superseded`, `rejected`, `uncertain`.
- Therefore the table was suitable for memory, but needed a minimal constraint
  expansion for `memory`, `saved`, `reminder`, `completed` and `archived`.
- There was no existing application memory service or owner-memory API.
- Owner chat already had server-verified owner identity, SSE streaming,
  `WorkspaceMarkdown`, citations and a compact workspace shell.

---

## 2. Memory model

The existing `pierrot_decisions` table is reused. No duplicate table was added.

| kind       | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| `memory`   | durable preference, fact, principle or agreement        |
| `saved`    | temporary idea, note, link or fragment                  |
| `reminder` | deferred task/thought; optional due date in `review_at` |

Status values now include:

- `current`
- `completed`
- `archived`
- `superseded`
- legacy: `rejected`, `uncertain`

Each record stores:

- owner `user_id` (auth.users FK);
- optional `conversation_id` and `message_id`;
- original command in `rationale`;
- source metadata in `source_refs`;
- optional reminder date in `review_at`;
- timestamps.

The chat also writes a `pierrot_decision_events` row for created/updated/status
changes when available. Events never contain the full private transcript.

---

## 3. Migration

Prepared, **not applied**:

`migrations/2026-11-17_pierrot_memory_records.sql`

It:

- expands `pierrot_decisions_kind_check` with `memory`, `saved`, `reminder`;
- expands `pierrot_decisions_status_check` with `completed`, `archived`;
- adds lookup indexes for active kinds and reminder dates;
- leaves RLS enabled with no public policies;
- does not rewrite or delete existing rows.

Manual order:

1. Review on staging.
2. Apply the migration in Supabase.
3. Verify the two check constraints and indexes.
4. Run a service-role insert/read/update/delete smoke test.
5. Only then treat owner memory as production-ready.

Rollback: restore the previous kind/status constraints and drop the two new
indexes. No data rewrite is required.

---

## 4. Backend

### Modules

- `lib/pierrot/memory/types.ts` — client-safe record/kinds/status contract.
- `lib/pierrot/memory/intent.ts` — deterministic three-command and natural-language detector.
- `lib/pierrot/memory/store.ts` — service-role CRUD, summary, search and prompt context.
- `lib/pierrot/memory/auth.ts` — verified owner auth with a real auth.users UUID.

### API

- `GET /api/pierrot/memory?view=summary`
- `GET /api/pierrot/memory?status=active&kind=memory|saved|reminder&q=...`
- `POST /api/pierrot/memory`
- `PATCH /api/pierrot/memory/[id]`
- `DELETE /api/pierrot/memory/[id]`

All endpoints require a verified owner. Public/visitor requests receive `403`.
No client-supplied role, user id or owner flag is trusted. Personal memory is
never loaded in public mode and is never exposed through public endpoints.

### Commands

- `Запомни` / `remember` → durable `memory`.
- `Сохрани` / `save` → temporary `saved`.
- `Напомни` / `remind` → `reminder`.
- Natural variants are supported, including:
  - «Пусть это останется в памяти»
  - «Сохрани пока»
  - «К этому надо вернуться»
  - «Что я просил сохранить?»
  - «Что у нас сохранено?»
  - «Что у нас в памяти?»
  - «Покажи напоминания»
  - «Что осталось незавершённым?»
  - «Что ты обо мне помнишь?»

Ambiguous commands such as «Запиши это» ask one clarification instead of
guessing. Explicit replacement language («вместо», «больше не») is not applied
silently; Pierrot asks which record should be replaced.

### Confirmation rule

Pierrot says «Запомнил / Сохранил / Напомню» only after a successful Supabase
insert. A failed write returns an honest error and no success confirmation.

### Consent

Memory writes are independent of transcript-storage consent. An explicit
command is its own permission for that one record. If transcript consent is
denied, the memory record can still be written; the chat transcript is not.

### Chat context

At owner-chat time the server loads a bounded compact context:

- up to 12 durable memories;
- up to 8 saved notes;
- up to 8 reminders.

It is injected only in personal mode. Public mode never receives it. The model
is told not to invent records and not to claim a write that the server did not
confirm.

### Reminders

`review_at` stores an optional due date. Supported deterministic forms include
`завтра`, `послезавтра`, `через N дней/недель/месяцев`, `10 ноября`,
`2026-12-01`, `10.12.2026`, weekdays, and English `tomorrow` / `next week`.
No calendar event, cron, worker, scheduler, push notification or background
process is created.

---

## 5. Owner chat UI

- A compact `Память · N` trigger appears in the chat header.
- A new-dialog line shows:
  `Память · 12 | Сохранено · 4 | Напоминания · 3`.
- The Memory panel has tabs: Все / Запомнено / Сохранено / Напомнить.
- Each record shows kind, status, title, date/project and content.
- Actions:
  - edit wording;
  - complete a reminder;
  - archive a saved note;
  - delete after confirmation.
- Message actions now include:
  - Запомнить;
  - Сохранить;
  - Напомнить.

They operate on the selected assistant message, so the owner does not repeat
the text in chat. No separate dashboard was added.

---

## 6. Editorial Markdown

### Rendering

`WorkspaceMarkdown` keeps the existing safe renderer, raw-HTML disabling and
citation badges. New behavior:

- an optional `editorial` mode wraps tables in a scrollable container;
- Dev Mode keeps the old rendering;
- during streaming, an unfinished fenced code block is provisionally closed so
  it cannot swallow the rest of the answer;
- the final `completed` SSE payload remains authoritative.

### CSS

New isolated stylesheet:

`app/admin/pierrot/(workspace)/editorial.css`

It defines:

- H1–H4 hierarchy;
- comfortable body size and line length;
- lead paragraph treatment;
- disciplined lists and nested lists;
- editorial blockquotes;
- responsive tables with horizontal scroll;
- inline code and scrollable code blocks;
- links, emphasis and separators;
- desktop, iPad and mobile size adjustments.

The existing paper palette, serif typography, mono service labels and
citation/source inspector behavior are preserved.

### Owner prompt

`PIERROT_PROMPT_OWNER` now distinguishes concision from editorial structure:

- simple question → short answer, no headings/lists/tables;
- analytical answer → answer first, then 2–4 real H2 sections;
- comparison → table only when useful;
- sequence → numbered list;
- code → fenced blocks;
- no decorative emoji, repeated question or artificial structure;
- no preamble such as «Вот…» or «Конечно…».

---

## 7. Tests

Relevant command:

```bash
npx jest lib/pierrot/memory lib/pierrot/workspace \
  app/api/pierrot/memory app/api/pierrot-web lib/pierrot \
  --runInBand --forceExit
```

Result:

- **60 suites passed**
- **527 tests passed**
- **0 failed**

Coverage:

- three memory categories;
- natural-language variants;
- ambiguous command clarification;
- explicit conflict clarification;
- create/read/search/edit/archive/complete/delete;
- owner isolation and public visitor rejection;
- explicit memory with transcript consent denied;
- memory prompt injection;
- unavailable/failed write does not claim success;
- reminder date parsing;
- streaming Markdown fence stabilization;
- Markdown headings, nested lists, tables, quotes, code and raw-HTML rejection.

Typecheck:

```bash
npx tsc --noEmit
```

- passes cleanly.

Lint:

```bash
npm run lint
```

- repository-wide lint still fails on existing debt in unrelated files;
- no errors are reported for the changed memory, chat, Markdown or API files.

Build:

- not run in this session; per operator instruction the commit was made without
  waiting for the long production build.

---

## 8. Manual production steps

1. Apply `migrations/2026-11-17_pierrot_memory_records.sql` manually.
2. Confirm RLS still has no public policies on `pierrot_decisions`.
3. Verify the memory panel and commands with a real owner Supabase session.
4. Check the memory write/read event in `pierrot_decision_events`.
5. Check the editorial rendering on desktop, iPad and narrow mobile.
6. Verify streaming Markdown with a long answer containing a table, code block
   and citation.

---

## 9. Known limitations

- Memory search is deterministic SQL text search (`ILIKE`), not semantic search.
- The Memory panel lists active records; completed/archived records are updated
  in the store but are not yet shown in a separate archive view.
- A semantic contradiction between two memories is not auto-detected. Explicit
  replacement language asks for clarification; no silent overwrite occurs.
- Telegram webhook owners without a real `auth.users` UUID cannot use memory,
  because the table's `user_id` is an auth.users foreign key. The PWA owner
  session is the supported path.
- No background reminder delivery exists by design.
- No production migration was applied and no production-readiness claim is made
  until the manual steps above are completed.
