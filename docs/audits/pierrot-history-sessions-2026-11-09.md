# Pierrot: permanent histories, sessions and message provenance

Date: 2026-11-09  
Status: implemented and applied to the production Supabase project.  
Scope: `merkurov1/newlove`, owner web workspace, `/api/pierrot-web`, Telegram owner path, project chats, search and memory context.

## 1. Audit before the change

### Actual schema and data (production snapshot at migration time)

- `pierrot_conversations`: 330 rows total; 187 owner rows (site + dev), 131 unknown rows, 12 visitor rows.
- `pierrot_messages`: 1,753 rows; 1,340 belonged to owner conversations.
- `pierrot_projects`: 3 rows:
  - Art Engine — canonical conversation `474df7ed-2573-4ab4-b320-00d3a4fc837f`;
  - Journal — canonical conversation `901e9c19-2801-43e6-88df-3c0e7bc94bd2`;
  - Heart & Angel — canonical conversation `f7b54f96-e4fd-43ed-8570-9424f023886a`.
- `pierrot_project_conversations`: 9 rows; all 9 belonged to the three projects (7 Journal, 1 Art Engine, 1 Heart & Angel).
- `pierrot_project_chat_migrations`: 1 applied run, id `c30d32b7-2906-42a7-a053-04097c124bb6`.
- `pierrot_project_chat_merge_map`: 92 rows for the Journal merge; 0 skipped duplicates, 0 missing message rows.
- `pierrot_events`: 2,997 rows at migration time.
- `pierrot_decisions`: 101 rows; `pierrot_context_summaries`: 20 rows; Brain/knowledge tables are separate from chat storage.

### What already worked

- Conversation-level ownership by `identity_type='owner'` and `user_id`.
- Project canonical conversation pointers (`pierrot_projects.conversation_id`).
- Reviewed Journal merge and its complete before/after map.
- Owner search across conversations, memory, projects and Brain.
- Project context builder and memory extraction.

### What was missing or partial

- There was no permanent MAIN history; each owner conversation was a separate chat row.
- `pierrot_conversations.session_id` was an opaque auth token, not an episode.
- Messages had no history/session provenance, so a project merge kept the old conversation ids only in `pierrot_project_chat_merge_map`.
- The UI listed legacy conversations instead of histories and sessions.
- The model context came from the browser transcript, not from a server-scoped permanent history.
- Retention could purge owner conversations after 90 days.
- No uniqueness guard for “one MAIN per owner”.

### Classification of legacy owner conversations

- 9 conversations were structurally project conversations (3 canonical + 6 historical Journal merges).
- 177 conversations were MAIN episodes at the applied run (including dev-mode conversations).
- 0 conversations were left unresolved.
- 7 MAIN conversations mention a project name but have no structural project link. They stay in MAIN and are listed for manual review; they were not guessed into a project:
  - `2423c8d5-71a6-42bf-ac5a-74e49f37e9b8`
  - `85ae26a8-f3f7-4162-8999-8187dfde0d34`
  - `28c838ef-e1e8-40c5-81ae-47540dc6681e`
  - `e8071115-68f7-42ab-a0ca-7e95881e1c22`
  - `44abef4c-055b-4558-aab7-7e0e1bfd4577`
  - `b1d761ef-47d4-44b2-9d60-e772b633a872`
  - `9ba025ee-85c7-48e7-9d42-bcdcf7855e58`

The six required audit candidates are in MAIN:

| Conversation | Messages | Classification |
| --- | ---: | --- |
| `932e705e-950c-4541-97fa-a26275209468` (Knowledge Graph) | 66 | MAIN |
| `d9bb59c0-8e20-4ade-9def-8790ac7b98c5` (PWA / Heart & Angel) | 50 | MAIN |
| `81fb4733-6e4d-4bf1-93a0-1580de24280e` (DuckDuckGo) | 34 | MAIN |
| `0dff7735-4e36-4281-ba8c-4ee3ae9a0f45` (Flow / Dev) | 32 | MAIN |
| `d1ff978f-61d9-48c3-8919-0451346e0667` (general) | 28 | MAIN |
| `ed9994f2-f105-4673-83a5-576e0a9abf85` (research) | 32 | MAIN |

`d9bb59c0` is a PWA/general task list that mentions the Heart & Angel tab; it is not a Heart & Angel project transcript. `28c838ef`, `e8071115` and `44abef4c` are project-management/task instructions, not project conversations, and stay in MAIN.

## 2. Implemented model

### History

`public.pierrot_histories`

- `id`
- `owner_user_id`
- `type`: `main` | `project`
- `project_id` (nullable)
- `canonical_conversation_id`
- `title`
- `metadata`
- `next_message_sequence`
- `created_at`, `updated_at`

Uniqueness:

- one `main` per owner: partial unique index `(owner_user_id) where type='main'`;
- one `project` per project: partial unique index `(project_id) where type='project'`.

MAIN uses a deterministic canonical conversation id `main-<owner uuid without hyphens>`. The canonical conversation is storage for new sessions, not a visible history.

### Session

`public.pierrot_sessions`

- `id`, `history_id`
- `conversation_id` (physical storage, normally the history canonical conversation)
- `source_conversation_id` (legacy provenance)
- `ordinal`, `title`
- `started_at`, `ended_at`, `last_message_at`
- `message_count`, `first_message_sequence`, `last_message_sequence`
- `metadata`

A legacy conversation can produce at most one session; new sessions have a null source id and are not constrained by that index.

### Message

`public.pierrot_messages` gained only additive columns:

- `history_id`
- `session_id`
- `history_sequence` (stable cursor inside the history)

Original `id`, `conversation_id`, `role`, `content`, `message_index`, `provider`, `created_at` and mode were never rewritten. `message_index` remains the per-conversation order; `history_sequence` is the cross-session order.

