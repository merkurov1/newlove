# Аудит `/heartandangel` — архитектура, UX, мобильная версия, Telegram Mini App и PWA

**Репозиторий:** `merkurov1/newlove`  
**Дата:** 2026-11-04  
**Режим:** read-only audit. В ходе аудита код, API, миграции, навигация и БД не изменялись.  
**Важно:** в рабочем дереве уже были незакоммиченные изменения по `/vigil` и `/tribute`; к этому аудиту они не относятся и не затрагивались.

---

## I. Executive summary

Heart & Angel — не набор случайных страниц. У проекта есть узнаваемый визуальный язык, последовательность World → Temple → ритуалы и самостоятельная интонация. World, Calm, Let It Go и Temple действительно ощущаются частями одного произведения. Особенно хорошо работают: полноэкранный World, случайный Angel/Daemon, сердце как центральный объект, спокойная типографика, физическая открытка как продолжение идеи «любовь — это действие».

Главная проблема не в концепции, а в **несогласованности оболочек и инфраструктуры**:

- Telegram Mini App имеет собственную плавающую навигацию, но страницы не резервируют под неё место. На узком экране она перекрывает главный CTA.
- Telegram-детекция вызывает hydration mismatch: сервер отдаёт одну оболочку, клиент сразу другую.
- World не классифицирован как ritual/immersive route. В результате полноэкранная сцена скроллится и под ней появляется глобальный footer.
- Weather API World вызывает несуществующий endpoint, поэтому погода никогда не влияет на сцену.
- `HeartPhysics` рисует canvas без `devicePixelRatio`, не пересчитывает композицию при resize/orientation change и показывает gyro-кнопку почти всем.
- Hub и Card в обычном браузере получают два footer’а — собственный и глобальный.
- NFT-раздел фактически является заглушкой, хотя присутствует в sitemap.
- PWA для Heart & Angel отсутствует: есть только общий сайтовый manifest и service worker для Pierrot.

Проект готов к дальнейшему развитию, но перед этим нужен **P0-проход по Telegram, World и мобильной оболочке**. Полноценный редизайн не нужен.

### Что уже хорошо

- Сильная визуальная идентичность и цельная палитра.
- Понятная художественная рамка в Hub и About.
- World как самостоятельная сцена, а не просто фон.
- Temple с шестью ритуалами как понятный хаб.
- Физическая открытка с реальным Stripe-флоу и проверкой статуса.
- Аккуратные SEO-метаданные и JSON-LD.
- Базовая Telegram-инфраструктура: safe-area, stable viewport, BackButton, тема, haptics.
- Общий audio provider, который не пытается играть вне Heart & Angel.
- Отсутствие горизонтального overflow в проверенных мобильных размерах.

### Что мешает

- Разные источники истины для immersive/ritual-маршрутов.
- Перекрытие Telegram-панели с контентом.
- Hydration mismatch в Mini App.
- World scroll/footer и неработающая погода.
- Canvas без DPR и корректного resize.
- Скрытые интерактивные механики Calm и Let It Go.
- Дублирующиеся footer’ы.
- Незавершённый NFT.
- Отсутствие PWA-слоя для Heart & Angel.

---

## II. Карта архитектуры

### Маршруты

| Маршрут | Тип | Основные компоненты | Данные / действия |
|---|---|---|---|
| `/heartandangel` | Hub | `HeartAndAngelHub` | статика, Swiper, YouTube modal, ссылки на World/About/Card |
| `/heartandangel/world` | Интерактивная сцена | `WorldScene` | время, погода (`/api/world/weather` — сломан), random Angel/Daemon, heart rain, audio |
| `/heartandangel/calm` | Canvas-ритуал | `HeartPhysics` | canvas, deviceorientation, touch/mouse, log `MEDITATION` |
| `/heartandangel/letitgo` | Интерактивный ритуал | `LetItGoAngel` | локальные flying hearts, log `ASH`, Telegram user |
| `/heartandangel/about` | Статья | page | статика, JSON-LD |
| `/heartandangel/card` | Commerce | `CardPageClient`, `PostcardOrderForm` | `/api/postcards`, `/api/postcards/order`, Stripe |
| `/heartandangel/card/success` | Payment status | `SuccessClient` | `/api/postcards/order-success` |
| `/heartandangel/NFT` | Заглушка | `ClientPage` | web3-код присутствует, но UI почти отсутствует |
| `/temple` | Ритуальный хаб | `TempleClient` | `/api/temple_logs` каждые 15 сек, Telegram user, audio |
| `/cast`, `/absolution`, `/vigil`, `/tribute` | Ритуалы Temple | соответствующие клиенты | не входят в задачу, но являются частью пути |

### Общие компоненты

- `TemplePageTransition` — анимация переходов.
- `TempleTopBar` — back/sound/timer для Calm, Let It Go и других ритуалов.
- `SoundToggle` + `GlobalAudioProvider` — общий ambient audio.
- `TelegramMiniApp` — SDK, viewport/safe-area, BackButton, body classes, `TelegramNavigation`.
- `TelegramNavigation` — плавающая панель World/Temple/ритуалы.
- `Header` / `Footer` — глобальная сайтовая оболочка.
- `useIsTelegram` — определение Mini App.
- `templeLogger` / `/api/temple_logs` — запись ритуальных событий.
- `HeartAndAngelHub`, `WorldScene`, `HeartPhysics`, `LetItGoAngel` — основные клиенты.

### Состояние и сохранение

- `localStorage`:
  - `temple_user` — имя для ритуальных логов и Telegram-персонализации.
  - `tg_user` — Telegram user в Temple.
  - `connected_address` — старый NFT-контекст.
- Сервер:
  - `temple_log` — публичные ритуальные события.
  - `postcards` / `postcard_orders` — каталог и заказы.
  - Stripe metadata / webhook — оплата открытки.
- Локальное состояние:
  - Hub: modal, Swiper.
  - World: hero, gradient, night, cloud opacity, falling hearts.
  - Calm: canvas-физика, permission, seconds.
  - Let It Go: flying hearts, click count, sky gradient, Telegram name.
  - Temple: modals, posts, stats, lighting, Telegram user.
  - Card: catalogue, form fields, loading.
- Между посещениями сохраняются только `temple_user`, `tg_user`, `connected_address`; визуальное состояние ритуалов не сохраняется.

