# Pierrot Regression Report

**Date:** 2 November 2026  
**Repository:** `merkurov1/newlove`  
**Scope:** owner-facing routing, Brain/Media/Web evidence, feedback linkage, visitor-facing regression safety.

---

## 1. Result

| Check | Result |
|---|---|
| Full Jest suite | **157 / 157 suites, 1073 / 1073 tests passed** |
| Targeted Pierrot + Brain + Web + analytics suite | **47 / 47 suites, 463 / 463 tests passed** |
| TypeScript (`tsc --noEmit`) | New/changed production files: **clean**. Repository has pre-existing type errors only in old test mocks (`lib/ai/__tests__`, `lib/flow/__tests__`, route test mock helpers). |
| Production build (`npm run build`) | **PASS** (compile, typecheck, static generation) |
| External services in tests | None. Web, Brain, Media, LLM and Supabase stores are mocked. |
| Production DB writes | None during this report. Read-only queries only. |

Reproduce:

```bash
npx jest --runInBand --forceExit
npx tsc --noEmit
npm run build
```

> Jest may report an open handle from the existing animation/timer setup and a haste-map collision with `.next/standalone/package.json` after a build. Both are pre-existing environment artefacts, not test failures.

---

## 2. Required scenario matrix

### A. Weekly Review

| Step | Input | Expected intent | Actual intent | Expected tools | Actual tools | Source status | Context used |
|---|---|---|---|---|---|---|---|
| A1 | «Найди Weekly Review» | `document_lookup` | `document_lookup` | Brain title lookup | `findBrainDocumentByTitle` → owner chunks | brain `success` | yes |
| A2 | «Не то! Найди Weekly Review в Brain» | `document_lookup` | `document_lookup` | Brain title lookup | Brain title lookup | brain `success` | yes |
| A3 | «Я имею в виду документ в Brain, а не коммерческую статистику» + history | `document_lookup` | `document_lookup` (history title inherited) | Brain title lookup | Brain title lookup | brain `success` | yes |
| A4 | Document absent | `document_lookup` | `document_lookup` | honest not-found | deterministic owner reply, no model/Commercial | brain `empty` | no |
| A5 | Correction after wrong tool | previous document remains target | no `owner_tool=commercial` | Brain | Brain | success/empty | yes |

Assertions in `app/api/pierrot-web/__tests__/route.test.ts`:

- `routs a named Weekly Review document to Brain, never to Commercial`
- `reports a missing named document honestly instead of substituting statistics`
- `applies an explicit correction across messages without pinning Commercial`
- `does not hijack a document named Weekly Review` in `lib/pierrot/__tests__/commercialQuestion.test.ts`

### B. Biography

Input: «Расскажи мою биографию».

| Field | Expected | Actual |
|---|---|---|
| Intent | `biography` | `biography` |
| Tools | Brain biography retrieval | Brain retrieval |
| Graph Stats | not used | not used |
| Commercial | not used | not used |
| Empty Brain | explicit limitation | `source_status.brain=empty`, deterministic disclosure |
| Invented characteristics | blocked/limited | prompt + evidence guard |

Tests:

- `routes biography to Brain, not Graph Stats`
- `does not treat biography as a graph request` (regression for `граф` inside «биографию»)
- `uses biography retrieval without Graph Stats or invented characteristics`
- `does not present personal material as grounded when Brain is empty`

### C. Public mentions

Input: «Найди СМИ и каналы, которые цитировали меня за последний месяц».

| Field | Expected | Actual |
|---|---|---|
| Intent | `media_mentions` | `media_mentions` |
| Sources | Media + Web | Media + Web requested |
| Period | last 30 days | `last_30_days` |
| Web unavailable | honest limitation | Web status `unavailable` |
| Media empty | honest limitation | Media status `empty` |
| Invented outlets/URLs | removed | `https://fake.example` and «Le Monde» claim replaced by safe message |

Tests:

- `routes media mentions to Media and Web with a period`
- `does not claim media results when web is unavailable and media is empty`
- `removes an invented URL even when web evidence exists`
- `filters latest coverage by the requested period`

### D. Week analysis

Input: «Как у меня дела за последнюю неделю?».

| Field | Expected | Actual |
|---|---|---|
| Intent | `personal_analysis` | `personal_analysis` |
| Period | last 7 days | `last_7_days` |
| Brain | required | required |
| Old materials | not silently treated as current | period filter + disclosure on timeout/empty |
| Brain timeout | honest limitation | `source_status.brain=timeout` + disclosure |

Tests:

- `detects a strict current-week period and personal analysis`
- `marks a Brain timeout and discloses the limitation`
- `records the embedding stage when the overall timeout aborts it`

### E. iOS / project

Input: «Как продвигается моё iOS-приложение?».

| Field | Expected | Actual |
|---|---|---|
| Intent | `project` | `project` |
| Brain | project context | Brain requested |
| Analytics | not used | not used |
| Commercial | not used | not used |

Tests:

- `routes an iOS question to project context without Analytics`
- `uses project context for an iOS question without Analytics`

### F. Commercial

Input: «Покажи продажи, подписки и донаты».

| Field | Expected | Actual |
|---|---|---|
| Intent | `commercial` | `commercial` |
| Owner tool | `commercial` | preserved |
| Existing explicit commercial questions | still recognised | all existing tests pass |

