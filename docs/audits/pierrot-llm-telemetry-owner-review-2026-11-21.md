# Owner review: восстановление telemetry `pierrot_llm_calls`

**Дата review:** 2026-11-21  
**Task ID:** `cabfc3c3-b22b-4435-b7af-9c7af78f48c9`  
**Repository:** `merkurov1/newlove`  
**Base ref:** `main` = `4eccacc11cb55b799ecff0ae6c563bb350f40c64`  
**Working branch:** `pierrot/dev/cabfc3c3-b22b-4435-b7af-9c7af78f48c9/1`  
**Migration under review:** `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`  
**Rollback:** `migrations/rollback/2026-11-18_pierrot_llm_call_telemetry.rollback.sql`  
**Migration introduced in:** commit `d0ada17b62b756d8915f67046d541443ea4db5d0` (2026-11-18, task `69ba98a7-7813-4326-8434-bf3aec88bf15`)

## 1. Статус и решение

**Production DDL не выполнялся. Ни одна production-команда не запускалась.**
Review остановлен на обязательном owner gate из task specification.

Текущий вывод: **migration готова к owner approval с оговорками**, перечисленными
в разделах 6, 7 и 11. До явного approval Антона применять её нельзя.

Ключевые оговорки, требующие решения owner:

1. Репозиторий **не использует Supabase CLI migration history** для этих файлов.
   Штатное применение через `supabase db push` в текущей конфигурации невозможно:
   нет каталога `supabase/`, нет `config.toml`, а имена файлов не соответствуют
   формату CLI (`YYYYMMDDHHMMSS_name.sql`). Поэтому требование «migration history
   подтверждает применение» и требование «применить ровно этот файл» могут быть
   выполнены одновременно только после отдельного решения о способе фиксации
   history.
2. В sandbox нет production credentials, поэтому фактическая production schema
   и текущая `supabase_migrations.schema_migrations` **не проверены**. Это
   сознательно: секреты не читались, к production не подключались.
3. Административный агрегат `/admin/pierrot/ai-costs` показывает attempts,
   fallback/retry, tokens и cost, но **не агрегирует и не показывает latency**.
   `latency_ms` сохраняется в таблицу, однако UI-агрегат его не выводит. Это
   расхождение с acceptance criterion №9 и требует отдельного решения owner.

## 2. Что именно создаёт migration

Файл аддитивный. Он не изменяет существующие объекты, не удаляет данные, не
создаёт функций, триггеров, views, RLS policies и foreign keys.

### 2.1 Таблица

`public.pierrot_llm_calls`, 28 колонок:

| Колонка                      | Тип             | Ограничения / назначение                                                   |
| ---------------------------- | --------------- | -------------------------------------------------------------------------- |
| `id`                         | `UUID`          | PK, `DEFAULT gen_random_uuid()`                                            |
| `occurred_at`                | `TIMESTAMPTZ`   | `NOT NULL DEFAULT NOW()`                                                   |
| `request_id`                 | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `conversation_id`            | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `session_id`                 | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `user_id`                    | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `surface`                    | `TEXT`          | `NOT NULL`, CHECK по 11 значениям                                          |
| `provider`                   | `TEXT`          | `NOT NULL`, CHECK: `gemini`, `deepseek`, `openrouter`, `openai`, `other`   |
| `model`                      | `TEXT`          | `NOT NULL`, `length(btrim(model)) BETWEEN 1 AND 160`                       |
| `attempt`                    | `INTEGER`       | `NOT NULL DEFAULT 1`, `1..20`                                              |
| `is_retry`                   | `BOOLEAN`       | `NOT NULL DEFAULT FALSE`                                                   |
| `fallback_from`              | `TEXT`          | `NULL` или тот же provider CHECK                                           |
| `ok`                         | `BOOLEAN`       | `NOT NULL`                                                                 |
| `latency_ms`                 | `INTEGER`       | `NULL` или `>= 0`                                                          |
| `finish_reason`              | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `error_code`                 | `TEXT`          | `NULL` или `length <= 160`                                                 |
| `prompt_chars`               | `INTEGER`       | `NULL` или `>= 0`; только длина, не текст                                  |
| `response_chars`             | `INTEGER`       | `NULL` или `>= 0`; только длина, не текст                                  |
| `input_tokens`               | `INTEGER`       | `NULL` или `>= 0`                                                          |
| `output_tokens`              | `INTEGER`       | `NULL` или `>= 0`                                                          |
| `total_tokens`               | `INTEGER`       | `NULL` или `>= 0`                                                          |
| `usage_source`               | `TEXT`          | `NOT NULL`, CHECK: `provider_reported`, `partial`, `unknown`               |
| `estimated_cost_usd`         | `NUMERIC(18,8)` | `NULL` или `>= 0`                                                          |
| `cost_source`                | `TEXT`          | `NOT NULL`, CHECK: `provider_reported`, `estimated_from_tariff`, `unknown` |
| `pricing_version`            | `TEXT`          | `NULL` или `length <= 200`                                                 |
| `pricing_source`             | `TEXT`          | `NULL` или `length <= 240`                                                 |
| `provider_reported_cost_usd` | `NUMERIC(18,8)` | `NULL` или `>= 0`                                                          |
| `created_at`                 | `TIMESTAMPTZ`   | `NOT NULL DEFAULT NOW()`                                                   |

Контракт «missing value stays unknown» соблюдён: tokens и cost nullable, CHECK не
превращает `NULL` в `0`.

### 2.2 Индексы

| Индекс                               | Определение                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `pierrot_llm_calls_occurred_idx`     | `(occurred_at DESC)`                                                    |
| `pierrot_llm_calls_provider_idx`     | `(provider, model, occurred_at DESC)`                                   |
| `pierrot_llm_calls_surface_idx`      | `(surface, occurred_at DESC)`                                           |
| `pierrot_llm_calls_request_idx`      | `(request_id) WHERE request_id IS NOT NULL`                             |
| `pierrot_llm_calls_conversation_idx` | `(conversation_id, occurred_at DESC) WHERE conversation_id IS NOT NULL` |

Индексы покрывают читателя `loadLlmTelemetryReport`: диапазон по `occurred_at`,
опциональные фильтры `provider` и `surface`, сортировку по `occurred_at DESC`.

### 2.3 RLS, grants, Data API

```sql
ALTER TABLE public.pierrot_llm_calls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_llm_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pierrot_llm_calls TO service_role;
```

- RLS включён.
- Policies **нет**. Для не-bypass ролей это deny-all даже при случайно выданном
  будущем grant.
- `anon` и `authenticated` не получают ни table privileges, ни policy.
- `service_role` получает table privileges и обходит RLS.
- Data API: без grant на `anon`/`authenticated` PostgREST не должен отдавать
  таблицу этим ролям. Явный `REVOKE` перекрывает Supabase default privileges.
- `PUBLIC` также revoke.

## 3. Соответствие `recordLlmCall()`

Проверены все 26 полей, которые вставляет `recordLlmCall()` в
`lib/ai/telemetry.ts:321-373`. Каждое поле существует в таблице, совпадает по
имени и укладывается в ограничения:

- `occurred_at`, `request_id`, `conversation_id`, `session_id`, `user_id`,
  `surface`, `provider`, `model`, `attempt`, `is_retry`, `fallback_from`,
  `ok`, `latency_ms`, `finish_reason`, `error_code`, `prompt_chars`,
  `response_chars`, `input_tokens`, `output_tokens`, `total_tokens`,
  `usage_source`, `estimated_cost_usd`, `cost_source`, `pricing_version`,
  `pricing_source`, `provider_reported_cost_usd`.
