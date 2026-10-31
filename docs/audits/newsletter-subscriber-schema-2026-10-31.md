# Аудит схемы подписчиков и токенов рассылки

**Дата:** 2026-10-31
**Статус:** миграция подготовлена, в production **не применялась**.

## Что проверено

- `app/api/subscribe/route.ts`
- `app/api/newsletter-confirm/route.ts`
- `app/api/cron/newsletter-worker/route.ts`
- `app/api/newsletter-unsubscribe/route.ts`
- `lib/newsletter/processJob.ts`
- `lib/newsletter/sendNewsletterToSubscriber.ts`
- `app/admin/actions.ts`, `app/admin/users/page.tsx`
- `app/api/admin/flow-issues/route.ts`
- `app/api/subscription-status/route.ts`
- `app/api/mark-claimed/route.ts`
- `app/api/user/connect-wallet/route.ts`
- `app/api/generate-signature/route.ts`
- `app/api/subscribers/[id]/route.ts`
- `app/layout.tsx`, `lib/pierrot/offerAvailability.ts`
- `scripts/check_subscriber.js`, `scripts/check_all_subscribers.js`, `scripts/seed_subscribers.js`
- все миграции в `migrations/`, относящиеся к `subscribers` и `subscriber_tokens`

Метод: поиск по коду + чтение `information_schema`, `pg_constraint`, `pg_indexes`,
`pg_policies` и read-only проверки PostgREST.

## Главный вывод

Код обращается к четырём полям, которых нет в фактической схеме production:

- `subscribers."confirmedAt"`
- `subscribers."unsubscribedAt"`
- `subscriber_tokens."usedAt"`
- `subscriber_tokens.expires_at`

PostgREST подтверждает ошибку `42703`:

```text
column subscribers.confirmedAt does not exist
column subscriber_tokens.expires_at does not exist
```

Из-за этого:

- `POST /api/subscribe` падает на первом `select`;
- `GET /api/newsletter-confirm` не может сохранить подтверждение;
- `GET /api/newsletter-unsubscribe` не может сохранить отписку;
- worker и остальные отправители не могут вставить unsubscribe-токен
  с `expires_at`.

Дополнительно: в репозитории нет миграции, создающей `subscriber_tokens`,
а `2025-10-18_create_subscribers_table.sql` описывает другую, legacy-таблицу
(`BIGINT id`, без `email`, `userId`, `isActive`, `locale`).

## Фактическая схема

### `public.subscribers`

| Поле | Фактический тип | Ограничения |
|---|---|---|
| `id` | `text` | PK, default `gen_random_uuid()` |
| `email` | `text` | NOT NULL, UNIQUE |
| `createdAt` | `timestamp` | NOT NULL, default `CURRENT_TIMESTAMP` |
| `userId` | `text` | UNIQUE, nullable, без FK |
| `isActive` | `boolean` | NOT NULL, default `true` |
| `wallet_address` | `text` | nullable, partial UNIQUE |
| `has_claimed` | `boolean` | NOT NULL, default `false` |
| `created_at` | `timestamptz` | default `CURRENT_TIMESTAMP` |
| `locale` | `text` | NOT NULL, default `'ru'` |

### `public.subscriber_tokens`

| Поле | Фактический тип | Ограничения |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `subscriber_id` | `text` | NOT NULL, FK → `subscribers.id` ON DELETE CASCADE |
| `type` | `text` | NOT NULL, CHECK `confirm` / `unsubscribe` |
| `token` | `text` | NOT NULL, UNIQUE |
| `used` | `boolean` | NOT NULL, default `false` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |

## `subscribers`: обращения и изменения

