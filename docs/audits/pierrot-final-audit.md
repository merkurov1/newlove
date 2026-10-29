# Pierrot — финальный production-readiness аудит

Дата: 2026-10-29  
Репозиторий: `merkurov1/newlove` (workspace `/workspaces/newlove`)  
Ветка: `main`, HEAD `afff69af`  
Аудируемое состояние: рабочее дерево (не HEAD) — в нём находится незакоммиченный коммерческий слой Pierrot.

---

## 0. Обновление: одно окно Pierrot

После первичного аудита inline-режим и отдельный home-composer удалены. Актуальное поведение:

- На всех страницах и в Telegram используется **одно полноэкранное окно** `components/PierrotChat.tsx`.
- Точки входа: compact-P в Header, плавающий P на главной, P в Telegram-навигации и ссылки `PierrotSectionLink`. Все они открывают один и тот же modal.
- В шапке окна: аватар Pierrot (те же 40/44 px, ring и shadow, что у аватара пользователя), имя `Pierrot` тем же шрифтом/размером/трекингом, что лого в Header, кнопки `New chat` (reset) и `Close Pierrot` в тех же пропорциях 40/44 px.
- Default/empty state — редакционный навигационный индекс: `Structure is the antidote to chaos.` + `Anton Merkurov`, `Lobby → Unframed`, `Flow → Journal`, `Art Engine → Selection`, `Heart & Angel → Temple`. Старый hero-блок (`Context Architecture…`, Art/Selection/Advising, Enter Lobby/Journal) удалён.
- Окно рендерится в portal на `z-[9999]`, поэтому кнопка `FLOW` из основного Header (`z-50`) не перекрывает reset/close. Header, Footer и главная остаются в обычном виде; отдельного «второго» Pierrot-экрана нет.
- Ввод: окно использует `visualViewport.height` и `offsetTop` при открытой клавиатуре, safe-area сверху/снизу, footer `shrink-0`, а textarea автоматически растёт до 144 px. Поле ввода остаётся внутри видимой области.
- `HomePierrotMode`, `telegram-pierrot-inline`, `pierrot-inline-shell` и composer-режим удалены; `PierrotMode` теперь только `site | modal`.
- Ответы Pierrot рендерятся как безопасный markdown: `**bold**`, `*italic*`, ссылки, списки и code больше не показываются literal; raw HTML отключён, URL фильтруются.
- На default-странице добавлен CTA `Ask Pierrot something`: он фокусирует поле ввода и запускает диалог. Ниже — компактный индекс без разделителей: крупный sans-uppercase раздел + мелкий дочерний (`LOBBY UNFRAMED`, `FLOW JOURNAL`, `ART ENGINE SELECTION`, `HEART & ANGEL TEMPLE`) в типографике Header.
- Полный Jest после унификации: **61/61 suites, 365/365 tests PASS**.

Разделы ниже, где упоминаются inline-режим и composer-порог, сохранены как история первичного аудита. Актуальное состояние — этот раздел и §7 (D-U1…D-U6).

---

## 1. Краткий итоговый статус

**READY WITH CAVEATS.**

- P0/P1 дефектов не найдено.
- Найдено и исправлено 6 воспроизводимых P2/P3-дефектов, включая унификацию окна.
- Полный Jest-прогон: **61/61 suites, 365/365 tests PASS**.
- Оставлено одно окно Pierrot с аватаром, именем, reset и close; поле ввода защищено от ухода за экран, reset не перекрывается Flow.
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

- Изменены 13 файлов, удалён `HomePierrotMode`, добавлены 5 регрессионных тестов и этот отчёт (см. §7).
- `npm test`: **365/365 PASS**, 61/61 suites.
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
| Домашний launcher                    | `components/pierrot/PierrotComposer.tsx`, `HomeClient.tsx`                                                                  |
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

Монтирование PierrotChat ровно одно. `PierrotComposer` на `/` — это только launcher, открывающий то же окно; `PierrotTrigger` — в Header; в Telegram — `TelegramNavigation`.

---

## 4. Проверенные маршруты

Существуют все целевые маршруты:

`/`, `/heartandangel`, `/heartandangel/world`, `/heartandangel/calm`, `/heartandangel/card`, `/lobby`, `/selection`, `/journal`, `/flow`, `/flow/join`, `/letters`, `/advising`, `/advising/request`, `/media`, `/heritage`, `/research`, `/art-engine`, `/unframed`, `/unframed/book`, `/unframed/proposal`, `/temple`.

Существуют якоря: `#order`, `#issues`, `#subscribe`, `#family`, `#museum`, `#digital`.