### Клиент/сервер

- Почти все Heart & Angel-страницы — клиентские.
- Серверные данные: `/api/temple_logs`, `/api/postcards`, `/api/postcards/order`, `/api/postcards/order-success`, `/api/world`, Stripe webhook.
- Weather API `/api/world` существует, но World его не вызывает.
- NFT-клиент содержит web3-код, но UI до него не доходит.

### Поведение при отказе сети

- World: падает в device-time fallback, но weather endpoint всё равно неверный.
- Calm: при битом изображении canvas может остановиться с `InvalidStateError`.
- Let It Go: изображения не имеют fallback; таймеры не очищаются.
- Temple: при ошибке `/api/temple_logs` показывает «No traces recorded yet» вместо ошибки.
- Card: skeleton может висеть бесконечно, если `/api/postcards` не отвечает.
- Card success: при сетевой ошибке показывает error, повторного автоматического retry нет.
- PWA/offline: для Heart & Angel отсутствует.

---

## III. Технические проблемы

### Подтверждённые ошибки

#### 1. P0 — Hydration mismatch в Telegram

**Файлы:** `components/useIsTelegram.ts:31`, `components/TelegramMiniApp.tsx:186`, `components/Header.tsx:27`

`useIsTelegram` инициализирует state через `useState(isTelegramMiniApp)`. На сервере `window` нет → `false`. На клиенте первый рендер видит `window.Telegram.WebApp.initData` → `true`. Серверный HTML и клиентский первый рендер не совпадают.

**Воспроизведение:** открыть `/heartandangel/about` или `/heartandangel/card` в Playwright с имитацией Telegram. В консоли:

- `Hydration failed because the initial UI does not match what was rendered on the server`
- `Expected server HTML to contain a matching <button> in <body>`

**Последствия:** замена серверного HTML, мигание Header/Footer, позднее появление плавающей панели, возможная потеря состояния. Это влияет на весь Telegram-опыт, не только на Heart & Angel.

**Исправление:** инициализировать `false`, устанавливать `true` в `useEffect`, либо использовать `useSyncExternalStore` с серверным snapshot `false`.

---

#### 2. P0 — Плавающая панель перекрывает главный CTA Hub на узком экране

**Файлы:** `components/telegram/TelegramNavigation.tsx:139-167`, `components/HeartAndAngelHub.tsx:117-139`

На 320×568 в имитации Telegram:

- CTA `Explore World`: `x=20..300`, `y=466..510`
- кнопка навигации: `x=262..308`, `y=478..522`
- кнопка Pierrot: `x=12..56`, `y=478..522`

Обе плавающие кнопки попадают в область CTA. Пользователь может нажать на навигацию вместо входа в World.

**Причина:** панель `position: fixed`, а страницы не резервируют нижнюю зону; Hub использует `min-h-[calc(100vh-70px)]` и прижимает CTA к низу.

**Исправление:** резервировать bottom safe-zone на страницах с плавающей панелью, либо скрывать/сворачивать триггеры при пересечении с CTA. Не просто сдвигать панель на несколько пикселей.

---

#### 3. P0/P1 — World не считается ritual route: footer и скролл

**Файлы:** `components/TelegramMiniApp.tsx:10-17`, `app/heartandangel/world/page.tsx:45`

`RITUAL_ROUTES` содержит `/temple`, `/heartandangel/calm`, `/heartandangel/letitgo`, `/vigil`, `/absolution`, `/tribute`, но **не содержит `/heartandangel/world`**. Поэтому `body.ritual-route` не выставляется, и глобальный `<Footer>` не скрывается.

**Измерено в Playwright 320×568 (Telegram simulation):**

- `innerHeight = 568`
- `document.documentElement.scrollHeight = 1740`
- `body.className = "telegram-app"` без `ritual-route`

На 390×844: `scrollHeight = 1015`. Полноэкранная сцена скроллится, и под ней появляется сайтовый footer.

**Исправление:** добавить World в ritual/immersive-классификацию или явно скрыть глобальный footer на этом маршруте; использовать `100dvh`/stable viewport, а не `min-h-screen` на внешней обёртке.

---

#### 4. P1 — Weather API World вызывает несуществующий endpoint

**Файлы:** `components/WorldScene.tsx:90`, `app/api/world/route.ts`, `app/api/world/weather` (0 байт)

World делает `fetch('/api/world/weather')`. Реальный handler находится в `app/api/world/route.ts`. Файл `app/api/world/weather` пустой и не является route. Запрос уходит в 404, `if (!res.ok) return` тихо выходит, и всегда работает только device-time fallback.

**Последствия:** погода, `isDay`, cloud opacity и weathercode никогда не влияют на сцену. Концепция «weather and time shape the world» не реализована.

**Исправление:** вызывать `/api/world`, удалить пустой файл или создать полноценный route. Добавить тест на endpoint.

---

#### 5. P1 — HeartPhysics canvas не учитывает devicePixelRatio

**Файл:** `components/HeartPhysics.tsx:89-96`

```ts
let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);
```

Canvas backing store равен CSS-пикселям. На iPhone с DPR 3 canvas рисуется в 1/3 физического разрешения и выглядит размытым. `ctx.scale(dpr, dpr)` и умножение `canvas.width/height` на DPR отсутствуют.

**Исправление:** использовать `devicePixelRatio`, масштабировать контекст и пересчитывать при resize.

---

#### 6. P1 — HeartPhysics не пересчитывает композицию при resize/orientation change

**Файл:** `components/HeartPhysics.tsx:89-129`

`handleResize` обновляет только `canvas.width/height`. При этом:

- `daemonWidth` / `daemonHeight`
- `sceneLift`
- `restLength`
- `balloonX` / `balloonY`

вычисляются один раз до resize. После поворота экрана daemon остаётся старого размера, heart может оказаться не по центру, физика использует старую длину верёвки.

**Воспроизведение:** открыть Calm на iPhone, повернуть в landscape. Композиция не пересчитывается.

**Исправление:** вычислять производные размеры внутри `handleResize`/`render`, пересчитывать `balloonX/Y` относительно нового viewport, слушать `visualViewport`/`orientationchange`.

---

#### 7. P1 — Gyro-кнопка показывается почти всем и игнорирует safe area

**Файл:** `components/HeartPhysics.tsx:480-519`, `570-604`

