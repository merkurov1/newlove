# Pierrot — финальный production-readiness аудит

Дата: 2026-10-29  
Репозиторий: `merkurov1/newlove` (workspace `/workspaces/newlove`)  
Ветка: `main`, HEAD `afff69af`  
Аудируемое состояние: рабочее дерево (не HEAD) — в нём находится незакоммиченный коммерческий слой Pierrot.

---

## 1. Краткий итоговый статус

**READY WITH CAVEATS.**

- P0/P1 дефектов не найдено.
- Найдено и исправлено 4 воспроизводимых P2-дефекта и 1 P3 ARIA-дефект.
- Полный Jest-прогон: **57/57 suites, 350/350 tests PASS**.
- TypeScript: **PASS** (чистый `tsc --noEmit`).
- Production build: **compile + typecheck PASS**; полная статическая генерация в этом окружении упирается в отсутствие реальных env и внешний `fonts.gstatic.com`, а не в код.
- Реальная браузерная геометрия/скриншоты/мобильная клавиатура **не проверены**: в окружении нет Playwright/Puppeteer/Chromium.
- Остались эксплуатационные/продуктовые риски (retention cron, rate limit в памяти, consent по умолчанию, отсутствие P на immersive-маршрутах) — они перечислены в §12 и не являются P0/P1.

---

## 2. Состояние репозитория до и после

### До аудита

- HEAD `afff69af` + 33 изменённых файла и крупный блок неотслеживаемых файлов Pierrot.
- `npm test`: 4 suite падали (`node:test`-файлы несовместимы с Jest), 334 теста проходили.
- `next lint`: 6334 ошибки из-за сломанного `.eslintrc.json` (нет `next/core-web-vitals`, включён `react/react-in-jsx-scope` для всего проекта).
- `npm run build`: падал на `Collecting page data` из-за отсутствия `NEXT_PUBLIC_SUPABASE_URL`; compile и typecheck при этом проходили.

### После аудита

- Изменены 9 файлов, добавлены 3 регрессионных теста и этот отчёт (см. §7).
- `npm test`: **350/350 PASS**, 57/57 suites.
- `tsc --noEmit`: **PASS**.
- `next lint` по затронутым файлам: новых ошибок нет; остаются только pre-existing `no-explicit-any` в `Header.tsx` и repo-wide `react/react-in-jsx-scope` из сломанного конфига.
- Коммиты/пуш не выполнялись. Production-данные, Supabase, Stripe, Vercel, env не менялись.

---

## 3. Архитектурная карта Pierrot

| Слой                                 | Файлы                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Провайдер состояния                  | `components/pierrot/PierrotContext.tsx`                                                                                     |
| Глобальное монтирование              | `app/layout.tsx`: `PierrotProvider` → `PierrotChat`                                                                         |
| Модальное окно / portal / focus trap | `components/PierrotChat.tsx`                                                                                                |
| Сообщения и ввод                     | `components/pierrot/PierrotConversation.tsx`                                                                                |
| Домашний composer                    | `components/pierrot/PierrotComposer.tsx`, `HomePierrotMode.tsx`, `HomeClient.tsx`                                           |
| Ссылки-триггеры                      | `components/pierrot/PierrotSectionLink.tsx`                                                                                 |
| Навигация                            | `lib/pierrot/navigation.ts`, `config.ts`                                                                                    |
| Consent / телеметрия                 | `lib/pierrot/clientTelemetry.ts`, `conversation.ts`                                                                         |
| Офферы / коммерция                   | `lib/pierrot/offers.ts`, `commercial.ts`, `intents.ts`, `offerAvailability.ts`, `orderAttribution.ts`, `serviceInquiry*.ts` |
| API чата                             | `app/api/pierrot-web/route.ts`                                                                                              |
| API телеметрии / удаления            | `app/api/pierrot/events/route.ts`, `app/api/pierrot/conversations/route.ts`                                                 |
| Admin-аналитика                      | `app/admin/pierrot/*`, `app/api/admin/pierrot/*`, `lib/analytics/pierrotIntelligence.ts`                                    |
| Telegram                             | `components/TelegramMiniApp.tsx`, `components/telegram/TelegramNavigation.tsx`, `app/main.css`                              |
| Flow-контекст                        | `components/flow/PierrotContextBlock.tsx`                                                                                   |
| Миграции                             | `migrations/2026-10-29_*.sql`                                                                                               |