Tests:

- `keeps commercial requests commercial`
- all original cases in `lib/pierrot/__tests__/commercialQuestion.test.ts` and `ownerTools.test.ts`

### G. General questions

Input: «Кто такой Махатма Ганди?».

| Field | Expected | Actual |
|---|---|---|
| Intent | `general` | `general` |
| Personal Brain context | not requested | `source_status.brain=not_requested` |
| Web | may be used | requested by factual decision |
| Answer | normal general answer | model answer |

Tests:

- `keeps general knowledge free of personal Brain context`
- `answers a general factual question without personal Brain context`
- existing public `Who is Mark Rothko?` web tests remain green.

### H. Unavailable sources

| Simulated failure | Expected | Actual |
|---|---|---|
| Web unavailable | no found-publications claim; no invented URL | evidence guard replaces/redacts |
| Web empty | honest "no verified results" | `web_status=empty` |
| Brain timeout | no claim of Brain grounding | `brain_status=timeout`, disclosure |
| Brain empty | no claim of personal material | `brain_status=empty`, disclosure |
| Media error/empty | no invented outlets | `media_status=empty/unavailable`; safe media message |
| Brain disabled by flag | `unavailable` + no retrieval call | preserved existing contract |

Tests:

- `blocks a claim of found publications when the web search failed`
- `does not present personal material as grounded when Brain is empty`
- `adds a Brain limitation when the answer is otherwise safe`
- `marks a Brain timeout and discloses the limitation`
- `honours PIERROT_RAG_ENABLED=false and never calls retrieval`
- `returns an honest no-match owner response without sources`

---

## 3. Source status contract exercised by tests

`lib/pierrot/evidence.ts`:

- `success`
- `empty`
- `unavailable`
- `timeout`
- `error`
- `not_requested`

Tests assert that `no_match !== unavailable`, `timeout !== empty`, and `missing_api_key !== no_results`.

## 4. Dialogue correction sequences

`lib/pierrot/__tests__/queryUnderstanding.test.ts` covers:

- explicit document correction;
- inherited document title from history;
- short follow-up inheritance only when the current message does not establish a new intent;
- topic change does not keep an old tool.

`app/api/pierrot-web/__tests__/route.test.ts` covers the real production sequence:

1. «Найди Weekly Review» → Brain;
2. «Я имею в виду документ в Brain, а не коммерческую статистику» → still Brain, never Commercial.

## 5. Feedback trace

`components/pierrot/__tests__/PierrotNavigation.test.tsx` asserts that the feedback event uses `assistantMessageId` returned by the server, not a fresh browser-generated id.

Server-side `app/api/pierrot/events/route.ts` enriches `answer_feedback` with a compact `trace` from `assistant_replied` and `brain_retrieval`:

- `intent`
- `owner_tool`
- `deterministic`
- `provider`
- `answer_sources`
- `web_outcome`, `web_code`, `web_source_count`
- `source_status`
- `evidence_warnings`
- `brain_outcome`, `brain_code`, `brain_timings`
- `document_title_matched`, `document_match_type`

This is additive and uses the existing `pierrot_events` table. No schema migration was required.

## 6. Visitor-facing regression

The following existing visitor tests remain green:

- public identity answers stay in the third person;
- public mode never exposes owner profile or owner Brain;
- public media uses metadata/verified quotes only;
- public web citations render only from actual Exa sources;
- ordinary conversation does not trigger web search;
- deterministic commerce, service inquiry and navigation flows are unchanged.

## 7. Production data checks performed (read-only)

- Confirmed `doc_text_450a71a0b1d4a21295a3aaac6b7c9c76` exists, `ingestion_status=completed`, 9 owner chunks.
- Confirmed `ilike('%Weekly Review%')` returns exactly that document.
- Confirmed its 9 chunks are readable by owner scope.
- Confirmed the production conversation contains three deterministic 3074-character Commercial replies for the Weekly Review turns.
- Confirmed 14 `answer_feedback` events and that all historical `message_id` values cannot be joined to stored messages (fixed for new feedback; historical rows remain unlinked).

## 8. Remaining test gaps

1. No live Exa call in the suite; web success is simulated. Production currently records **0 successful web outcomes**, so the first real success still needs a production check after enabling/verifying `PIERROT_WEB_SEARCH_ENABLED` and `EXA_API_KEY`.
2. No live Supabase call in Jest; title lookup is covered by pure ranking tests plus an owner-scoped read-only production query. Route tests mock the store.
3. Historical feedback rows cannot be repaired because their original `message_id` values were never stored as assistant message ids. New feedback is linked correctly.
4. A real browser/Telegram end-to-end check is required after deployment.

---

## 9. Commands and environment

```bash
# unit/integration/regression
npx jest --runInBand --forceExit

# focused
npx jest lib/pierrot lib/knowledge/rag lib/knowledge/web \
  app/api/pierrot-web app/api/pierrot/events \
  lib/analytics/__tests__/pierrotIntelligence.test.ts \
  --runInBand --forceExit

# typecheck / build
npx tsc --noEmit
npm run build
```

No production data, schema, env, cron, worker, model routing or Vercel configuration was changed by the test run.