### Events

`public.pierrot_events` gained `history_id` and `session_id`. A trigger fills them from the referenced message id or the latest session of the conversation. Backfilled owner feedback is fully scoped.

## 3. Migrations applied

Applied:

- `migrations/2026-11-09_pierrot_histories_sessions.sql`
  - tables, columns, indexes, RLS/grants;
  - `pierrot_ensure_main_history`;
  - `pierrot_ensure_project_history`;
  - `pierrot_create_session`;
  - `pierrot_link_conversation_messages`;
  - `pierrot_append_message_v2`;
  - event and direct-message scope triggers;
  - history-aware retention (never purges history or its provenance).
- `scripts/pierrot/history-backfill.mjs --apply`
  - creates MAIN and project histories;
  - creates one session per legacy conversation;
  - maps messages, preserving the merge map;
  - assigns stable history sequences;
  - backfills event scope;
  - writes an audit report and an entry in `pierrot_history_migration_runs`.

Rollback:

- `migrations/rollback/2026-11-09_pierrot_histories_sessions.rollback.sql`
  - removes only the additive layer; no legacy row is deleted.

Applied result:

- MAIN histories: **1**
- project histories: **3** (Art Engine, Journal, Heart & Angel)
- sessions: **186** (177 MAIN + 9 project)
- owner messages mapped: **1,340 / 1,340**
- unmapped owner messages: **0**
- duplicate `(history_id, history_sequence)`: **0**
- unresolved owner conversations: **0**
- data-loss check: **passed** (same message id digest, same counts, no deletion)

### Journal verification

- Migration `c30d32b7-2906-42a7-a053-04097c124bb6` remains applied.
- Canonical conversation `901e9c19-2801-43e6-88df-3c0e7bc94bd2` remains canonical.
- 7 sessions preserved.
- All **92** merge-map rows exist; 0 skipped duplicates; 0 missing message rows; 0 unmapped rows.
- All original message ids and timestamps are unchanged.
- The 40 post-migration messages were preserved (132 messages in the canonical transcript).
- The canonical session contains the original 4 canonical messages plus the 40 later messages; the other 6 sessions retain their original message counts 48/20/6/10/2/2.

## 4. Runtime behavior

### Server

- `lib/pierrot/history/store.ts` resolves the permanent history/session and canonical conversation.
- `appendPierrotMessage` calls `pierrot_append_message_v2` when a history/session is present; legacy callers use the old RPC.
- `/api/pierrot-web`:
  - resolves the owner history before writing;
  - replaces the browser-provided history with a bounded server-side window from the correct history;
  - never mixes MAIN and project history;
  - passes `historyId`/`episodeId` through the stream and JSON response.
- Old conversation ids resolve through `pierrot_sessions.source_conversation_id` without creating a new history.
- Project history always uses the project canonical conversation.
- Retention excludes owner histories and all session provenance.
- Deleting a history-owned conversation is refused.
- `/api/admin/pierrot/conversations` supports `historyId`, `sessionId`, `beforeSequence`, and keeps the legacy `conversationId` / `beforeIndex` path.
- `/api/admin/pierrot/sessions` creates a new episode inside an existing history only.

### UI

- Default page opens MAIN.
- Drawer shows:
  - “Главная история”;
  - the project histories;
  - sessions inside the open history (12 newest, with “show all”).
- “Новая сессия” creates a session, not a history, and does not delete earlier messages.
- The transcript is a single stream with unobtrusive session separators.
- Old conversation URLs redirect to `?history=…&session=…`.
- Project URLs redirect to the project history.
- Pagination is cursor-based on `history_sequence`; it does not jump on prepend and does not duplicate messages.
- Feedback is loaded with each page and attached to the correct message.

### Memory, search and retrieval

- Owner model context is loaded from `pierrot_messages.history_id`.
- MAIN and project scopes never share a bounded transcript.
- History queries use the current history; project context uses the project history.
- `loadOwnerHistoryContext` searches relevant older fragments only inside the same history.
- Unified search still covers the full owner scope; result links now use `?history=`/`?session=`.
- No duplicate Brain documents were created for migrated messages.
- Existing `запомни`, `сохрани`, `напомни`, archive and memory APIs were not replaced.

## 5. Tests

- TypeScript: `npx tsc --noEmit` → 0 errors.
- Jest: **299 suites, 2,082 tests passed**.
- New tests:
  - `lib/pierrot/history/__tests__/store.test.ts` — MAIN idempotency, session creation without a new history, old-conversation resolution, scope isolation, cursor pagination, feedback, bounded context.
  - `lib/pierrot/__tests__/serverStore.test.ts` — v2 provenance append.
- Build was not run at the user’s request.

## 6. Data verification report

Machine-readable report:

- `docs/audits/pierrot-history-backfill-report.json`

Contains:

- before/after counts and message-id digest;
- history/session/message/event counts;
- project history details;
- Journal merge check;
- feedback scope;
- required candidate classification;
- ambiguous project mentions;
- unresolved list (empty);
- duplicate sequence list (empty).

## 7. Remaining notes

- Commit: `0b4a424e961ce45499237db8d079a775f4235cd0`.
- Production build was intentionally not run at the user’s request. TypeScript and the full Jest suite were run.
- Dev-mode conversations were preserved inside MAIN as owner sessions (`mode` stays in metadata/provenance and in the original conversation row). The separate dev workspace was not redesigned.
- Unknown/visitor conversations (131 + 12 at migration time) were intentionally not attached to the owner MAIN history: they are not proven owner data. They remain untouched in the legacy tables.
- Sessions created before the UI deployment can be picked up by re-running the idempotent backfill; the runtime also creates a session on first access of an unlinked owner conversation.
- No remote/production deployment was performed by this task.
