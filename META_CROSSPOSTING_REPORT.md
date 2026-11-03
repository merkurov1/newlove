# Отчёт: Meta Crossposting (Facebook Pages + Threads)

> Текущее состояние: кросспост в Facebook включён, Threads отключён.
> Facebook: `META_FACEBOOK_CROSSPOST_ENABLED=true`.
> Threads: `META_THREADS_CROSSPOST_ENABLED=false`.

## 1. Изменённые файлы

**Новые адаптеры и общая логика**
- `lib/meta/types.ts` — общие типы результата/возобновления Meta-публикации.
- `lib/meta/http.ts` — таймауты, разбор ошибок Meta, редактирование токенов.
- `lib/meta/content.ts` — адаптация текста для Facebook и Threads.
- `lib/meta/facebook.ts` — Facebook Page adapter.
- `lib/meta/threads.ts` — Threads adapter (container → publish).
- `lib/flow/distribution.ts` — чистые helpers чтения статусов для UI.

**Движок и API**
- `lib/flow/crosspost.ts` — расширены каналы, состояния, сохранение, retry, uncertain.
- `app/api/flow/crosspost/route.ts` — приём `facebook`/`threads`, расширенный ответ.

**Интерфейс**
- `app/admin/items/[id]/page.tsx` — блок статусов четырёх каналов и безопасный retry.
- `app/flow/page.tsx` — ссылки на Facebook/Threads в существующей социальной строке.
- `app/flow/[slug]/page.tsx` — ссылки на Facebook/Threads в существующей шапке записи.

**Конфигурация и миграция**
- `.env.example` — новые переменные без секретов.
- `migrations/2026-11-13_flow_crosspost_meta_channels.sql`.

**Тесты**
- `lib/meta/__tests__/facebook.test.ts`
- `lib/meta/__tests__/threads.test.ts`
- `lib/meta/__tests__/content.test.ts`
- `lib/flow/__tests__/crosspostMeta.test.ts`
- `lib/flow/__tests__/distributionState.test.ts`
- `app/api/flow/crosspost/__tests__/route.test.ts`

Существующие Telegram/Bluesky-тесты не переписывались и проходят.

## 2. Что реализовано

- `CrosspostChannel`, `CHANNELS`, `CrosspostState`, `CrosspostResult` расширены каналами `facebook` и `threads`.
- Для каждого канала независимо сохраняются:
  `pending / publishing / published / failed / skipped`, `externalId`, `externalUri`, `attempts`, `lastError`, `uncertain`, `contentHash`, `startedAt`, `updatedAt`, `publishedAt`.
- Добавлен фазовый признак `phase`:
  - `container_created` — для Threads создан контейнер, но публикация не подтверждена;
  - `published` — публикация подтверждена.
- Facebook:
  - текст/ссылка через `/{page-id}/feed`;
  - изображение через `/{page-id}/photos` с публичным URL;
  - ссылка на Flow item сохраняется в `link` либо в caption для фото;
  - публикация только на Page, не на личный профиль.
- Threads:
  - двухэтапная публикация: container → `threads_publish`;
  - `published` выставляется только после подтверждения второго шага;
  - длинный текст сокращается по границе предложения/слова, Flow URL не теряется;
  - изображение берётся из Flow item;
  - permalink сохраняется, если API его вернул.
- Retry:
  - повторно отправляется только неуспешный канал;
  - опубликованные каналы не отправляются повторно;
  - `uncertain` не повторяется автоматически — только после явного `retryUncertain`/`force`;
  - перед повтором Meta-канала адаптер пытается проверить сохранённый ID/контейнер.
- Ошибки Meta очищаются от токенов; токены передаются в `Authorization`, не в URL и не в metadata.
- Автоматическая crosspost-публикация при создании/публикации Flow item теперь добавляет Meta-каналы только если они сконфигурированы. Без credentials поведение Telegram/Bluesky не меняется.
- В существующем админском редакторе item появился блок четырёх каналов: статус, attempts, ссылка, ошибка, retry. Для `uncertain` требуется подтверждение.
- В публичном Flow ссылки Facebook/Threads показываются рядом с уже существующими Bluesky/Telegram.

