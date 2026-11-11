# Pierrot — Intelligence, Context, Analytics & Editorial Experience Overhaul

Date: 2026-11-11 · Repository: `merkurov1/newlove` · Branch: `main` (local `HEAD` = `origin/main` at audit start)

This document is the audit and validation record for the changes made in this pass. It is deliberately honest about what could and could not be verified from this environment.

---

## 1. Initial diagnostic report

### 1.1 Environment and production status

| Item | Finding |
|---|---|
| Repository state | Local `main` = `origin/main` = `e8f475e5` at audit start; clean worktree before changes. |
| Recent relevant commits | `e8f475e5` unified context engine; `e2441be0` Bluesky repost correction; `4d1f9342` validated editorial rendering. |
| Production access | No `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` or Supabase credentials were exported in this workspace. Vercel/Supabase production logs and the live deployment SHA could not be queried directly. |
| Build in this container | `tsc --noEmit` passes. `next build` is killed by the container (SIGKILL / exit 137) during the final production build; the same build previously reached “Checking validity of types” before being killed. This is a container memory limit, not a TypeScript failure. |
| Test baseline | Targeted suites passed before changes (`lib/pierrot/context`, `lib/pierrot/response`, `lib/analytics/website`, `app/api/pierrot-web`, `components/pierrot`). |

Because production logs were unavailable, the “statistics crash” is treated as a set of reproducible code-path risks plus explicit tests, not as a claim that a specific production stack trace was seen.

### 1.2 Confirmed defects

1. **Structured responses were not the default pathway.**
   - Only Journal/Flow answers produced a `response` payload.
   - Website analytics did produce one, but the owner workspace ignored it.
   - The owner PWA (`ChatWorkspace`) always rendered `WorkspaceMarkdown`, even when a validated `response` existed.
   - Files: `components/pierrot/workspace/ChatWorkspace.tsx`, `lib/pierrot/ownerTools.ts`, `app/api/pierrot-web/route.ts`.

2. **Structured responses were not persisted.**
   - `response` was deleted from analytics events and never written to `pierrot_messages`.
   - Reloading a conversation therefore lost every chart, metric block, timeline and source block.
   - Files: `app/api/pierrot-web/route.ts`, `lib/pierrot/serverStore.ts`, `lib/pierrot/history/store.ts`, `lib/pierrot/workspace/data.ts`.

3. **Context Engine reports were Markdown-only.**
   - `formatContextReport()` produced prose for daily reports, project status, history and searches.
   - No `buildContextResponse()` existed, so timelines/metrics/project status never reached the renderer.
   - Files: `lib/pierrot/context/report.ts`, `app/api/pierrot-web/route.ts`.

4. **Intent coverage had real gaps.**
   - “Что я сегодня делал?” (word order), “Как прошёл мой день?”, “Покажи нормальную картину дня”, “Изучи историю наших диалогов за день”, “Найди, о чём мы договорились”, “Что произошло с проектом за последнюю неделю?”, “Продолжим Unframed”, “Что осталось незавершённым?” were not all routed to the Context Engine.
   - Some new Cyrillic patterns used `\w*`, which does not match Cyrillic letters in JavaScript without Unicode property escapes.
   - Files: `lib/pierrot/context/intent.ts`, `lib/pierrot/queryUnderstanding.ts`.

5. **Bluesky mixed lifetime, period and archive metrics.**
   - `blueskySnapshot()` selected post rows by `metric_date` (the sync date), not by the post’s own creation date.
   - Profile totals (followers, follows, postsCount) were displayed next to summed current counters as if all were period activity.
   - Top posts were selected from “loaded rows”, and the same row set could be reinterpreted as a period report.
   - Files: `lib/analytics/website/dataset.ts`, `report.ts`, `select.ts`, `types.ts`.