SSR-прогон (dev, безопасные env-заглушки):

| Маршрут                   | HTTP | Примечание                      |
| ------------------------- | ---- | ------------------------------- |
| `/`                       | 200  | 1× Open Pierrot + 1× launcher P |
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

| #   | Сценарий                             | Маршрут/контекст     | Авторизация | Viewport         | Ожидание                | Факт                                  | Статус              | Доказательство                     |
| --- | ------------------------------------ | -------------------- | ----------- | ---------------- | ----------------------- | ------------------------------------- | ------------------- | ---------------------------------- |
| 1   | Открыть Pierrot window               | `/`                  | гость       | jsdom            | modal                   | работает                              | PASS                | `PierrotNavigation.test.tsx`       |
| 2   | Launcher P открывает то же окно      | `/`                  | гость       | jsdom            | modal                   | работает                              | PASS                | там же                             |
| 3   | Окно, закрытие, сохранение черновика | `/lobby`             | гость       | jsdom            | черновик сохранён       | работает                              | PASS                | там же                             |
| 4   | Отправить короткое сообщение         | `/`                  | гость       | jsdom            | 1 запрос                | 1 запрос                              | PASS                | там же                             |
| 5   | Подтверждение навигации + arrival    | `/`                  | гость       | jsdom            | 1 переход, без дублей   | работает                              | PASS                | там же                             |
| 6   | Flow-кнопка у non-admin              | Header               | non-admin   | статика + jest   | скрыта                  | скрыта                                | PASS (fixed)        | `HeaderPierrotFlow.test.tsx`       |
| 7   | Flow-кнопка у admin                  | Header               | admin       | статика + jest   | видна рядом с P         | видна                                 | PASS                | там же                             |
| 8   | Сброс истории/бейджа при logout      | modal                | admin→guest | jsdom            | очищено                 | очищено                               | PASS (fixed)        | `PierrotAuthReset.test.tsx`        |
| 9   | История не чистится при F5           | modal                | admin       | jsdom            | сохранена               | сохранена                             | PASS                | там же                             |
| 10  | Hook order null→ready                | `/flow/[slug]`       | любой       | jsdom            | без краша               | без краша                             | PASS (fixed)        | `PierrotContextBlock.test.tsx`     |
| 11  | Escape / focus trap                  | modal                | любой       | статика          | работает                | код есть                              | PARTIAL             | `PierrotChat.tsx`                  |
| 12  | Flow vs clear: перекрытие            | auth + modal         | auth        | 320–1440         | нет перекрытия          | статически нет; пиксельно не измерено | PARTIAL             | см. §6                             |
| 13  | P на immersive-маршрутах             | `/temple`, `/vigil`… | любой       | статика          | доступна                | отсутствует                           | FAIL (design)       | `Header.tsx`                       |
| 14  | API validation                       | `/api/pierrot-web`   | n/a         | node/curl        | 400/413                 | 400/413                               | PASS                | curl + jest                        |
| 15  | Consent denied → нет записи          | API                  | n/a         | node             | нет store               | нет store                             | PASS                | `route.test.ts`                    |
| 16  | Идемпотентность / чужой session id   | API                  | n/a         | node             | replay/deny             | корректно                             | PASS                | `route.test.ts`                    |
| 17  | Детерминированный оффер              | API                  | гость       | curl             | 200 + CTA               | 200 + CTA                             | PASS                | curl                               |
| 18  | Полный Jest                          | весь проект          | n/a         | node             | зелёный                 | 365/365                               | PASS                | см. §8                             |
| 19  | TypeScript                           | весь проект          | n/a         | —                | без ошибок              | без ошибок                            | PASS                | `tsc`                              |
| 20  | Production build                     | весь проект          | n/a         | —                | собирается              | compile+types OK; static — env/fonts  | PARTIAL             | см. §8                             |
| 21  | Lint                                 | весь проект          | n/a         | —                | зелёный                 | baseline 6334                         | FAIL (pre-existing) | см. §8                             |
| 22  | Визуальная одинаковость страниц      | 10+ маршрутов        | —           | реальный браузер | —                       | не проверено                          | NOT TESTED          | нет браузера                       |
| 23  | Telegram P → одно окно               | `/`                  | гость       | jsdom            | modal                   | modal                                 | PASS (fixed)        | `TelegramPierrotBehavior.test.tsx` |
| 24  | Telegram launcher → то же окно       | `/`                  | гость       | jsdom            | modal                   | modal                                 | PASS (fixed)        | там же                             |
| 25  | Reset в шапке окна                   | `/`                  | гость       | jsdom            | очищает диалог          | очищает                               | PASS (fixed)        | `PierrotNavigation.test.tsx`       |
| 26  | Клавиатура: высота/offset окна       | modal                | любой       | jsdom + мок VP   | input видим             | height 500 / top 50                   | PASS (fixed)        | `PierrotChatViewport.test.tsx`     |
| 27  | Default-меню Pierrot                 | `/`, пустой диалог   | гость       | jsdom + Chromium | 5 компактных строк      | все ссылки, без разделителей          | PASS                | `PierrotNavigation.test.tsx`       |
| 28  | Шапка Pierrot = шапка Header         | modal                | любой       | статика          | avatar/logo/reset/close | выровнено                             | PASS (fixed)        | `PierrotChat.tsx`                  |
| 29  | Markdown в ответе Pierrot            | modal                | гость       | jsdom            | bold/links, не `**`     | bold/link, raw HTML off               | PASS (fixed)        | `PierrotNavigation.test.tsx`       |
| 30  | CTA «Ask Pierrot something»          | default window       | гость       | jsdom + Chromium | фокус в input           | фокус + input внутри viewport         | PASS                | `PierrotNavigation.test.tsx`       |

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

