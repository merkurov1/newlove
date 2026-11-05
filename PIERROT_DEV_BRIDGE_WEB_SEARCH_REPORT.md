# PIERROT — DEV TASK BRIDGE + CONTEXTUAL WEB SEARCH

Дата: 2026-11-05  
Репозиторий: `merkurov1/newlove`

---

## PART 1 — DEV TASK BRIDGE

### 1. Причина проблемы

В системе было два независимых хранилища:

- `pierrot_decisions` — обычная память, напоминания и задачи;
- `pierrot_dev_prompts` — инженерные задачи Task Studio.

`detectMemoryIntent()` умел создавать только записи памяти. Ни один путь не переводил
инженерную запись в Dev. Поэтому задача «проверить логи dev mode и улучшить работу там»
оставалась напоминанием в общей памяти и не появлялась в Task Studio.

Дополнительно production-схема `pierrot_dev_prompts` имела ограничение
`repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'`, то есть требовала `owner/repo`,
а не короткий ключ `newlove`. Это исправлено в коде: наружу UI/API отдают ключ,
в БД сохраняется полное имя.

### 2. Какие файлы изменены

- `lib/pierrot/memory/devBridge.ts` — новый мост память → Dev.
- `lib/pierrot/memory/__tests__/devBridge.test.ts` — тесты моста.
- `lib/pierrot/memory/store.ts` — `sourceRefs` теперь можно обновлять без смены статуса.
- `lib/pierrot/dev/tasks.ts` — `decision_ids`, полное `owner/repo`, маппинг verification status.
- `lib/pierrot/dev/types.ts` — `decisionIds` в Dev-задаче.
- `lib/pierrot/dev/repositories.ts` — конфигурация больше не тянет GitHub client.
- `app/api/pierrot-web/route.ts` — распознавание и выполнение Dev-команд в чате.
- `app/api/pierrot-web/__tests__/route.test.ts` — интеграционные проверки.
- `app/api/admin/pierrot/dev/tasks/route.ts` — приём `decisionIds`.
- `app/api/admin/pierrot/dev/tasks/[id]/route.ts` — приём `decisionIds`.
- `components/pierrot/workspace/DevTaskStudio.tsx` — показывает источник памяти.
- `migrations/2026-11-18_pierrot_dev_engineering.sql` — расширен status CHECK.
- `scripts/pierrot/import-memory-dev-task.mjs` — идемпотентный импорт исходной записи.

### 3. Как работает механизм

`detectDevTaskIntent()` — детерминированный, без side effects:

- явные команды: «Создай задачу в Dev», «Добавь в Dev: …», «Это задача по разработке»,
  «Задача относится к Dev Mode»;
- явный перенос: «Перенеси в Dev …», «Отправь в Dev …», «Импортируй в Dev …»;
- автоматическая классификация только для очевидных инженерных запросов
  (Dev Mode, newlove, Pierrot, репозиторий, код, API, тесты, миграция, ошибка,
  логи, commit, PR и т.п.);
- обычные напоминания («Напомни завтра проверить…») не попадают в Dev;
- web-запросы («Найди в интернете…») не классифицируются как Dev-задачи.

Перенос:

1. Ищется уже существующая Dev-задача по `decision_ids` → повторный перенос не создаёт дубль.
2. Создаётся задача через существующий `createDevTask()`.
3. В задаче сохраняется `decision_ids = [memoryId]`.
4. В исходной записи памяти обновляются только `source_refs` и тег `dev-task`.
5. Статус исходной записи не меняется. Она не удаляется и не считается выполненной.
6. Если запись в `source_refs` не удалась, задача всё равно остаётся идемпотентной:
   связь уже есть в `decision_ids`.

Обратная синхронизация:

- технически возможна через `decision_ids`;
- автоматически не выполняется;
- архивирование и физическое удаление остаются разными операциями;
- исходная запись не удаляется при завершении Dev-задачи.

### 4. Тесты

Добавлены/обновлены:

- явное создание Dev-задачи;
- «Добавь в Dev: …»;
- «Это задача по разработке»;
- автоматическая классификация «Нужно исправить это в newlove»;
- обычное напоминание не становится Dev-задачей;
- web-запрос не становится Dev-задачей;
- перенос памяти в Dev;
- повторный перенос не создаёт дубль;
- исходная запись сохраняется;
- ошибка Dev API не даёт ложного подтверждения.

Реально прошли:

```text
npx jest lib/knowledge/web/__tests__ lib/pierrot/memory/__tests__ \
  lib/pierrot/__tests__/executionPlan.test.ts \
  lib/pierrot/dev/__tests__/tasks.test.ts \
  lib/pierrot/dev/__tests__/security.test.ts \
  app/api/pierrot-web/__tests__/route.test.ts --runInBand

12 suites, 252 tests — passed
```

Отдельно route suite:

```text
npx jest app/api/pierrot-web/__tests__/route.test.ts --runInBand
99 tests — passed
```

### 5. Импортирована ли исходная задача

Да.

- Memory ID: `0aac6356-b6a3-418c-bf90-01f499b1cd94`
- Dev task ID: `41d745ca-d353-46ff-9285-8ec1ff39d0ab`
- Title: «Проверить логи Dev Mode и улучшить работу»
- Repository: `merkurov1/newlove`
- Base ref: `main`
- Base commit: `d6690ed0b8df7de4dc5917a84facfbd51253ff98`
- Status: `draft`
- `decision_ids`: `[0aac6356-b6a3-418c-bf90-01f499b1cd94]`
- Source memory link: сохранён в `source_refs`
- Повторный запуск импорта вернул `alreadyImported: true`, дубль не создан.

