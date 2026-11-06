# Pierrot: аудит диалогов, поиска, задач и проектов

Дата: 2026-11-06  
Репозиторий: `merkurov1/newlove`  
Режим: локальные исправления, production-данные только читались.

## 1. Карта текущей архитектуры

```text
PWA / Telegram / public site
  -> POST /api/pierrot-web
     -> server-verified identity + consent + ownerMode
     -> bounded client history
     -> understandPierrotQuery() + buildPierrotExecutionPlan()
     -> owner-only branches:
        deterministic memory/task/project commands
        Brain / Media / analytics / Dev Task Studio
        diagnostics ("почему ты так ответил?")
     -> decideWebSearch()  (единственный источник решения о web)
     -> Exa only when shouldSearch=true
     -> Brain retrieval + project/memory/history context + web context
     -> Gemini -> DeepSeek direct -> OpenRouter fallback
     -> evidence guard + Sources only for actually used web results
     -> append message + assistant_replied trace
     -> JSON or SSE response
```

Ключевые данные: `pierrot_conversations`, `pierrot_messages`, `pierrot_events`,
`pierrot_decisions` (память/задачи/решения), `pierrot_decision_events`,
`pierrot_projects`, `pierrot_project_decisions`, `pierrot_project_conversations`,
`pierrot_project_brief_revisions`, `pierrot_dev_prompts`.

## 2. Подтверждённые production-факты (read-only)

- `pierrot_projects`: 4 строки; `priority=0` у всех.
- `pierrot_project_decisions`: **0 строк**.
- `pierrot_project_conversations`: 3 строки.
- `pierrot_project_brief_revisions`: 3 строки, в основном короткие `"Выпуск Journal"`.
- Есть ошибочный проект:
  `aff91843-4c1d-4a63-8d1a-0f0c7ab354b2` с названием
  `Heart & Angel и там добавь задачу - опустить шарик...`.
- Colonок `owner_rating` в `pierrot_projects` и `pierrot_decisions` пока нет.
- Le Monde / Le Temps:
  - `0ce50a84` Le Monde — `published`;
  - `cd42abb0` Le Temps — `draft`, `hidden_reason=duplicate reprint...`.
- За последние 24 часа в `pierrot_events` были `assistant_replied` с
  `web_requested=true`, `web_reason=current_events`, но `requires_web=false`.
- Встречались ответы модели «Задача добавлена» без фактической записи задачи
  и ответы «все задачи выполнены» без подтверждённых UUID.

## 3. Найденные ошибки и причины

| # | Проблема | Файл / функция | Причина |
|---|---|---|---|
| 1 | «Что у нас сегодня?» запускало web | `lib/knowledge/web/searchDecision.ts`, `decideWebSearch` | слово «сегодня» было сильным current-events сигналом |
| 2 | «Что происходило сегодня с моими задачами?» запускало web | там же | не было owner-фразы «с моими задачами» в internal terms |
| 3 | «Как дела с Journal?» классифицировалось как greeting | там же | `как дела` искалось подстрокой |
| 4 | Противоречие `requires_web=false`, `web_requested=true` | `app/api/pierrot-web/route.ts`, `assistant_replied` | событие писало ранний intent hint, а не фактическое решение |
| 5 | Второй veto после `decideWebSearch` | route.ts, `webSuppressedIntent` / `ownerInternalWebQuestion` | последующие этапы переопределяли единый роутер |
| 6 | «Создай проект Heart & Angel и там добавь задачу…» создавал проект с всей фразой в названии | `lib/pierrot/projects/commands.ts`, `detectProjectCommand` | regex забирал весь хвост сообщения |
| 7 | «Добавь задачу…» не создавал задачу, но модель говорила «добавлено» | `lib/pierrot/memory/intent.ts`, route.ts | не было детерминированного task-intent и проверки UUID |
| 8 | «Задачи в Journal — выполнены» могло затронуть чужие задачи | `lib/pierrot/memory/intent.ts`, `detectProjectRef` | не распознавался проект в форме «задачи в Journal» |
| 9 | «Все задачи по проекту выполнены» могло стать scope=all | там же | «по проекту» без имени не отделялось от глобального scope |
| 10 | «Восстанови её» после ошибочного завершения не находило запись | intent + route | restore не использовал последний список ID |
| 11 | `pierrot_project_decisions` пустая | store/links + production migration | исторические задачи хранили проект только текстом; backfill не применён |
| 12 | Project Brief перезаписывался без осмысленной причины | `lib/pierrot/projects/store.ts` | `change_note` всегда `Owner update`, не было chat-команды |
| 13 | Оценка проекта/задачи не хранилась отдельно | projects/decisions schema | `priority` и `importance` — внутренние значения модели |
| 14 | Owner rating не отображался | UI проектов | поля не было в контракте |
| 15 | «Почему ты так ответил?» не имело диагностики | route.ts | не было чтения последнего trace |
| 16 | «Что я обсуждал вчера?» в новом диалоге не имело истории | route.ts | использовалась только history из браузера |
| 17 | Dev-задачу можно было вручную пометить `verified` без проверки | `lib/pierrot/dev/tasks.ts` | не было guard на acceptance criteria/tests/result |
| 18 | Главная показывала «спокойно» без учёта активных задач/свежести | `workspace/status.ts`, `HomeOverview` | `buildOwnerOverallStatus` не использовался |
| 19 | Отдельная страница проектов была недоступна из PWA | `ChatWorkspace.tsx` | ссылка на `/admin/pierrot/projects` отсутствовала |
| 20 | Возможен дубликат проекта по имени через API | `createPierrotProject` | проверялся только slug |