Монтирование PierrotChat ровно одно. `PierrotComposer` — только на `/`; `PierrotTrigger` — в Header; в Telegram — `TelegramNavigation`.

---

## 4. Проверенные маршруты

Существуют все целевые маршруты:

`/`, `/heartandangel`, `/heartandangel/world`, `/heartandangel/calm`, `/heartandangel/card`, `/lobby`, `/selection`, `/journal`, `/flow`, `/flow/join`, `/letters`, `/advising`, `/advising/request`, `/media`, `/heritage`, `/research`, `/art-engine`, `/unframed`, `/unframed/book`, `/unframed/proposal`, `/temple`.

Существуют якоря: `#order`, `#issues`, `#subscribe`, `#family`, `#museum`, `#digital`.

SSR-прогон (dev, безопасные env-заглушки):

| Маршрут                   | HTTP | Примечание                      |
| ------------------------- | ---- | ------------------------------- |
| `/`                       | 200  | 1× Open Pierrot + 1× composer P |
| `/lobby`                  | 200  | 1× Open Pierrot                 |
| `/flow`                   | 200  | 1× Open Pierrot                 |
| `/journal`                | 200  | 1× Open Pierrot                 |
| `/unframed/book`          | 200  | 1× Open Pierrot                 |
| `/temple`                 | 200  | 0× Pierrot (immersive)          |
| `/admin/pierrot`          | 307  | редирект без admin-сессии       |
| `/api/pierrot-web` GET    | 405  | только POST                     |
| `/api/pierrot/events` GET | 405  | только POST                     |

---

## 5. Матрица тестов

| #   | Сценарий                                | Маршрут/контекст     | Авторизация | Viewport         | Ожидание              | Факт                                  | Статус              | Доказательство                 |
| --- | --------------------------------------- | -------------------- | ----------- | ---------------- | --------------------- | ------------------------------------- | ------------------- | ------------------------------ |
| 1   | Открыть Pierrot inline                  | `/`                  | гость       | jsdom            | inline-режим          | работает                              | PASS                | `PierrotNavigation.test.tsx`   |
| 2   | Открыть/закрыть composer P              | `/`                  | гость       | jsdom            | работает              | работает                              | PASS                | там же                         |
| 3   | Модалка, закрытие, сохранение черновика | `/lobby`             | гость       | jsdom            | черновик сохранён     | работает                              | PASS                | там же                         |
| 4   | Отправить короткое сообщение            | `/`                  | гость       | jsdom            | 1 запрос              | 1 запрос                              | PASS                | там же                         |
| 5   | Подтверждение навигации + arrival       | `/`                  | гость       | jsdom            | 1 переход, без дублей | работает                              | PASS                | там же                         |
| 6   | Flow-кнопка у non-admin                 | Header               | non-admin   | статика + jest   | скрыта                | скрыта                                | PASS (fixed)        | `HeaderPierrotFlow.test.tsx`   |
| 7   | Flow-кнопка у admin                     | Header               | admin       | статика + jest   | видна рядом с P       | видна                                 | PASS                | там же                         |
| 8   | Сброс истории/бейджа при logout         | modal                | admin→guest | jsdom            | очищено               | очищено                               | PASS (fixed)        | `PierrotAuthReset.test.tsx`    |
| 9   | История не чистится при F5              | modal                | admin       | jsdom            | сохранена             | сохранена                             | PASS                | там же                         |
| 10  | Hook order null→ready                   | `/flow/[slug]`       | любой       | jsdom            | без краша             | без краша                             | PASS (fixed)        | `PierrotContextBlock.test.tsx` |
| 11  | Escape / focus trap                     | modal                | любой       | статика          | работает              | код есть                              | PARTIAL             | `PierrotChat.tsx`              |
| 12  | Flow vs clear: перекрытие               | auth + modal         | auth        | 320–1440         | нет перекрытия        | статически нет; пиксельно не измерено | PARTIAL             | см. §6                         |
| 13  | P на immersive-маршрутах                | `/temple`, `/vigil`… | любой       | статика          | доступна              | отсутствует                           | FAIL (design)       | `Header.tsx`                   |
| 14  | API validation                          | `/api/pierrot-web`   | n/a         | node/curl        | 400/413               | 400/413                               | PASS                | curl + jest                    |
| 15  | Consent denied → нет записи             | API                  | n/a         | node             | нет store             | нет store                             | PASS                | `route.test.ts`                |
| 16  | Идемпотентность / чужой session id      | API                  | n/a         | node             | replay/deny           | корректно                             | PASS                | `route.test.ts`                |
| 17  | Детерминированный оффер                 | API                  | гость       | curl             | 200 + CTA             | 200 + CTA                             | PASS                | curl                           |
| 18  | Полный Jest                             | весь проект          | n/a         | node             | зелёный               | 350/350                               | PASS                | см. §8                         |
| 19  | TypeScript                              | весь проект          | n/a         | —                | без ошибок            | без ошибок                            | PASS                | `tsc`                          |
| 20  | Production build                        | весь проект          | n/a         | —                | собирается            | compile+types OK; static — env/fonts  | PARTIAL             | см. §8                         |
| 21  | Lint                                    | весь проект          | n/a         | —                | зелёный               | baseline 6334                         | FAIL (pre-existing) | см. §8                         |
| 22  | Визуальная одинаковость страниц         | 10+ маршрутов        | —           | реальный браузер | —                     | не проверено                          | NOT TESTED          | нет браузера                   |

