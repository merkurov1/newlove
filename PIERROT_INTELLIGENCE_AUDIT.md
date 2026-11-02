# Pierrot Intelligence — аудит архитектуры и production-ошибок

**Дата аудита:** 2 ноября 2026  
**Репозиторий:** `merkurov1/newlove`, рабочая директория `/workspaces/newlove`  
**Ветка:** `main`, HEAD `56e74e19`  
**Режим:** read-only. На этом этапе не изменялись production-код, схема Supabase, env, cron, workers и Vercel-конфигурация.

> **Важно о live-данных.** Production-база менялась во время аудита. Все числа ниже — снимок на момент запросов (2 ноября 2026, после 17:26 UTC). Их нужно перепроверять перед каждым релизом. В частности, в исходной постановке было 8 feedback-оценок и 24 Brain retrieval; в фактическом снимке уже **14 оценок** и **47 Brain retrieval**.

---

## 1. Что реально установлено

### 1.1. Фактическая схема прохождения сообщения

```text
Browser (components/pierrot/PierrotContext.tsx)
  │  POST /api/pierrot-web  { message, history, conversationId, sessionId, userMessageId, consent, mode }
  ▼
app/api/pierrot-web/route.ts
  ├─ rate limit, validation, consent, language
  ├─ identity: getCurrentUser / Telegram owner / verified admin credential
  ├─ ownerMode = verified owner && mode !== 'site'
  ├─ normalize history (max 24 items / 16k chars)
  ├─ ensure conversation, human-takeover checks
  ├─ classifyPierrotIntent(message)          ← public commercial intent only
  ├─ planPierrotResponse(...)                ← deterministic commercial plan
  ├─ if ownerMode:
  │    ├─ URL intake (explicit URL / confirmation)
  │    ├─ detectOwnerTool(message)           ← commercial / stats / graph / analytics / ...
  │    └─ runOwnerTool(...)                  ← deterministic early return
  ├─ decideWebSearch({ message, history })   ← web query starts in parallel
  ├─ if useModel:
  │    ├─ buildBrainQueryPlan(message)
  │    ├─ isMediaArchiveQuery(message) ? Media retrieval
  │    ├─ public RAG (visitors) or owner Brain retrieval
  │    ├─ buildWebEvidencePrompt(...)
  │    └─ callPierrotModel(...)              ← Gemini → DeepSeek → OpenRouter
  ├─ append assistant message + assistant_replied event
  └─ recordPierrotRetrieval(...)             ← brain_retrieval event
  ▼
Browser renders reply; feedback `yes/no` → POST /api/pierrot/events
```

Telegram (`app/api/pierrot/route.ts`) — тонкий адаптер: загружает историю из `pierrot_messages`, вызывает `/api/pierrot-web` server-to-server и передаёт `x-telegram-owner-id` для allowlisted owner. Отдельного Telegram AI-пайплайна нет.

### 1.2. Компоненты и их реальные роли

