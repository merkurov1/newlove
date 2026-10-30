# PIERO HUMAN PRESENCE — итоговый отчёт

Дата: 2026-10-30
Статус: код и база готовы; production-переменные Vercel требуют ручного добавления; деплой, push, тесты и сборка не выполнялись по указанию.

---

## 1. Краткий итог

Реализована функция **PIERO HUMAN PRESENCE**:

- посетитель merkurov.love просит Пьеро позвать Антона;
- существующий Piero-бот отправляет Anton уведомление в Telegram;
- Anton принимает или отклоняет запрос;
- после принятия общение идёт в том же чате на сайте;
- Anton отвечает из Telegram;
- AI Пьеро автоматически ставится на паузу;
- после завершения разговора AI снова отвечает посетителю.

Не создавались:

- второй Telegram-бот;
- второй чат;
- отдельный сервер / VPS / Docker / long-running process.

Используются только:

- Next.js Route Handlers;
- Supabase;
- Telegram Bot API;
- существующий бот `app/api/pierrot/route.ts`.

---

## 2. База данных

### Миграция

`migrations/2026-10-30_z_create_pierrot_human_presence.sql`

Префикс `z_` выбран намеренно: миграция должна применяться после
`2026-10-30_repair_pierrot_event_constraint.sql`, иначе старый repair мог
перезаписать event-контракт и убрать human-events.

### Новые таблицы

- `pierrot_human_requests`
- `pierrot_human_sessions`
- `pierrot_human_message_links`

### Изменения существующих таблиц

- `pierrot_messages.role` расширен:
  `user | assistant | human`
- `pierrot_events` расширен human-событиями:
  `human_requested`, `human_request_duplicate`, `human_accepted`,
  `human_declined`, `human_expired`, `human_closed`,
  `human_message_sent`, `human_message_received`,
  `human_notification_failed`, `human_ai_blocked`
- `pierrot_append_message` пересоздан с поддержкой `human`
- `pierrot_record_event` пересоздан с новым списком событий

### Состояния

```text
pending ── accept ──> accepted ──> active ── close ──> closed
   │                     (accepted_at + active session в одной транзакции)
   ├── decline ──> declined
   ├── visitor cancel ──> declined (resolved_by = visitor)
   └── timeout ──> expired
```

### Защита от гонок

- уникальный pending-запрос на диалог;
- уникальный active-запрос на диалог;
- одна active-сессия на диалог;
- одна active-сессия на Telegram-аккаунт Anton;
- `SELECT ... FOR UPDATE`;
- advisory locks;
- единый порядок блокировок `conversation → request row`;
- accept и close сериализованы с AI/human message append;
- повторный accept возвращает `already_active`;
- повторный decline возвращает `already_declined`;
- повторный close возвращает `already_closed`;
- повторная Telegram-доставка сообщения дедуплицируется детерминированным message id.

### Проверка применённой миграции

Проверено напрямую в production Supabase:

- 3 таблицы созданы;
- RLS включён на всех трёх;
- RLS-политик для `anon`/`authenticated` — 0;
- `service_role` имеет полный доступ;
- `anon`/`authenticated` не имеют EXECUTE на human-RPC;
- все 7 RPC-функций созданы;
- `pierrot_messages.role` содержит `human`;
- human-events присутствуют в constraint;
- индексы созданы;
- в таблицах пока 0 записей;
- применённая версия функций содержит актуальные блокировки и `already_declined`.

---

## 3. Backend

### Новые файлы

- `lib/pierrot/humanPresence.ts`
- `lib/pierrot/humanPresenceShared.ts`
- `lib/pierrot/humanPresenceTelegram.ts`
- `lib/pierrot/humanPresenceClient.ts`
- `lib/pierrot/humanIntent.ts`
- `app/api/pierrot/human/state/route.ts`
- `app/api/pierrot/human/message/route.ts`
- `app/api/pierrot/human/action/route.ts`

### Основные операции

- создание запроса;
- получение состояния по recovery-token или паре `conversationId + sessionId`;
- accept / decline / expire / close;
- добавление human-сообщения;
- загрузка последних сообщений;
- поиск активной сессии Anton;
- маршрутизация Telegram `reply_to_message`;
- audit events без текста сообщений.

### Безопасность

- recovery-token: 256 бит, случайный;
- в БД хранится только SHA-256 hash;
- token передаётся только в POST body;
- conversation/session ids используются как существующий visitor credential;
- предсказуемые ID не являются авторизацией;
- ответы браузеру не содержат token hash, Telegram ids и чужие сообщения;
- rate limiting;
- логи без текста сообщений, токенов и секретов;
- service-role клиент используется только на сервере.

### AI pause / resume

- `/api/pierrot-web` проверяет active human session до вызова модели;
- проверка повторяется после генерации;
- проверка повторяется после сохранения assistant-сообщения;
- при active-сессии AI-ответ не возвращается браузеру;
- если AI-роут уже успел сохранить visitor message, human-роут привязывает delivery metadata к существующей строке и отправляет её Anton без дубля;
- после close/decline/expiry AI снова работает.

---

## 4. Telegram

Расширен существующий бот:

`app/api/pierrot/route.ts`

### Реализовано

- уведомление Anton:
  - visitor label;
  - страница;
  - краткий контекст;
  - короткий Ref запроса;
  - кнопки `Start conversation` / `Decline`;
- accept:
  - проверка Telegram user id;
  - атомарный переход;
  - создание active-сессии;
  - редактирование уведомления;
  - подтверждение Anton;
- decline:
  - обновление статуса;
  - редактирование уведомления;