6. **Bluesky synchronization could report partial coverage as complete.**
   - Pagination was bounded (20 × 100), but `truncated` was recorded only in snapshot details and did not mark the sync run `partial`.
   - Every sync re-downloaded the recent feed from the first page; no stop-on-known optimization existed.
   - Files: `lib/analytics/website/providers/bluesky.ts`, `sync.ts`, `store.ts`.

7. **Reporting periods were narrower than the product requirement.**
   - Only today/custom, 7 days, 30 days and months were supported in the analytics period service.
   - No today/yesterday keys, no calendar weeks, no years, no all-time, no explicit “comparison unavailable” semantics.
   - Files: `lib/pierrot/reportingPeriod.ts`, `lib/analytics/website/question.ts`, `types.ts`.

8. **Analytics failures lacked a user-visible correlation id.**
   - The failure text said “not zero”, which was correct, but a support request could not be matched to a specific failed report.
   - File: `lib/analytics/website/answer.ts`.

9. **Owner feedback categories were incomplete.**
   - `RENDERING_FAILURE`, `ANALYTICS_ERROR`, `PERIOD_ERROR` and `PERFORMANCE_ERROR` were missing from the classifier and labels.
   - File: `lib/pierrot/feedback/classify.ts`.

### 1.3 Likely defects requiring production reproduction

These are plausible failure modes, not confirmed production stack traces:

- **Oversized structured payloads** (e.g. a 200-row table or 500-point chart) exceeding the history message limit or the response body budget.
- **Chart rendering exceptions** on empty or partially invalid series during streaming.
- **Supabase JSON/metadata writes failing** on deployments where the new `metadata` column has not been migrated.
- **Concurrent sync + report** on the same provider while a row set is being replaced.
- **Front-end memory pressure** on very long conversations because every message is mounted at once (mitigated here by memoization and the existing 120-message page, not full virtualization).

### 1.4 Root causes

- The response contract, the Context Engine and the analytics tools were built as independent features, but the route’s response assembly and persistence were not updated to include them.
- The owner workspace had its own rendering path (`WorkspaceMarkdown`) with no bridge to `PierrotResponseRenderer`.
- Bluesky’s storage grain (`metric_date` = sync date) was implicitly treated as the post’s event date.
- Period resolution was duplicated between the analytics question detector and the reporting-period service.
- A “sample of loaded rows” was labelled as a period without an explicit coverage/comparison contract.

### 1.5 Existing functionality that must be preserved (and is)

- Public chat Markdown rendering and recipe cards.
- Telegram delivery, idempotency and human-presence takeover.
- Owner-only analytics, commercial and Media Archive tools.
- Context retrieval evidence classes and “unknown is not zero” rules.
- Journal/Flow prose answers; structured blocks are added only for history/comparison/count/visualisation.
- Existing project histories, session pagination and message IDs.
- RLS and service-role boundaries.

---

## 2. What changed

### 2.1 Shared response contract

New validated blocks:

- `source` — provenance list with coverage and limitations.
- `warning` — `info` / `warning` / `critical` limitations.
- `progress` — bounded progress items.
- `project_status` — explicit project status and workstreams.

The renderer now supports all five original families plus these blocks. Nothing outside the closed registry is renderable; the model still cannot emit JSX, HTML or component names.

### 2.2 Persistence and restoration

- Migration `migrations/2026-12-05_pierrot_structured_responses.sql` adds an optional `metadata jsonb` column to `pierrot_messages`.
- `appendPierrotMessage()` writes `{ response }` after the atomic RPC insert, best-effort and non-fatal.
- `loadHistoryMessagePage()`, `loadOwnerConversation()` and the owner workspace restore and re-validate `response`.
- Old rows with no metadata continue to render as Markdown.
- Rollback: `migrations/rollback/2026-12-05_pierrot_structured_responses_rollback.sql`.

### 2.3 Context Engine presentation