- `id` и `created_at` имеют defaults, приложение их не передаёт.
- `bounded()` обрезает идентификаторы и текстовые поля до тех же лимитов, что и
  CHECK-ограничения (160/200/240).
- `latency_ms` нормализуется в `Math.max(0, Math.trunc(...))`.
- `LlmProvider` и `LlmSurface` в TypeScript совпадают с CHECK-списками.
- `LlmUsageSource` и `LlmCostSource` совпадают с CHECK-списками.
- `fallback_from` может быть `NULL`; CHECK это разрешает.

Читатель `loadLlmTelemetryReport()` выбирает только существующие поля:
`occurred_at, surface, provider, model, attempt, is_retry, ok, latency_ms,
error_code, input_tokens, output_tokens, total_tokens, usage_source,
estimated_cost_usd, cost_source, pricing_version, pricing_source,
provider_reported_cost_usd`.

## 4. Privacy review

Таблица **не содержит** prompt, history, answer, RAG passage или credential.

- `prompt_chars` / `response_chars` — только количества символов.
- `error_code` формируется `errorCodeFrom()` в `lib/pierrot/model.ts:124-135`:
  стабильный code, HTTP status или сообщение только если оно проходит regex
  `^[A-Za-z0-9_.:-]{1,120}$`; свободный текст провайдера отбрасывается.
- `finish_reason` — короткое значение провайдера, ограничено 160 символами.
- `user_id`, `conversation_id`, `session_id`, `request_id` — псевдонимные
  идентификаторы, не контент. В Pierrot route они передаются только когда
  consent разрешает хранение metadata: `conversationId`/`sessionId` обнуляются
  при `!canStoreMetadata`, `userId` — только для Pierrot user id.
- Прочие адаптеры (`lib/ai/gemini.ts`, `lib/knowledge/graph/deepseek.ts`) по
  умолчанию передают `null` для conversation/session/user.

Остаточный риск: псевдонимные идентификаторы и `error_code` всё же являются
данными наблюдения. Политика retention в migration отсутствует; таблица будет
расти бесконечно. Это не блокер применения, но требует отдельного решения
(например, retention 90 дней отдельной additive migration/RPC).

## 5. Repository evidence, что migration не применена

- `docs/audits/ai-pipeline-economics-audit-2026-11-18.md:200-201` явно фиксирует:
  migration **«Not applied»**.
- В репозитории нет другого объекта/миграции, создающей
  `pierrot_llm_calls`; grep по `migrations/`, `docs/`, `scripts/` находит только
  сам файл, rollback и ссылки в UI/документации.
- Более поздние миграции (`2026-11-19` … `2026-12-14`) не создают, не изменяют
  и не удаляют `pierrot_llm_calls`.
- Commit `d0ada17b` добавил migration и rollback в одном изменении; последующих
  изменений этого файла нет (`git log -- migrations/...` — одна запись).

Это repository evidence, **не** live production proof. Live proof требует
read-only доступа к production, которого в sandbox нет.

## 6. Migration history: диагноз и blocker

В репозитории две противоречащие друг другу записи:

- `docs/operations/resource-safety.md:74` (audit 2026-10-31): в
  `supabase_migrations.schema_migrations` есть только
  `20261012062841_add_missing_foreign_key_indexes`.
- `docs/production-operations.md:121`: «There is no `schema_migrations` table in
  this project».

Фактически это означает: **таблица history не является источником истины для
этого репозитория**. Предыдущие миграции применялись вручную через psql/SQL
editor после schema inspection; `docs/audits/task-1-pierrot-commercial-intelligence.md:111`
прямо это подтверждает.

Дополнительно:

- В репозитории нет `supabase/` directory, `supabase/config.toml` и
  `supabase/migrations/`.
- Имя `2026-11-18_pierrot_llm_call_telemetry.sql` не соответствует формату
  Supabase CLI (`YYYYMMDDHHMMSS_name.sql`).
- Сам migration header предлагает `psql "$SUPABASE_DB_URL" -f ...`, то есть
  manual workflow.

