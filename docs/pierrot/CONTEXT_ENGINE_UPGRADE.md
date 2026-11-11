# Pierrot Context Intelligence & Project Continuity Upgrade

Date: 2026-11-11
Scope: targeted upgrade of the existing Pierrot retrieval, project, memory,
Brain and feedback paths. No application rebuild, no database replacement, no
destructive migration.

## 1. Initial architecture audit

### Existing pieces reused

| Area | Existing implementation | Reused by the upgrade |
|---|---|---|
| Conversations | `pierrot_conversations`, `pierrot_messages`, `pierrot_histories/sessions` | Original messages remain the source of truth; the new layer only reads them |
| Project workspaces | `pierrot_projects`, `pierrot_project_conversations`, `pierrot_project_decisions`, `pierrot_project_artifacts`, `pierrot_project_knowledge` | Canonical project chat, tasks, decisions, artifacts and links |
| Owner memory | `pierrot_decisions` + `pierrot_memory_embeddings` + `pierrot_memory_search` | Hybrid semantic/lexical memory retrieval |
| Brain | `knowledge_documents`, `knowledge_chunks`, hybrid RAG, document lookup | Title/content lookup, section structure, source attribution |
| Knowledge graph | `brain_entities`, `brain_entity_mentions`, extraction pipeline | Entity-based graph evidence |
| Intent/routing | `queryUnderstanding`, `executionPlan`, `ownerTools`, search intent | Existing analytics/Flow/MSI/Brain routes are unchanged |
| Feedback | `answer_feedback` events, analytics views, intelligence snapshot | Up/down counts retained; error categories added |

### Root causes found

1. **Cross-session questions were not routed to retrieval.**
   `detectUnifiedSearchIntent` required explicit search verbs. Questions such as
   “Что мы делали сегодня?”, “What did we decide yesterday?” and “What is the
   current state of UNFRAMED?” fell through to the general model. The model saw
   only the current bounded transcript and durable memory.
2. **The project chat searched older conversations only on a narrow history
   regex.** `buildProjectChatContext` searched all linked project conversations
   only when `wantsHistory` matched. A normal “continue from where we stopped”
   turn did not retrieve the separate task conversation.
3. **Search preserved conversation identity, not message identity.**
   `searchUnifiedOwnerContext` deduplicated to one hit per conversation. The
   original message id, event time and retrieval method were lost.
4. **No chronological/daily reconstruction layer.** There was no path that
   combined conversations, tasks, decisions, artifacts and project events for
   a day, in the requested timezone, while distinguishing completion from
   intention.
5. **The project model had no typed entities.** A book and a larger project
   with the same name could only be distinguished by matching text. There was
   no stable BOOK/PROJECT/SERIES/VIDEO/WEBSITE/PROPOSAL identity or explicit
   relation such as `SOURCE_WORK`.
6. **Brain retrieval depended on embeddings even for an exact title.**
   Title lookup existed, but the general retrieval path had no lexical
   content fallback and did not return document structure.
7. **Feedback was only up/down.** Negative ratings were not classified, so a
   hallucination, context loss, entity confusion and wrong tool looked the
   same in analytics.
8. **Timezone handling was inconsistent.** The daily path did not exist; the
   existing query-period helper used UTC day boundaries for daily questions.

## 2. Architecture changes

### 2.1 Context engine (new orchestration layer)

New files:

- `lib/pierrot/context/types.ts` — evidence classes, retrieval methods,
  context hits, timeline events, project state, ambiguities.
- `lib/pierrot/context/intent.ts` — deterministic owner context intent
  detection, date/timezone parsing.
- `lib/pierrot/context/retrieval.ts` — unified retrieval over conversations,
  projects, memory, artifacts, Brain, graph and project events.
- `lib/pierrot/context/timeline.ts` — chronological sorting, timezone grouping,
  daily digest, intention/completion separation.
- `lib/pierrot/context/state.ts` — project/workstream state and task vs
  deliverable distinction.
- `lib/pierrot/context/report.ts` — concise intent-specific report formatter.
- `lib/pierrot/context/store.ts` — append-only project event/status writes.

This layer does **not** create a second memory or project store. It reads the
existing tables and links every hit back to its original source.

### 2.2 Typed entity model

New files:

- `lib/pierrot/entities/types.ts`
- `lib/pierrot/entities/store.ts`