| Компонент | Файл / функция | Кто вызывает | Условия | Вход | Выход | Ошибки | Признак результата |
|---|---|---|---|---|---|---|---|
| Публичный intent | `lib/pierrot/intents.ts` → `classifyPierrotIntent` | `/api/pierrot-web` | всегда, до модели | текущее сообщение | `PierrotIntent` | нет throw; rule-based | `name`, `confidence`, `signals` |
| Commercial plan | `lib/pierrot/commercial.ts` → `planPierrotResponse` | `/api/pierrot-web` | не owner | intent, history, runtime, page | deterministic reply / CTA / `useModel` | ошибки runtime не критичны | `plan.useModel`, `plan.reply` |
| Owner tools | `lib/pierrot/ownerTools.ts` → `detectOwnerTool`, `runOwnerTool` | `/api/pierrot-web` | owner mode | текущее сообщение | `OwnerToolRequest` | `runOwnerTool` ловит ошибку и возвращает текст | наличие `ownerTool` |
| Commercial analyst | `lib/pierrot/commercialQuestion.ts` → `detectCommercialQuestion`; `commercialIntelligence.ts` → `answerPierrotCommercialQuestion` | `detectOwnerTool` / owner tool | owner + совпадение правил | сообщение | `CommercialQuestion`, готовый отчёт | SQL/чтение ошибок частично собирается в `PeriodData.errors` | `detectCommercialQuestion !== null` |
| Brain query plan | `lib/knowledge/rag/queryRouting.ts` → `buildBrainQueryPlan` | route / retrieval | owner Brain | текущее сообщение | `BrainQueryPlan` | нет throw | `requestedSources`, `intent`, `publishedFrom/To` |
| Brain retrieval | `lib/knowledge/rag/brainRetrieval.ts` → `retrieveBrainEvidence` | `retrieveBrainEvidenceWithRefinement` | `PIERROT_RAG_ENABLED=true`, owner | query, plan, scope | `BrainRetrievalResult` | все исключения → `emptyResult(...,'unavailable', code)` | `outcome === 'relevant_results'` и `hits.length > 0` |
| Brain refinement | `lib/knowledge/rag/pierrotRetrieval.ts` → `retrieveBrainEvidenceWithRefinement` | route | owner Brain v2 | query + retrieve callback | refined result | ошибки первого шага прекращают refinement | `attempts`, `attemptLog` |
| Media retrieval | `lib/knowledge/rag/mediaEvidence.ts` → `retrieveMediaEvidence` | route | `isMediaArchiveQuery(message)` | query, limit, ownerAccess | `MediaEvidenceResult` | semantic ошибка → lexical fallback; outer catch → `unavailable` | `outcome`, `hits` |
| Web search | `lib/knowledge/web/searchDecision.ts` → `decideWebSearch`; `exaSearch.ts` → `searchWebEvidence` | route | `useModel` + decision | message | `WebSearchDecision`, `WebSearchResult` | всегда структурированный `unavailable`/`no_results` | `outcome === 'relevant_results'` |
| LLM | `lib/pierrot/model.ts` → `callPierrotModel` | route | `useModel` | system prompt + history | reply/provider/model | Gemini → DeepSeek → OpenRouter | успешный provider |
| Persistence | `lib/pierrot/serverStore.ts` | route / events API | consent | ids, text, event | message/event rows | best-effort, `persistenceFailure` | `appendPierrotMessage`, `recordPierrotEvent` |
| Feedback | `components/pierrot/PierrotConversation.tsx` → `AnswerFeedback`; `/api/pierrot/events` | браузер | consent granted | `message_id`, rating | `answer_feedback` event | 204 / 400 | событие записано |

### 1.3. Разделение owner / visitor

- `ownerMode` определяется **только** server-side identity: реальный ADMIN user, allowlisted Telegram owner + internal secret, либо verified credential. `x-admin-key` сам по себе owner-режим не открывает.
- Public visitor никогда не входит в owner Brain branch; public RAG включается отдельным флагом `PIERROT_PUBLIC_RAG_ENABLED`.
- Commercial planner и deterministic CTA работают только в public mode. В owner mode коммерческий prompt и CTA подавляются.
- Owner tools выполняются **до** Brain и до web search. Это и есть главный конфликт приоритетов, приведший к ошибке Weekly Review.

---

## 2. Production evidence

### 2.1. Воспроизводимая ошибка Weekly Review

Документ:

- `id`: `doc_text_450a71a0b1d4a21295a3aaac6b7c9c76`
- title: `Anton Merkurov — Weekly Review`
- `ingestion_status`: `completed`
- `chunk_count`: 9, все chunks `access_class=owner`, `embedding_model=baai/bge-m3`
- `published_at`: `null`
- `source_type`: `text`

Conversation: `94e2914c-826d-4c32-81d6-7c2415ad2477`  
Session: `b1749f51-50b2-463c-be2f-f24fdca39b2f`

Фактические сообщения:

| # | Роль | Текст / длина | Ответ / событие |
|---|---|---|---|
| 1 | user | «Как у меня дела на этой неделе?» (31) | Gemini, 847 символов, `answer_sources=brain`, `web_outcome=unavailable` |
| 3 | user | «Там weekly в базе появился!» (27) | Gemini, 246 символов, `answer_sources=brain` |
| 5 | user | «Найди Weekly Review» (19) | **provider=null, owner_tool=commercial, deterministic=true**, 2962 |
| 7 | user | «Отлично! Перескажи коротко по русски — это будет твой ответ на вопрос как у меня дела» | Gemini, 491 |
| 9 | user | «Стоп! Не то! Это статистка продаж. Как дела — это Weekly Review в brain — переведи что там и коротко ответь» (107) | **provider=null, owner_tool=commercial, deterministic=true**, 3074 |
| 11 | user | `be61ce7a-15d2-478a-874f-f6207f3c868f`: «Не то! Найди Weekly Review В brain и сделай краткий перевод на русский» (70) | **provider=null, owner_tool=commercial, deterministic=true**, 3074 |
| 13 | user | `e9c7ff42-4f42-4564-a300-16e862adc42f`: развёрнутый запрос «Найди в Brain документ с точным названием…» (416) | **provider=null, owner_tool=commercial, deterministic=true**, 3074 |

Все три commercial-ответа побайтно совпадают по длине 3074 и содержат один и тот же отчёт «Period: last seven days… Attributed to Pierrot…».

**Причина:** `detectCommercialQuestion()` в `lib/pierrot/commercialQuestion.ts` считает фразу `weekly review` признаком коммерческого weekly-отчёта:

```ts
const weeklyReview =
  /(как у нас дела|итоги недели|недельн[а-яё]*\s+отчет|weekly review|weekly report|how are we doing)/.test(text);
```

`detectOwnerTool()` вызывает `detectCommercialQuestion()` **раньше** Brain-ветки и до любого анализа документа. В результате «Найди Weekly Review» → `commercial`, `answerPierrotCommercialQuestion` → полный коммерческий отчёт. Уточнения «не то», «в Brain», «точное название» ничего не меняют, потому что каждое новое сообщение снова содержит `weekly review`.

**Дополнительно установлено:** в conversation state ошибочный `owner_tool` **не сохраняется**. В `pierrot_conversations` нет полей intent/owner_tool, а каждый запрос классифицируется заново только по текущему тексту. Ошибка повторяется не из-за «залипшего» state, а из-за повторного срабатывания того же правила на каждом уточнении.

### 2.2. Brain retrieval: фактические цифры

События `brain_retrieval` за весь доступный период:

| Метрика | Значение |
|---|---:|
| Всего | 47 |
| `relevant_results` | 38 |
| `unavailable` (все `code=timeout`) | 8 |
| `no_match` | 1 |
| `brain_v2` | 42 |
| `media` | 3 |
| без mode (legacy) | 2 |
| медианная latency | **1680 ms** |
| максимальная latency | 4151 ms |
| latency таймаутов | **2500–2504 ms** (ровно `BRAIN_RAG_TIMEOUT_MS = 2500`) |

Таймауты: 8 из 47 ≈ **17%**. Все они завершились на 2.5 s с `candidate_count=0`, `chunk_count=0`, `top_similarity=null`. Это означает, что сигнал обрывается **до получения кандидатов** — либо на embedding-запросе к OpenRouter, либо на abort внутри `withAbort`. Точное разделение «embedding vs SQL» сейчас не логируется: `latencyMs` общий, отдельных stage timings нет.

### 2.3. Web search фактически не даёт успешных результатов

В 190 событиях `assistant_replied`:

| `web_outcome` | Количество |
|---|---:|
| `undefined` (web не запрашивался) | 167 |
| `unavailable` | 4 |
| `null` (web decision был, результата нет) | 19 |
| `relevant_results` | **0** |