Важно: на момент повторной проверки исходная запись памяти уже имела
`status = archived` и `archived_reason = owner_confirmed_completed_2026-11-05`.
Это изменение произошло **до** импорта (09:12), не в результате переноса.
Импорт не менял статус записи. Dev-задача осталась `draft` и не отмечена выполненной.

### 6. Нужны ли SQL migrations

Да, одна подготовлена, но **не применена**:

`migrations/2026-11-18_pierrot_dev_engineering.sql`

Причина: production CHECK для `pierrot_dev_prompts.status` разрешал только
`draft/ready/used/verified/failed`, а Task Studio использует
`draft/ready/in_progress/review/verified/rejected/archived`.
Migration расширяет допустимый набор, сохраняя старые значения. Данные не удаляются.

Verification status маппится без migration:

- `verified` → `passed`
- `verified_with_warnings` → `partial`
- `not_verified` → `not_run`
- `rejected` → `failed`

---

## PART 2 — CONTEXTUAL WEB SEARCH

### 1. Причина проблемы

До изменений:

- распознавались не все явные команды («Найди в сети», «Проверь в интернете»,
  «Search the web», «Find online», «Look it up», «Check online»);
- `ownerTool`, `research` и общий `searchVerb` могли перехватить запрос,
  явно адресованный Web;
- поисковый запрос строился только из текущей фразы;
- `Exa` использовал только `text`, без `highlights`;
- telemetry не сохраняла исходную команду, причину, контекст и latency.

### 2. Какие файлы изменены

- `lib/knowledge/web/searchDecision.ts` — явные источники, контекстный query builder.
- `lib/knowledge/web/exaSearch.ts` — `contents.highlights: true`, разбор highlights, bounded text.
- `lib/knowledge/web/types.ts` — `highlights` в источнике.
- `lib/knowledge/web/webContext.ts` — правила качества источников и дат.
- `lib/knowledge/web/__tests__/*` — тесты.
- `lib/pierrot/queryUnderstanding.ts` — явные Web/Brain/Media формулировки.
- `lib/pierrot/executionPlan.ts` — приоритет явного Web над owner tools/searchVerb.
- `app/api/pierrot-web/route.ts` — contextual query, запрет Web для explicit Brain/Media,
  telemetry.

### 3. Как работает

Приоритет источников:

- «Найди в интернете» → Web.
- «Найди в Brain» → Brain.
- «Найди в Media Archive» → Media.
- «Сравни мои тексты с интернетом» → Brain + Web.
- явный Web не перехватывается `ownerTool`, `research` или `searchVerb`.

Контекстный запрос:

- `buildContextualWebQuery()` — чистая функция;
- использует только предыдущий **явный пользовательский web-запрос**, не ответы
  ассистента, не Brain, не память и не системный промпт;
- сохраняет тему при follow-up: «А теперь подробнее про результаты аукционов»;
- разворачивает «его/её/их» из предыдущей web-темы;
- переключает тему: «А теперь про Christie's»;
- ограничивает итоговую строку 500 символами;
- не отправляет всю историю диалога в Exa.

Exa:

- `type: auto`;
- `contents.highlights: true` как основной источник фрагментов;
- `text` остаётся bounded fallback для обратной совместимости;
- сохраняются title, URL, domain, published date, author;
- URL дедуплицируются;
- общий объём текста ограничен;
- таймауты и graceful fallback сохранены;
- Exa summary/Agent не используются.

Ответ:

- модель синтезирует ответ;
- Sources добавляются детерминированно только из реально полученных Exa URL;
- при `disabled/missing_api_key/timeout/http_error/network_error/no_results`
  модель получает явный статус и не должна выдумывать ссылки.

Telemetry сохраняет:

- `web_requested`;
- `web_command` (до 500 символов);
- `web_query`;
- `web_reason`;
- `web_used_context`;
- `web_topic_changed`;
- `web_latency_ms`;
- `web_outcome`;
- `web_code`;
- `web_source_count`.

Секреты и API key не записываются.

### 4. Тесты

Добавлены/проверены:

1. «Найди в интернете…» → Web.
2. «Поищи в сети…» → Web.
3. «Найди в Brain…» → Brain.
4. «Найди в Media Archive…» → Media.
5. «Сравни мои тексты с интернетом…» → Brain + Web.
6. Контекстный follow-up после Web Search.
7. Уточнение предыдущей темы.
8. Переключение на новую тему.
9. Указание конкретного домена.
10. Указание временного диапазона.
11. Пустой ответ Exa.
12. Ошибка API и timeout.
13. Корректная обработка highlights.
14. Дедупликация URL.
15. Отсутствие выдуманных ссылок при сбое.
16. Защита от prompt injection в тексте страниц.

Прошли:

```text
npx jest lib/knowledge/web/__tests__ --runInBand
3 suites, 53 tests — passed
```

### 5. Состояние production env

Проверено через `vercel env ls production` без вывода значений:

- `EXA_API_KEY` — присутствует (Secret, Production).
- `PIERROT_WEB_SEARCH_ENABLED` — отсутствует.

Поиск **не включён** в production. Для активации после проверки:

1. Добавить `PIERROT_WEB_SEARCH_ENABLED=true` в Production.
2. Сделать redeploy.
3. Выполнить реальный запрос «Найди в интернете последние новости о Sotheby’s» и
   проверить outcome, источники, latency и отсутствие выдуманных ссылок.

Секреты не изменялись.

### 6. Что не проверено

- Реальный Exa-запрос после deployment не выполнялся.
- Production-поиск не заявляется как работающий до redeploy и live-проверки.
- Полный `tsc` блокируется не связанными с этой задачей ошибками в
  `lib/pierrot/skills/analysis/collect.ts` (concurrent changes).
- `npm run build` не запускался.

---

## Commit

Будет указан после коммита.