## 4. Что исправлено

### Поиск

- `decideWebSearch` теперь различает временные слова и внешний предмет.
  «Сегодня», «сейчас», «последнее», «что происходит» сами по себе не ищут.
- Owner-вопросы о задачах, проектах, памяти и истории уходят во внутренний контекст.
- Явные команды «найди в интернете», «поищи», «проверь актуальную документацию»
  сохраняют приоритет.
- `webRequested` теперь равен только `decideWebSearch().shouldSearch`.
- `requires_web` в событии пишет фактическое значение; ранний hint сохранён
  отдельно как `intent_requires_web`.
- Sources добавляются только при фактически использованных web-результатах.

### Задачи

- Новый детерминированный `create_task` intent:
  «Добавь задачу…», «В <проект> добавь задачу…», «Создай задачу…».
- `lib/pierrot/memory/taskCreation.ts`:
  - находит точный проект;
  - создаёт ровно одну запись;
  - связывает через `pierrot_project_decisions`;
  - читает запись обратно;
  - не переносит чужую задачу при текстовом совпадении;
  - возвращает честный `project_not_found` / `link_failed` / `existing_in_other_project`.
- «Добавь это всё в задачи» не угадывается: Pierrot просит точные формулировки.
- «Задачи в Journal — выполнены» теперь scope=project + точный Journal.
- «Все задачи по проекту выполнены» без имени проекта не выполняется.
- Restore использует последний подтверждённый список UUID.
- Массовые операции требуют preview + подтверждение; после выполнения — read-back.
- В `assistant_replied` добавлен `operation_log` с intent, project_id, object_ids,
  старыми/новыми статусами, changed/failed/result.

### Проекты

- `detectProjectCommand` больше не включает вторую команду в имя проекта.
- Комбинированная команда «создай проект X и добавь задачу Y» создаёт проект X
  и связанную задачу Y.
- Повторное «создай проект X» не создаёт дубликат.
- `resolvePierrotProject` понимает «продолжим Journal», «как дела с Journal»,
  исправления «нет, это Art Engine, а не Heart & Angel».
- В проектном контексте загружаются Brief, решения, задачи, знания, связанные
  диалоги и последние сообщения **только этого проекта**.
- Project Brief обновляется только явной командой; ревизия сохраняется,
  `change_note` осмысленный, короткий текст не перезаписывает бриф.
- Добавлена отдельная ссылка «Проекты» в drawer чата.

### Оценки

- Введено отдельное `owner_rating` (1..10) для проекта и задачи.
- `priority` и `importance/confidence` не используются как пользовательская оценка.
- Команды: «Поставь проекту Journal оценку 8», «Оцени задачу … на 7».
- Значение читается обратно и отображается в UI.
- Без миграции Pierrot честно говорит, что поле ещё не создано, и не подменяет его.

### Память и диагностика

- `historyContext.ts` подтягивает последние owner-диалоги для вопросов об истории,
  строго по `user_id` владельца и с исключением текущего диалога.
- `diagnostics.ts` объясняет последний ответ: provider, маршрут, web decision,
  источники, memory status, project command, operation result. Без промптов,
  ключей и приватных фрагментов.
- `loadOwnerHistoryContext` и `formatPierrotAnswerTrace` покрыты тестами.

### Dev Mode

- `validateDevTaskCompletion`: `verified` невозможен без:
  - `verificationStatus = verified | verified_with_warnings`;
  - acceptance criteria;
  - tests / unverified / verification notes;
  - result commit / PR / verification notes.
- API возвращает 409 с кодом, а не молчаливое «обновлено».

### Главная

- `HomeOverview` использует `buildOwnerOverallStatus`.
- Учитываются: метрики, коммерция, Brain, свежесть, активные задачи и Dev-задачи.
- Активные задачи дают «Есть движение», а не «Всё спокойно».
- Недоступный источник даёт «Данные неполные».

## 5. Файлы

Основные:

- `lib/knowledge/web/searchDecision.ts`
- `app/api/pierrot-web/route.ts`
- `lib/pierrot/memory/intent.ts`
- `lib/pierrot/memory/operations.ts` (использован существующий safety-слой)
- `lib/pierrot/memory/taskCreation.ts` (новый)
- `lib/pierrot/memory/historyContext.ts` (новый)
- `lib/pierrot/diagnostics.ts` (новый)
- `lib/pierrot/projects/commands.ts`
- `lib/pierrot/projects/resolver.ts`
- `lib/pierrot/projects/store.ts`
- `lib/pierrot/projects/links.ts`
- `lib/pierrot/projects/types.ts`
- `lib/pierrot/memory/store.ts`
- `lib/pierrot/memory/types.ts`
- `lib/pierrot/dev/tasks.ts`
- `app/api/admin/pierrot/dev/tasks/[id]/route.ts`
- `lib/pierrot/workspace/status.ts`, `data.ts`, `types.ts`
- `components/pierrot/workspace/HomeOverview.tsx`
- `components/pierrot/workspace/ChatWorkspace.tsx`
- `components/pierrot/workspace/ProjectOverview.tsx`, `ProjectsWorkspace.tsx`