---

## 6. Конфликт «Flow» и очистки Pierrot

Проверено статически и через jsdom:

- Flow-триггер `ComposerTrigger` находится в правом кластере Header (поток, `z-50`), рядом с compact-P.
- Очистка `New chat` (`RotateCcw`) находится в шапке полноэкранной модалки Pierrot (`z-[9999]`), которая перекрывает Header.
- Одновременно эти элементы недоступны: модалка перехватывает слой, а Flow-модалка и Pierrot-модалка не открываются друг из друга.
- Геометрического перекрытия именно Flow и `New chat` не найдено.

Реальные дефекты в этой зоне были другими и исправлены:

1. Flow-кнопка показывалась любому авторизованному пользователю, хотя `POST /api/flow/items` требует admin → dead action. Теперь `isAdmin`.
2. Плавающая P на главной была `relative` из-за конфликта `fixed` + `relative` → уезжала влево/в поток. Теперь снова `fixed`.

На узких экранах Flow-пилюля по-прежнему занимает место в Header; пиксельного теста на 320 px нет (нет браузера). Это остаётся PARTIAL, а не PASS.

---

## 7. Дефекты

### Изменённые файлы

- `components/pierrot/PierrotComposer.tsx` — D1, D5.
- `components/Header.tsx` — D2.
- `components/pierrot/PierrotContext.tsx` — D3.
- `components/PierrotChat.tsx` — D3 (обёртка обработчика `New chat`).
- `components/flow/PierrotContextBlock.tsx` — D4.
- `lib/newsletter/__tests__/language.test.ts`, `lib/journal/__tests__/preview.test.ts`, `lib/flow/__tests__/bilingual.test.ts`, `lib/flow/__tests__/flowLayout.test.ts` — перевод с `node:test`/скриптового стиля на Jest (инфраструктура тестов, не Pierrot-логика).
- Добавлены: `components/pierrot/__tests__/PierrotAuthReset.test.tsx`, `components/flow/__tests__/PierrotContextBlock.test.tsx`, `components/__tests__/HeaderPierrotFlow.test.tsx`.
- Добавлен: `docs/audits/pierrot-final-audit.md`.

### Исправленные