- text routing:
  - определение активной сессии;
  - маршрутизация по `reply_to_message`;
  - запись сообщения;
  - отображение на сайте через state polling;
- `/status`;
- `/end`;
- `/human`;
- обработка сообщений после закрытия;
- идемпотентность webhook updates;
- HTML-escaping динамических значений;
- логи без содержимого и секретов.

### Webhook

Проверено:

- URL: `https://www.merkurov.love/api/pierrot`
- `setWebhook`: успешно
- pending updates: `0`
- last error: отсутствует
- max connections: `40`

Старый `TELEGRAM_WEBHOOK_SECRET` имел недопустимый для Telegram формат,
поэтому webhook был зарегистрирован без secret token.

Сейчас:

- сгенерирован новый валидный secret;
- secret записан только в локальный `.env.production.local`;
- webhook перерегистрирован с новым secret;
- локально включён `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`.

В production Vercel новый secret и enforcement ещё нужно добавить вручную.

---

## 5. Website UI

Обновлены:

- `components/pierrot/PierrotContext.tsx`
- `components/pierrot/PierrotConversation.tsx`
- `components/PierrotChat.tsx`

### Visitor experience

- запрос Антона на RU/EN без точного совпадения фраз;
- ответ «Разумеется. Попробуем его найти.» / `Of course. Let us try to find him.`;
- discreet waiting state;
- кнопка отмены;
- «Антон здесь.» / `Anton is here.`;
- human mode в существующем composer;
- отдельный стиль сообщений Anton;
- таймстемпы human-сообщений;
- delivery states: sending / sent / failed;
- восстановление после закрытия браузера через recovery-token;
- polling:
  - active: ~2 сек;
  - pending: ~4.5 сек;
  - пауза при скрытом табе;
  - нет параллельных запросов;
  - остановка после closed/declined/expired;
- защита от дублирующихся системных уведомлений после reload;
- сортировка сообщений по серверному sequence;
- скрытие AI-кнопок, ссылок и CTA в human mode;
- запрет Brain mode и AI-старта во время active human session;
- корректная обработка гонки `cancel vs accept`.

Обычный AI-режим визуально не переработан.

---

## 6. Environment variables

### Уже есть / должны быть в Vercel

- `PIERROT_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_ALLOWED_USER_IDS`

### Нужно добавить/обновить в Vercel Production

| Переменная | Значение |
|---|---|
| `PIERROT_OWNER_TELEGRAM_ID` | Telegram ID Anton (`MY_TELEGRAM_ID` из `.env.production.local`) |
| `TELEGRAM_WEBHOOK_SECRET` | новый secret из `.env.production.local` |
| `TELEGRAM_WEBHOOK_ENFORCE_SECRET` | `1` |
| `PIERROT_HUMAN_REQUEST_TTL_MINUTES` | `20` (опционально) |

Посмотреть локальные значения:

```bash
cd /workspaces/newlove
grep '^PIERROT_OWNER_TELEGRAM_ID=' .env.production.local
grep '^TELEGRAM_WEBHOOK_SECRET=' .env.production.local
```

Секреты в отчёт и чат не включаются.

### Важный порядок

1. Обновить `TELEGRAM_WEBHOOK_SECRET` в Vercel на новый.
2. Установить `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`.
3. Сделать redeploy.

Если включить enforcement со старым secret, Telegram-апдейты начнут
отклоняться.

---

## 7. Что проверено

- миграция применена;
- таблицы/RLS/grants/functions/indexes проверены;
- Telegram webhook зарегистрирован;
- Telegram chat owner `@merkurov` доступен;
- owner ID определён;
- локальный production env обновлён;
- `git diff --check` — без ошибок пробелов;
- секреты не выводились в чат.

---

## 8. Что не выполнялось

По указанию пользователя:

- тесты не запускались;
- `next build` не запускался;
- `git push` не выполнялся;
- deploy не выполнялся;
- Vercel production env не изменялся (нет доступа: CLI отсутствует, OIDC API возвращает 403).

На промежуточном этапе до последних правок проходили 71 тест по human presence
и существующему `/api/pierrot-web`. После финальных изменений тесты не
перезапускались.

Ранее `next build` в этой среде не завершался из-за внешнего запроса к
Google Fonts / ограничений окружения; `BUILD_ID` не создавался.

---

## 9. Осталось сделать вручную

1. Открыть Vercel → Project → Settings → Environment Variables → Production.
2. Добавить/обновить переменные из раздела 6.
3. Сделать redeploy.
4. Проверить сценарий:

```text
Посетитель → «Позови Антона»
Anton → Telegram notification
Anton → Start conversation
Посетитель → «Антон здесь.»
Anton → сообщение из Telegram
Посетитель → ответ на сайте
Anton → /end
Посетитель → снова общается с Пьеро
```

5. Проверить decline, expiry, повторный webhook update и сообщение от
   неавторизованного Telegram-аккаунта.

---

## 10. Ограничения

- Одна live human-сессия на Anton одновременно.
- Human presence требует сохранения транскрипта (`consent = granted`).
- Транспорт — server-mediated polling, не websocket/Supabase Realtime.
- Очистка localStorage во время active-сессии теряет recovery-token; Anton
  всё равно может завершить сессию из Telegram.
- Rate limiting — best-effort на инстанс; основная защита — токены, пара
  conversation/session и RLS.
- Pending-запросы истекают лениво; при необходимости можно добавить cron
  `SELECT public.pierrot_human_expire_due();`.
- Если notification не доставлен, запрос закрывается системой
  (`declined`, `resolved_by = system`), AI продолжает работу.