- `components/PierrotChat.tsx` — единое окно, аватар/имя/reset/close, safe-area, viewport.
- `components/pierrot/PierrotContext.tsx` — один режим (site/modal), удалены inline/composer, auth-reset.
- `components/pierrot/PierrotComposer.tsx` — только launcher, открывающий общее окно.
- `components/pierrot/PierrotConversation.tsx` — auto-grow поля ввода, default-индекс навигации, CTA «Ask Pierrot something», безопасный markdown ответов.
- `components/pierrot/useKeyboardViewportHeight.ts` — height + offsetTop.
- `components/pierrot/HomePierrotMode.tsx` — удалён.
- `components/Header.tsx` — обычный Header, Flow только admin.
- `components/Footer.tsx`, `components/HomeClient.tsx` — убраны inline-ветки.
- `components/TelegramMiniApp.tsx` — без inline body-класса; BackButton сохранён.
- `app/main.css` — удалены inline-правила.
- `components/flow/PierrotContextBlock.tsx` — порядок хуков.
- `lib/telegram/format.ts` — безопасный Markdown → Telegram HTML для ответов бота.
- `lib/newsletter/__tests__/language.test.ts`, `lib/journal/__tests__/preview.test.ts`, `lib/flow/__tests__/bilingual.test.ts`, `lib/flow/__tests__/flowLayout.test.ts` — перевод с `node:test`/скриптового стиля на Jest (инфраструктура тестов, не Pierrot-логика).
- Добавлены: `components/pierrot/__tests__/PierrotAuthReset.test.tsx`, `components/flow/__tests__/PierrotContextBlock.test.tsx`, `components/__tests__/HeaderPierrotFlow.test.tsx`, `components/telegram/__tests__/TelegramPierrotBehavior.test.tsx`, `components/pierrot/__tests__/PierrotChatViewport.test.tsx`, `components/pierrot/__tests__/useKeyboardViewportHeight.test.tsx`.
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
- **Проверка:** класс содержит только `fixed`; SSR-страница `/` содержит launcher P; визуально — после браузерного прогона.

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

#### D-U1 — P2. Два окна Pierrot: inline на главной и modal на остальных

- **Где:** `PierrotContext`, `HomeClient`, `Header`, `Footer`, `HomePierrotMode`.
- **Воспроизведение:** открыть `/` → P; затем открыть `/lobby` → P.
- **Ожидание:** одно и то же окно с аватаром, именем, reset и close.
- **Факт:** на `/` открывался inline-экран без собственной шапки/reset; на других страницах — modal с другим header.
- **Первопричина:** два режима (`inline` и `modal`) и два компонента (`HomePierrotMode` и `PierrotChat`).
- **Исправление:** inline и home-composer удалены; `PierrotMode` = `site | modal`; `HomePierrotMode` удалён; Header/Footer/Home всегда в обычном виде; все P и section-links открывают `PierrotChat`.
- **Побочные эффекты:** быстрый composer с порогом 100 символов больше не показывается отдельно — ввод сразу происходит в общем окне. Это осознанная унификация.
- **Проверка:** `PierrotNavigation.test.tsx` (главная → modal; launcher → modal), `TelegramPierrotBehavior.test.tsx`.

#### D-U2 — P2. Поле ввода могло уйти за экран при клавиатуре