**Следствие:** если применить файл через `psql`, schema изменится, но новая
строка в `supabase_migrations.schema_migrations` не появится. Нельзя честно
заявить «migration history подтверждает применение» без отдельного шага
фиксации history. Вставлять строку в history вручную или через
`supabase migration repair` — это отдельное административное действие, которое
требует явного согласия owner; task запрещает ad-hoc DDL и импровизацию.

**Варианты для owner:**

| Вариант                                                                                                           | Плюсы                                                      | Минусы                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A. Применить ровно файл через `psql`/SQL editor, evidence = `information_schema`/`pg_indexes`/`pg_policies`       | Соответствует текущему workflow репозитория; не меняет SQL | Нет строки в `supabase_migrations`; criterion «history подтверждает» не выполняется формально                                            |
| B. Сначала нормализовать Supabase CLI history (baseline + repair), затем `db push`                                | Формальная history                                         | Требует создания `supabase/` конфигурации, reconciliation всех прошлых миграций и production credentials; высокий риск, выходит за scope |
| C. Применить файл, затем отдельно зафиксировать version через `supabase migration repair` с согласованным version | Компромисс                                                 | Нужен Supabase CLI/link/token; version не совпадает с именем файла; всё равно административный шаг вне migration                         |

Рекомендация: **A** с явной записью в этом отчёте/ops-журнале, либо **C** только
если owner отдельно разрешит. Не выполнять B в рамках этой задачи.

## 7. Pre-flight read-only проверки (до approval)

Выполнить на production **только read-only** (или на Supabase preview branch).
Не запускать `\i migration` на production до approval.