`permissionGranted` стартует с `false`, поэтому кнопка `Enable Gyroscope 📱` видна:

- на Android, где `requestPermission` не нужен;
- на desktop;
- после отказа пользователя (без сообщения об отказе);
- в Telegram.

Кнопка позиционируется `bottom: 32px`, без `env(safe-area-inset-bottom)`. На 320×568 при safe area 34 px её нижние 2 px попадают в home-indicator зону.

**Последствия:** ложный главный CTA, визуальный шум, лишний шаг до взаимодействия с сердцем.

**Исправление:** показывать кнопку только на iOS, где `DeviceOrientationEvent.requestPermission` существует и разрешение ещё не выдано; использовать safe-area; обрабатывать denied.

---

#### 8. P1 — Битое изображение останавливает canvas HeartPhysics

**Файл:** `components/HeartPhysics.tsx:326-334`, `410-429`

Код проверяет только `img.complete`, но не `img.naturalWidth` / `onerror`. У битого изображения `complete === true`, после чего `ctx.drawImage` выбрасывает `InvalidStateError` и цикл рендера прекращается.

**Воспроизведение:** Playwright с заблокированным remote image — в консоли `InvalidStateError: The HTMLImageElement provided is in the 'broken' state`.

**Исправление:** флаг `failed`, `img.onerror`, пропуск `drawImage` и fallback-состояние.

---

#### 9. P1 — Параллакс сердца в World не работает из-за конфликта transform

**Файл:** `components/WorldScene.tsx:377-381`, `496-505`, `515-517`

Кнопка сердца одновременно:

- имеет inline `transform: translate(calc(-50% + var(--heart-x)), calc(-50% + var(--heart-y)))`;
- имеет класс `animate-bounce-slow`, чья CSS-анимация анимирует `transform`.

CSS-анимация имеет приоритет над inline transform, поэтому `--heart-x`/`--heart-y` фактически не двигают сердце. Pointer-параллакс не виден.

**Исправление:** вынести bounce на внешний wrapper, а parallax — на внутренний слой; либо использовать motion values.

---

#### 10. P1 — Falling hearts перерисовывают React каждый кадр

**Файл:** `components/WorldScene.tsx:188-221`

`animate()` вызывает `setFallingHearts` на каждом `requestAnimationFrame`, создавая новый массив и перерисовывая компонент ~60 раз в секунду. Каждый клик добавляет 12 сердец; ограничения на количество нет. На мобильном это заметная нагрузка.

**Исправление:** анимировать через CSS/`requestAnimationFrame` с refs и прямым DOM/canvas, либо вынести в canvas; ограничить число сердец.

---

#### 11. P1 — Let It Go:核心 взаимодействие недоступно с клавиатуры, таймеры не очищаются

**Файл:** `components/LetItGoAngel.tsx:104-109`, `80-86`, `134-151`

- Интерактивный ангел — `div` с `onClick`, без `role="button"`, `tabIndex`, `onKeyDown`, `aria-label`.
- Два `setTimeout` (1800 ms и 6000 ms) не сохраняются и не очищаются при unmount.
- Flying heart имеет фиксированные 450×450 px и `margin-left: -225px`; на 320 px он гарантированно выходит за ширину и обрезается `overflow-x-hidden`.

**Исправление:** сделать кнопкой, очищать таймеры, ограничить размер по `min(450px, 70vw)` и проверить clipping.

---

#### 12. P1 — На мобильном Hub нет видимого `<h1>`

**Файл:** `components/HeartAndAngelHub.tsx:94-104`, `143-146`

Мобильный заголовок «Heart & Angel» — это `<p>`. Единственный `<h1>` находится внутри блока `hidden md:flex`. На мобильном в DOM нет видимого `h1`; screen reader и document outline теряют заголовок страницы.

**Исправление:** использовать один адаптивный `<h1>` (визуально тот же), а не скрытый desktop-only `h1`.

---

#### 13. P1 — Два footer’а на Hub и Card в обычном браузере

**Файлы:** `app/layout.tsx:268-270`, `components/HeartAndAngelHub.tsx:370`, `app/heartandangel/card/CardPageClient.tsx:216`, `components/Header.tsx:31-39`

Root layout всегда рендерит `<Footer />`. Hub и Card дополнительно рендерят собственные `<footer>`. `Header.isImmersiveRoute` не включает `/heartandangel` и `/heartandangel/card`, поэтому глобальная оболочка не скрывается. В Telegram `body.telegram-app .site-footer` скрывает глобальный footer, но в Safari/desktop видны оба.

**Последствия:** композиция произведения заканчивается дважды; после художественного footer идут сайтовые ссылки.

**Исправление:** либо включить эти маршруты в immersive/ritual-классификацию, либо не рендерить глобальный Footer на страницах с собственным footer.

---

#### 14. P1 — Postcard checkout в Telegram не использует `openLink`

**Файл:** `components/heartandangel/PostcardOrderForm.tsx:92`

После создания Stripe-сессии вызывается `window.location.assign(result.paymentUrl)`. В Telegram Mini App это может:

- открыть Stripe в том же webview;
- быть заблокировано;
- оставить кнопку в состоянии загрузки;
- не дать корректно вернуться в Mini App.

Нет `Telegram.WebApp.openLink`, нет pending session, нет обработки focus/pageshow, нет возврата в форму.

**Исправление:** использовать `openLink` с fallback, сохранять `session_id`, на возврате проверять статус через существующий `/api/postcards/order-success`, сбрасывать loading.

---

#### 15. P1 — NFT-раздел фактически является заглушкой

**Файлы:** `app/heartandangel/NFT/ClientPage.tsx:908-918`, `app/heartandangel/NFT/page.tsx`, `app/heartandangel/NFT/contract.ts:3`, `app/heartandangel/NFT/README.md`

- В `ClientPage` ~900 строк mint/transform/claim-логики, но return содержит только заголовок, подзаголовок и картинку. Пользователь не видит ни connect wallet, ни mint, ни transform.
- `ClientPage_fixed.tsx` и `ClientPage_new.tsx` не импортируются.
- `CONTRACT_ADDRESS` читает `(globalThis as any)?.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS` вместо `process.env.NEXT_PUBLIC...`; в Next это не работает.
- Код вызывает `/api/check-eligibility`, но такого route нет.
- README говорит «keep feature-flagged», но feature flag отсутствует.
- Маршрут включён в `PUBLIC_ROUTES` и sitemap.