- **Где:** `components/PierrotChat.tsx`, `components/pierrot/useKeyboardViewportHeight.ts`, `PierrotConversation.tsx`.
- **Воспроизведение:** открыть окно на мобильном, сфокусировать ввод.
- **Ожидание:** окно и footer/input остаются в visual viewport.
- **Факт:** использовалась только высота `100dvh`/`--tg-viewport-height`; `offsetTop` visualViewport не учитывался; textarea не рос.
- **Исправление:** hook возвращает `{height, offsetTop}`; окно получает `height/maxHeight/top`; safe-area сверху/снизу; footer `shrink-0`; textarea auto-grow до 144 px с минимумом 38 px.
- **Побочные эффекты:** при открытой клавиатуре окно может сдвигаться вниз на `offsetTop` — это ожидаемое поведение.
- **Проверка:** `PierrotChatViewport.test.tsx` (height 500 / top 50), `useKeyboardViewportHeight.test.tsx`.

#### D-U3 — P2. Reset мог конкурировать с Flow из основного Header

- **Где:** `components/PierrotChat.tsx`.
- **Ожидание:** reset и close доступны, Flow не перекрывает их.
- **Факт:** в inline-режиме основной Header с Flow оставался на экране; в modal header был другой, и элементы могли визуально конкурировать.
- **Исправление:** единственное окно — full-screen portal `z-[9999]`; основной Header (`z-50`) остаётся позади; reset/close живут в собственной шапке окна.
- **Проверка:** `PierrotNavigation.test.tsx` (reset в шапке), статическая проверка z-index; пиксельно — после браузерного прогона.

#### D-U4 — P2. Шапка Pierrot не совпадала с основным Header

- **Где:** `components/PierrotChat.tsx`.
- **Ожидание:** два режима — пользователь и диалог с Pierrot — с одинаковой визуальной шапкой.
- **Факт:** в окне был маленький аватар 36 px, serif-имя 15 px, подпись и admin-бейдж; шапка не совпадала с Header.
- **Исправление:** аватар 40/44 px с тем же ring/shadow, имя `Pierrot` в логотипной пилюле (`font-sans font-bold text-sm sm:text-base uppercase tracking-[0.15em]/[0.2em]`), контейнер `max-w-[1800px] px-4 sm:px-6 lg:px-10 py-3 sm:py-4`, фон/бордер/blur как у scrolled Header; reset/close — 40/44 px. Подпись и бейдж `Master` из шапки убраны.
- **Побочные эффекты:** admin-режим по-прежнему определяется сервером, но больше не показывается бейджем.
- **Проверка:** статическая сверка классов с `Header.tsx`; тесты Pierrot/Telegram проходят. Пиксельно — после браузерного прогона.

#### D-U5 — P2. Markdown в ответах Pierrot показывался literal

- **Где:** `components/pierrot/PierrotConversation.tsx`.
- **Воспроизведение:** ответ модели с `**bold**` или `[link](/lobby)`.
- **Ожидание:** bold/italic/ссылки/списки отрисованы.
- **Факт:** ассистентский текст выводился как plain text, поэтому `**` и markdown-ссылки были видны как технические символы.
- **Причина:** `{message.content}` в обычном `<div>` без markdown-рендера.
- **Исправление:** `markdown-to-jsx` только для assistant-сообщений; `disableParsingRawHTML`, фильтр URL (internal `/`, `#`, `http(s)`, `mailto`), internal links через `next/link`, внешние — `target=_blank rel=noopener noreferrer`, изображения отключены.
- **Проверка:** `PierrotNavigation.test.tsx` (bold → `<strong>`, link → `/lobby`, `javascript:` не становится ссылкой).

#### D-U6 — P2. Default-страница Pierrot была маркетинговым hero, а не навигацией

- **Где:** `components/pierrot/PierrotConversation.tsx`.
- **Воспроизведение:** открыть Pierrot или нажать `New chat`.
- **Ожидание:** сохранённая фраза `Structure is the antidote to chaos.` и красивый индекс сайта.
- **Факт:** старый hero `Context Architecture & Cultural Capital`, кнопки Art/Selection/Advising и Enter Lobby/Journal; меню Header не отражено.
- **Исправление:** старый блок удалён; добавлен компактный индекс `Anton Merkurov`, `Lobby → Unframed`, `Flow → Journal`, `Art Engine → Selection`, `Heart & Angel → Temple` в типографике Header: крупный sans-uppercase раздел и мелкий дочерний в одну строку, без hairline-разделителей и номеров. CTA `Ask Pierrot something` фокусирует input. Пустой диалог скроллится к началу, а не к низу.
- **Побочные эффекты:** меню стало прямой навигацией; это шаг к будущему отказу от Header-меню.
- **Проверка:** `PierrotNavigation.test.tsx` (все 9 ссылок, старого hero нет).