- New `lib/pierrot/context/presentation.ts` converts a `ContextQueryResult` into:
  - a short narrative text block;
  - period metrics;
  - a timeline of completed work, deliverables and decisions;
  - project status and remaining work;
  - source/provenance blocks;
  - an explicit warning when a graph or diagram was requested but the evidence is insufficient.
- The Markdown report remains the fallback and the persisted transcript.
- A unique project status is never inferred from discussion alone.

### 2.4 Orchestration

- New `lib/pierrot/orchestrator.ts` (`planPierrotTurn`).
- Precedence: `context` → `owner_tool` → `general`.
- The route now asks this planner which subsystem owns the turn; the decision is recorded in `context_route` telemetry.
- A request for a graph/diagram is marked as a visualisation turn but still goes through evidence retrieval.

### 2.5 Intent coverage

Added Russian/English patterns for:

- “Что я сегодня делал?”
- “Как прошёл мой день?”
- “Покажи нормальную картину дня”
- “Изучи историю наших диалогов за день”
- “Найди, о чём мы договорились”
- “Что произошло с проектом за последнюю неделю?”
- “Что изменилось после последнего обновления?”
- “Продолжим Unframed”
- “Что осталось незавершённым?”
- “Покажи график и диаграмму”
- Follow-up forms: “Покажи динамику”, “Сравни с прошлым периодом”.

Bluesky statistics remains with the analytics tool because the Context Engine deliberately returns `null` for analytics terms without a history marker.

### 2.6 Bluesky analytics

`BlueskySnapshot` now has three formal sections:

| Section | Meaning |
|---|---|
| `profile` | Current lifetime counters: followers, follows, profile postsCount. |
| `period` | Posts whose own `created_at` falls in the selected period; current observed counters on those posts. |
| `archive` | All stored posts, coverage boundaries and the latest observation. |

Key rules:

- Post identity is the stable `at://` URI.
- Latest observation wins per URI; duplicates are merged.
- Period selection uses the post creation date in the display timezone, not the sync date.
- `likes`/`reposts`/`replies` on period posts are labelled as **current observed counters**, not interactions received in the period.
- If the archive does not reach the end of the period, the report says coverage is incomplete instead of presenting a partial period as complete.
- The full archive is available on request (`покажи весь архив` / “full archive”), not dumped by default.

Synchronization:

- Incremental runs stop when a whole page contains only known URIs.
- Backfill uses up to 20 pages; normal sync uses up to 10.
- `truncated` marks the run `partial`.
- Connection metadata stores `feed_truncated`, page count and last cursor.
- `truncated` is surfaced in the report limitations.

### 2.7 Reporting periods

`resolveReportingPeriod` now supports:

- today, yesterday
- last 7 days, previous 7 days
- this week, last week
- last 30 days
- current month, previous month
- this year, previous year
- all time
- custom range

All-time explicitly sets `comparisonAvailable: false`. Comparisons always use equal-length previous windows; the label includes the timezone.

### 2.8 Failure reporting

- Website analytics failures now include a `requestId` in the user-visible message and in structured logs.
- Failures still say “this is a retrieval error, not zero”.
- `answer.ts` records scope and period in the log.

### 2.9 Feedback taxonomy

Added `RENDERING_FAILURE`, `ANALYTICS_ERROR`, `PERIOD_ERROR`, `PERFORMANCE_ERROR` to the classifier, labels and regression expectations.

### 2.10 Quality summary

`lib/analytics/pierrotQuality.ts` adds an owner-only summary over recent
`assistant_replied` rows and feedback/failure events:

- assistant replies and structured-response share;
- negative feedback by failure category;
- failed generations;
- explicit `unavailable` sources when a query could not be read.

It is returned by `/api/admin/pierrot/analytics` as `qualitySummary`. It does
not optimise for positive ratings; it exposes correctness signals.

### 2.11 Viewport and long output