Entity types: `PROJECT`, `WORK`, `BOOK`, `CHAPTER`, `DOCUMENT`, `MEDIA_ASSET`,
`VIDEO`, `SERIES`, `EPISODE`, `WEBSITE`, `PAGE`, `PROPOSAL`, `TASK`, `EVENT`,
`DECISION`, `CONVERSATION`.

Relations include `SOURCE_WORK`, `HAS_SERIES`, `HAS_VIDEO`, `HAS_PAGE`,
`HAS_PROPOSAL`, `HAS_CONVERSATION`, `HAS_CHAPTER`, `HAS_EDITION`, `PUBLISHED_AS`.

Resolution uses name, aliases, type hint, project context and score. Two close
candidates of different types are returned as **ambiguous**; the resolver does
not pick one silently. Existing projects are exposed as `PROJECT` entities even
before the entity migration is applied.

### 2.3 Project chat continuity

`lib/pierrot/projects/history.ts` now:

- searches all linked project conversations on every substantive turn, not only
  when the owner says “history”;
- includes the canonical transcript and a bounded `RELATED PROJECT DISCUSSIONS`
  block;
- labels each older message with its conversation id;
- states how many linked conversations exist;
- keeps original messages as evidence; it never replaces them with a summary.

The route still uses the existing canonical project chat (`conversation_id`);
no second project chat is created.

### 2.4 Intent routing

New context intents:

`PROJECT_HISTORY`, `PROJECT_STATUS`, `DAILY_SUMMARY`, `CONVERSATION_SEARCH`,
`ACHIEVEMENT_LOG`, `ENTITY_DISTINCTION`, `DOCUMENT_SEARCH`.

Routing rules:

- Daily/achievement reports are owner-wide even if opened from a project chat.
- Project history/status use the resolved project.
- A project-scoped conversation search widens to all owner conversations if the
  project has no match, and says so.
- Analytics, Flow, MSI and commercial questions are deliberately left to their
  existing tools.
- “What is UNFRAMED?” (all-caps name) reaches entity resolution; ordinary
  sentence-case questions stay in normal chat.

### 2.5 Evidence and confidence

Every context hit carries:

`id`, `sourceType`, `sourceId`, `conversationId`, `messageId`, `projectId`,
`entityId`, `title`, `excerpt`, `eventAt`, `ingestedAt`, `retrievalMethod`,
`confidence`, `evidenceClass`, `href`, `metadata`.

Evidence classes: `MEASURED`, `USER_CONFIRMED`, `DIRECTLY_OBSERVED`,
`DOCUMENTED`, `INFERRED`, `UNKNOWN`.

Rules implemented:

- an intention is not a completed deliverable;
- a discussed task is not a completed task;
- an AI inference is labelled `INFERRED`;
- a document hit is labelled `DOCUMENTED`;
- a missing period says “no saved events”, not “no work happened”;
- a calculated/derived project status names its reason and gaps.

### 2.6 Feedback classification

New file `lib/pierrot/feedback/classify.ts` classifies negative feedback into:
`WRONG_FACT`, `HALLUCINATION`, `WRONG_SOURCE`, `CONTEXT_LOSS`,
`CROSS_SESSION_FAILURE`, `ENTITY_CONFUSION`, `INTENT_MISMATCH`, `WRONG_TOOL`,
`INCOMPLETE_ANSWER`, `REPETITION`, `WRONG_FORMAT`, `TIMEZONE_ERROR`, `OTHER`.

`/api/pierrot/events` now stores `feedback_category`, `feedback_root_cause`,
`feedback_confidence`, `feedback_signals` and `correction_kind` alongside the
existing rating and trace. The intelligence snapshot exposes
`feedbackByCategory`, so the quality dashboard can separate failure types.
`toRegressionCase` converts a classified correction into a reusable fixture
without automatically turning every correction into a permanent preference.

## 3. Database changes

Migration: `migrations/2026-12-03_pierrot_context_engine.sql`

Additive only:

1. `pierrot_messages.ingested_at` (event time stays `created_at`; historical
   rows are backfilled from `created_at`).
2. `pierrot_entities` with a `PROJECT` backfill from `pierrot_projects`.
3. `pierrot_entity_relations`.
4. `pierrot_project_events` (append-only timeline with evidence class and
   original source references).
5. `pierrot_project_status_history` (append-only status changes).
6. Retrieval indexes: message `created_at`, conversation+created, trigram
   indexes on message content, Brain titles and Brain chunk content.

Follow-up backfill: `migrations/2026-12-04_pierrot_entity_backfill.sql`.

