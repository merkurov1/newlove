# Pierrot deep conversation and routing audit

Date: 2026-11-06

## A. Общая оценка

Production использует один основной backend для сайта и PWA: `POST /api/pierrot-web`. Telegram также адаптируется к этому route через `/api/pierrot`. Однако внутри `/api/pierrot-web` до этого аудита существовали два независимых решения о web search:

1. `buildPierrotExecutionPlan()` / `queryUnderstanding` классифицировали intent и выставляли `queryPlan.sources.web`.
2. `decideWebSearch()` принимал детерминированное решение `shouldSearch`.

Фактический вызов Exa использовал OR между ними. Поэтому классификатор intent мог запустить поиск после того, как web-decision уже запретил его. Это подтверждено production events, а не только тестами.

Исправление внесено локально и покрыто route-тестом. Production пока не обновлён.

## B. Найденные проблемы

### P0 — web search выполнялся вопреки решению маршрутизатора

Production conversation `c22d98e0-9773-41af-982c-b7048a8a893b`:

- user message `60ad2e14-92e1-43f7-92dc-949f8eda1026`: «Итак, посмотри в памяти, что на сегодня?»
- assistant event `f21b8387-9063-4b8a-bde4-9cf4c7ba3e1e`
- `requires_web=false`, но `web_requested=true`, `web_reason=current_events`, 5 web sources.

Причина в коде была прямой:

```ts
queryPlan.sources.web || webDecision.shouldSearch;
```

`queryUnderstanding` распознавал слова «сегодня»/«что происходит» как внешний current-events intent. Детерминированный `decideWebSearch()` мог запретить поиск, но его veto не имел приоритета.

Классификация: Unnecessary tool call, Wrong routing, Source attribution issue. Серьёзность: P0 — приватный вопрос о собственном состоянии получал внешние источники и расходовал Exa.

### P0 — вопрос об источниках запускал новый web search

В той же conversation:

- user message `6e874162-a388-4818-ad36-df0bad449a77`: «А что за источники в ответе?»
- assistant event `2b539ed5-403f-4724-bff9-c659ce2e5354`
- `requires_web=false`, `web_requested=true`, `web_reason=verification`, 5 sources.

Косвенная причина та же: history inheritance превращала текущий follow-up в старый `web_research`, после чего `queryPlan.sources.web` обходил `conversation_meta` veto.

Классификация: Unnecessary tool call, Conversation continuity issue, Source attribution issue. Новый поиск не отвечал на вопрос о происхождении уже показанных ссылок.

### P0 — личный вопрос владельца смешивался с внешними событиями

Conversation `238c84c1-ca35-4e9f-9f82-91cf1ae12ed3`:

- user message `d37b775a-80e2-4d96-94a6-bb7e06b5cbe4`: «Как у меня дела? Что происходит? Какие планы на день?»
- assistant event `88317762-8c6b-41c3-9fcd-a379e7c9b59f`
- `requires_web=false`, `web_requested=true`, `answer_sources=brain+web`, 5 sources.

На production запрос пришёл из `/admin/pierrot`, но был сохранён с `mode=site`. В route `ownerMode` был false, а web decision поэтому не применял owner-specific internal-state rules. Одновременно intent classifier считал «что происходит» current events.

Исправление использует серверно подтверждённый owner identity для web-routing даже при выбранной public persona. Явные внешние команды (`найди последние новости`, `проверь в интернете`) по-прежнему имеют приоритет.

### P1 — production и GitHub/локальный Git расходились

- GitHub `main`: `d2f594829d8c775c3dc4d02a54d1d40019941047`.
- Vercel latest production deployment: `dpl_99wnbzLNzfUwTAunZNoTkCLFCnyP`, commit `d2f5948`.
- Local repository at audit start: stabilization commit `425153e3e91ccc7e7fb39f42f28bfa09c6bf803c`.
- New routing fix is local only and has not been deployed.

The production bug was therefore real in the deployed `d2f5948`, not a stale local-code artifact.

### Наблюдения без подтверждённого P0

- Conversation `68ab24f6-5b16-4d3f-99ef-a8d866830a3f`, user message `380009e6-8388-4e38-a1b1-cbe85cfab18c`, «перечисли все технические задачи которые есть»: event showed `web_requested=false`, `answer_sources=model`. This is a Correct routing result, although the answer was generated from model/context rather than an explicitly labelled Memory source.
- Conversation `938e0fe7-5a2b-4f45-9260-85262c5dbeba` shows continuity for a reminder and later technical-task listing. Events did not invoke web. The available excerpt does not prove whether every item was retrieved from Memory or reconstructed by the model, so this is not marked as a Memory correctness failure.
- Conversation `96265f6d-5ef7-4aa2-9d90-46672f121c9b` explicitly asked «Поищи про меня в интернете» and received a web-unavailable response in an earlier deployment. This is not an unnecessary-search finding; it is an external-provider availability case.

