# PIERROT DEV MODE — ENGINEERING ENVIRONMENT

Дата: 2026-11-04  
Репозиторий: `merkurov1/newlove`  
Локальная ветка: `main`  
Локальный commit: `73451150af4b60fb5305323e2f792aade115b334`  
Удалённый `newlove/main`: тот же SHA на момент проверки.  
`merkurov1/Pierrot/main`: `774f0cc73897b831e92af235eb5d885bd9ea8e89`.

---

## A. Что было обнаружено

### Исходное состояние

- Dev Mode уже существовал: `app/admin/pierrot/(workspace)/dev`, `/api/admin/pierrot/dev`, `lib/pierrot/dev/*`.
- Использовались `pierrot_conversations` / `pierrot_messages` с `mode = 'dev'`.
- GitHub-доступ шёл через один `GITHUB_TOKEN` и один репозиторий.
- LLM: DeepSeek напрямую, затем OpenRouter.
- В production `pierrot_dev_prompts` уже существовала, но содержала **0 строк** и не использовалась ни в коде, ни в migrations.
- Оба репозитория публичны и доступны без токена: `newlove` → `main`, `Pierrot` → `main`, Expo-клиент в `pierrot-ios/`.
- Production REST-схема:
  - `pierrot_dev_prompts`: 24 колонки, anon/authenticated получают `401 permission denied`, service role имеет доступ.
  - `pierrot_conversations` / `pierrot_messages`: `mode` уже присутствует.
  - На момент аудита: 175 conversations, 707 messages.

### Критические расхождения

1. **Запись была включена по умолчанию.** `isGitHubWriteEnabled()` возвращал `true` для любого значения, кроме `false`. Write-tools всегда передавались модели.
2. **Можно было писать в default branch.** `create_or_update_file` при отсутствии `branch` подставлял `main`. `create_pull_request` не запрещал head = default branch.
3. **Fallback повторял весь запрос после side effects.** `callDevModel()` перебирал провайдеров после любой ошибки, включая уже выполненные записи.
4. **Один репозиторий.** Все GitHub-функции были жёстко привязаны к `getGitHubRepository()`; выбрать `Pierrot` было нельзя.
5. **Не было repository intelligence.** Только листинг директории и чтение файла целиком. Не было поиска, диапазонов строк, commits, diff, branches, PR, workflow/check runs.
6. **Tool traces не сохранялись.** Они возвращались в ответе и терялись после перезагрузки.
7. **Не было request status / idempotency / deadline.** Не было `pending/running/completed/failed/partially_completed`, не было защиты от повторной отправки.
8. **Task Studio не существовал.** `pierrot_dev_prompts` была мёртвой таблицей.
9. **Engineering Review не существовал.**
10. **Project Memory не существовала.**
11. **Schema drift.** `pierrot_dev_prompts` была в production, но не в migrations.
12. **Не было явного разделения фактов, выводов и гипотез** на уровне tool contract; системный промпт обещал больше, чем умели tools.

---

## B. Что изменено

### Новые модули

- `lib/pierrot/dev/types.ts` — общие типы Dev Mode.
- `lib/pierrot/dev/repositories.ts` — независимая конфигурация `newlove` и `Pierrot`, env-overrides, строгий выбор репозитория.
- `lib/pierrot/dev/repository.ts` — 13 read-only GitHub-операций, кэш с привязкой к SHA, bounded results, metadata envelope.
- `lib/pierrot/dev/tools.ts` — JSON-schema tools, исполнитель, summary, запрет write-tools.
- `lib/pierrot/dev/requests.ts` — request status, idempotency, traces, latency, usage, errors.
- `lib/pierrot/dev/tasks.ts` — Task Studio CRUD и генерация полного OpenCode prompt.
- `lib/pierrot/dev/review.ts` — Engineering Review по diff, checks и acceptance criteria.
- `lib/pierrot/dev/memory.ts` — компактная curated Project Memory с source/date/commit/status.
- `components/pierrot/workspace/DevTaskStudio.tsx` — компактный Task Studio UI.

### Новые API routes

- `POST /api/admin/pierrot/dev` — SSE и JSON, статусы, idempotency, traces.
- `GET/POST /api/admin/pierrot/dev/tasks`.
- `GET/PATCH /api/admin/pierrot/dev/tasks/[id]`.
- `POST /api/admin/pierrot/dev/review`.

### Изменённые файлы