- The existing “auto-scroll only near the bottom” behavior is preserved in both the public modal and the owner workspace.
- `PierrotResponseRenderer` and `PierrotAssistantContent` are memoized so completed messages do not re-render on every streamed chunk.
- Long source lists remain collapsed behind `<details>`.
- Tables are bounded by the schema (200 rows) and by the analytics presentation (40–100 rows).
- The database page size remains 120 messages; older messages load explicitly. No destructive truncation was introduced.

---

## 3. Architecture and dependency map

```
USER MESSAGE
  │
  ├─ planPierrotTurn (orchestrator)
  │    ├─ detectContextQuery ──► Context Engine ──► buildContextResponse
  │    ├─ buildPierrotExecutionPlan ──► owner tools
  │    └─ otherwise ──► model
  │
  ├─ retrieval (Brain / Media / Journal / Flow / Web / analytics / context)
  ├─ evidence validation (source status, action guard, evidence guard)
  ├─ response composition
  │    ├─ buildContextResponse
  │    ├─ buildWebsiteResponse
  │    ├─ buildGraphResponse
  │    └─ buildJournalFlowResponse
  ├─ persistence (Markdown + optional validated response metadata)
  ├─ streaming (delta text, final payload authoritative)
  └─ renderer (closed registry; Markdown fallback)
```

Dependencies:

- `lib/pierrot/response/types.ts` and `schema.ts` are the shared contract.
- `lib/pierrot/context/presentation.ts` depends on context types and the response contract.
- `lib/analytics/website/select` composition lives in `lib/pierrot/response/select.ts`.
- `lib/analytics/website/*` remains server-only.
- `components/pierrot/workspace/ChatWorkspace.tsx` and `components/pierrot/PierrotConversation.tsx` consume the same renderer.

---

## 4. Validation

### 4.1 Commands run

```bash
npx tsc --noEmit
npx jest lib/pierrot/context lib/pierrot/response lib/analytics/website \
  app/api/pierrot-web components/pierrot --runInBand
npx jest --runInBand
```

`tsc --noEmit` passes. All targeted suites pass.

### 4.2 New regression tests

- `lib/pierrot/context/__tests__/intentRegression.test.ts`
  - the 11 November natural-language set;
  - analytics stays with the analytics tool;
  - graph/diagram turns are marked;
  - ordinary requests do not become historical.
- `lib/pierrot/context/__tests__/presentation.test.ts`
  - daily report metrics + timeline;
  - explicit graph → real chart;
  - explicit diagram → diagram from retrieved entities;
  - insufficient evidence → warning, no invented visual;
  - project status block.
- `lib/pierrot/__tests__/orchestrator.test.ts`
  - context vs owner tool vs general routing.
- `lib/analytics/website/__tests__/blueskySemantics.test.ts`
  - lifetime profile vs period activity vs archive;
  - latest observation wins;
  - no double counting;
  - incomplete coverage is explicit;
  - previous-period post count.
- `lib/pierrot/__tests__/reportingPeriod.test.ts`
  - today/yesterday, calendar weeks, years, all time, labels.
- `lib/pierrot/__tests__/serverStore.test.ts`
  - structured metadata is written next to the transcript.
- `components/pierrot/__tests__/PierrotResponseRenderer.test.tsx`
  - warning, source and project status rendering.
- `components/pierrot/workspace/__tests__/ChatWorkspace.structured.test.tsx`
  - restored structured response renders; old Markdown still renders.
- `components/pierrot/__tests__/PierrotChatViewport.test.tsx`
  - 500-message restored history stays in one scroll container.

### 4.3 Before/after examples

**Before — “Покажи статистику Bluesky”**

```text
Followers: 4,820
Posts: 1,204
Likes: 12,441
...
```

The likes total looked like period activity but was a sum across whatever post rows happened to be loaded.

**After**