| Поле | Где читается | Где записывается | Есть в миграциях | Тип | Необходимое изменение |
|---|---|---|---|---|---|
| `id` | subscribe, admin actions, admin/users, mark-claimed, connect-wallet, generate-signature, flow-issues, layout, subscription-status, offerAvailability | subscribe (default), admin actions (`createId()`), seed (default) | Да, но `BIGINT identity` в `2025-10-18` — не совпадает с production | `text`, PK, default `gen_random_uuid()` | В production не менять. Зафиксировать расхождение: нужна актуальная baseline-миграция |
| `email` | subscribe, admin actions, admin/users, scripts | subscribe insert, admin insert | Нет | `text` NOT NULL UNIQUE | В production не менять. В admin-коде нормализовать `trim().toLowerCase()`; опционально UNIQUE `lower(email)` |
| `createdAt` | scripts, legacy admin page | default при insert | Нет | `timestamp` NOT NULL | В production не менять; добавить в baseline |
| `userId` | admin actions, admin/users, subscription-status, offerAvailability, mark-claimed, connect-wallet, generate-signature | subscribe insert/update, admin insert/update, adminDeleteUser → `null` | Нет (только упоминается в trigger) | `text` UNIQUE nullable, без FK | Не обязательно. Опционально FK → `users.id` ON DELETE SET NULL после проверки orphans |
| `isActive` | subscribe, worker, processJob, admin, flow-issues, layout, subscription-status, offerAvailability, trigger | subscribe insert/update, confirm, unsubscribe, admin update | Только legacy `archive/migrate_letters_fix.sql` | `boolean` NOT NULL default `true` | В production не менять. Default `true` слишком мягкий, но public subscribe явно ставит `false` |
| `wallet_address` | mark-claimed, connect-wallet, generate-signature, seed | connect-wallet update, seed insert | Да, `2025-10-18` | `text`, partial UNIQUE | Не менять |
| `has_claimed` | mark-claimed, generate-signature, seed | mark-claimed update, seed insert | Да, `2025-10-18` | `boolean` NOT NULL default `false` | Не менять |
| `created_at` | backfill/диагностика | default при insert | Да, `2025-10-18` | `timestamptz` | Не менять |
| `locale` | worker, processJob, flow-issues, language filter | subscribe insert/update | Нет | `text` NOT NULL default `'ru'` | В production не менять; добавить в baseline |
| `confirmedAt` | subscribe (`select`, проверка `already_confirmed`) | subscribe (`null`), confirm (`now()`) | Нет | **отсутствует** | **Добавить `timestamptz`; backfill для уже активных подписчиков** |
| `unsubscribedAt` | subscribe | subscribe (`null`), confirm (`null`), unsubscribe (`now()`) | Нет | **отсутствует** | **Добавить `timestamptz`** |

## `subscriber_tokens`: обращения и изменения

| Поле | Где читается | Где записывается | Есть в миграциях | Тип | Необходимое изменение |
|---|---|---|---|---|---|
| `id` | не используется приложением | default при insert | Нет | `uuid` PK default `gen_random_uuid()` | Не менять; добавить в baseline |
| `subscriber_id` | confirm, unsubscribe, invalidation в subscribe | subscribe, confirm, unsubscribe, worker, processJob, sendNewsletterToSubscriber, admin actions | Нет | `text` NOT NULL FK → `subscribers.id` CASCADE | Не менять; добавить в baseline |
| `type` | confirm, unsubscribe | все insert-точки | Нет | `text` CHECK `confirm` / `unsubscribe` | Не менять |
| `token` | confirm, unsubscribe (по `eq('token')`) | все insert-точки | Нет | `text` NOT NULL UNIQUE | Не менять |
| `used` | подтверждение/отписка, инвалидация старых confirm-токенов | subscribe, confirm, unsubscribe | Нет | `boolean` NOT NULL default `false` | Не менять |
| `created_at` | не читается, используется для backfill | все insert-точки | Да, `2025-11-08_add_token_expiry.sql` (косвенно) | `timestamptz` NOT NULL default `now()` | Не менять |
| `usedAt` | не читается | subscribe, confirm, unsubscribe | Нет | **отсутствует** | **Добавить `timestamptz`** |
| `expires_at` | confirm, unsubscribe | subscribe, worker, processJob, sendNewsletterToSubscriber, admin actions | Да, `2025-11-08_add_token_expiry.sql`, но миграция не применена | **отсутствует** | **Добавить `timestamptz`, backfill, default +7 дней, NOT NULL, индекс** |

## Проверка сценариев

### 1. Повторная подписка

До миграции: `select('id, isActive, confirmedAt, unsubscribedAt')` падает с `42703`,
поэтому подписка не работает даже для нового email.

После миграции:

- активный подтверждённый подписчик → `already_confirmed`, письмо не отправляется;
- pending-подписчик → строка переиспользуется, старые `confirm`-токены
  помечаются `used=true`, создаётся новый токен;