Ни одного успешного web-источника, ни одного `web_source_count > 0`. При этом в production-конфигурации, доступной из `.env.production.local`, отсутствуют `PIERROT_WEB_SEARCH_ENABLED` и `EXA_API_KEY` (есть только в `.env.example`). В событиях не сохраняется `web.code`, поэтому нельзя отличить `disabled`, `missing_api_key`, `timeout` и `http_error`. Это подтверждённая проблема наблюдаемости.

Пример ложного впечатления о поиске:

- user: «А в интернете научился искать? Кто такой махатма Ганди»
- event: `web_outcome=unavailable`
- answer: «Искать умею, но контекст у нас свой…» + интерпретация из Substack + общие знания.
- Ответ не сообщает, что внешний поиск недоступен, и не отделяет общие знания от личных материалов.

### 2.4. Brain не находит контекст, но модель отвечает как будто нашла

Пример из того же conversation, сообщение 1:

- Brain вернул `relevant_results` из `personal_writing` и `other` (6 документов, top similarity 0.638).
- На вопрос «Как у меня дела **на этой неделе**?» ответ говорит «Из того, что ты сам описывал в своих текстах за последнее время…», описывает «режим ожидания и лёгкого раздражения», «интеллектуальное одиночество».
- В запросе нет периода в `BrainQueryPlan`: `parseTimeRange()` не распознаёт «на этой неделе», поэтому retrieval не фильтрует по дате.
- Следующий ответ прямо говорит: последняя запись Substack — 10 августа. То есть старые материалы были представлены как актуальное состояние.

Это одновременно:
1. ошибка temporal relevance;
2. необоснованная психологическая интерпретация;
3. отсутствие разделения «что подтверждено» / «что является выводом».

### 2.5. Feedback не связан с ответом

Снимок: 14 событий `answer_feedback` (5 up, 9 down). У всех 14 `payload.message_id` **не найден** в `pierrot_messages` и не имеет соответствующего `assistant_replied` event.

Причина в клиенте: `components/pierrot/PierrotContext.tsx` при получении ответа вызывает `appendMessage({ role: 'assistant', ... })` **без** `id`, поэтому `appendMessage` генерирует новый локальный `createPierrotId()`. Серверный `assistantMessageId` из ответа API игнорируется. `AnswerFeedback` отправляет именно этот локальный id.

Следствие: сейчас невозможно восстановить по feedback исходный запрос, ответ, intent, owner_tool, источники и ошибки. Данные feedback есть, но связь с причиной ответа потеряна.

### 2.6. Прочие production-наблюдения

- `assistant_replied`: 190 событий; 24 deterministic, 40 с `provider=null` (owner tools + deterministic replies).
- Owner tools в production: `commercial` 6, `stats` 7, `rag` 4, `research` 2, `brain` 1, `graph` 1, `analytics` 1.
- `assistant_failed`: 2 события, оба `ai_unavailable`.
- В `brain_retrieval` для media branch (`mode=media`) поле `selected_sources=['media_coverage']`, но `used_context` зависит от media outcome.
- `media` retrieval не фильтрует по периоду: «последние СМИ за месяц» возвращает последние записи архива, но не проверяет, что они попадают в месяц.
- Web search запускается параллельно Brain, но при `unavailable`/`no_results` в prompt **не передаётся статус**. `buildWebEvidencePrompt()` возвращает `null`, поэтому модель вообще не знает, что поиск не удался.

---

## 3. Карта маршрутизации (фактическая)

### 3.1. Порядок приоритетов в `/api/pierrot-web`

1. Rate limit / validation / consent.
2. Human takeover.
3. Public commercial intent (`classifyPierrotIntent`) + service inquiry.
4. Commercial planner (`planPierrotResponse`).
5. **Owner URL intake** (explicit URL).
6. **Owner tools** (`detectOwnerTool` → commercial, research, diagnostics, graph, rag, brain, analytics, stats).
7. Web decision (parallel).
8. Media branch, если `isMediaArchiveQuery`.
9. Public RAG или owner Brain.
10. Web evidence prompt.
11. LLM.
12. Persistence / feedback.