It creates typed `BOOK` / `DOCUMENT` entities from the existing Brain corpus
when the document is a manuscript/book or its title matches an existing project
on whole-word boundaries, then links the entity to that project. It does not
reindex Brain, does not change embeddings, and does not write project rows.

Rollback:
- `migrations/rollback/2026-12-03_pierrot_context_engine_rollback.sql`
- `migrations/rollback/2026-12-04_pierrot_entity_backfill_rollback.sql`

They drop only objects created by these migrations. They never drop messages,
projects, decisions or Brain documents.

### Applied in this environment

Before applying, the existing rows were exported to
`/tmp/opencode/pre-context-migration-backup.json` (mode 0600; not committed).

Applied successfully:
- `2026-12-03_pierrot_context_engine.sql`
- `2026-12-04_pierrot_entity_backfill.sql`

Post-migration production checks:

```text
projects: 4, artifacts: 4, messages: 3061, documents: 291, chunks: 1994
pierrot_entities: 13
pierrot_entity_relations: 9
messages with ingested_at: 3061
pg_trgm: available
UNFRAMED: BOOK entity + PROJECT entity both present
UNFRAMED project chat: 156 messages (2026-11-11 06:18 → 11:52 UTC)
UNFRAMED: MASTER PROJECT BLUEPRINT: 7 sections
UNFRAMED manuscript: 169 chunks
```

The whole-word project match deliberately prevents “Journal” from matching
“LiveJournal” documents. A first backfill attempt exposed that false positive;
it was rolled back through the marker-based rollback and re-applied with the
corrected matcher. No source document was deleted.

## 4. Retrieval improvements

- Exact phrase and quoted phrase detection.
- Keyword/root matching for Russian/English inflections.
- Semantic memory retrieval via the existing `pierrot_memory_search`.
- Entity-based graph retrieval via `brain_entities` / `brain_entity_mentions`.
- Brain title lookup plus content fallback that works without embeddings.
- Brain document structure: headings, section count, truncation flag.
- Chronological retrieval: real event time, stable message ordering, timezone
  grouping.
- Project-scoped retrieval with explicit widening to all owner conversations.
- Source preservation: original message id, conversation id, project id,
  document id, chunk id.
- Retrieval method and confidence stored per hit.
- Deduplication by source identity, not by conversation.

## 5. Project state model

Derived states: `PROPOSED`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `CANCELLED`,
`ARCHIVED`.

- `COMPLETED` requires a completed task, a confirmed deliverable or an explicit
  project event. Discussion alone never completes anything.
- Tasks are `pierrot_decisions` rows of kind `task`/`reminder`.
- Deliverables are project artifacts/publications with an observed status, not
  intentions.
- Workstreams are typed child entities (`BOOK`, `SERIES`, `VIDEO`, `WEBSITE`,
  `PROPOSAL`, …), with relation labels.
- Status changes are appended to `pierrot_project_status_history`.
- Completed owner commands are mirrored to `pierrot_project_events`; the
  original memory record and message remain the evidence.

## 6. Tests and evidence

New test suites:

- `lib/pierrot/context/__tests__/intent.test.ts`
- `lib/pierrot/context/__tests__/timeline.test.ts`
- `lib/pierrot/context/__tests__/retrieval.test.ts`
- `lib/pierrot/context/__tests__/report.test.ts`
- `lib/pierrot/context/__tests__/migration.test.ts`
- `lib/pierrot/entities/__tests__/resolution.test.ts`
- `lib/pierrot/feedback/__tests__/classify.test.ts`

Key regression scenarios implemented with real-shaped fixtures:

- `What is UNFRAMED?` → BOOK and PROJECT are returned as two candidates.
- `Где мы обсуждали Spectral Tiger?` → original message id and project
  conversation id are preserved.
- `Что мы делали сегодня?` → messages from the project chat and the main chat,
  yesterday excluded.
- Brain `UNFRAMED: MASTER PROJECT BLUEPRINT` → title match, headings and
  chunk excerpts without embeddings.
- Project status → completed task, open task, decision, published artifact and
  `SERIES` workstream separated.
- `What did I complete today?` → only the completed task, not the open one.
- Feedback → hallucination, context loss, entity confusion, cross-session,
  wrong tool, timezone and format preference classified separately.
- Timezone → Moscow day boundaries and an explicit GMT override.
- Migration → additive, no message deletion, project entity backfill, rollback.

Verification run:

```text
npx tsc --noEmit --incremental false        → clean
npx next lint --file <changed files>        → clean
npx jest --runInBand                        → 354 suites / 2537 tests passed
```