#### D1 — P2. Плавающая P на главной не была fixed

- **Где:** `components/pierrot/PierrotComposer.tsx`.
- **Воспроизведение:** открыть `/`.
- **Ожидание:** кнопка fixed bottom-right.
- **Факт:** одновременно `fixed` и `relative`; Tailwind регистрирует `.fixed` раньше `.relative`, поэтому побеждал `relative`; кнопка уходила в поток.
- **Первопричина:** `relative` добавлен для бейджа, хотя `fixed` уже создаёт containing block.
- **Исправление:** удалён `relative`.
- **Побочные эффекты:** нет; бейдж по-прежнему позиционируется от fixed-кнопки.
- **Проверка:** класс содержит только `fixed`; SSR-страница `/` содержит composer P; визуально — после браузерного прогона.

#### D2 — P2. Flow-кнопка была доступна non-admin

- **Где:** `components/Header.tsx`.
- **Воспроизведение:** войти обычным пользователем → `FLOW +` → Post.
- **Ожидание:** кнопка только у admin.
- **Факт:** кнопка была, публикация возвращала 401.
- **Первопричина:** гейт `{user && ...}` вместо уже вычисленного `isAdmin`.
- **Исправление:** `{isAdmin && <ComposerTrigger />}`.
- **Побочные эффекты:** у non-admin исчезает недоступное действие; у admin без изменений.
- **Проверка:** `HeaderPierrotFlow.test.tsx` (2 кейса).

#### D3 — P2. Не сбрасывались история и admin-бейдж при смене пользователя

- **Где:** `components/pierrot/PierrotContext.tsx`.
- **Воспроизведение:** admin → ответ (бейдж `Master`) → logout → открыть Pierrot в той же вкладке.
- **Ожидание:** бейдж снят, история не смешивается.
- **Факт:** `isAdminSession` сбрасывался только в `clearChat`; `sessionStorage`-история не была привязана к пользователю.
- **Первопричина:** провайдер не знал об auth-состоянии.
- **Исправление:** `useAuth()` + эффект на смену `user.id`; первый settled-id не считается сменой (F5 сохраняет историю), при смене вызывается `clearChat('user_closed')`. Обработчик кнопки `New chat` обёрнут (`onClick={() => clearChat()}`), чтобы MouseEvent не попадал в параметр reason.
- **Побочные эффекты:** гость, вошедший в аккаунт, теряет текущий чат — сознательный privacy-компромисс.
- **Проверка:** `PierrotAuthReset.test.tsx` (сброс при смене, сохранение при rerender/F5); `tsc` подтверждает совместимость обработчика.

#### D4 — P2. Условный `useState` в Flow-контексте

- **Где:** `components/flow/PierrotContextBlock.tsx`.
- **Воспроизведение:** переход между Flow-записями, где контекст меняется `null → ready`.
- **Ожидание:** стабильный порядок хуков.
- **Факт:** `useState` вызывался после early return → возможен «Rendered more hooks…».
- **Исправление:** hook поднят выше `if (!context…) return null`.
- **Побочные эффекты:** нет.
- **Проверка:** `PierrotContextBlock.test.tsx` (null → ready).

#### D5 — P3. Висячий `aria-controls` у закрытого composer

- **Где:** `components/pierrot/PierrotComposer.tsx`.
- **Исправление:** убран `aria-controls` у закрытой кнопки, т.к. целевой формы нет в DOM.
- **Проверка:** статически; поведение не изменилось.

### Не исправлялись (осознанно)

#### D6 — P3. Pierrot недоступен на immersive-маршрутах

`/temple`, `/cast`, `/vigil`, `/absolution`, `/tribute`, `/heartandangel/world|calm|letitgo`: Header возвращает `null`, Telegram-навигация на части маршрутов тоже скрыта. Триггера `P` нет. Это выглядит как осознанный immersive-дизайн; изменение требует продуктового решения и согласования.

#### D7 — P3. Layout shift при открытии модалки