- `lib/github.ts` — read-only по умолчанию, explicit confirmation, запрет default branch.
- `lib/pierrot/dev/llm.ts` — 13 tools, deadline, tool timeout, tool-call cap, безопасный fallback.
- `lib/pierrot/dev/config.ts` — два репозитория и статусы доступа.
- `lib/pierrot/dev/github.ts` — legacy-wrapper только для чтения.
- `lib/pierrot/dev/store.ts` — идемпотентные сообщения, загрузка traces.
- `lib/pierrot/dev/prompt.ts` — tool contract и запрет ложных утверждений.
- `app/admin/pierrot/(workspace)/dev/page.tsx` — tasks, repo statuses, memory, request store.
- `components/pierrot/workspace/DevWorkspace.tsx` — контекстная зона, repo selector, SSE, traces.
- `app/admin/pierrot/(workspace)/workspace.css` — адаптивная контекстная зона и Task Studio.
- `.env.example` — read-only default, два репозитория, лимиты.
- `migrations/2026-11-18_pierrot_dev_engineering.sql` — additive migration.

### Supabase

Migration **не применена автоматически**. Она:

- документирует `pierrot_dev_prompts`;
- добавляет `title`, `objective`, `context`, `current_behavior`, `required_behavior`, `technical_plan`, `frontend_changes`, `database_changes`, `pull_requests`, `result_notes`, `verification_report`;
- создаёт `pierrot_dev_requests`;
- включает RLS и закрывает доступ для `anon/authenticated`;
- выдаёт доступ только `service_role`;
- не содержит `DROP TABLE` / `DROP COLUMN`.

---

## C. Что теперь умеет Dev Mode

### A. Project Intelligence

- Два независимых репозитория: `newlove` и `Pierrot`.
- Для каждого: owner/repository/default branch/work branch/status/last checked/commit SHA.
- Кэш в памяти на 5 минут; полноценного индекса, cron и worker нет.
- Токены не попадают в БД и клиент.

### B. Repository Explorer

Реализованы:

1. `get_repo_info`
2. `get_repo_tree`
3. `search_repo`
4. `read_file`
5. `read_file_range`
6. `list_branches`
7. `list_commits`
8. `get_commit`
9. `compare_refs`
10. `list_pull_requests`
11. `get_pull_request`
12. `get_workflow_runs`
13. `get_check_runs`

Каждый результат содержит repository, branch, commit SHA, данные, `complete` и warnings. Один репозиторий не может быть выдан за другой.

### C. Architect

- Модель обязана указывать repository в каждом tool call.
- Промпт и tool contract требуют разделять подтверждённые факты, выводы и гипотезы.
- Запрещено утверждать, что тест/сборка прошли, если не было executed check run.
- Partial/truncated результаты должны быть названы явно.

### D. Task Studio

- Задания читаются и пишутся в `pierrot_dev_prompts`.
- Поля: title, goal, context, repository, base ref/commit, affected files, current/required behavior, technical plan, backend/frontend/database/mobile changes, migrations, security, tests, acceptance criteria, status, result commit, PR, verification.
- Статусы: draft / ready / in_progress / review / verified / rejected / archived.
- Создание из текущего Dev-треда, редактирование, сохранение, повторное открытие, copy full prompt, прикрепление результата, review.
- При отсутствии новых колонок Task Studio деградирует до legacy-схемы, а не падает.

### E. Engineering Review

- Сравнивает base...head через GitHub.
- Читает diff, checks, workflow runs.
- Формирует findings с severity/file/line/problem/impact/recommendation.
- Сопоставляет acceptance criteria с diff и CI.
- Вердикты: `verified`, `verified_with_warnings`, `not_verified`, `rejected`.
- Явно пишет, что Pierrot не запускал тесты сам.
- Commit/PR не считается доказательством выполнения.

### F. Project Memory

- Curated записи: архитектура, routes, Supabase, GitHub, LLM, technical debt, mobile repo.
- У каждой записи: source, date, repository, commit SHA, status.
- Обновление commit SHA происходит on-demand при загрузке страницы.
- Нет бесконечной автоматической индексации.

---

## D. Что проверено

Выполнено:

```bash
npx jest lib/pierrot/dev/__tests__ --runInBand
# 7 suites, 45 tests — passed

npx jest lib/__tests__/github.test.ts lib/pierrot/workspace/__tests__ --runInBand
# 7 suites, 38 tests — passed

npx tsc --noEmit
# exit 0

ESLINT_USE_FLAT_CONFIG=false npx eslint \
  lib/pierrot/dev app/api/admin/pierrot/dev \
  components/pierrot/workspace/DevWorkspace.tsx \
  components/pierrot/workspace/DevTaskStudio.tsx \
  'app/admin/pierrot/(workspace)/dev/page.tsx' \
  --rule 'react/react-in-jsx-scope: off' \
  --rule '@next/next/no-img-element: off'
# без ошибок
```