Главный конфликт: шаг 6 стоит выше шага 8–9. Любое слово, попавшее в `detectOwnerTool`, отменяет Brain, Media и Web.

### 3.2. Что может быть ошибочно перехвачено

| Запрос | Фактический перехват | Причина | Ожидаемо |
|---|---|---|---|
| «Найди Weekly Review» | `commercial` | `weekly review` в `detectCommercialQuestion` | Brain document lookup |
| «Weekly Review в Brain» | `commercial` | то же | Brain document lookup |
| «Как изменились мои взгляды?» / «Что изменилось?» | `commercial` | `wantsComparison` содержит `изменилось`; сравнение не требует коммерческого контекста | Brain views-over-time |
| «Что мне делать с рукописью?» | `commercial` | `wantsRecommendations` содержит `что мне делать` | Brain / project |
| «Покажи динамику моего письма» | `commercial` | `wantsComparison` содержит `динамик` | Brain / analysis |
| «Покажи состояние Brain» | `brain` (status), не поиск | owner tool `brain` — это status, не retrieval | Brain status (корректно для status) |
| «Что в Knowledge Graph?» | `graph` (status), не содержательный ответ | owner tool `graph` — counts | Graph status (корректно для status) |
| «Аналитика Pierrot за неделю» | `analytics` | явный analytics | Analytics (корректно) |
| «Сколько пользователей?» | `stats` | явный stats | Stats (корректно) |
| «Сколько подписчиков?» | `stats`, не commercial | `detectCommercialQuestion` не видит `подписчик` без Flow/new | Stats или Commercial — требует уточнения |
| «Как продвигается моё iOS-приложение?» | не перехватывается | нет правила | Project/Brain (сейчас просто model + Brain) |
| «Расскажи мою биографию» | не перехватывается | нет правила | Brain biography |

### 3.3. Обработка контекста диалога

- История передаётся в LLM (`normalizedHistory`) и в `decideWebSearch` (для follow-up).
- **Но** `classifyPierrotIntent`, `detectOwnerTool`, `buildBrainQueryPlan`, `isMediaArchiveQuery` используют **только текущее сообщение**.
- Нет переписывания follow-up в самостоятельный запрос: «А подробнее?», «А за прошлую неделю?», «Я имею в виду документ» не несут контекста в retrieval/plan.
- Нет механизма «пользователь исправил предыдущий выбор инструмента». Уточнение обрабатывается с нуля.
- Нет сохранения `intent`/`owner_tool` в conversation row, поэтому «залипания» state нет; но и коррекции нет.

---

## 4. Карта ошибок

### 4.1. Подтверждённые проблемы (есть код + production evidence)