```sql
-- 1. Объект уже существует?
select to_regclass('public.pierrot_llm_calls') as table_oid;

-- 2. Нет ли конфликтующего view/matview/sequence с тем же именем
select c.relname, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'pierrot_llm_calls';

-- 3. Если таблица уже есть — фактическая структура
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by ordinal_position;

-- 4. Ограничения
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.pierrot_llm_calls'::regclass
order by conname;

-- 5. Индексы
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'pierrot_llm_calls'
order by indexname;

-- 6. RLS
select relrowsecurity, relforcerowsecurity
from pg_class
where oid = 'public.pierrot_llm_calls'::regclass;

-- 7. Policies (ожидается 0 строк)
select polname, polcmd, polroles::regrole[]
from pg_policy
where polrelid = 'public.pierrot_llm_calls'::regclass;

-- 8. Grants
select grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by grantee, privilege_type;

-- 9. Явная проверка доступа ролей
select
  has_table_privilege('anon', 'public.pierrot_llm_calls', 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.pierrot_llm_calls', 'SELECT') as auth_select,
  has_table_privilege('service_role', 'public.pierrot_llm_calls', 'SELECT') as svc_select,
  has_table_privilege('service_role', 'public.pierrot_llm_calls', 'INSERT') as svc_insert;

-- 10. Migration history (фактическая, не по документации)
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

Ожидаемый baseline до применения: `to_regclass` = `NULL`, конфликтующих
объектов нет. Если `to_regclass` не `NULL` — **остановиться**: это расхождение
с ожиданием, `CREATE TABLE IF NOT EXISTS` может молча пропустить создание и
наложить индексы/grants на чужую таблицу. В этом случае нужен отдельный
диагноз, а не применение файла.

Дополнительно проверить, что более поздние миграции не ссылаются на таблицу:

```bash
grep -rn "pierrot_llm_calls" migrations/ --include='*.sql'
```

Ожидается только сам файл и rollback.

## 8. План применения после явного approval

Предусловия:

1. Owner Anton явно одобрил применение именно
   `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`.
2. Owner выбрал способ фиксации history (A или C из раздела 6).
3. Сделан backup/PITR checkpoint production (или подтверждено, что для новой
   пустой таблицы backup не требуется).
4. Pre-flight из раздела 7 выполнен, `to_regclass` = `NULL`.
5. Migration не редактировалась после review; SHA файла совпадает с review.

Применение:

```bash
# Только после approval. Не выполнять автоматически из приложения.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-11-18_pierrot_llm_call_telemetry.sql
```

`-v ON_ERROR_STOP=1` обязателен, чтобы частичное применение не осталось
незамеченным. Файл идемпотентен (`IF NOT EXISTS`, повторный `ENABLE RLS`,
повторные `REVOKE`/`GRANT`), поэтому безопасен для повторного запуска при
транзиентной ошибке.

Не выполнять `DROP`, `TRUNCATE`, `ALTER` существующих таблиц, не менять модели,
routing, prompts, fallback policy, лимиты или тарифы.

## 9. Post-apply read-only проверки

Повторить запросы 1, 3–10 из раздела 7. Ожидаемо:

| Проверка                     | Ожидание                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `to_regclass`                | `public.pierrot_llm_calls`                                                            |
| Колонки                      | 28 колонок, типы и nullable как в разделе 2.1                                         |
| PK                           | `pierrot_llm_calls_pkey` на `id`                                                      |
| CHECK constraints            | surface/provider/model/attempt/usage_source/cost_source и nullable-check              |
| Индексы                      | 5 индексов из раздела 2.2 + PK                                                        |
| `relrowsecurity`             | `true`                                                                                |
| Policies                     | 0 строк                                                                               |
| `anon_select`, `auth_select` | `false`                                                                               |
| `svc_select`, `svc_insert`   | `true`                                                                                |
| History                      | строка есть только если owner выбрал вариант C; при варианте A — documented exception |

Проверка Data API / PostgREST:

- `anon`/`authenticated` не должны получать таблицу через `/rest/v1/pierrot_llm_calls`.
- `service_role` должен получать `200`, не `404`.
- Если после DDL PostgREST ещё отдаёт `PGRST205`/404, дождаться auto-reload
  schema cache (Supabase event trigger) или, с разрешения owner, выполнить
  `NOTIFY pgrst, 'reload schema';`. Это операционное действие, не DDL.

Проверка constraints на реальном insert **не выполняется**: task запрещает
создавать тестовые записи в production. Поэтому отсутствие 404
подтверждается:

1. наличием таблицы и grants;
2. отсутствием `PGRST205` / `42P01` / `relation ... does not exist` в runtime
   logs после применения;
3. ростом `count(*)` от реального пользовательского трафика (не синтетика).

## 10. Runtime logs: что искать

До применения `recordLlmCall()` намеренно подавляет warning для missing table
(`isMissingTelemetryTable`), поэтому «тишина в логах» не является доказательством
успеха. Искать нужно:

- `[AI telemetry] insert failed`;
- `PGRST205`;
- `42P01`;
- `relation "public.pierrot_llm_calls" does not exist`;
- HTTP `404` на `/rest/v1/pierrot_llm_calls`.

После применения: этих записей быть не должно. Дополнительно сверить, что
`/admin/pierrot/ai-costs` перестал показывать
`telemetry_migration_not_applied` (причина `unavailableReason` в
`lib/ai/telemetryReport.ts:298-315`).

## 11. Административные агрегаты и privacy

Страница `app/admin/pierrot/(workspace)/ai-costs/page.tsx`:

- требует `requireAdmin()`;
- создаёт server-side client с `useServiceRole: true`;
- читает данные через `loadLlmTelemetryReport()`;
- не выбирает и не отображает prompt, answer, RAG passage, `user_id`,
  `conversation_id`, `session_id`, `request_id`;
- группирует по `provider`, `model`, `surface`;
- показывает: messages, provider calls, ok/failed, retries/fallbacks, tokens
  (in/out/unknown), estimated cost, provider-reported cost.

**Найденный gap:** latency. `latency_ms` сохраняется и выбирается из БД, но:

- `summarizeLlmCalls()` не принимает `latencyMs` в агрегируемый тип;
- `LlmTelemetryRow`/`LlmTelemetryTotals` не содержат latency-полей;
- страница `/admin/pierrot/ai-costs` не выводит latency.

Следовательно acceptance criterion «агрегаты показывают ... latency» **сейчас не
выполнен**. Это не влияет на применение migration: данные latency начнут
сохраняться сразу. Но для полного acceptance нужен отдельный небольшой
code-change (aggregate + UI + test) — он не требует DDL и не входит в данный
review. Owner должен выбрать: (а) принять latency как «сохраняется, но пока не
агрегируется», или (б) одобрить follow-up code-change.

Также `retries` в UI считается как `is_retry === true` (attempt > 1) и не
разбивает `fallback_from` по провайдерам. Для acceptance «fallback» это
приемлемое приближение, но точный fallback-count по `fallback_from` не выводится.

Ограничение читателя: `limit(50_000)` строк за период и агрегация в JS. При
большом объёме отчёт может молча усечься. Для текущего объёма это приемлемо;
для масштабирования позже нужен SQL aggregate/RPC. Не менять в этой задаче.

## 12. Rollback plan

Rollback-файл: `DROP TABLE IF EXISTS public.pierrot_llm_calls;`

- Таблица новая, без foreign keys и зависимых объектов, поэтому rollback
  технически чистый.
- Rollback **деструктивный**: удаляет всю накопленную telemetry.
- Перед rollback (если есть данные) сделать export и хранить его по правилам
  обращения с псевдонимными идентификаторами:

```bash
psql "$SUPABASE_DB_URL" -c "\copy (select * from public.pierrot_llm_calls) to '/secure/path/pierrot_llm_calls.csv' csv header"
```

- После rollback приложение продолжит работать: `recordLlmCall()` fail-closed,
  admin-страница покажет `telemetry_migration_not_applied`.
- Повторное применение файла после rollback безопасно.

Rollback выполнять только по решению owner, не автоматически.

## 13. Ожидаемое влияние

- **User-facing:** нет изменений. Вставка telemetry уже best-effort и не ломает
  ответ при ошибке.
- **Write path:** одна строка на provider attempt. Для Pierrot — до 3 попыток
  (Gemini → DeepSeek → OpenRouter) на сообщение; плюс graph/media/evaluation
  вызовы. Объём небольшой, 5 индексов добавляют умеренную write-нагрузку.
- **Read path:** админ-страница читает до 50k строк за 7/30 дней через
  service-role; индексы по `occurred_at` и фильтрам поддерживают запрос.
- **Storage:** таблица растёт без retention. Нужен отдельный retention decision.
- **Security:** public/anon/authenticated доступ не появляется; RLS deny-all;
  service_role only. Существующие RLS других таблиц не затрагиваются.
- **Data compatibility:** существующие URL, таблицы и данные не меняются;
  migration только добавляет новый объект.

## 14. Риски и замечания

| Уровень | Риск                                                                               | Комментарий                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker | Нет live production schema/history proof в sandbox                                 | Нужен read-only доступ или выполнение pre-flight owner/runner                                                                                                                             |
| Blocker | Supabase CLI history не настроена; файл не в формате CLI                           | Нужно решение A/C из раздела 6                                                                                                                                                            |
| Medium  | `GRANT ALL` для `service_role` шире минимально нужного (`SELECT, INSERT`)          | `service_role` — доверенная server-only роль; риск низкий, но least privilege был бы чище. Менять SQL после approval нельзя; можно принять как есть или согласовать amendment до approval |
| Medium  | Нет retention                                                                      | Рост таблицы и псевдонимных данных; отдельная задача                                                                                                                                      |
| Medium  | Latency не агрегируется в UI                                                       | Acceptance gap; отдельный code-change                                                                                                                                                     |
| Low     | `CREATE TABLE IF NOT EXISTS` может замаскировать дрейф схемы                       | Pre-flight `to_regclass` обязателен; при non-NULL — стоп                                                                                                                                  |
| Low     | PostgREST schema cache может временно отдавать 404 после DDL                       | Проверить logs; reload только при необходимости                                                                                                                                           |
| Low     | `anon`/`authenticated`/`service_role` могут отсутствовать в plain Postgres staging | В Supabase они есть; для plain Postgres dry-run создать роли или не запускать grants                                                                                                      |
| Low     | `error_code`/`finish_reason` — короткие свободные строки                           | Код санитизирует `error_code`; лимит 160; контент не сохраняется                                                                                                                          |
| Low     | `limit(50_000)` может усечь агрегат                                                | Не блокер текущего объёма                                                                                                                                                                 |

## 15. Проверки, выполненные в этом review

| Команда                                                                                                              | Результат                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                                                                                     | exit 0                                                                                     |
| `pnpm exec jest lib/ai/__tests__/telemetry.test.ts lib/ai/__tests__/geminiTelemetry.test.ts --runInBand`             | 2 suites / 11 tests passed                                                                 |
| `pnpm exec jest lib/pierrot/__tests__/modelAttempts.test.ts lib/ai/evaluation/__tests__/compare.test.ts --runInBand` | 2 suites / 7 tests passed                                                                  |
| `pnpm exec eslint lib/ai/telemetry.ts lib/ai/telemetryReport.ts lib/ai/__tests__/telemetry.test.ts`                  | exit 0                                                                                     |
| `git status`                                                                                                         | clean before review; только этот отчёт добавлен                                            |
| Production SQL / psql                                                                                                | **не запускалось**                                                                         |
| Production logs / Vercel / Supabase API                                                                              | **не запускалось**                                                                         |
| Migration tests / CI                                                                                                 | в репозитории нет отдельного migration-test suite; CI workflow не содержит migration steps |

CI: `.github/workflows/ci.yml` не применяет миграции и не проверяет schema.
Отдельного `migration test` в `package.json` нет.

## 16. Явные вопросы owner (approval gate)

1. Одобряете применение ровно
   `migrations/2026-11-18_pierrot_llm_call_telemetry.sql` без изменения SQL?
2. Какой вариант history evidence выбираете: **A** (schema inspection +
   документированное исключение) или **C** (`supabase migration repair` после
   применения)? Вариант B не рекомендуется.
3. Принимаете `GRANT ALL` для `service_role` или требуете amendment до
   применения (тогда это будет уже не «ровно этот файл»)?
4. Принимаете latency-gap как follow-up, или одобряете отдельный code-change
   на агрегат latency до/после DDL?
5. Нужна ли retention policy отдельной задачей?

До ответов на эти вопросы production DDL не выполняется.

## 17. Итоговый статус acceptance criteria

| Criterion                                                                                     | Статус              | Evidence                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| Owner review report подготовлен до production DDL                                             | satisfied           | этот документ; DDL не выполнялся                                           |
| Production migration не применяется без явного owner approval                                 | satisfied           | ни одной production-команды не запущено; approval gate в разделе 16        |
| После approval применена ровно migration `2026-11-18_pierrot_llm_call_telemetry.sql`          | not_verified        | approval ещё не получен; применение не выполнялось                         |
| Migration history подтверждает применение                                                     | not_verified        | history не настроена/противоречива; нужен выбор A/C                        |
| RLS/grants соответствуют reviewed security model                                              | not_verified (live) | SQL review выполнен; live schema не проверена из-за отсутствия credentials |
| Нет 404 при записи telemetry                                                                  | not_verified        | требует применения и runtime logs; синтетические insert запрещены          |
| Подтверждён безопасный доступ к агрегатам provider attempts, fallback, tokens, latency и cost | failed (latency)    | attempts/fallback/tokens/cost есть; latency не агрегируется в UI           |