**Последствия:** индексируется и доступен полупустой NFT-раздел, который обещает «The Irreversible Choice», но не даёт действия.

**Исправление:** либо убрать из sitemap/навигации и явно закрыть, либо восстановить UI за feature flag после отдельного аудита безопасности web3-потока.

---

#### 16. P2 — Temple logs: ошибка сети выглядит как «нет записей»

**Файл:** `app/temple/TempleClient.tsx:360-365`, `617-624`

`fetchLogs` ловит ошибку только `console.warn`, а в `finally` ставит `loaded = true`. Модалка Traces показывает «No traces recorded yet» и для пустого массива, и для сетевой ошибки.

**Исправление:** отдельное состояние `error`, сообщение и retry.

---

#### 17. P2 — Модальные окна Temple без focus trap и блокировки скролла

**Файл:** `app/temple/TempleClient.tsx:527-784`

Escape обрабатывается, но:

- фокус не переводится в диалог;
- нет focus trap;
- `document.body` не блокируется, фон может скроллиться;
- после закрытия фокус не возвращается.

**Исправление:** общий modal-слой или аккуратная реализация focus trap/scroll lock.

---

#### 18. P2 — SoundToggle без доступного имени на мобильном

**Файл:** `components/SoundToggle.tsx:30`, `components/TempleTopBar.tsx:41`

Текст `Sound On/Off` скрыт через `hidden sm:inline`. На мобильном остаётся только иконка, а `aria-label`/`aria-pressed` отсутствуют. Это затрагивает TempleTopBar на Calm, Let It Go и других ритуалах.

**Исправление:** `aria-label={isPlaying ? 'Pause ambient audio' : 'Play ambient audio'}`, `aria-pressed`.

---

#### 19. P2 — Header пишет в localStorage каждую секунду на всех страницах

**Файл:** `components/Header.tsx:44-59`

`setInterval(syncIdentity, 1000)` работает даже тогда, когда Header возвращает `null` на immersive-маршрутах. Он постоянно читает `Telegram.WebApp.initDataUnsafe` и может писать `temple_user` каждую секунду.

**Последствия:** лишняя нагрузка, особенно на мобильных; синхронная запись в localStorage.

**Исправление:** событийная синхронизация при изменении user/profile/Telegram, без интервала.

---

#### 20. P2 — `templeLogger` может подменить автора ритуала

**Файл:** `lib/templeLogger.ts:22-24`

```ts
localStorage.getItem('temple_user') || author || 'Pilgrim'
```

HeartPhysics и LetItGo передают вычисленный `author`, но localStorage имеет приоритет. Если в `temple_user` осталось старое имя, событие `MEDITATION`/`ASH` запишется на него. Это не граница безопасности, но портит историю Temple.

**Исправление:** либо явно передавать доверенное имя и ставить его первым, либо синхронизировать `temple_user` с актуальным auth.

---

#### 21. P2 — Reduced motion применяется только внутри Telegram

**Файл:** `app/main.css:616-629`

Медиазапрос ограничен `body.telegram-app`. В обычном Safari/Chrome `animate-clouds-move`, `animate-spin-slow`, `animate-bounce-slow`, `animate-fly-away`, `fadeIn` продолжают работать. Модалка Hub использует `animate-fadeIn`, который в этот селектор не входит.

**Исправление:** глобальный `@media (prefers-reduced-motion: reduce)` для всех декоративных анимаций, включая canvas/JS-анимации.

---

#### 22. P2 — Время World не обновляется после первого рендера

**Файл:** `components/WorldScene.tsx:56-86`

`updateFallbackTime()` вызывается один раз в `useEffect`. Если пользователь открыл World днём и оставил вкладку до вечера, градиент, ночь и звёзды не изменятся. Аналогично погода загружается один раз.

**Исправление:** обновлять время/погоду раз в 1–5 минут, без частого polling.

---

#### 23. P2 — Невалидный Tailwind-класс `sm:w-38`

**Файл:** `components/WorldScene.tsx:357`

В `tailwind.config.js` нет spacing `38`. Класс `sm:w-38` ничего не делает; angel остаётся `w-28` на `sm`. Это визуальная, но подтверждённая мелочь.

---

#### 24. P2 — Дубликаты и мёртвый код

- `components/useIsTelegram.tsx` — дубликат `components/useIsTelegram.ts`, не используется.
- `app/heartandangel/SoundToggle.tsx` — дубликат `components/SoundToggle.tsx`, не используется.
- `app/heartandangel/letitgo/letitgo.css` — не импортируется.
- `components/TempleNav.tsx`, `TempleWrapper.tsx`, `TempleEntry.client.tsx` — не используются.
- `app/heartandangel/NFT/ClientPage_fixed.tsx`, `ClientPage_new.tsx` — не используются.
- `app/api/world/weather` — пустой файл.
- `app/api/temple/log/route.ts` — не используется.
- `HeartPhysics`/`LetItGoAngel` содержат неиспользуемые `tokenRef`.

Это не срочно, но затрудняет поддержку и создаёт ложные точки входа.

---

### Вероятные проблемы

- **Card catalogue без timeout.** `CardPageClient` не имеет `AbortController`/timeout; при зависшем `/api/postcards` skeleton может висеть бесконечно.
- **Card success без retry после сетевой ошибки.** При временной ошибке показывается error, автоматического повторного запроса нет.
- **Postcard PENDING orders.** `app/api/postcards/order/route.ts` создаёт заказ в статусе `PENDING` до Stripe; при отказе пользователя от оплаты заказ остаётся в базе. Нужна политика очистки/истечения.
- **Цена открытки дублируется.** В `CardPageClient` жёстко указано `£29`, в JSON-LD `29.00`, а фактическая цена берётся из `postcards.price`. При изменении в БД UI/SEO разойдутся.
- **Global Header без safe-area.** `components/Header.tsx` использует `fixed top-0` и `py-4`, но не `env(safe-area-inset-top)`. На iPhone с `viewportFit: cover` он может заходить в зону status bar/notch.
- **`100vh` vs `100dvh`.** Hub использует `min-h-[calc(100vh-70px)]`, World-обёртка — `min-h-screen`. На iOS Safari `100vh` может быть больше видимой области.
- **Telegram theme mismatch.** `TelegramMiniApp` принудительно ставит header/bottom bar `#141210`, хотя Calm/LetItGo/World днём светлые. Это может выглядеть как чужеродная тёмная рамка.
- **Native BackButton не закрывает модалки/панель.** `TelegramMiniApp` BackButton не знает о `isModalOpen` в Hub/Temple или об открытой `TelegramNavigation`; нажатие native back уйдёт по истории вместо закрытия overlay.
- **`initDataUnsafe` используется для отображаемого имени и localStorage** в `TempleClient`, `LetItGoAngel`, `Header`. Это не auth, но имя можно подделать; логи Temple остаются client-authoritative.
- **Font scaling.** Обилие `text-[9px]`/`text-[10px]` и `truncate` в Temple/Navigation может плохо себя вести при системном увеличении шрифта.
- **World `scrollHeight` 1740** воспроизведён, но точная причина дополнительной высоты требует отдельной проверки DOM перед изменением кода; отсутствие `ritual-route` и видимый footer подтверждены.