| ID | Первопричина | Симптом | Файл / функция | Доказательство |
|---|---|---|---|---|
| C1 | Конфликт приоритетов handlers | «Найди Weekly Review» → Commercial | `lib/pierrot/commercialQuestion.ts` → `detectCommercialQuestion`; `lib/pierrot/ownerTools.ts` → `detectOwnerTool` | 3 ответа 3074 символа, `owner_tool=commercial`, `provider=null` |
| C2 | Неверное понимание intent | `weekly review` трактуется как коммерческий отчёт без коммерческого контекста | `detectCommercialQuestion` | тот же кейс |
| C3 | Неверное понимание intent | `изменилось` / `что мне делать` / `динамика` сами по себе включают Commercial | `detectCommercialQuestion` (`wantsComparison`, `wantsRecommendations`) | логика кода; требует теста/подтверждения на реальных запросах |
| C4 | Ошибочная маршрутизация | Owner tools выполняются раньше Brain/Media/Web | `app/api/pierrot-web/route.ts` (owner block до retrieval) | C1 |
| C5 | Недостаточная точность retrieval | Нет поиска по точному/частичному названию документа | `brainRetrieval.ts`, `queryRouting.ts` | документ Weekly Review не находится по title; `document_title` не участвует в lexical score RPC |
| C6 | Недостаточная точность retrieval | `parseTimeRange` не понимает «на этой неделе», «за последнюю неделю», «за последний месяц» | `queryRouting.ts` → `parseTimeRange` | ответ по старым Substack на вопрос о текущей неделе |
| C7 | Потеря контекста | follow-up/уточнение не переписывается в самостоятельный запрос | route + все intent-функции | «Не то! Найди Weekly Review» повторяет ошибку |
| C8 | Timeout | 2500 ms общий бюджет на embedding + SQL; 17% таймаутов | `lib/knowledge/rag/config.ts` (`BRAIN_RAG_TIMEOUT_MS`), `brainRetrieval.ts` | 8/47, latency 2500–2504 |
| C9 | Неверная обработка недоступных источников | При `web unavailable` статус не передаётся модели; ответ может звучать как успешный поиск | `lib/knowledge/web/webContext.ts` → `buildWebEvidencePrompt` возвращает `null` | 0 успешных web; ответ «Искать умею» |
| C10 | Необоснованные утверждения модели | Психологическая интерпретация старых текстов как текущего состояния | prompt + отсутствие post-check | ответ про «режим ожидания» на вопрос о неделе |
| C11 | Отсутствие связи feedback с причиной | `message_id` feedback не совпадает с сохранённым assistant message | `components/pierrot/PierrotContext.tsx` (`appendMessage` без id), `PierrotConversation.tsx` (`AnswerFeedback`) | 14/14 feedback не находятся в `pierrot_messages` |
| C12 | Наблюдаемость | Нет `web.code` в `assistant_replied`; нет stage timings Brain | route, `brainAnalytics.ts` | нельзя отличить disabled/missing/timeout; нельзя отделить embedding от SQL |
| C13 | Media period | «за последний месяц» не фильтрует media archive по дате | `mediaEvidence.ts` → `latestRecords` | код; исправлено и покрыто тестом |
| C14 | Ложное срабатывание graph tool | «Расскажи мою биографию» перехватывалось как `graph`, потому что `граф` — подстрока слова «биографию» | `ownerTools.ts` → regex `граф` | воспроизведено route-тестом; исправлено word-boundary паттерном |

### 4.2. Вероятные проблемы (код указывает, production-подтверждение частичное)

| ID | Проблема | Основание |
|---|---|---|
| P1 | Owner Brain запускается для **любого** owner-вопроса, включая общие («Кто такой Ганди»), и подмешивает личный контекст | route: owner branch без проверки «нужен ли Brain»; production-ответ по Ганди |
| P2 | Public/media ответы могут смешивать Media Archive и Web без явного разделения | media branch и web branch независимы; synthesis prompt включается только при Brain+Web, не Media+Web |
| P3 | `detectOwnerTool` не различает «покажи статус Brain» и «найди документ в Brain» | regex `brain` + `покажи/документ` → status tool |
| P4 | `detectOwnerTool` `stats` слишком широк: «Сколько подписчиков?» уходит в stats, хотя это может быть commercial | regex `сколько + подписчик` |
| P5 | Analytics tool включает `media archive` и `media intelligence`, пересекаясь с Media branch | `ownerTools.ts` regex |
| P6 | Commercial intelligence при частичных ошибках SQL может показывать неполные цифры как полные | `PeriodData.errors`, но отчёт не всегда явно отделяет ошибки |
| P7 | Brain refinement при `unavailable` не делает повторных попыток (правильно), но route не различает `timeout` и «нет данных» в ответе | `retrieveBrainEvidenceWithRefinement` + `buildUnframedUnavailablePrompt` |
| P8 | History обрезается до 24 items/16k; при длинном диалоге коррекция может потеряться | route normalization |

### 4.3. Гипотезы, требующие дополнительной проверки