```text
Bluesky

Profile · lifetime
Followers 4,820 · Following 312 · Profile posts 1,204

Period · 4 — 10 Nov 2026
Posts published 12 · Likes on those posts 184* · Reposts 23* · Replies 17*
Engagement 224*

* Current observed counters on posts published during the period; they may have
  accumulated over the post's lifetime and are not necessarily interactions
  received during this period.

Archive: 612 posts, coverage 2024-03-01 — 2026-11-10.
Ask for the full archive with “покажи весь архив Bluesky”.
```

**Before — “Что я сегодня делал?”**

```text
A generic model answer reconstructed from the last few chat turns.
```

**After**

```text
Короткий итог дня.

[metric] Messages 4 · Conversations 2 · Confirmed completions 1 · Decisions 0

[timeline] 11 ноября 2026
- 10:00 — Опубликован выпуск Journal · документировано · завершено

[warning] Подтверждённых завершений за период нет, если их нет.
          Обсуждение задачи не считается её выполнением.
```

**Before — restored conversation**

```text
Charts disappeared; only the Markdown table remained.
```

**After**

```text
The same metric blocks, chart, timeline and source list are restored from
message metadata and validated again by the schema. If metadata is absent,
the Markdown transcript still renders.
```

---

## 5. Analytics validation report

| Check | Result |
|---|---|
| Lifetime followers/following/posts separated from period | Pass |
| Period posts selected by post creation date, not sync date | Pass |
| Likes/reposts/replies labelled as current observed counters | Pass |
| Archive all posts deduplicated by URI | Pass |
| Partial coverage surfaced | Pass |
| Previous-period post count | Pass |
| Truncated feed marks sync partial | Implemented; requires a provider run to verify in production |
| Duplicate ingestion idempotent | Pass by existing upsert key + latest-observation test |
| Full archive only on request | Pass |
| Requested-period coverage is reported separately from connectivity | Pass (`lib/analytics/website/coverage.ts`, `coverageWarning`) |
| Failure message includes correlation id | Pass |
| No zero when retrieval failed | Preserved and tested by existing error contract |

---

## 6. Production verification

Not performed in this environment:

- No Vercel token or project id.
- No Supabase URL/service-role key exported.
- `next build` is killed by the container during the production build (exit 137). `tsc --noEmit` and the full Jest suite are the available gates here.

Before deploying, the following must be run in the real environment:

1. Apply `migrations/2026-12-05_pierrot_structured_responses.sql`.
2. Deploy `main`.
3. Confirm the Vercel deployment SHA equals the merged commit.
4. Run a Bluesky manual sync and compare `analytics_sync_runs.status` with `details.truncated`.
5. Ask “Покажи статистику Bluesky” and verify profile/period/archive separation.
6. Ask “Что я сегодня делал?” and verify the Context Engine answer has a timeline.
7. Reload the conversation and verify structured blocks are restored.
8. Ask for a graph and a diagram and verify rendered components, not prose.
9. Check `/admin/pierrot` on desktop, iPad portrait/landscape and mobile.
10. Verify no new runtime errors with `vercel logs`.

---

## 7. Changelog

### Added

- `metadata` persistence for structured responses + rollback migration.
- `source`, `warning`, `progress`, `project_status` blocks and renderer support.
- Context Engine presentation builder.
- Turn orchestrator with explicit route reasons.
- Reporting periods: today, yesterday, this/last week, this/previous year, all time.
- Bluesky lifetime/period/archive contract.
- Regression tests for intent, presentation, analytics semantics, persistence and viewport.
- Correlation ids for analytics report failures.
- Feedback categories for rendering, analytics, period and performance failures.

### Changed

- Owner workspace and public chat both use `PierrotResponseRenderer` when a validated response exists.
- Context reports now return structured blocks alongside Markdown.
- Bluesky sync stops on known posts, marks truncated runs partial and stores feed metadata.
- Graph/diagram requests produce real components from retrieved evidence or an explicit insufficiency warning.

### Preserved

- Existing site design and typography.
- Markdown fallback for all historical messages.
- Telegram, human presence, commercial and Media Archive paths.
- Owner-only access checks and service-role boundaries.