### Архитектурные риски

- **Три источника истины для «immersive/ritual»:** `Header.isImmersiveRoute`, `TelegramMiniApp.RITUAL_ROUTES`, `TelegramMiniApp.IMMERSIVE_ROUTES`, плюс `body.ritual-route` и `body.telegram-app`. Они расходятся; отсюда footer на World, панель на Hub и hydration-различия.
- **Публичные клиентские логи.** `ASH` и `MEDITATION` пишутся через `/api/temple_logs` с авторством из localStorage. Сервер не проверяет identity. Для художественного проекта это может быть допустимо, но данные Temple нельзя считать доверенными.
- **Нет тестов на Heart & Angel UI.** Нет тестов для `WorldScene`, `HeartPhysics`, `LetItGoAngel`, `HeartAndAngelHub`, `TelegramNavigation` в контексте этих маршрутов.
- **PWA отсутствует как система.** Есть только общий manifest и Pierrot SW; Heart & Angel не имеет route-scoped manifest/SW/offline.
- **NFT-код существует, но продукт не существует.** Это одновременно риск безопасности (если включат без аудита) и риск доверия (обещание в тексте не выполняется).

### Субъективные дизайнерские замечания

- Hub и Card в обычном браузере выглядят как сайт с двумя финалами: художественный footer, затем сайтовый footer.
- Плавающая панель «The Threshold» функционально полезна, но визуально ближе к dashboard, чем к мифологии Heart & Angel.
- Calm: единственная видимая кнопка — «Enable Gyroscope», хотя главное действие — прикоснуться к сердцу. Это смещает смысл ритуала.
- World визуально силён, но не даёт видимой подсказки, что сердце можно нажать; на мобильном это скрытый жест.
- Let It Go: ангел выглядит как иллюстрация, а не как интерактивный объект; на мобильном нет hover-title.
- Мелкие uppercase-лейблы красивы, но при системном увеличении шрифта могут ломать ритм.

---

## IV. Мобильный UX

### Что проверено

Playwright/Chromium, 320×568 и 390×844, Telegram simulation с `initData`, `safeAreaInset` 47/34, отключённым реальным Telegram SDK и Supabase. Плюс статический анализ для iPad/desktop. Физические iPhone/Android не использовались.

### iPhone, узкий экран

- Hub: плавающие кнопки перекрывают CTA «Explore World» (подтверждено rect’ами).
- Hub: нет видимого `<h1>`.
- World: страница скроллится, `scrollHeight` 1740 при viewport 568; внизу появляется сайтовый footer.
- Calm: gyro-кнопка попадает в safe-area и показывается без необходимости.
- Let It Go: flying heart 450 px обрезается по ширине;核心 interaction недоступна с клавиатуры.
- Card: двойной footer в обычном браузере; в Telegram checkout уходит через `window.location.assign`.
- SoundToggle на мобильном — icon-only без доступного имени.
- Global Header не учитывает safe-area top.

### iPhone, большой экран

- Hub CTA может не перекрываться, но проблема зависит от высоты hero и всё равно требует проверки на 390/428.
- World scroll/footer сохраняется.
- Calm canvas по-прежнему без DPR и с неверным resize.
- Let It Go 450 px heart может обрезаться на 390.
- Панель Telegram остаётся фиксированной внизу; на Card/About она перекрывает контент при скролле.

### iPad portrait / landscape

- Статически: Hub использует `md`-героя с h1; это лучше, чем mobile.
- World остаётся полноэкранной сценой, но footer/scroll и canvas-проблемы не зависят от ширины.
- Let It Go ограничен `max-w-[70vw] max-h-[55vh]`; на iPad выглядит крупнее, но flying heart 450 px может быть мал/клиппирован в landscape.
- Temple: двухколоночная сетка `md:grid-cols-2`; модалки `max-h-[80vh]`.
- Панель Telegram остаётся в углах; на iPad она дальше от контента, но всё ещё fixed overlay.

### Desktop

- Два footer’а на Hub и Card.
- NFT — полупустая страница.
- World — скроллящаяся сцена с сайтовым footer.
- Панель Telegram не отображается вне Telegram.
- Global Header/Footer выглядят нормально, но Header пишет в localStorage каждую секунду.

### Клавиатура и системный шрифт

- Card form: стандартные input’ы, клавиатура должна работать; глобальный `interactiveWidget: resizes-content` есть. Специального scroll-into-view и safe-area bottom для полей нет.
- Hub/Card: нет горизонтального overflow в проверенных размерах.
- Temple/Navigation: много `text-[9px]`/`text-[10px]`, `truncate`; при font scaling возможны обрезания.
- Calm/Let It Go: основные действия не являются нативными кнопками, поэтому keyboard/screen-reader path сломан.

---

## V. Telegram Mini App

### Инициализация

`TelegramMiniApp` делает много правильных вещей:

- `ready`, `expand`, optional `requestFullscreen`;
- `disableVerticalSwipes`;
- `safeAreaInset` и `contentSafeAreaInset` → CSS variables;
- `viewportHeight` / `viewportStableHeight`;
- `themeChanged`, `viewportChanged`, `safeAreaChanged`;
- `setHeaderColor`, `setBackgroundColor`, `setBottomBarColor`;
- BackButton;
- route-based `TelegramNavigation`.