`body.overflow = hidden` без компенсации ширины скроллбара. На desktop возможен горизонтальный сдвиг. Лечится `scrollbar-gutter: stable` глобально — вне минимального фикса.

#### D8 — P3. Дублирующий P в Telegram

На главной в Telegram одновременно есть P в `TelegramNavigation` и `PierrotComposer` (разные функции, одинаковый смысл).

---

## 8. Результаты проверок

| Проверка                        | Команда                                                                                                                       | Результат                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pierrot Jest                    | `npx jest lib/pierrot components/pierrot app/api/pierrot-web app/api/pierrot/conversations app/api/admin/pierrot --runInBand` | 15 suites, **128 tests PASS**                                                                        |
| Полный Jest                     | `npx jest --runInBand --forceExit`                                                                                            | 57 suites, **350 tests PASS**                                                                        |
| TypeScript                      | `tsc --noEmit -p tsconfig.json`                                                                                               | **PASS**, 0 ошибок                                                                                   |
| Prettier (затронутые файлы)     | `prettier --check ...`                                                                                                        | **PASS**                                                                                             |
| Production build                | `next build` (без реальных env)                                                                                               | compile **PASS**, typecheck **PASS**, page data **FAIL** из-за отсутствия `NEXT_PUBLIC_SUPABASE_URL` |
| Production build (env-заглушки) | `next build` + dummy env                                                                                                      | доходит до static generation; блокируется внешним `fonts.gstatic.com` (офлайн-сеть)                  |
| Lint                            | `next lint`                                                                                                                   | **FAIL baseline**: 6334 ошибки из-за конфига, не Pierrot                                             |
| Stylelint                       | `npm run lint:css`                                                                                                            | не запускается: `stylelint` не установлен                                                            |

Пояснение по build: отсутствие env и внешней сети — ограничение окружения. Compile и typecheck проходят; Vercel с реальными env и сетью должен собрать проект. Перед пушем нужно убедиться, что в Vercel заданы все переменные из `.env.example`.

Пояснение по lint: `.eslintrc.json` не подключает `next/core-web-vitals` и использует `react/recommended`, поэтому `react/react-in-jsx-scope` срабатывает на тысячах файлов. Это pre-existing и не связано с Pierrot. `next.config.js` уже игнорирует ESLint при build (`ignoreDuringBuilds: true`), поэтому Vercel build не блокируется.

---

## 9. Производительность

Методика и ограничения:

- Браузерной автоматизации нет; метрики open-to-interactive, layout shift и FPS не измерялись.
- SSR-тайминги в dev (после прогрева): `/` ~204 ms, `/lobby` ~90 ms, `/flow` ~93 ms, `/temple` ~89 ms. Это dev-режим, не production-метрика.
- На одно текстовое сообщение клиент делает **один** POST `/api/pierrot-web` (тест проверяет ровно 1 вызов). Телеметрия (`navigation_proposed`, `action_clicked`, `offer_action_clicked`, `conversation_ended`) — отдельные fire-and-forget POST, не блокируют UI.
- Дубли отправки блокируются `loadingRef`; повторная отправка во время загрузки игнорируется.
- Таймаут клиента 35 с; после ошибки/таймаута интерфейс выходит из loading и позволяет повторить.
- Провайдер обновляет `draft` на каждый символ, поэтому все потребители контекста (Header, Footer, HomeClient, PierrotChat, DataNotice) перерисовываются на каждый keystroke. Это архитектурный риск, не измеренный в браузере; для production-профилирования стоит проверить React Profiler.
- История не виртуализируется; при очень длинном диалоге возможны просадки.

---

## 10. Авторизация и приватность