- отписавшийся → снова pending, `unsubscribedAt` очищается, отправляется
  новое письмо подтверждения.

Для существующих 22 активных подписчиков нужен backfill `confirmedAt`,
иначе повторная подписка сбросит их в pending.

Отдельные code-level риски:

- `app/admin/actions.ts` не приводит email к lower-case: возможна
  case-sensitive дубликация;
- уникальный `userId` может конфликтовать, если тот же auth-пользователь
  подписывается с другим email;
- одновременные запросы на один email могут дать `23505`; нужен
  upsert/on-conflict или обработка гонки.

### 2. Подтверждение email

До миграции: токен нельзя создать (`expires_at` отсутствует), а обновление
подписчика падает на `confirmedAt` / `unsubscribedAt`.

После миграции:

1. токен ищется по `token`;
2. проверяются `type='confirm'`, `used=false`, `expires_at`;
3. подписчик получает `isActive=true`, `confirmedAt=now()`,
   `unsubscribedAt=null`;
4. токен получает `used=true`, `usedAt=now()`.

Повторное открытие того же токена → `404`. Истёкший токен → `410`.

Гонка: два одновременных запроса могут оба пройти проверку `used=false`.
Для confirm это идемпотентно, но для строгой однократности нужен
атомарный `update ... where used = false`.

### 3. Истечение токена

До миграции колонки нет, поэтому проверка `tokenRow.expires_at` всегда
пропускается; при этом вставка нового токена с `expires_at` падает.

После миграции действует TTL 7 дней. Все 21 существующих токенов старше
7 дней — после backfill они станут истёкшими.

Важно: TTL 7 дней применяется и к `unsubscribe`-токенам. Старые ссылки
отписки в письмах перестанут работать. Для compliance обычно нужен
более долгий или бессрочный unsubscribe-токен — это отдельное изменение
кода, не входит в миграцию.

### 4. Повторное использование токена

Последовательно повторное использование блокируется `used=true`.
При новой подписке все старые `confirm`-токены инвалидируются.

Старые `unsubscribe`-токены при повторной подписке не инвалидируются:
ссылка из старого письма может отписать подписчика снова, пока не истекла
или не использована.

### 5. Отписка

До миграции: невозможно создать unsubscribe-токен и невозможно записать
`unsubscribedAt`.

После миграции:

- `subscribers.isActive=false`, `unsubscribedAt=now()`;
- токен `used=true`, `usedAt=now()`;
- trigger `sync_user_subscription_status()` обновляет
  `users.is_subscribed=false`, если у подписчика есть `userId`.

Админская отписка (`toggleUserSubscription`, `adminToggleUserSubscription`)
пока не заполняет `unsubscribedAt` — это несогласованность, не блокер.

### 6. Очередь рассылки

До миграции worker на каждого подписчика делает insert unsubscribe-токена
с `expires_at`, получает `42703`, пишет failed-лог, и job завершается
как failed без отправки писем.

После миграции insert проходит, письма отправляются, ссылки отписки
валидны, `newsletter_logs` и `newsletter_jobs` обновляются штатно.

`lib/newsletter/processJob.ts` и прямой `sendNewsletterToSubscriber`
сейчас игнорируют ошибку insert токена и всё равно отправляют письмо.
Рекомендуется сделать ошибку токена фатальной, как уже сделано в
`app/api/cron/newsletter-worker/route.ts`.

## Миграция

Файл: `migrations/2026-10-31_repair_newsletter_subscriber_schema.sql`

Свойства:

- аддитивная и идемпотентная;
- не удаляет строки;
- добавляет четыре недостающие колонки;
- заполняет `confirmedAt` только для уже активных подписчиков;
- заполняет `expires_at` по формуле `created_at + 7 days`;
- ставит `expires_at NOT NULL DEFAULT now() + 7 days`;
- добавляет индексы по `expires_at` и `(subscriber_id, type, used)`.

Проверено на временном PostgreSQL 16:

- применение на схеме, повторяющей production;
- повторное применение (idempotency);
- повторная подписка, confirm, expired token, token reuse,
  unsubscribe, re-subscribe;
- вставка токена без `expires_at` получает default.

**В production миграция не применялась.**