Это хорошая база. Проблемы начинаются на стыке с React hydration и layout.

### Hydration

См. P0 выше. В Telegram пользователь сначала может увидеть серверную оболочку с обычным Header/Footer, затем клиент заменяет её на Mini App-оболочку. Это не только warning: это визуальный flash и потенциальная потеря состояния.

### Viewport и safe areas

Viewport/safe-area helpers работают. Но:

- `HeartPhysics` игнорирует safe-area для gyro-кнопки.
- World не классифицирован как ritual, поэтому page height/footer не согласованы с viewport.
- Hub использует `100vh`-производную и магические `70px` при фактическом header 76px.
- Global Header вне Telegram не имеет `safe-area-inset-top`.

### BackButton / MainButton

- BackButton скрыт на World, показан на остальных.
- При direct deep link fallback — `/lobby`, не World.
- MainButton не используется; это нормально, центральные действия уже в контенте.
- BackButton не закрывает модалки Hub/Temple и не закрывает открытую панель `TelegramNavigation`. Это заметный integration gap.

### Theme

`TelegramMiniApp` жёстко ставит тёмные header/bottom bar `#141210`. Для Temple/Vigil это уместно; для светлых Calm/LetItGo/World днём может выглядеть как отдельная тёмная рамка. `themeParams` читаются, но CSS их почти не использует.

### Плавающая панель: оценка идеи и исполнения

**Какую задачу решает.** В Telegram глобальный Header скрыт. Панель даёт быстрый доступ к World, Temple и ритуалам, а также к Pierrot. Идея разумная: Mini App не должен тащить обычный сайтовый header.

**Что работает:**

- расположена в нижних углах, доступна одной рукой;
- 44 px touch targets;
- safe-area учтена;
- модалка с `aria-modal`, Escape, focus на close, body overflow lock;
- активный маршрут подсвечивается;
- визуально совпадает с тёмным Temple-языком;
- Pierrot и навигация разнесены по разным углам.

**Что не работает:**

- **Не резервирует место.** На Hub 320×568 перекрывает CTA.
- **Показывается почти везде.** На About/Card она ощущается как постоянный overlay, а не контекстный инструмент.
- **Не включает полный путь.** Нет ссылок на Hub, About, Card, NFT; на Card нет верхней ссылки назад, а панель не компенсирует это.
- **Конкурирует с Pierrot.** Две одинаковые по весу плавающие кнопки в нижних углах; на маленьком экране они обрамляют и перекрывают контент.
- **Модалка тяжёлая.** Для «порога» открывается полноэкранный dialog с двумя секциями; это скорее dashboard, чем жест мира.
- **Нет focus trap.**
- **Native BackButton не связан с панелью.**

**Три направления развития:**

1. **Сохранить и улучшить текущую модель.**
   - Добавить резерв нижней зоны на страницах.
   - Скрывать/сворачивать триггеры при пересечении с CTA.
   - Добавить ссылки Hub/About/Card в панель.
   - Связать BackButton с открытой панелью.
   - Плюсы: минимальные изменения, сохраняет привычку.
   - Минусы: остаётся два floating-элемента и overlay-логика.
   - Стоимость: S/M.

2. **Компактная контекстная панель.**
   - Один триггер, который меняет набор ссылок по маршруту: World → Temple/Calm/LetItGo; Temple → ритуалы; Card → Hub/World; About → Hub.
   - Плюсы: меньше визуального шума, понятнее контекст, проще не перекрывать CTA.
   - Минусы: нужна логика маршрутов и больше тестов.
   - Стоимость: M.

3. **Нативные возможности Telegram.**
   - Использовать BackButton как основной back, MainButton только там, где есть одно очевидное действие, а floating-панель оставить только на Hub/World.
   - Плюсы: меньше собственного UI, ближе к Telegram.
   - Минусы: MainButton не подходит для выбора из шести ритуалов; BackButton не заменяет forward-навигацию.
   - Стоимость: M.

**Вывод:** идея панели оправдана, но текущее исполнение — «глобальный overlay без layout-контракта». Сначала нужно исправить перекрытия и hydration, затем решать, нужна ли полная панель на всех маршрутах.

### Внешние ссылки и возврат

- Card checkout использует `window.location.assign`; для Telegram нужен `openLink` + pending session/return.
- Social links в Hub — обычные `<a target="_blank">`; в Telegram могут открываться внутри webview. Не критично, но лучше единая политика внешних ссылок.
- Card success page уже умеет проверять Stripe-сессию, но Mini App не сохраняет pending session, поэтому после возврата из внешнего браузера пользователь может не увидеть результат.

### Авторизация и контекст

- `useIsTelegram` — UI hint, не auth.
- `TempleClient`, `LetItGoAngel`, `Header` используют `initDataUnsafe` для имени и localStorage. Это допустимо для display, но не должно считаться identity.
- `templeLogger` и `/api/temple_logs` принимают author из клиента; ASH/MEDITATION можно подделать. Для художественного проекта это может быть приемлемо, но в отчёте это архитектурный риск.

---

## VI. Идеология и пользовательский путь

**Что работает.** Hub и About ясно объясняют идею: Angel и Devil не бинарны, heart — живая связь, Temple — место, где внимание становится действием. Путь Hub → World → Temple → ритуалы логичен. World, Calm, Let It Go и Temple говорят на одном визуальном языке. Postcard — сильное продолжение идеи: «love is something we do», физический объект, который путешествует. Это не выглядит случайным набором экспериментов.

**Где реализация расходится с идеей.**

- **World** обещает «time flows, weather changes», но weather endpoint сломан, а время обновляется только при загрузке. Мир «не дышит» после первого кадра.
- **Calm** называет главным действием удержание сердца, но единственный видимый CTA — «Enable Gyroscope». Пользователь может решить, что ритуал требует датчика, а не прикосновения.
- **Let It Go** — сильная метафора, но ангел не выглядит интерактивным; на мобильном нет подсказки. Пользователь скорее наблюдатель, чем участник, пока случайно не нажмёт.
- **World** тоже скрывает heart rain: видимая сцена красива, но участие неочевидно.
- **Hub/Card** в обычном браузере заканчиваются дважды: художественный footer, затем сайтовый. Это разрушает ощущение самостоятельного произведения.
- **NFT** обещает «The Irreversible Choice», но страница — заглушка. Это самый явный разрыв между текстом и реализацией.
- **Telegram-панель** функционально объясняет навигацию, но визуально это утилитарный слой; она не должна перекрывать главный жест.