## C. Фактическая маршрутизация

```text
HTTP request
  -> /api/pierrot-web
  -> server identity + consent + mode
  -> normalize bounded history
  -> understandPierrotQuery()
  -> buildPierrotExecutionPlan()
  -> owner tools / memory / Brain / Media early branches
  -> decideWebSearch()
  -> webRequested
  -> searchWebEvidence() when true
  -> Brain retrieval and web retrieval
  -> model prompt assembly
  -> evidence guard
  -> deterministic Sources section
  -> persistence + assistant_replied event + response/SSE
```

The broken boundary was between `buildPierrotExecutionPlan()` and `decideWebSearch()`. `queryPlan.sources.web` was an intent hint, but was treated as an executable permission. After the fix, only `decideWebSearch().shouldSearch` can start Exa.

Relevant verification events are `message_sent`, `brain_retrieval`, `assistant_replied`; the latter records `requires_web`, `web_requested`, `web_reason`, `web_outcome`, source count and answer source mode.

Website and PWA both call `/api/pierrot-web`. The owner workspace has its own `ChatWorkspace` client but uses the same route. The global `PierrotContext` also uses the same route and can send `mode=site`; this was the reason verified owner identity had to be supplied to web routing independently of persona mode.

## D. Исправления

Changed files:

- `app/api/pierrot-web/route.ts`
  - `webRequested` now requires `webDecision.shouldSearch`.
  - Removed `queryPlan.sources.web` as an independent Exa execution path.
  - Web routing receives server-verified owner authorization, not only the selected persona mode.
- `lib/knowledge/web/searchDecision.ts`
  - Expanded deterministic internal owner-state patterns for personal status, plans and project-state questions.
  - Explicit external/news/verification signals remain higher priority.
- `app/api/pierrot-web/__tests__/route.test.ts`
  - Added regression coverage for inherited web intent plus an explicit web veto, including `mode=site`.
- `lib/knowledge/web/__tests__/searchDecision.test.ts`
  - Added current owner-state and project-state examples.

No database, memory records, prompts, provider settings, deployment configuration, secrets or external services were changed.

## E. Проверки

Passed:

- Pierrot route/search decision focused suite: 160 tests.
- Pierrot route, search-decision, web-context and execution-plan suites: 4 suites, 199 tests.
- Full Jest suite: 267 suites, 1,799 tests, exit 0.
- TypeScript: `npx tsc --noEmit`, exit 0.
- ESLint on changed source files: 0 errors; files are currently ignored by the repository's broad ignore rules.
- Production build: `npm run build`, exit 0. The sandbox could not resolve Google Fonts during the build, so Next.js emitted font-fetch warnings and continued with its fallback behavior.
- Production data inspection through read-only Supabase SQL.
- Vercel deployment inspection and GitHub commit search.

No production control query was issued that changes data. No production deployment was performed.

## F. Что осталось

- Deploy the fix and repeat the three production control questions:
  - «Итак, посмотри в памяти, что на сегодня?»
  - «Как у меня дела? Что происходит? Какие планы на день?»
  - «А что за источники в ответе?»
- Verify events show `web_requested=false`, `web_source_count=0`, and no Exa invocation for those turns.
- Verify explicit external prompts still show `web_requested=true` and source-backed responses.
- Decide whether the API should expose Memory as a separate answer-source label. Current `answerSources` distinguishes `model`, `brain`, `web`, and `brain+web`; private Memory is injected into the owner prompt but is not separately labelled. This is a product/API decision, not required to fix the confirmed web-routing bug.
- Investigate older conversations with high `routed_web_turns` after deployment if the new event data shows residual anomalies.

## G. Production status

- Production deployment inspected: `dpl_99wnbzLNzfUwTAunZNoTkCLFCnyP`.
- Production commit: `d2f594829d8c775c3dc4d02a54d1d40019941047`.
- GitHub `main` at inspection: `d2f594829d8c775c3dc4d02a54d1d40019941047`.
- Local fix: not deployed.
- Real production events: confirmed the three unnecessary-search cases above.
- Post-fix production events: not yet available; the fix is not considered production-verified.
