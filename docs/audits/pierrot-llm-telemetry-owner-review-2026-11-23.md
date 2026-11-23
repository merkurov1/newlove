# Owner review: восстановление telemetry `pierrot_llm_calls`

**Дата review:** 2026-11-23  
**Task ID:** `cabfc3c3-b22b-4435-b7af-9c7af78f48c9`  
**Attempt:** 2  
**Repository:** `merkurov1/newlove`  
**Base ref:** `main` = `0e82db35f89562a76f53e9ef2f392c708a9964af`  
**Working branch:** `pierrot/dev/cabfc3c3-b22b-4435-b7af-9c7af78f48c9/2`  
**Migration under review:** `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`  
**Rollback:** `migrations/rollback/2026-11-18_pierrot_llm_call_telemetry.rollback.sql`

## 0. Статус

**Production DDL не выполнялся. Production schema и migration history не читались.
Секреты не читались. Owner approval не получен.**

Этот документ — owner-review report, обязательный gate перед production DDL.
Он **не является** разрешением на применение. Применение возможно только после
явного approval Антона и только после read-only pre-flight на production.

Документ заменяет review от 2026-11-21
(`docs/audits/pierrot-llm-telemetry-owner-review-2026-11-21.md`) для текущего
`main`. Причина замены: после того review в `main` вошли изменения
`26258c38` (task `303de833`), которые добавили в агрегат latency и чтение
`fallback_from`. Прежний вывод «latency не агрегируется» для текущего `main`
неверен.

## 1. Зафиксированные входные данные

| Параметр                   | Значение                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| Reviewed `HEAD`            | `0e82db35f89562a76f53e9ef2f392c708a9964af`                         |
| `main`                     | `0e82db35f89562a76f53e9ef2f392c708a9964af`                         |
| Migration path             | `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`             |
| Migration git blob         | `18f8b7b38ae42250e1d817513e0015e873b19318`                         |
| Migration SHA-256          | `a093af93b553829514978dc46a9eb0ae42dd6a3336090a3fd8053db15d6dd08d` |
| Migration lines            | 86                                                                 |
| Rollback git blob          | `f164b07d4c1e8f3120d6a577011698a7e3b320a2`                         |
| Rollback SHA-256           | `237cb428b45afcd07147e1e1c1e80a1d63541415a2224eebdb60f2b1c5174da3` |
| Migration introduced       | `d0ada17b62b756d8915f67046d541443ea4db5d0`, 2026-11-18T19:53:20Z   |
| Later edits to migration   | нет (`git log` по файлу содержит только `d0ada17b`)                |
| Supabase migration version | **не назначена**; см. раздел 6                                     |

Файл миграции не редактировался в рамках этого review. Rollback также не
редактировался.

## 2. Что создаёт migration

Файл аддитивный. Он не изменяет существующие таблицы, не удаляет данные, не
создаёт функций, триггеров, views, RLS policies и foreign keys.

Создаётся ровно:

1. таблица `public.pierrot_llm_calls` — 28 колонок;
2. 5 индексов (плюс PK-индекс, который создаётся автоматически);
3. RLS на таблице;
4. table grants для `service_role` и отзыв прав у `PUBLIC`/`anon`/`authenticated`.

Полный SQL находится в файле; ниже — зафиксированные объекты и ограничения.

### 2.1 Колонки (28)