**Где участие реально есть.** Temple (шесть ритуалов), World (heart rain), Calm (touch heart), Let It Go (release heart), Card (физический объект). Это достаточно для художественного произведения; не нужно добавлять достижения или профили.

**Чего не хватает.** Небольших, ненавязчивых приглашений к действию, которые не превращают проект в tutorial. Один короткий жест-подсказка на первом посещении, исчезающий после первого взаимодействия, дал бы больше, чем новая навигация.

---

## VII. PWA

### Текущее состояние

| Элемент | Состояние |
|---|---|
| Web App Manifest | Есть общий `/manifest.webmanifest`, но он про весь сайт Anton Merkurov, не про Heart & Angel |
| `start_url` | `/`, не `/heartandangel` |
| `display` | `standalone` |
| Icons | `/favicon.ico`, `/icon` (heart emoji), `/apple-icon`; нет Heart & Angel art icons |
| Splash screens | Нет |
| Service worker | Есть только `public/pierrot-sw.js` со scope `/admin/pierrot`; для публичного сайта SW нет |
| Offline fallback | Есть `public/pierrot-offline.html` только для Pierrot |
| Static caching | Для Heart & Angel отсутствует |
| Update strategy | Для Heart & Angel отсутствует |
| Push | Нет; для проекта не нужен |
| Local storage | `temple_user`, `tg_user`, `connected_address`; визуальное состояние не сохраняется |
| Apple Web App | В root metadata нет `appleWebApp`; только у Pierrot |
| Theme color | `#ffffff`, не соответствует тёмному/кремовому Heart & Angel |

### A. Базовые преимущества

- Установка на домашний экран.
- Запуск в отдельном окне без Safari chrome.
- Своя иконка и стартовый экран.
- Более цельное ощущение «произведения», особенно для World/Calm/Let It Go.
- Быстрый повторный запуск, если закэшированы статические ресурсы.

### B. Функциональные возможности

- **Частичная offline-работа World/Calm/Let It Go** возможна, если закэшировать HTML/JS/CSS, шрифты и ключевые изображения. Canvas-физика Calm не требует сети. World требует изображения; weather может fallback на device time. Let It Go требует три изображения.
- **Сохранение состояния**: можно сохранять последний ритуал, звук, день/ночь, но это небольшой UX-выигрыш.
- **Быстрый повторный запуск**: service worker + cache-first для `/_next/static`, шрифтов и иконок.
- **Уведомления**: не нужны; у Temple нет события, ради которого стоит просить permission. iOS push ограничен, Telegram уже даёт уведомления. Это в категорию C.
- **Интеграция с устройством**: gyroscope уже есть; PWA не меняет разрешения iOS. Offline не поможет Card/NFT/Temple, которым нужны Stripe/сеть/логи.

### C. Что не стоит делать

- Push-уведомления.
- Background sync ритуальных логов.
- Offline-оплату Stripe.
- Кэширование `/api/*`, `temple_log`, приватных данных.
- Отдельное приложение/нативный wrapper.
- VPS, платные сервисы, дополнительную инфраструктуру.
- Сложный install-flow с агрессивными баннерами.
- Полный offline для Card/NFT/Temple — это создаст ложное ожидание.

### iOS / iPad / Telegram

- **iPhone Safari:** установка через Share → Add to Home Screen; нет `beforeinstallprompt`; standalone работает через manifest, но для старых iOS надёжнее `apple-mobile-web-app-capable`. Splash screens нужно задавать отдельно. Service worker/cache может вытесняться системой.
- **iPad:** standalone работает, но нужно проверять split view/orientation; `100dvh` и `visualViewport` важны.
- **Telegram:** PWA-установка внутри Telegram не является сценарием. Telegram открывает URL в своём webview; manifest не управляет окном. Service worker может работать, но не обязателен; push/install prompt недоступны. Внутри Telegram приоритет — WebApp SDK, safe-area, BackButton, а не PWA.
- **Один PWA для браузера и Telegram:** да, тот же Next-сайт может обслуживать оба контекста. Но PWA-преимущества (install, standalone, offline shell) проявляются в основном вне Telegram. Внутри Telegram нужна отдельная адаптация через `Telegram.WebApp`.
- **Только вне Telegram:** install prompt, standalone window, home-screen icon, splash screen, возможно offline shell. Внутри Telegram это не имеет смысла или не поддерживается.

### Минимальная архитектура, если PWA оправдана

1. `app/heartandangel/manifest.webmanifest` или metadata override в `app/heartandangel/layout.tsx`:
   - `name: Heart & Angel`
   - `short_name: Heart & Angel`
   - `start_url: /heartandangel`
   - `scope: /heartandangel`
   - `display: standalone`
   - `background_color`/`theme_color` в палитре Heart & Angel.
2. Отдельные иконки 192/512 и apple-touch-icon из artwork, не emoji.
3. `public/heartandangel-sw.js` со scope `/heartandangel`:
   - precache offline shell, manifest, icons, шрифты;
   - cache-first для `/_next/static` и публичных изображений;
   - network-first для навигации с offline fallback;
   - никогда не кэшировать `/api/*`, `temple_log`, Stripe;
   - версионирование и `skipWaiting`/`clients.claim`, либо аккуратный update prompt.
4. Маленький клиентский компонент регистрации SW только на Heart & Angel-маршрутах.
5. `appleWebApp` metadata для iOS.
6. Не добавлять push, background sync, offline payments.

**Оценка:** PWA оправдана как **лёгкая standalone/offline-оболочка для World/Calm/Let It Go**, но не как замена Telegram-адаптации и не как P0. Стоимость — M, эффект — средний, если делать только после P0-исправлений.

---

## VIII. Идеи развития

Не более семи, только из существующих механик.

1. **«Тихая подсказка» для heart/angel взаимодействий.**
   - Что: одноразовая fading-подсказка «Touch the heart» / «Let it go» при первом посещении.
   - Зачем: сейчас Calm и Let It Go визуально не выдают интерактивность.
   - Как: localStorage-флаг, исчезает после первого касания; не менять композицию.
   - Сложность: S.
   - Компоненты: `HeartPhysics`, `LetItGoAngel`.