Проверено фактически:

- два репозитория и запрет неизвестного repository;
- отсутствующий токен;
- поиск, чтение файла, диапазон строк, дерево, branches, compare, checks;
- недоступный репозиторий;
- fallback до side effects;
- запрет fallback после side effect;
- partial completion;
- tool-call limit;
- tool timeout;
- idempotency повторного request;
- сохранение tool traces;
- create/update Dev Prompt;
- read-only default;
- запрет записи в default branch;
- отсутствие write-tools у модели;
- RLS/grants в migration;
- admin-only routes.

Не проверено:

- `npm run build` — не запускался по указанию владельца; результат сборки не заявляется.
- Реальный GitHub token и оба репозитория через authenticated API — в локальном окружении `GITHUB_TOKEN` отсутствует. Публичная доступность обоих репозиториев проверена.
- Реальный Supabase production apply migration — не применялась.
- Браузерный E2E / iPad / iPhone — не запускался.
- Реальный LLM-вызов — не выполнялся.

---

## E. Что осталось

### Известные ограничения

- GitHub code search индексирует default branch; поиск по другой ветке может быть неполным, это явно возвращается в warning.
- Diff и большие файлы ограничены; `complete=false` и warnings обязательны.
- Engineering Review не запускает команды и не подменяет CI. Он проверяет diff и check runs.
- Project Memory — curated, не обновляется автоматически. Это сознательное ограничение.
- Write-flow намеренно отсутствует. `PIERROT_DEV_WRITE_ENABLED=true` не включает tools; запись потребует отдельного approval-flow.
- `pierrot_dev_requests` и новые колонки Task Studio появятся только после migration.
- Для `system-admin` (ADMIN_API_SECRET) `user_id` Task Studio может быть `null`, если production-колонка `user_id` NOT NULL. Обычный Supabase ADMIN работает с UUID.
- `request status` для ещё выполняющегося запроса после перезагрузки страницы не показывается отдельным баннером; он виден после завершения в trace.

### Риски

- Production schema могла измениться после аудита. Перед apply migration нужно повторить `information_schema` проверку.
- Если в Vercel остался `PIERROT_DEV_WRITE_ENABLED=true`, UI покажет `writes flag on`, но write-tools всё равно недоступны. Рекомендуется выставить `false` или удалить переменную.
- LLM/tools не тестировались с реальным токеном и реальными rate limits GitHub.

---

## F. Production checklist

Можно деплоить:

- код Dev Mode, API routes, UI, tests;
- read-only GitHub tools;
- Task Studio в legacy-режиме (без новых колонок) — базовое создание/обновление работает, но structured-поля будут частично недоступны.

Требует ручного применения:

```text
migrations/2026-11-18_pierrot_dev_engineering.sql
```

Порядок:

1. Снять backup / проверить production schema.
2. Применить migration вручную утверждённым процессом.
3. Проверить:
   - `pierrot_dev_prompts` columns;
   - `pierrot_dev_requests` columns;
   - RLS enabled;
   - anon/authenticated → permission denied;
   - service_role → access.
4. Задеплоить код.
5. Открыть `/admin/pierrot/dev`, проверить оба repository status.

Env variables:

```env
GITHUB_TOKEN=            # read-only fine-grained token for both repositories
PIERROT_DEV_REPO_NEWLOVE=merkurov1/newlove
PIERROT_DEV_REPO_PIERROT=merkurov1/Pierrot
PIERROT_DEV_WRITE_ENABLED=false
```

Опционально:

```env
PIERROT_DEV_REQUEST_DEADLINE_MS=90000
PIERROT_DEV_TOOL_TIMEOUT_MS=20000
PIERROT_DEV_MAX_TOOL_CALLS=16
PIERROT_DEV_GITHUB_TIMEOUT_MS=15000
PIERROT_DEV_MAX_TOKENS=6000
```

Требует отдельного разрешения:

- любая GitHub-запись;
- любая destructive migration;
- включение write-flow;
- изменение production RLS/policies;
- добавление cron/worker/background indexing.

---

## Итог

Dev Mode теперь имеет реальный read-only доступ к двум репозиториям, сохраняет инженерные задания в `pierrot_dev_prompts`, хранит request/tool traces, умеет готовить полный prompt для OpenCode и проверять фактический diff. Запись в GitHub отключена по умолчанию и не доступна модели. Production migration подготовлена, но не применена.