`id UUID PK DEFAULT gen_random_uuid()`, `occurred_at TIMESTAMPTZ NOT NULL
DEFAULT NOW()`, `request_id`, `conversation_id`, `session_id`, `user_id`,
`surface`, `provider`, `model`, `attempt`, `is_retry`, `fallback_from`, `ok`,
`latency_ms`, `finish_reason`, `error_code`, `prompt_chars`, `response_chars`,
`input_tokens`, `output_tokens`, `total_tokens`, `usage_source`,
`estimated_cost_usd NUMERIC(18,8)`, `cost_source`, `pricing_version`,
`pricing_source`, `provider_reported_cost_usd NUMERIC(18,8)`, `created_at
TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

Контракт «missing value stays unknown» соблюдён: `input_tokens`,
`output_tokens`, `total_tokens`, `latency_ms`, `estimated_cost_usd` и
`provider_reported_cost_usd` nullable; CHECK-ограничения не превращают NULL в 0.

### 2.2 Ограничения

Всего 24 constraint: 1 primary key + 23 CHECK.

| Constraint                                                                    | Проверка                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pierrot_llm_calls_pkey`                                                      | PK `(id)`                                                                                                                                              |
| `..._surface_check`                                                           | 11 значений: `pierrot_web`, `pierrot_stream`, `question`, `flow_issue`, `flow_item`, `brain`, `media`, `intake`, `art_engine`, `evaluation`, `unknown` |
| `..._provider_check`                                                          | `gemini`, `deepseek`, `openrouter`, `openai`, `other`                                                                                                  |
| `..._fallback_from_check`                                                     | NULL или тот же список провайдеров                                                                                                                     |
| `..._usage_source_check`                                                      | `provider_reported`, `partial`, `unknown`                                                                                                              |
| `..._cost_source_check`                                                       | `provider_reported`, `estimated_from_tariff`, `unknown`                                                                                                |
| `..._model_check`                                                             | `length(btrim(model)) BETWEEN 1 AND 160`                                                                                                               |
| `..._attempt_check`                                                           | `attempt BETWEEN 1 AND 20`                                                                                                                             |
| `..._latency_ms_check`                                                        | NULL или `>= 0`                                                                                                                                        |
| `..._prompt_chars_check`, `..._response_chars_check`                          | NULL или `>= 0`                                                                                                                                        |
| `..._input_tokens_check`, `..._output_tokens_check`, `..._total_tokens_check` | NULL или `>= 0`                                                                                                                                        |
| `..._estimated_cost_usd_check`, `..._provider_reported_cost_usd_check`        | NULL или `>= 0`                                                                                                                                        |
| `request_id`, `conversation_id`, `session_id`, `user_id`                      | NULL или `length <= 160`                                                                                                                               |
| `finish_reason`, `error_code`                                                 | NULL или `length <= 160`                                                                                                                               |
| `pricing_version`                                                             | NULL или `length <= 200`                                                                                                                               |
| `pricing_source`                                                              | NULL или `length <= 240`                                                                                                                               |

### 2.3 Индексы

| Индекс                               | Определение                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `pierrot_llm_calls_occurred_idx`     | `(occurred_at DESC)`                                                    |
| `pierrot_llm_calls_provider_idx`     | `(provider, model, occurred_at DESC)`                                   |
| `pierrot_llm_calls_surface_idx`      | `(surface, occurred_at DESC)`                                           |
| `pierrot_llm_calls_request_idx`      | `(request_id) WHERE request_id IS NOT NULL`                             |
| `pierrot_llm_calls_conversation_idx` | `(conversation_id, occurred_at DESC) WHERE conversation_id IS NOT NULL` |

Индексы покрывают чтение по диапазону `occurred_at`, фильтры `provider` и
`surface`, сортировку `occurred_at DESC`.

## 3. SQL / security review

### 3.1 RLS и grants

```sql
ALTER TABLE public.pierrot_llm_calls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_llm_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pierrot_llm_calls TO service_role;
```

- RLS включён.
- `CREATE POLICY` отсутствует намеренно. Для ролей без `BYPASSRLS` это
  deny-all даже при случайном будущем grant.
- `anon` и `authenticated` не получают table privileges; `PUBLIC` также
  отозван. Это перекрывает Supabase default privileges.
- `service_role` получает table privileges и в Supabase обходит RLS по дизайну.
  Это единственная роль, которой таблица реально доступна.
- `anon`/`authenticated` не смогут читать таблицу через PostgREST
  (`/rest/v1/pierrot_llm_calls`); ожидается permission denied, а не данные.
- `service_role` после применения должен получать `200`, а не `404`.

**Замечание least privilege:** `GRANT ALL` даёт `service_role` также `DELETE`,
`UPDATE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`. Приложению нужны только
`SELECT`/`INSERT` (читатель отчёта и writer). `service_role` — доверенная
server-only роль, поэтому риск низкий, но это шире минимально необходимого.
Изменение на `GRANT SELECT, INSERT` означало бы уже не «ровно этот файл»;
решение за owner (раздел 11).

### 3.2 Privacy

Таблица не содержит prompt, history, answer, RAG passage, vector, файл или
credential.

- `prompt_chars` / `response_chars` — только количества символов.
- `error_code` формируется `errorCodeFrom()` в `lib/pierrot/model.ts`: стабильный
  код/HTTP status, свободный текст провайдера отбрасывается.