| ID | Гипотеза | Как проверить |
|---|---|---|
| H1 | Timeout вызван преимущественно embedding-запросом OpenRouter, а не SQL | добавить stage timings; сравнить p50 embedding vs SQL |
| H2 | Часть web `null` — это `decideWebSearch=false`, а часть — `searchWebEvidence` вернул `null` из-за исключения | добавить `web_code` и `web_requested` в событие |
| H3 | Media archive не содержит публикаций за последний месяц, но `latestRecords` всё равно отдаёт старые | сравнить даты `media_archive_records` с границей периода |
| H4 | Owner profile/biography документ есть, но biography retrieval не находит его из-за фильтров source_type | прогнать `buildBrainQueryPlan('Расскажи мою биографию')` + фактические documents |
| H5 | Feedback «down» коррелирует с owner tools / web unavailable | после починки message_id построить join |
| H6 | Часть ответов с `provider=null` — это deterministic owner tools, а не ошибки | уже подтверждено для 24 deterministic; остальные 16 надо разобрать |

---

## 5. Целевая архитектура (минимальные изменения)

Не переписывать приложение. Ввести один слой понимания запроса и один слой evidence-контроля, которые используют существующие функции.

```text
message + history
  ▼
understandPierrotQuery()                    ← новый чистый модуль
  ├─ intent (document_lookup / biography / views_over_time /
  │         personal_analysis / media_mentions / web_research /
  │         brain_web_research / knowledge_graph / analytics /
  │         commercial / project / general)
  ├─ requested document title / partial title
  ├─ period (from/to) + temporal intent
  ├─ requested sources (brain/media/web/graph/analytics/commercial/project)
  └─ correction signals («не то», «в Brain», «я имею в виду…»)
  ▼
handler priority:
  1. explicit URL intake
  2. explicit slash command
  3. document lookup (Brain title/metadata)
  4. commercial (only with commercial context)
  5. analytics/stats/graph (only explicit)
  6. media (+ web if available)
  7. brain (+ web if combined)
  8. general model
  ▼
retrieval:
  Brain: title/metadata lookup → hybrid semantic/lexical → no-match
  Media: period-filtered archive → semantic/lexical
  Web: status-aware evidence prompt
  ▼
evidence ledger:
  source status success/empty/unavailable/timeout/error/not_requested
  + claim classification verified/inferred/historical/unverified
  ▼
generation
  ▼
deterministic post-check:
  false source claims / invented URLs / unsupported claims
  ▼
persist reply + trace + feedback-linked ids
```

### 5.1. Единый объект выполнения

Не создавать новую БД. Использовать существующие `pierrot_events` и `assistant_replied`:

- `source_status`: `{ brain, media, web }` со статусами;
- `brain_lookup`: `{ requested_title, matched_title, match_type, document_id }`;
- `web_code`;
- `brain_timings`;
- `feedback` связывается через `assistantMessageId`.

### 5.2. Приоритеты

1. Явно названный документ → Brain title lookup.
2. Явно коммерческий вопрос (`продажи`, `выручка`, `донаты`, `подписки`, `weekly sales report`) → Commercial.
3. Явный статус/диагностика (`/stats`, «состояние Brain», «граф») → соответствующий tool.
4. Media/Web — только если запрос про публикации/СМИ/внешние упоминания.
5. Brain — только если вопрос личный, биографический, проектный, аналитический или комбинированный.
6. Общий вопрос — model без личного контекста.

---

## 6. Минимальный план исправлений по приоритетам

### P0 — блокирующие ошибки

1. **Исправить commercial intent.** `weekly review` не должен быть коммерческим без коммерческого контекста; `изменилось`, `что мне делать`, `динамика` — только при наличии commercial-контекста.
2. **Ввести единый query plan** и использовать его для выбора handler до `detectOwnerTool`.
3. **Добавить точный поиск документа по title** (`knowledge_documents.title`) с exact/partial match и передачей `documentId` в retrieval.
4. **Исправить feedback id**: использовать `assistantMessageId` из ответа API для assistant message в клиенте.
5. **Не допускать ложных заявлений об источниках**: статус web/brain/media передаётся в prompt; post-check блокирует выдуманные ссылки/«найденные» результаты.

### P1 — точность и надёжность