## 6. Миграции (не применены)

- `migrations/2026-11-23_pierrot_owner_ratings.sql`
  - additive nullable `owner_rating` + `owner_rating_updated_at` в projects/decisions.
  - rollback: `migrations/rollback/2026-11-23_pierrot_owner_ratings.rollback.sql`.
- `migrations/2026-11-23_pierrot_duplicate_project_repair.sql`
  - архивирует только ошибочный проект `aff91843...`, не удаляет строки и связи.
  - rollback: `migrations/rollback/2026-11-23_pierrot_duplicate_project_repair.rollback.sql`.
- Ранее подготовленная `migrations/2026-11-22_pierrot_project_links_backfill.sql`
  остаётся неприменённой. Именно она заполнит `pierrot_project_decisions`
  для исторических записей по точному имени/слагу.

Порядок применения (после согласования):

1. Проверить дубликаты в `pierrot_decisions.project` и существующие links.
2. Применить backfill.
3. Применить `pierrot_project_decisions_single_project_idx` из того же файла.
4. Применить ratings.
5. Отдельно, после просмотра, — repair ошибочного проекта.

## 7. Тесты

Добавлены/обновлены:

- `lib/knowledge/web/__tests__/searchDecision.test.ts`
  - «Что у нас сегодня?», «Как дела с Journal?», «Что я вчера обсуждал с Пьеро?»,
    «Обнови состояние проекта», «Что происходило сегодня с моими задачами?»;
  - явные external-запросы;
  - «почему ты так ответил?»;
  - «что происходит» без внешнего предмета.
- `lib/pierrot/memory/__tests__/taskCreation.test.ts`
  - создание одной задачи;
  - точная связь с проектом;
  - неизвестный проект;
  - идемпотентность;
  - запрет переноса идентичной задачи из другого проекта.
- `lib/pierrot/memory/__tests__/operations.test.ts`
  - «Задачи в Journal — выполнены» не трогает Media;
  - «Все задачи по проекту выполнены» не становится all-scope;
  - restore по последнему UUID.
- `lib/pierrot/memory/__tests__/historyContext.test.ts`
  - owner-only история, чужой пользователь не попадает;
  - текущий диалог исключается.
- `lib/pierrot/projects/__tests__/commands.test.ts`
  - имя проекта не забирает вторую команду;
  - rating 1..10;
  - brief update и отказ от короткого текста.
- `lib/pierrot/dev/__tests__/tasks.test.ts`
  - `verified` без criteria/evidence запрещён;
  - корректный verified проходит.
- `lib/pierrot/workspace/__tests__/homeStatus.test.ts`
  - активные задачи не дают «спокойно»;
  - недоступный project health даёт incomplete.

Результат:

```text
Test Suites: 275 passed, 275 total
Tests:       1869 passed, 1869 total
TypeScript:  tsc --noEmit -> 0 errors
Build:       не запускался по указанию; результат сборки не подтверждён
```

## 8. Что осталось / требует production

1. **Deploy не выполнен.** Все исправления локальные; production всё ещё
   работает на старом коде.
2. Применить миграции только после review; без них:
   - оценки не сохраняются (Pierrot честно сообщает об этом);
   - `pierrot_project_decisions` остаётся пустой для исторических задач.
3. После backfill проверить, что старые задачи не попали в два проекта.
4. Разобрать ошибочный проект `aff91843...` через prepared repair.
5. Проверить production events после deploy:
   - `web_requested=false` и `web_source_count=0` для внутренних вопросов;
   - `requires_web === web_requested`;
   - создание задачи даёт реальный UUID и read-back;
   - project completion меняет только UUID этого проекта.
6. Journal/Flow: публичный архив сейчас корректен (Le Temps draft, Le Monde
   published). Отдельно стоит проверить, что метрики выпуска не считают
   перепечатку независимым оригиналом, если она когда-либо снова попадёт
   в `items` как отдельная запись.
7. Dev Mode: guard запрещает ложный `verified`, но существующие старые
   `verified`-записи нужно перепроверить вручную; автоматически понижать
   их статус нельзя.
8. `npm run build` не считается пройденным. Typecheck и Jest пройдены.

## 9. Риски

- Миграция ratings additive, но её нужно применять до проверки оценки в UI.
- Backfill использует точное совпадение имени/слага; записи с опечатками
  останутся без связи и требуют ручного разбора.
- Project Brief обновляется только явной командой; автоматическое
  переписывание брифа моделью намеренно не включено.
- В production остаётся ошибочный проект до применения repair.
- Полный `next build` не проверен в этом прогоне.