- `finish_reason` — короткое значение провайдера, ограничено 160 символами.
- `request_id`, `conversation_id`, `session_id`, `user_id` — псевдонимные
  идентификаторы, не контент. В Pierrot route они обнуляются при запрете
  хранения metadata; адаптеры (`gemini`, embeddings, graph deepseek`) по
умолчанию передают `null`.
- `pricing_version`/`pricing_source` — версия и источник тарифа, не секрет.

Остаточный риск: псевдонимные идентификаторы и error codes — это данные
наблюдения. Retention policy в migration отсутствует; таблица будет расти
бесконечно. Это отдельное решение owner, не блокер применения.

### 3.3 Data API exposure

`public` схема в Supabase экспонируется через PostgREST, но доступ к таблице
определяется table privileges + RLS. После `REVOKE` у `anon`/`authenticated`
нет ни одного table privilege, policies отсутствуют. Публичного доступа нет.

После DDL возможен кратковременный `404`/`PGRST205` из-за schema cache
PostgREST. Supabase обычно перезагружает cache автоматически; при необходимости
owner/оператор выполняет `NOTIFY pgrst, 'reload schema';` — это операционное
действие, не DDL.

## 4. Соответствие `recordLlmCall()`

Writer: `lib/ai/telemetry.ts:363-416`. Он вставляет ровно 26 полей; `id` и
`created_at` не передаются и заполняются defaults.

Проверено соответствие:

- все 26 имён колонок существуют в таблице;
- типы совместимы: UUID/TIMESTAMPTZ/TEXT/INTEGER/BOOLEAN/NUMERIC;
- `bounded()` обрезает identifiers и текст до 160/200/240, совпадая с CHECK;
- `latency_ms` нормализуется в `Math.max(0, Math.trunc(...))`;
- `LlmProvider`, `LlmSurface`, `LlmUsageSource`, `LlmCostSource` в TypeScript
  совпадают с CHECK-списками;
- `model` в приложении — непустая константа, CHECK `btrim` не нарушается;
- `attempt` в Pierrot chain максимум 3 (Gemini → DeepSeek → OpenRouter),
  CHECK допускает 1..20;
- `fallback_from` может быть NULL;
- NULL tokens/cost остаются NULL.

Наблюдение: в текущем `main` `isRetry` в production-путях всегда `false`
(SDK retries отключены; fallback оформляется отдельной строкой с
`fallback_from`). Поэтому метрика «Retries» на дашборде, скорее всего, будет
нулевой, пока не появится реальный same-provider retry. На fallback, tokens и
cost это не влияет.

При отсутствии таблицы `recordLlmCall()` fail-closed: возвращает `false`,
подавляет warning для `42P01`/`PGRST205`, ответ пользователю не ломается.
Поэтому «тишина в логах» до применения не доказывает успех; искать нужно явные
ошибки после применения.

Reader: `lib/ai/telemetryReport.ts` выбирает
`occurred_at, surface, provider, model, attempt, is_retry, fallback_from, ok,
latency_ms, error_code, input_tokens, output_tokens, total_tokens,
usage_source, estimated_cost_usd, cost_source, pricing_version, pricing_source,
provider_reported_cost_usd`.

Все выбранные поля существуют. Prompt/content и псевдонимные идентификаторы
reader не выбирает.

## 5. Production schema и migration history

### 5.1 Что известно из репозитория

- `docs/audits/ai-pipeline-economics-audit-2026-11-18.md` фиксирует migration
  как **«Not applied»**.
- Ни одна более поздняя migration не создаёт, не изменяет и не удаляет
  `pierrot_llm_calls`; grep по `migrations/` находит только саму migration и
  rollback.
- В репозитории нет каталога `supabase/`, `supabase/config.toml` и
  `supabase/migrations/`. Имя файла не соответствует формату Supabase CLI
  (`YYYYMMDDHHMMSS_name.sql`); header предлагает manual `psql`.
- Документация противоречива:
  - `docs/operations/resource-safety.md`: в `supabase_migrations.schema_migrations`
    есть только `20261012062841_add_missing_foreign_key_indexes`;
  - `docs/production-operations.md`: «There is no `schema_migrations` table in
    this project».
- `.github/workflows/ci.yml` содержит migration job, но он применяет только
  `scripts/knowledge/verify-brain-hnsw-migration.mjs`; этот файл CI не
  применяет и не проверяет.

### 5.2 Что не проверено и почему

Фактическая production schema и `supabase_migrations.schema_migrations` **не
проверены**: в workspace нет production credentials, а task запрещает читать
секреты и вызывать Supabase management APIs. Это сознательный blocker, а не
пропущенный шаг.

Task premise от owner: в production отсутствует `public.pierrot_llm_calls`,
поэтому запись даёт 404/`PGRST205`. Это принимается как owner-provided факт, но
не подтверждено live-запросом из этого окружения.

### 5.3 Обязательный pre-flight до approval/apply

Выполнять на production **только read-only**, после явного approval:

```sql
-- 1. Объект уже существует? Ожидается NULL.
select to_regclass('public.pierrot_llm_calls') as table_oid;

-- 2. Нет ли view/matview/sequence с тем же именем.
select c.relname, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'pierrot_llm_calls';

-- 3. Фактическая history, если таблица существует.
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;

-- 4. Конфликтующие objects в более поздних миграциях.
--    Ожидается только сама migration и rollback.
```

Если `to_regclass` не NULL — **остановиться**. `CREATE TABLE IF NOT EXISTS`
молча пропустит создание и наложит индексы/grants на чужую/частичную таблицу.
Нужен отдельный диагноз, а не применение файла.

### 5.4 Migration history: варианты

Так как CLI history для этих файлов не используется, «применить ровно файл» и
«history подтверждает применение» одновременно требуют решения owner:

| Вариант | Действие                                                                                                     | Плюсы                                            | Минусы                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **A**   | Применить файл через `psql`/SQL editor; evidence = `information_schema`, `pg_indexes`, `pg_policies`, grants | Соответствует текущему workflow; SQL не меняется | Нет строки в `supabase_migrations`; criterion «history подтверждает» формально не выполняется                        |
| **C**   | Применить файл, затем зафиксировать version через `supabase migration repair`                                | Формальная history                               | Нужны CLI/link/token; version нужно согласовать; административный шаг вне migration                                  |
| **B**   | Сначала нормализовать CLI history (baseline + repair всех миграций), затем `db push`                         | Формальная history                               | Высокий риск, требует создания `supabase/`, reconciliation всех прошлых миграций и production credentials; вне scope |

Рекомендация: **A** с явной записью в ops-журнале, либо **C** только если owner
отдельно разрешит. **B** в этой задаче не выполнять.

Если выбран C, предлагаемая version — `20261118000000` (дата файла + нулевое
время). Это предложение, не факт: version должна быть утверждена owner.
Сейчас **никакой migration version не назначена**.

## 6. Локальный dry-run (новое в attempt 2)

Для проверки SQL без production использован изолированный Docker-контейнер
`postgres:16-alpine`. Роли `anon`, `authenticated`, `service_role` (с
`BYPASSRLS`) созданы локально для имитации Supabase. Production не затрагивался,
секреты не использовались, тестовые записи создавались только в локальном
контейнере.

| Проверка                      | Результат                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Применение migration          | SUCCESS: `CREATE TABLE`, 5 × `CREATE INDEX`, `ALTER TABLE`, `REVOKE`, `GRANT`                                                  |
| Повторное применение          | SUCCESS, idempotent (`NOTICE ... already exists`, повторные RLS/grants)                                                        |
| Колонки                       | 28                                                                                                                             |
| Constraints                   | 24: 1 PK + 23 CHECK                                                                                                            |
| Индексы                       | 6: 5 явных + PK                                                                                                                |
| RLS                           | `relrowsecurity = true`, `relforcerowsecurity = false`                                                                         |
| Policies                      | 0                                                                                                                              |
| `anon` SELECT/INSERT          | `false` / `false`; фактический SELECT → `permission denied`                                                                    |
| `authenticated` SELECT/INSERT | `false` / `false`; фактический INSERT → `permission denied`                                                                    |
| `service_role` SELECT/INSERT  | `true` / `true`                                                                                                                |
| Representative insert         | SUCCESS: `deepseek`/`deepseek-chat`, attempt 2, `fallback_from='gemini'`, latency 321, partial tokens                          |
| NULL semantics                | `input_tokens/output_tokens/total_tokens = NULL`, `usage_source='unknown'`, `estimated_cost_usd=NULL`, `cost_source='unknown'` |
| Invalid `surface`             | CHECK violation                                                                                                                |
| Negative `input_tokens`       | CHECK violation                                                                                                                |
| Rollback                      | `DROP TABLE`, `to_regclass = NULL`                                                                                             |
| Re-apply после rollback       | SUCCESS, таблица пустая (`count = 0`)                                                                                          |

Ограничения dry-run:

- локальный Postgres 16, не Supabase; поведение PostgREST и Supabase default
  privileges не воспроизводились;
- в локальной БД owner `postgres` имеет полные grants — это нормально для
  owner и не отражает доступ `anon`/`authenticated`;
- `service_role` смоделирован как `BYPASSRLS`, как в Supabase;
- dry-run не доказывает production schema и не заменяет pre-flight.

Воспроизведение (без секретов, только локально):

```bash
docker run -d --name pierrot-telemetry-review \
  -e POSTGRES_PASSWORD=review -e POSTGRES_DB=review postgres:16-alpine
docker exec -i pierrot-telemetry-review psql -U postgres -d review <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
SQL
docker cp migrations/2026-11-18_pierrot_llm_call_telemetry.sql \
  pierrot-telemetry-review:/tmp/telemetry.sql
docker exec pierrot-telemetry-review psql -U postgres -d review \
  -v ON_ERROR_STOP=1 -f /tmp/telemetry.sql
```

## 7. CI и тесты

Выполнено в этом review на `0e82db35`:

| Команда                                                                                                                                                                                                                                              | Результат                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `pnpm typecheck`                                                                                                                                                                                                                                     | exit 0                                |
| `pnpm exec jest lib/ai/__tests__/telemetry.test.ts lib/ai/__tests__/telemetryReport.test.ts lib/ai/__tests__/geminiTelemetry.test.ts lib/knowledge/rag/__tests__/embeddingTelemetry.test.ts lib/pierrot/__tests__/modelAttempts.test.ts --runInBand` | 5 suites, 25 tests passed             |
| `pnpm exec eslint lib/ai/telemetry.ts lib/ai/telemetryReport.ts lib/ai/__tests__/telemetry.test.ts lib/ai/__tests__/telemetryReport.test.ts 'app/admin/pierrot/(workspace)/ai-costs/page.tsx'`                                                       | exit 0 (только browserslist warnings) |
| Локальный SQL dry-run                                                                                                                                                                                                                                | см. раздел 6                          |

CI gap: в `.github/workflows/ci.yml` нет теста этой migration. Migration job
проверяет только Brain HNSW. Поэтому зелёный CI **не доказывает** корректность
`2026-11-18_pierrot_llm_call_telemetry.sql`. Локальный dry-run из раздела 6
покрывает SQL, но не является частью CI. Добавление такого теста — отдельное
улучшение, не входящее в текущий diff.

## 8. Административные агрегаты и безопасность чтения

Страница: `app/admin/pierrot/(workspace)/ai-costs/page.tsx`.

- вызывает `requireAdmin()` до любых данных;
- создаёт server-side client с `useServiceRole: true`;
- читает через `loadLlmTelemetryReport()`;
- не выбирает и не отображает prompt, answer, RAG passage, `user_id`,
  `conversation_id`, `session_id`, `request_id`;
- группирует по `provider`, `model`, `surface`;
- показывает:
  - messages (`assistant_replied`) отдельно от provider calls;
  - ok/failed;
  - retries (same provider) и fallbacks (provider switch) отдельно;
  - **average latency** и latency samples;
  - input/output/total tokens и unknown usage;
  - estimated cost + unknown cost count;
  - provider-reported cost отдельно.

Latency-gap из review 2026-11-21 **закрыт** в `main` коммитом `26258c38`:
`LlmTelemetryRow`/`LlmTelemetryTotals` содержат `latencyTotalMs`,
`latencySamples`, `averageLatencyMs`; `summarizeLlmCalls()` агрегирует
`latencyMs`; страница выводит среднее; `telemetryReport.test.ts` проверяет
`averageLatencyMs` и `latencySamples`.

Fallback теперь считается по `fallback_from` (reader его выбирает), поэтому
приближение «is_retry» больше не используется для fallback.

Ограничения агрегата:

- reader забирает до `50_000` строк за период и агрегирует в JS; при большом
  объёме отчёт может молча усечься. Для текущего объёма приемлемо; для
  масштабирования позже нужен SQL aggregate/RPC.
- Gemini cost остаётся unknown, пока owner не задаст проверенные
  `GEMINI_*_USD_PER_MILLION`.
- `estimated_cost_usd` — оценка по тарифу, не invoice.
- «Retries» в текущем коде всегда 0, пока нет реального same-provider retry.

## 9. Ожидаемое влияние

- **User-facing:** изменений нет. Запись telemetry best-effort; ошибка не
  ломает ответ.
- **Write path:** одна строка на provider attempt. Для Pierrot до 3 попыток на
  сообщение; плюс graph/media/evaluation/embedding вызовы. Объём небольшой.
- **Read path:** admin-страница читает до 50k строк за 7/30 дней через
  service-role; индексы поддерживают диапазон и фильтры.
- **Storage:** таблица растёт без retention; нужен отдельный retention decision.
- **Security:** public/anon/authenticated доступа не появляется; RLS deny-all;
  service_role only. Существующие RLS других таблиц не затрагиваются.
- **Data compatibility:** существующие URL, таблицы и данные не меняются;
  migration только добавляет новый объект.

## 10. Rollback plan

Rollback-файл: `DROP TABLE IF EXISTS public.pierrot_llm_calls;`

- таблица новая, без FK и зависимых объектов; rollback технически чистый;
- rollback **деструктивный**: удаляет всю накопленную telemetry;
- перед rollback (если есть данные) сделать export по правилам обращения с
  псевдонимными идентификаторами;
- после rollback приложение продолжит работать: `recordLlmCall()` fail-closed,
  admin-страница покажет `telemetry_migration_not_applied`;
- повторное применение файла после rollback безопасно (проверено локально);
- rollback выполнять только по решению owner, не автоматически.

## 11. Риски

| Уровень | Риск                                                               | Комментарий                                                                              |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Blocker | Нет live production schema/history proof                           | Нужен read-only pre-flight с production credentials у owner/оператора                    |
| Blocker | Supabase CLI history не настроена; файл не в CLI-формате           | Нужно решение A/C и, для C, version                                                      |
| Blocker | Нет явного owner approval                                          | Production DDL запрещён                                                                  |
| Medium  | `GRANT ALL` шире минимально нужного                                | Можно принять или согласовать amendment до approval; amendment нарушит «ровно этот файл» |
| Medium  | Нет retention                                                      | Рост таблицы и псевдонимных данных; отдельная задача                                     |
| Low     | `CREATE TABLE IF NOT EXISTS` маскирует schema drift                | Pre-flight `to_regclass` обязателен; при non-NULL — стоп                                 |
| Low     | PostgREST schema cache временно 404 после DDL                      | Проверить логи; reload только при необходимости                                          |
| Low     | `anon`/`authenticated`/`service_role` отсутствуют в plain Postgres | В Supabase они есть; для plain Postgres dry-run создать роли                             |
| Low     | `limit(50_000)` может усечь агрегат                                | Не блокер текущего объёма                                                                |
| Low     | «Retries» всегда 0                                                 | SDK retries отключены; данные не искажаются, но метрика пустая                           |

## 12. Owner approval gate

До ответов на эти вопросы production DDL не выполняется:

1. Одобряете применение ровно
   `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`
   (blob `18f8b7b3…`, SHA-256 `a093af93…`) без изменения SQL?
2. Какой вариант history evidence: **A** (schema inspection + документированное
   исключение) или **C** (`supabase migration repair`, version
   `20261118000000`)? Вариант B не рекомендуется.
3. Принимаете `GRANT ALL` для `service_role` или требуете amendment до
   применения? Amendment означает, что это будет уже не тот же файл.
4. Нужна ли retention policy отдельной задачей?
5. Кто выполняет read-only pre-flight, применение и post-check (owner или
   оператор с production credentials)? Этот агент не имеет и не должен получать
   production credentials.

## 13. План после approval

Только после явного approval и выбора A/C:

1. Сделать backup/PITR checkpoint (для новой пустой таблицы backup может быть
   не нужен; решение owner).
2. Выполнить read-only pre-flight из 5.3. При `to_regclass` non-NULL —
   остановиться и представить диагноз.
3. Проверить, что SHA-256 файла всё ещё `a093af93…`; migration не редактировалась.
4. Применить ровно файл:

```bash
psql "$SUPABASE_DB_URL" -1 -v ON_ERROR_STOP=1 \
  -f migrations/2026-11-18_pierrot_llm_call_telemetry.sql
```

`-1`/`--single-transaction` и `ON_ERROR_STOP=1` обязательны, чтобы частичное
применение не осталось незамеченным. Файл идемпотентен и безопасен для
повторного запуска при транзиентной ошибке.

5. Если выбран C — зафиксировать version `20261118000000` штатным
   `supabase migration repair` по согласованию с owner. Если A — записать
   исключение в ops-журнал.
6. Выполнить post-check (раздел 14).
7. Проверить runtime logs и `/admin/pierrot/ai-costs`.

Не выполнять `DROP`, `TRUNCATE`, `ALTER` существующих таблиц, не менять модели,
routing, prompts, fallback policy, лимиты или тарифы. Не создавать тестовые
записи в production.

## 14. Post-apply read-only проверки

```sql
-- 1. Таблица существует.
select to_regclass('public.pierrot_llm_calls') as table_oid;

-- 2. Колонки: ожидается 28.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by ordinal_position;

-- 3. Constraints: ожидается 1 PK + 23 CHECK.
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.pierrot_llm_calls'::regclass
order by conname;

-- 4. Индексы: ожидается 5 + PK.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'pierrot_llm_calls'
order by indexname;

-- 5. RLS: relrowsecurity = true, policies = 0.
select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.pierrot_llm_calls'::regclass;
select count(*) from pg_policy
where polrelid = 'public.pierrot_llm_calls'::regclass;

-- 6. Grants.
select grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by grantee, privilege_type;

-- 7. Effective privileges: anon/auth false, service_role true.
select
  has_table_privilege('anon', 'public.pierrot_llm_calls', 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.pierrot_llm_calls', 'SELECT') as auth_select,
  has_table_privilege('service_role', 'public.pierrot_llm_calls', 'SELECT') as svc_select,
  has_table_privilege('service_role', 'public.pierrot_llm_calls', 'INSERT') as svc_insert;

-- 8. History (если применимо).
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

Ожидаемо: `to_regclass = public.pierrot_llm_calls`, 28 колонок, 24 constraints,
6 индексов, `relrowsecurity = true`, 0 policies, `anon_select = false`,
`auth_select = false`, `svc_select = true`, `svc_insert = true`.

Runtime logs: после применения не должно быть

- `[AI telemetry] insert failed`;
- `PGRST205`;
- `42P01`;
- `relation "public.pierrot_llm_calls" does not exist`;
- HTTP `404` на `/rest/v1/pierrot_llm_calls`.

Проверить `/admin/pierrot/ai-costs`: не должно быть баннера
`telemetry_migration_not_applied`; агрегаты должны показывать provider attempts,
fallback, tokens, latency и cost без prompt/content. Реальные строки появляются
только от реального пользовательского трафика. Синтетические production inserts
запрещены.

## 15. Итоговый статус acceptance criteria

| Criterion                                                                                     | Статус              | Evidence                                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| Owner review report подготовлен до production DDL                                             | satisfied           | этот документ; production DDL не выполнялся                                                              |
| Production migration не применяется без явного owner approval                                 | satisfied           | ни одной production-команды не запущено; approval gate в разделе 12                                      |
| После approval применена ровно migration `2026-11-18_pierrot_llm_call_telemetry.sql`          | not_verified        | approval не получен; применение не выполнялось                                                           |
| Migration history подтверждает применение                                                     | not_verified        | history не настроена/противоречива; нужен выбор A/C                                                      |
| RLS/grants соответствуют reviewed security model                                              | not_verified (live) | SQL review + локальный dry-run совпадают; production schema не проверена                                 |
| Нет 404 при записи telemetry                                                                  | not_verified        | требует применения и runtime logs; синтетические inserts запрещены                                       |
| Подтверждён безопасный доступ к агрегатам provider attempts, fallback, tokens, latency и cost | not_verified (live) | код и тесты покрывают attempts/fallback/tokens/latency/cost, доступ только service-role; live-данных нет |

## 16. Что осталось непроверенным

- фактическая production schema и наличие/отсутствие таблицы;
- фактическая `supabase_migrations.schema_migrations`;
- production runtime logs и прекращение 404;
- реальные агрегаты на production-данных;
- выбранный owner способ фиксации history и version;
- retention policy;
- поведение PostgREST schema cache после DDL.

До получения явного approval Антона и production read-only доступа эти пункты
остаются blocker'ами. SQL не изменялся, production не затрагивался.