- Гость: чат работает, история в `sessionStorage`, сервер хранит диалог по двум случайным id (conversation/session), без привязки к аккаунту.
- Авторизованный admin: сервер возвращает `admin: true`, включается owner-промпт; бейдж `Master` только в UI.
- Авторизованный non-admin: Pierrot работает в публичном режиме; Flow-кнопка больше не показывается.
- Logout/смена аккаунта: Pierrot очищает локальную историю и сбрасывает `Master` (D3).
- Истёкшая сессия: серверный `getCurrentUser()` возвращает `null`, чат переходит в публичный режим; приватные admin-страницы редиректят.
- Приватные действия защищены серверно: admin dashboard (`requireAdmin`), admin API (`requireAdminFromRequest`), Flow POST (`requireAdminFromRequest`).
- RLS включён; anon/authenticated не имеют доступа к таблицам Pierrot; запись/чтение только через service role.
- Транскрипт не пишется при `consent=denied`; при `pending` пишутся только метаданные.
- PII не попадает в URL: используются opaque id (`pcard_`, `psub_`, `punf_`, `lead`).
- Ошибки AI-провайдера не утекают клиенту; логи содержат только безопасный код.
- Секреты не попадают в клиентский бандл.

Остаточные риски:

- `getPierrotConsent()` по умолчанию возвращает `granted` и сразу пишет это в `localStorage`; согласие не является явным opt-in. Требует продуктового/юридического решения.
- `purge_expired_pierrot_conversations()` не запланирован автоматически; без pg_cron данные могут храниться дольше 90 дней.
- Rate limit (`lib/rateLimit.ts`) хранится в памяти инстанса; на Vercel лимит масштабируется вместе с числом инстансов.

---

## 11. Непроверенные сценарии и ограничения окружения

- Нет реального браузера: не проверены скриншоты, точная геометрия кнопок, перекрытия на 320/375/390 px, мобильная клавиатура, layout shift в пикселях, hover/focus-состояния в реальном рендере.
- Нет production-доступа: не проверены реальные Supabase, Stripe, OpenRouter/Gemini/DeepSeek, Telegram WebApp, Vercel runtime.
- Нет тестового аккаунта: сценарии admin/non-admin проверены через jsdom-моки и статический анализ, не через реальный вход.
- Production build не завершён локально: нет реальных env и внешней сети для Google Fonts/провайдеров.
- Lint baseline сломан repo-wide; зелёный lint не подтверждён.
- Stylelint не установлен.
- Не проверены реальные письма подписки, заказ открыток, Stripe webhook, UNFRAMED checkout — только код и существующие unit-тесты.

---

## 12. Остаточные риски

1. **Retention 90 дней** — функция есть, но не запланирована; нужен pg_cron/ops-job.
2. **Rate limit в памяти** — нужен внешний store для честного лимита на Vercel.
3. **Consent по умолчанию granted** — юридический риск; нужен явный opt-in или обоснование.
4. **Immersive-маршруты без Pierrot** — продуктовая неоднородность; решить, нужен ли там вход.
5. **Перерисовки на каждый символ** — возможная просадка на слабых устройствах; профилировать в браузере.
6. **Нет виртуализации истории** — длинные диалоги могут тормозить.
7. **Lint-конфиг** — repo-wide технический долг; не блокирует build, но делает `npm run lint` бесполезным.
8. **Flow-контекст** — исправлен hook-order, но сам блок по-прежнему рендерит markdown без санитайзера на клиенте (контент приходит с сервера, не от пользователя; риск низкий).

---

## 13. Рекомендация

**READY WITH CAVEATS.**

Код можно пушить и тестировать на production/staging при условии:

1. В Vercel заданы все env из `.env.example` (Supabase, OpenRouter, Gemini/DeepSeek, Telegram, Stripe, admin secrets).
2. После деплоя вручную проверены в браузере: `/`, `/lobby`, `/flow`, `/journal`, `/unframed/book`, `/temple`; гость и admin; открытие/закрытие/повторное открытие Pierrot; позиция P на главной; отсутствие Flow у non-admin; отсутствие `Master` после logout.
3. Отдельно проверены мобильные 320–390 px и открытая клавиатура.
4. Настроен retention purge (pg_cron или внешний job) и, при необходимости, внешний rate limit.
5. Принято продуктовое решение по immersive-маршрутам и consent-политике.

P0/P1-блокеров нет. Все исправления минимальны и локальны; архитектура, схема БД, env и production-конфигурация не менялись.