2. **Живое время и погода World.**
   - Что: исправить `/api/world`, обновлять gradient/weather раз в 1–5 минут.
   - Зачем: это уже обещано концепцией «time flows / weather changes».
   - Как: использовать существующий `/api/world`, device-time fallback, без нового backend.
   - Сложность: S/M.
   - Компоненты: `WorldScene`, `app/api/world/route.ts`.

3. **Контекстная Telegram-панель.**
   - Что: один trigger, набор ссылок зависит от текущего раздела; на Hub — только World/About/Card; на Temple — ритуалы.
   - Зачем: уменьшить визуальный шум и перекрытия.
   - Как: использовать существующий `TelegramNavigation`, `usePathname`.
   - Сложность: M.
   - Компоненты: `TelegramNavigation`, `TelegramMiniApp`.

4. **«Эхо ритуала» после Calm/Let It Go.**
   - Что: короткое локальное подтверждение после завершения: «Your calm was left in the Temple» / «A burden was released».
   - Зачем: сейчас ритуал заканчивается без обратной связи; пользователь не понимает, что след остался.
   - Как: использовать уже существующий лог и локальное состояние; без нового API.
   - Сложность: S.
   - Компоненты: `HeartPhysics`, `LetItGoAngel`, `templeLogger`.

5. **Память мира между посещениями.**
   - Что: сохранять последний ритуал/время суток/погодный режим, чтобы возвращение ощущалось продолжением.
   - Зачем: усилить идею «living world», не добавляя профиль.
   - Как: localStorage + существующие состояния World/Temple.
   - Сложность: S.
   - Компоненты: `WorldScene`, `TempleClient`.

6. **Accessible heart/angel controls.**
   - Что: скрытая визуально, но доступная кнопка/зона с клавиатуры и screen reader для Calm/Let It Go; сохранить текущий визуал.
   - Зачем: сейчас核心 ритуалы недоступны без pointer.
   - Как: button-обёртка/`role` и клавиатурные события; без изменения арта.
   - Сложность: S/M.
   - Компоненты: `HeartPhysics`, `LetItGoAngel`.

7. **Route-scoped PWA shell для World/Calm/Let It Go.**
   - Что: manifest + SW + offline fallback только для этих страниц.
   - Зачем: дать ощущение произведения и повторный запуск без сети, не трогая Temple/Card/NFT.
   - Как: существующий `public`, Next manifest, Pierrot SW как образец.
   - Сложность: M.
   - Компоненты: `app/heartandangel/layout.tsx`, `public`, `TelegramMiniApp` (не регистрировать SW внутри Telegram без необходимости).

---

## IX. План работ

### P0 — исправить первым

| Задача | Сложность |
|---|---|
| Убрать hydration mismatch `useIsTelegram` | S |
| Убрать перекрытие плавающей панели и CTA Hub; резерв bottom safe-zone | S/M |
| Исправить World: ritual route/footer, `100dvh`, остановить лишний скролл | S |
| Исправить weather endpoint World (`/api/world/weather` → `/api/world`) | S |
| Убрать дублирующиеся footer’ы Hub/Card | S/M |

### P1 — важные улучшения

| Задача | Сложность |
|---|---|
| HeartPhysics: DPR, resize/orientation, safe-area, gyro flow | M |
| HeartPhysics: image error fallback | S |
| Let It Go: button semantics, keyboard, timer cleanup, responsive heart | S/M |
| Hub: видимый `h1` на mobile | S |
| Telegram: BackButton для модалок/панели, focus trap | M |
| Card: `openLink` + pending session/return для Telegram | M |
| NFT: убрать из sitemap или восстановить за feature flag | S/M |
| Temple: error state для logs, modal focus/scroll lock | M |
| SoundToggle `aria-label` | S |
| Header: убрать 1s interval | S |
| Reduced motion: глобальный media query | S |
| World: убрать конфликт transform, ограничить falling hearts | M |

### P2 — необязательные улучшения

| Задача | Сложность |
|---|---|
| World: обновление времени/погоды раз в 1–5 мин | S |
| Hub/Card: modal focus trap, price source из БД | S |
| Card: timeout для каталога/формы, retry success | S/M |
| Temple: убрать дублирующий top spacing, унифицировать модалки | S |
| Dead code cleanup (`useIsTelegram.tsx`, `SoundToggle.tsx`, `letitgo.css`, `TempleNav/Wrapper/Entry`, NFT fixed/new) | S |
| Font scaling/contrast pass | S |
| World `sm:w-38` → корректный размер | S |

### Later

- Полноценный route-scoped PWA.
- Контекстная Telegram-панель вместо глобальной.
- «Память мира» и «эхо ритуала».
- Более глубокая интеграция weather/time в Temple.
- Аудит web3/NFT перед публичным запуском.

---

## X. Что не трогать

- Тёмную chapel-эстетику, кремово-красную палитру Hub/Card, визуальный язык Temple.
- Случайный Angel/Daemon в World и Temple — это работает.
- Heart rain, облака, солнце, звёзды, градиенты World.
- Шесть ритуалов Temple и их названия.
- Физическую открытку и её коммерческую механику; success-page уже проверяет Stripe.
- About-текст и интонацию.
- `TempleTopBar` как концепцию (back/sound/timer).
- Общий `GlobalAudioProvider` и `SoundToggle`.
- Telegram safe-area/viewport helpers и BackButton как идею.
- Существующий Pierrot PWA/service worker — его можно использовать как образец, но не заменять.
- Глобальную навигацию сайта и концепцию плавающей панели без отдельного согласования.

---

## Итог

**Исправлять первым:** hydration Telegram, перекрытие плавающей панели с CTA, World/footer/scroll, weather endpoint. Это даст максимальный эффект, потому что затрагивает главный канал распространения (Telegram), первый экран Hub и центральную сцену World.

**Максимальный эффект:** не новый дизайн, а приведение оболочки в порядок — одна согласованная классификация immersive/ritual-маршрутов, layout-aware Telegram-панель, корректный World viewport, честный weather/time.

**Лучше оставить без изменений:** визуальную концепцию, Angel/Daemon, heart rain, шесть ритуалов, физическую открытку, About-текст и общую идею плавающей навигации. PWA — не первый приоритет; это отдельный слой после P0/P1.