6. **Temporal filtering**: «на этой неделе», «за последнюю неделю/месяц» → `publishedFrom/To`; не подмешивать старые материалы без пометки `historical`.
7. **Media period filter** для latest-запросов.
8. **Stage timings Brain** (`embeddingMs`, `searchMs`, `rankingMs`) и `web_code` в событиях.
9. **Brain status prompt** для `empty`/`unavailable`: модель обязана обозначить ограничение.
10. **Document-not-found**: если запрошен конкретный документ и title lookup не дал результата — честный ответ, без подмены коммерцией/статистикой.

### P2 — качество и аналитика

11. Разделение `verified` / `inferred` / `historical` в prompt и в ответе для биографии/личных взглядов.
12. Analytics: разрез feedback по `owner_tool`, `intent`, `source_status`.
13. Regression tests на сценарии A–H.
14. Visitor-facing проверки: public media/biography/web не должны сломаться.

---

## 7. Риски регрессии

| Риск | Причина | Митигация |
|---|---|---|
| Owner перестанет получать Brain на общие вопросы | gating Brain по intent | явные personal/project/biography сигналы; тест «Кто такой Ганди» без личного контекста |
| Commercial-запросы потеряют распознавание | сужение `weeklyReview`/`wantsComparison` | тесты на все существующие commercial-вопросы + новые guard-тесты |
| Точный title lookup не найдёт документ из-за пунктуации/тире | em dash, кавычки, регистр | нормализация title, exact + partial + token match, fallback на semantic внутри найденного documentId |
| Date filter отрежет документы с `published_at=null` | Weekly Review имеет null | title lookup выполняется до date filter и не применяет period |
| Post-check заменит полезный ответ | ложное срабатывание на «не нашёл» | negative checks, отдельные шаблоны, тесты на честные ответы |
| Feedback id изменит формат | `a_...` вместо UUID | `isPierrotId` допускает `[A-Za-z0-9_-]{8,64}`; проверить UI keys |
| Public media/biography сломаются | общий plan | public ветка не использует owner title lookup; отдельные тесты |
| Тесты route ждут точный порядок событий | новые events/prompt | не добавлять новые event names без необходимости; расширять payload существующих |

---

## 8. Что не менялось на этапе аудита

- production-код;
- схема Supabase;
- env;
- cron/workers;
- Vercel/Render конфигурация;
- модели и таймауты.

---

## 9. Краткий отчёт

**Установлено:**

- Ошибка Weekly Review воспроизведена и объяснена: `weekly review` в `detectCommercialQuestion` + приоритет owner tools над Brain.
- 3 ответа по 3074 символа с `owner_tool=commercial`, `provider=null` — это один и тот же детерминированный commercial-отчёт.
- Brain: 47 обращений, 8 timeout (17%), все на 2500 ms, stage-причины не разделены.
- Web: 0 успешных результатов в 190 ответах; статус недоступности не передаётся модели; `web.code` не логируется.
- Feedback: 14/14 `message_id` не связаны с сохранёнными ответами из-за клиентского id.
- «Как у меня дела на этой неделе?» получил старые Substack-материалы и психологическую интерпретацию вместо temporal retrieval.
- Ошибочный intent не «залипает» в state, но и коррекция не работает: каждый запрос классифицируется только по текущему тексту.

**Требует проверки:**

- точная причина Brain timeout (embedding vs SQL) — нужны stage timings;
- реальные значения `web.code` в production;
- содержимое Media Archive за последний месяц;
- наличие biography-документа и его доступность retrieval;
- корреляция feedback с инструментами после починки id.

**Предлагаемые изменения:**

1. Единый `understandPierrotQuery` + приоритет document lookup над commercial.
2. Сужение commercial detection до коммерческого контекста.
3. Точный title/metadata lookup в Brain до embeddings.
4. Evidence ledger + status-aware prompts + post-check.
5. Feedback через `assistantMessageId`.
6. Stage timings и `web_code` в существующих событиях.
7. Regression tests A–H.

Аудит завершён. Переход к реализации — только после этого документа.