## 3. Подготовленные миграции

`migrations/2026-11-13_flow_crosspost_meta_channels.sql`

Расширяет CHECK-ограничение `distributions.channel` значениями:
`telegram`, `mastodon`, `bluesky`, `facebook`, `threads`.

Миграция написана идемпотентно, существующие строки не меняет. **Не применялась.**

## 4. Переменные окружения

Добавлены в `.env.example`:

```env
# Facebook Page crossposting is enabled by default; Threads is opt-in.
META_FACEBOOK_CROSSPOST_ENABLED=true
META_THREADS_CROSSPOST_ENABLED=false

META_GRAPH_API_VERSION=v26.0
META_FACEBOOK_PAGE_ID=
META_FACEBOOK_PAGE_ACCESS_TOKEN=

META_THREADS_USER_ID=
META_THREADS_ACCESS_TOKEN=
# META_THREADS_API_VERSION=v1.0
```

Только серверные переменные. `NEXT_PUBLIC_*` для них не используются.

## 5. Что нужно настроить в Meta Developer

**Facebook Page**
- Page ID страницы «Ретроградный Меркуров».
- Page access token с правами на публикацию:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
- Приложение Meta должно иметь доступ к странице; токен — long-lived/System User token.
- Изображения должны быть доступны Meta по публичному HTTPS URL.

**Threads**
- Отдельный Threads access token, не равный Facebook Page token.
- Threads user ID.
- Права Threads API:
  - `threads_basic`
  - `threads_content_publish`
- Для постоянной работы позже потребуется OAuth-подключение и обновление токена. Сейчас предусмотрена только конфигурация через env.

Существующий Meta App и привязки Instagram/Facebook не менялись.

## 6. Что пока не работает без реальных credentials

- Facebook и Threads возвращают `skipped` с понятной причиной, если переменные не заданы.
- Реальные публикации не выполняются без токенов и выданных разрешений.
- Threads OAuth-поток не реализован — предполагается ручная установка токена.
- Facebook публикует только первое изображение; multi-image carousel не реализован.
- Если Meta приняла запрос, но ответ потерян до сохранения ID, автоматически подтвердить результат невозможно — канал остаётся `uncertain`.
- Автоматическое обновление/ротация токенов не реализованы.
- Instagram не подключался.

## 7. Результаты тестов

Релевантный набор:

```text
Test Suites: 10 passed, 10 total
Tests:       69 passed, 69 total
```

Проверены:
- успешная публикация в Facebook и Threads;
- независимая ошибка одного канала;
- retry только failed-канала;
- отсутствие повторной отправки published-канала;
- `uncertain` и необходимость явного подтверждения;
- сохранение `externalId`/`externalUri`;
- отсутствие credentials;
- ошибки Meta API и таймауты;
- Threads: container не считается публикацией;
- сохранение существующих Telegram/Bluesky-тестов;
- API-ответ по каждому каналу.

Typecheck:

```text
npx tsc --noEmit
exit code 0
```

Deploy и миграции не выполнялись.

## 8. Риски и открытые вопросы

- Нужно вручную применить SQL-миграцию. До этого metadata остаётся каноническим состоянием, но mirror в `distributions` для Facebook/Threads будет писать warning.
- Версия Graph API по умолчанию `v26.0`; при изменении версии Meta её нужно обновить через `META_GRAPH_API_VERSION`.
- Для Facebook фото публикуется только первое изображение. Если нужен альбом/карусель — потребуется отдельная загрузка unpublished photos.
- Threads permalink не всегда возвращается API; тогда `externalUri` будет `null`, но `externalId` сохранится.
- В редком случае resume-проверки Threads, когда контейнер уже `PUBLISHED`, сохраняется ID контейнера, а не media ID — API не всегда отдаёт media ID в этом состоянии.
- Если ответ Meta потерян до сохранения любого ID, повтор возможен только как осознанное решение администратора. Автоматический повтор в таком случае запрещён.
- В рабочем дереве уже были посторонние незакоммиченные изменения (`lib/lots`, `art-engine` и др.). Они не затрагивались.