The targeted context/entity/feedback suites contain 36 tests and are included
in the full run above.

## 7. Before / after on UNFRAMED-shaped cases

| Request | Before | After |
|---|---|---|
| “What is UNFRAMED?” | One general answer; book and project could be merged | Typed resolution returns BOOK and PROJECT as distinct candidates |
| “Find the conversation where we discussed Spectral Tiger” | Conversation-level hit; message id lost | Per-message hit with message id, conversation id, timestamp, method and evidence |
| “What did we do today?” | Current chat / durable memory only | Owner-wide daily reconstruction across all conversations, tasks, decisions and artifacts |
| “What is the current state of UNFRAMED?” | Active/paused plus open task count | Workstreams, completed/remaining work, deliverables, decisions and gaps |
| “What did we decide yesterday?” | Not routed to history | Chronological project history with the original message references |
| Brain blueprint title | Retrieval could depend on embeddings | Exact title + content fallback + document structure |
| Negative feedback | One undifferentiated down vote | Classified failure category and root cause |

## 8. Remaining limitations

1. **Live production data was not queried from this environment.** The
   regression fixtures reproduce the specified UNFRAMED case, but the final
   staging pass must run against the real November 11 conversations and the
   real blueprint document.
2. **Conversation embeddings do not exist.** Conversation retrieval is exact /
   keyword / root / chronological. Semantic retrieval is used for owner memory
   and the existing Brain RAG path. Adding conversation embeddings would be a
   separate, expensive indexing project; it was not introduced silently.
3. **Graph extraction coverage depends on the existing Brain graph pipeline.**
   If a document has no extracted entities, graph hits are absent; the document
   lexical path still works.
4. **Project status is derived unless an explicit status history row exists.**
   There is no new project-status UI. The model is conservative, but an explicit
   owner command remains the strongest completion evidence.
5. **Automatic creation of regression cases is pure, not automatic.** A
   classifier and `toRegressionCase` exist; persisting every correction as a
   permanent fixture requires an explicit operator step.
6. **Trigram indexes are optional.** The migration catches a missing
   `pg_trgm` extension and skips them; all retrieval paths still work. Build
   them on staging first, because index creation on a large Brain corpus takes
   time.

## 9. Prioritized follow-up backlog

P0:
- Run the real UNFRAMED November 11 fixtures against staging and attach the
  actual message/document ids.
- Add an admin-only quality view for `feedbackByCategory` and unresolved
  regression cases.

P1:
- Conversation-level embeddings with a staged backfill and rollback, reusing
  the existing embedding model.
- Persist explicit project events from more sources (GitHub, Vercel, Vercel
  deployments, publication events).
- Add a deterministic `deliverable` memory kind only if artifacts prove
  insufficient after the staging pass.

P2:
- Entity extraction from project artifacts and Brain documents into
  `pierrot_entities` with `MENTIONED_IN` links.
- Project-status transition UI and operator review.

## 10. Modified files

New:
- `lib/pierrot/context/types.ts`
- `lib/pierrot/context/intent.ts`
- `lib/pierrot/context/timeline.ts`
- `lib/pierrot/context/state.ts`
- `lib/pierrot/context/retrieval.ts`
- `lib/pierrot/context/report.ts`
- `lib/pierrot/context/store.ts`
- `lib/pierrot/context/__tests__/*`
- `lib/pierrot/entities/types.ts`
- `lib/pierrot/entities/store.ts`
- `lib/pierrot/entities/__tests__/resolution.test.ts`
- `lib/pierrot/feedback/classify.ts`
- `lib/pierrot/feedback/__tests__/classify.test.ts`
- `migrations/2026-12-03_pierrot_context_engine.sql`
- `migrations/2026-12-04_pierrot_entity_backfill.sql`
- `migrations/rollback/2026-12-03_pierrot_context_engine_rollback.sql`
- `migrations/rollback/2026-12-04_pierrot_entity_backfill_rollback.sql`
- `docs/pierrot/CONTEXT_ENGINE_UPGRADE.md`

Modified:
- `app/api/pierrot-web/route.ts`
- `app/api/pierrot/events/route.ts`
- `lib/analytics/pierrotIntelligence.ts`
- `lib/pierrot/projects/history.ts`
- `lib/pierrot/projects/store.ts`
- `lib/pierrot/search/types.ts`
- `lib/pierrot/search/unified.ts`
- `lib/pierrot/memory/testSupport/fakeSupabase.ts`