### Не исправлялись (осознанно)

#### D6 — P3. Pierrot недоступен на immersive-маршрутах

`/temple`, `/cast`, `/vigil`, `/absolution`, `/tribute`, `/heartandangel/world|calm|letitgo`: Header возвращает `null`, Telegram-навигация на части маршрутов тоже скрыта. Триггера `P` нет. Это выглядит как осознанный immersive-дизайн; изменение требует продуктового решения и согласования.

#### D7 — P3. Layout shift при открытии модалки

`body.overflow = hidden` без компенсации ширины скроллбара. На desktop возможен горизонтальный сдвиг. Лечится `scrollbar-gutter: stable` глобально — вне минимального фикса.

#### D8 — P3. Два P в Telegram site-режиме

На главной в Telegram одновременно есть P в `TelegramNavigation` и `PierrotComposer` (launcher). Оба теперь открывают **одно и то же окно**; два элемента — это два места входа, а не два интерфейса. Оставлено осознанно.

---

## 8. Результаты проверок

| Проверка                        | Команда                                                                                                                       | Результат                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pierrot Jest                    | `npx jest lib/pierrot components/pierrot app/api/pierrot-web app/api/pierrot/conversations app/api/admin/pierrot --runInBand` | 18 suites, **136 tests PASS**                                                                        |
| Полный Jest                     | `npx jest --runInBand --forceExit`                                                                                            | 61 suites, **365 tests PASS**                                                                        |
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
9. **Telegram-детект** — `useIsTelegram` ждёт `initData` от SDK, загружаемого `lazyOnload`; в первые кадры в Mini App может мелькнуть web-header. Функционально не ломает Pierrot, но требует проверки на реальном Telegram.
10. **Telegram / unified window** — окно и viewport проверены в jsdom, но реальный Telegram WebApp (safe-area, клавиатура, BackButton, закрытие, отсутствие визуальных перекрытий) ещё не проверялся.

---

## 13. Рекомендация

**READY WITH CAVEATS.**

Код можно пушить и тестировать на production/staging при условии:

1. В Vercel заданы все env из `.env.example` (Supabase, OpenRouter, Gemini/DeepSeek, Telegram, Stripe, admin secrets).
2. После деплоя вручную проверены в браузере: `/`, `/lobby`, `/flow`, `/journal`, `/unframed/book`, `/temple`; гость и admin; открытие/закрытие/повторное открытие одного окна; аватар/имя/reset/close; reset не перекрыт Flow; отсутствие `Master` после logout.
3. В реальном Telegram Mini App проверены: `P` и home-launcher открывают то же окно; BackButton; safe-area сверху/снизу; клавиатура не выталкивает input; отсутствие мелькания web-header.
4. Отдельно проверены мобильные 320–390 px и открытая клавиатура.
5. Настроен retention purge (pg_cron или внешний job) и, при необходимости, внешний rate limit.
6. Принято продуктовое решение по immersive-маршрутам и consent-политике.

P0/P1-блокеров нет. Все исправления минимальны и локальны; архитектура, схема БД, env и production-конфигурация не менялись.

---

## 14. Telegram bot: webhook secret incident

- **Симптом:** Telegram-бот перестал отвечать; сообщения не обрабатываются.
- **Причина:** в `app/api/pierrot/route.ts` `webhookCallback` начал требовать `TELEGRAM_WEBHOOK_SECRET`, если переменная задана. Если webhook в Telegram зарегистрирован без `secret_token`, grammY отклоняет каждый апдейт (401) — бот молчит.
- **Исправление:** проверка секрета сделана opt-in: `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`. По умолчанию secret не требуется, поэтому бот снова принимает апдейты; при включённом флаге секрет проверяется.
- **Как включить безопасно:** зарегистрировать webhook с `secret_token=<TELEGRAM_WEBHOOK_SECRET>` и только затем выставить `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`.
- **Проверка после деплоя:** `getWebhookInfo` не должен показывать `last_error_message`; в логах Vercel не должно быть 401/`getMe`; бот отвечает на `/start`.
- **Если webhook был отключён Telegram:** перерегистрировать URL `https://www.merkurov.love/api/pierrot` (без вывода токена в чат).
- **Форматирование ответов:** web-чат рендерит безопасный markdown через `markdown-to-jsx`; Telegram-бот конвертирует `**bold**`, ссылки и заголовки в HTML (`lib/telegram/format.ts`) и отправляет `parse_mode: 'HTML'`. Raw HTML экранируется, `javascript:` не становится ссылкой.
