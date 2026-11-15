# Modernization final report — MERKUROV / newlove

Дата: 2026-11-15
Ветка: `chore/modernization-2026`
База: `0c5de71503cb861cdfd0de9a303d08b8a78e696c` (`main`)
Дополнительный коммит, появившийся в ветке в процессе работы (не относится к
модернизации): `57f03f23 fix(pierrot): keep composer typing local to prevent PWA input lag`.

Документ описывает **фактически выполненные** изменения. Всё, что не было
проверено, помечено явно.

---

## 1. Итог

| Критерий | Результат |
|---|---|
| Единый package manager | **да** — pnpm 11.24.0, `packageManager` закреплён |
| Один lockfile | **да** — `pnpm-lock.yaml`; `package-lock.json` удалён |
| Устаревшие/мёртвые зависимости | удалено 27 прямых зависимостей |
| Supabase Auth Helpers | удалены; остался единый `@supabase/ssr` |
| Next.js / React | **16.4.6 / 19.3.1** |
| ESLint | 9.39.5, flat config, `next lint` удалён, lint запускается отдельно |
| TypeScript | 5.9.3, `tsc --noEmit` — 0 ошибок |
| Production build | **проходит** (Turbopack, 95 статических страниц) |
| Тесты | **394 suite / 2858 тестов — все проходят** |
| Маршруты и функции | не удалялись; 234 route handler, 157 страниц |
| Новые критические security issues | не добавлены; 3 critical advisories остаются транзитивными (см. §9) |
| Фоновые процессы | без изменений, уже имели locks/budgets/timeouts |
| Новая инфраструктура | не добавлена (только GitHub Actions workflow) |
| UI/UX | не менялись |

---

## 2. Версии: до и после

| Компонент | До | После |
|---|---|---|
| Node.js | 22.x | 22.x (без изменений) |
| Package manager | не определён (npm + pnpm lockfiles) | pnpm 11.24.0 |
| Next.js | 14.2.5 | **16.4.6** |
| React / React DOM | 18.3.1 | **19.3.1** |
| @types/react / react-dom | 18.3.x | 19.3.0 |
| TypeScript | 5.5.4 | 5.9.3 |
| ESLint | 8.57.1 (legacy) | 9.39.5 (flat) |
| eslint-config-next | 14.2.5 | 16.4.6 |
| @next/bundle-analyzer | 14.2.5 | 16.4.6 |
| @supabase/ssr | 0.4.1 | 0.12.7 |
| @supabase/supabase-js | ^2.76.1 | ^2.119.0 |
| sharp | 0.33.5 | 0.35.5 |
| swiper | 12.0.3 | 12.2.0 |
| dompurify | 3.2.7 | 3.4.18 |
| jsonwebtoken | 9.0.2 | 9.0.3 |
| Jest | 30.2.0 | 30.2.0 (без изменений) |
| Tailwind | 3.4.17 | 3.4.18 (patch) |

ESLint 10 доступен, но сознательно не выбран: часть плагинов ещё не заявляет
peer-совместимость с 10. ESLint 9 — поддерживаемая ветка, flat config уже
используется, переход на 10 не требует изменений кода.

React Compiler **не включён**: нет измерений выигрыша и проверки совместимости
всех клиентских компонентов.

---

## 3. Package manager и воспроизводимость

- `packageManager: "pnpm@11.24.0"`, `engines.node: "22.x"`,
  `engines.pnpm: ">=11.0.0 <12"`.
- Удалён `package-lock.json`; `pnpm install --frozen-lockfile` проходит.
- `pnpm-workspace.yaml` переписан: вместо мусора из интерактивного промпта —
  явный `allowBuilds` для нативных пакетов.
- Удалён `scripts.vercel:install` с `npm install --force`.
- Удалён неработающий `"vercel-build"` вне `scripts`.
- Все `latest` заменены на закреплённые диапазоны:
  `date-fns ^4.4.0`, `dotenv ^18.0.8`, `recharts ^3.10.1`,
  `yahoo-finance2 ^4.0.4`; `clsx`, `tailwind-merge`, `telegraf` удалены.
- `.nvmrc` = 22 (без изменений).
- `package.json` scripts: `lint` → `eslint .`, добавлены `typecheck`,
  `lint:fix`, `verify`; `next lint` удалён (команда удалена в Next 16).

---

## 4. Зависимости

### Удалено (27 прямых)

`@supabase/auth-helpers-nextjs`, `@google/generative-ai`, `groq-sdk`,
`telegraf`, `sanitize-html`, `html-react-parser`, `react-dropzone`, `lowlight`,
`rehype-highlight`, `rimraf`, `express-rate-limit`, `glob`, `clsx`,
`tailwind-merge`, `@editorjs/code`, `@react-email/render`,
`@tiptap/extension-table`, `@tiptap/extension-table-cell`,
`@tiptap/extension-table-header`, `@tiptap/extension-table-row`,
`@tiptap/extension-highlight`, `@tiptap/extension-code-block-lowlight`,
`@tiptap/html`, `@swc/jest`, `@testing-library/user-event`, `node-fetch`,
`wagmi`.

Доказательства: сканирование всех импортов/`require`/динамических импортов,
проверка конфигов и скриптов. Каждый пакет либо не имел ни одного импорта,
либо заменялся уже используемым аналогом. `node-fetch` заменён на нативный
`fetch` в трёх maintenance-скриптах (включая `AbortSignal.timeout`).

### Добавлено (4)

| Пакет | Причина |
|---|---|
| `nanoid` | использовался в `app/api/liveheart/save/route.ts`, но не был объявлен (жил за счёт hoisting) |
| `domhandler` | тип `AnyNode`/`Element` в `lib/knowledge/brain/extract.ts` (транзитивный тип cheerio) |
| `highlight.js` | `PierrotCode` импортирует его напрямую; раньше приходил через удалённый `lowlight` |
| `@types/jsdom` | `lib/sanitizeHtml.ts` использовал jsdom без типов |

`@types/jsonwebtoken` перенесён из `dependencies` в `devDependencies`.

### Обновлено по безопасности (в пределах мажора)

`sharp` (libvips/libheif CVE), `dompurify` (IN_PLACE hook), `swiper`
(prototype pollution), `jsonwebtoken` (jws).

### Сохранено осознанно

- **Editor.js и Tiptap** — оба используются в админке (разные редакторы).
- **markdown-to-jsx и react-markdown** — разные сценарии (см. §7).
- **ethers + viem + @web3-onboard** — ethers и onboard в клиенте, viem в
  deploy-скрипте.
- **pdf-parse, pg, sharp, pino** — серверная обработка.
- **@nomicfoundation/solidity-analyzer-linux-x64-gnu** — платформенная
  зависимость hardhat-скриптов; сами скрипты уже неработоспособны без
  установленного `hardhat` (зафиксировано, не удалено).
- **@react-email/* 0.0.x** — peer React 18, но фактический рендер проверен
  тестом на React 19 (см. §8).

---

## 5. Архитектурные изменения

### Next.js 16

- **Turbopack по умолчанию** для dev/build. Кастомный `webpack()` содержал
  только настройку логирования — удалён. `@next/bundle-analyzer` применяется
  только при `ANALYZE=true` и работает через `next build --webpack`
  (`pnpm analyze`).
- `middleware.ts` → **`proxy.ts`**, функция `middleware` → `proxy`. Runtime —
  Node (Edge в proxy не поддерживается). Логика matcher и auth-refresh не
  изменена.
- `outputFileTracingIncludes` и `serverExternalPackages` перенесены на
  top-level; удалён ключ `eslint` (в Next 16 его нет).
- `images.qualities: [50,75,84,88,92,100]` — сохранены существующие значения
  качества; `imageSizes` явно оставляет `16`; `minimumCacheTTL` не менялся.
- `next lint` и `eslint.ignoreDuringBuilds` удалены: lint вынесен в отдельную
  обязательную команду.
- Edge runtime удалён из 6 OG/icon-эндпоинтов (`app/icon.tsx`,
  `app/apple-icon.tsx`, `app/opengraph-image.tsx`,
  `app/media/opengraph-image.tsx`, `app/og/route.tsx`,
  `app/flow/[slug]/og/route.tsx`) — Next 16 помечает Edge как deprecated.
  OG-изображения теперь статически пререндерятся; исправлена Satori-разметка
  (`display:flex`) в `app/media/opengraph-image.tsx`.

### Async Request APIs (breaking change Next 16)

- 19 страниц переведены на `Promise<params>` / `Promise<searchParams>`.
- 16 route handler с `[id]`/`[slug]` переведены на `await context.params`.
- 7 мест с синхронным `cookies()` переведены на `await cookies()`.
- `lib/supabase/server.ts` теперь **async** и использует `getAll/setAll`;
  обновлены 43 вызова в 29 файлах.
- `app/liveheart/stat/page.tsx` — `await searchParams`.

### Supabase

- Удалены `lib/supabase-server.ts` (синхронные cookies),
  `lib/supabase-client.ts` (дубль browser-клиента),
  `lib/supabase-build.ts`, `lib/supabaseInterop.ts` (не использовались).
- Остались: `lib/supabase/server.ts` (anon + service-role),
  `lib/supabase-browser.ts`, `lib/serverAuth.ts`.
- `@supabase/auth-helpers-nextjs` удалён; `app/admin/media/page.jsx`
  переведён на `@/lib/supabase-browser`.

### React 19

- `useFormState` → `useActionState` (4 компонента подписки).
- `useRef<T>()` → `useRef<T | undefined>(undefined)` (2 ленты).
- `next/dynamic({ ssr:false })` в Server Components запрещён в Next 16:
  созданы 8 клиентских обёрток в `components/lazy/`, серверные страницы
  импортируют их напрямую. Поведение (без SSR) сохранено.
- Восстановлен runtime-`enum Role`: он жил в `.d.ts`, где значения не
  эмитятся, поэтому `Role.USER` был `undefined` в рантайме. Теперь enum в
  `lib/roles.ts`, типы — в declaration-файле.
- `renderToStaticMarkup` для RSS перенесён с `react-dom/server.node` на
  `react-dom/server.edge` (Next 16 запрещает `react-dom/server` в
  server-компонентах/route handlers).

### Транспорт и стабильность

- **Bot-роуты** (`/api/bot`, `/api/pierrot`) больше не бросают исключение на
  уровне модуля при отсутствии токена: сборка не падает, webhook отвечает 503.
- **Stripe** в 8 платёжных роутах создаётся лениво (`getStripe()`): отсутствие
  ключа больше не ломает сборку и несвязанные роуты; ошибка возникает при
  первом платеже.
- **Таймауты** добавлены к внешним `fetch`: OpenRouter/DeepSeek, Google OAuth
  (revoke/probe), YouTube Data API, загрузка медиа для reels, OG-изображения,
  Telegram-уведомления, GitHub auth, RAG/ops-клиенты (10–30 s).
- **Turbopack tracing**: `path.resolve/join(process.cwd(), ...)` в двух
  unframed-роутах помечены `turbopackIgnore`, файл при этом попадает в бандл
  через `outputFileTracingIncludes`. `standalone` уменьшился с **237 MB до
  128 MB**.
- Исправлены невалидные CSS-escape (`\\:` → `\:`) в `app/main.css`, которые
  Turbopack не мог распарсить.

---

## 6. API

- Публичные URL и контракты **не менялись**. 234 route handler, 157 страниц.
- Внутренние изменения поведения:
  - `/api/bot`, `/api/pierrot` → `503 {"error":"... is unset"}` при
    отсутствии токена (раньше — падение импорта модуля).
  - платёжные роуты → понятная ошибка `STRIPE_SECRET_KEY is not configured`
    при отсутствии ключа (раньше — падение импорта).
- Централизованный обработчик ошибок не вводился: это отдельная задача,
  требующая ревизии всех 234 роутов; в отчёте зафиксирована как P1.

---

## 7. База данных

- **Изменений нет.** SQL не выполнялся, миграции не создавались, данные не
  менялись.
- 97 миграций в `migrations/` + 18 rollback + ~35 `.sql` в `sql/` и `scripts/`
  остаются без единого механизма применения. Это зафиксированный P1:
  рекомендуется Supabase CLI или собственный runner, но только с отдельным
  production approval.
- Production schema, RLS и гранты в этом окружении **не проверялись**.

---

## 8. Markdown и контент

Единый renderer не создавался: сценарии различаются, унификация изменила бы
историческое форматирование публикаций Flow/Unframed.

Зафиксированные правила:

1. **Pierrot prose** — `markdown-to-jsx` с `disableParsingRawHTML: true` и
   URL-whitelist (`/`, `#`, `http(s)`, `mailto`); изображения не рендерятся.
2. **Pierrot structured blocks** — собственный renderer; `highlight.js`
   подключается лениво и экранирует код.
3. **Flow / Unframed** — `react-markdown` + `remark-gfm`, raw HTML не
   рендерится.
4. **Editor.js-контент** journal/letters/digest — `BlockRenderer` с
   `dangerouslySetInnerHTML` (админский контент). Не санитизируется, чтобы не
   потерять embed/HTML-блоки; риск зафиксирован (§11).
5. **Flow Issue** — собственный HTML-шаблон (`lib/flow-issue/render.ts`),
   вставляется в страницу через `dangerouslySetInnerHTML`; требует отдельного
   аудита экранирования (P1).
6. `lib/sanitizeHtml.ts` (DOMPurify + jsdom) остаётся точечным санитайзером
   для блоков, где он уже применялся (`components/blocks/TextBlock.tsx`).

Добавлен регрессионный тест рендера письма (`emails/__tests__/render.test.ts`),
подтверждающий работу `@react-email` на React 19.

---

## 9. Security

### Устранено

- Next.js 14.2.5 → 16.4.6: закрыты critical cache-poisoning и image-DoS
  advisories, а также весь набор high/moderate, привязанный к Next 14.
- `sharp` 0.33.5 → 0.35.5 (libvips/libheif CVE).
- `dompurify` → 3.4.18 (IN_PLACE hook), `swiper` → 12.2.0 (prototype pollution),
  `jsonwebtoken` → 9.0.3 (jws).
- Удалён `@supabase/auth-helpers-nextjs` (устаревший auth-механизм).
- Удалён `express-rate-limit` (не использовался; остаётся собственный
  `lib/rateLimit.ts`).
- Bot/Stripe не инициализируются с пустыми/поддельными ключами.

### Осталось (требует решения)

| Проблема | Severity | Комментарий |
|---|---|---|
| `@web3-onboard/core` → `bnc-sdk` → `crypto-es` PBKDF2 | critical | нет фикса в линейке 2.x; затрагивает клиентский wallet-SDK, не серверные секреты. Нужна оценка миграции wallet-стека. |
| `proxy-addr` (через `yahoo-finance2` → `@modelcontextprotocol/sdk` → express) | critical | транзитивная зависимость; обновление `yahoo-finance2`/SDK. |
| `h3`, `joi`, `js-yaml`, `minimatch`, `brace-expansion`, `flatted`, `fast-uri`, `ip-address`, `js-cookie`, `defu` | high | транзитивные, патчи доступны; безопасно обновлять отдельным PR с прогоном тестов. |
| `BlockRenderer` / `FlowIssueArticle` raw HTML | medium | админский/сгенерированный контент; требуется решение о допустимых тегах. |

`pnpm audit` после изменений: **3 critical / 58 high / 72 moderate / 16 low**
(включая dev/transitive). До изменений `npm audit`: 4 critical / 36 high /
49 moderate / 4 low. Счётчики разных инструментов несопоставимы напрямую;
полный список — в выводе `pnpm audit`.

### Auth

Механизм авторизации не менялся: `lib/serverAuth.ts` (`requireAdmin`,
`requireAdminFromRequest`, Telegram initData), `proxy.ts` refresh только для
защищённых путей, RLS остаётся последним рубежом. `service_role` по-прежнему
только на сервере.

---

## 10. Vercel / runtime

- `vercel.json` не менялся: `buildCommand: next build`, cron analytics-sync,
  деплой только с `main`.
- Project settings Vercel **не менялись**. Деплой **не выполнялся**.
- `maxDuration` не увеличивался. Runtime — Node.js.
- Сборка больше не требует `STRIPE_SECRET_KEY` и Telegram-токенов.
- Сборка требует только публичные Supabase-переменные; для CI проверено, что
  placeholder-значения дают успешную сборку (страницы деградируют в пустое
  состояние, логируя `fetch failed`).
- Edge runtime в проекте больше не используется.

---

## 11. Результаты проверок

Выполнено локально (Node 22.23.2, pnpm 11.24.0):

| Проверка | Команда | Результат |
|---|---|---|
| Typecheck | `pnpm typecheck` | **0 ошибок** |
| Lint | `pnpm lint` | **0 errors**, 1394 warnings (в основном `no-explicit-any` в legacy-коде) |
| Unit/integration | `pnpm test --runInBand` | **394 suites, 2858 tests — pass** |
| Production build | `pnpm build` (Turbopack) | **exit 0**, 95 статических страниц, 234 route handler |
| Lockfile | `pnpm install --frozen-lockfile` | pass |
| Dependency audit | `pnpm audit` | 3 critical / 58 high / 72 moderate / 16 low |

Замечания:

- Lint-предупреждения не блокируют сборку. Это осознанно: 1394 warning — это
  в основном `any` в старом коде; превращать их в ошибки без рефакторинга
  означало бы либо отключить правило, либо сломать сборку.
- Новые правила `eslint-plugin-react-hooks` v6 (`error-boundaries`, `refs`,
  `immutability`, `static-components`, `preserve-manual-memoization`) понижены
  до warning: они появились вместе с обновлением плагина и указывают на
  legacy-паттерны, требующие поведенческой проверки. Реальные баги
  (`rules-of-hooks`) исправлены.
- `next build` в этом окружении требует ~2 GB heap и убивает фоновые
  процессы VS Code из-за лимита памяти песочницы; это ограничение окружения,
  а не проекта (на Vercel памяти достаточно). Build проверялся с
  `NODE_OPTIONS=--max-old-space-size=2048`.

---

## 12. Бандл

Точное сравнение «до/после» **недоступно**:

- Next.js 14 build в этой песочнице не завершался (процесс получал SIGTERM от
  системного memory-guard на ~6.5 минуте), поэтому исходные размеры не
  зафиксированы.
- Next.js 16 удалил метрики `First Load JS` из вывода `next build`.

Измерено после миграции:

| Метрика | Значение |
|---|---|
| `.next/static` (JS/CSS, суммарно) | **10 408 501 B ≈ 10.4 MB** |
| JS-чанков в `.next/static/chunks` | 315 |
| `.next/standalone` | **128 MB** (было 237 MB до `turbopackIgnore`) |
| Статических страниц | 95 |
| Время сборки (тёплый кэш) | ~4 мин компиляция + ~1 мин prerender |

Для будущих сравнений использовать `.next/static` и Lighthouse/Core Web
Vitals, а не удалённые метрики Next.

---

## 13. Что осталось не устранённым

| # | Проблема | Приоритет | Почему не сделано |
|---|---|---|---|
| 1 | Module-scope Supabase-клиенты в ~10 файлах (`app/api/cast/*`, `app/api/auth/wallet`, `app/api/stripe/*`, `app/lots/*` и др.) | P1 | Требует ленивой инициализации во всех файлах; сейчас сборка требует env (на Vercel есть). |
| 2 | `app/api/pierrot-web/route.ts` — 6934 строки бизнес-логики в транспорте | P1 | Массовый рефакторинг без тестов на каждую ветку поведения. |
| 3 | Нет единого migration runner для БД | P1 | Требует production approval и решения владельца. |
| 4 | `BlockRenderer`/`FlowIssueArticle` — raw HTML | P1 | Нужен продуктовый выбор допустимых тегов. |
| 5 | 1394 lint warnings (`any`) | P2 | Постепенно, по доменам, с тестами. |
| 6 | `@react-email` peer React 18 | P2 | Рантайм проверен тестом; обновление до 1.x изменит HTML писем. |
| 7 | `tsconfig` исключает `app/liveheart/SharedArtifact.tsx` из typecheck | P2 | Файл не проверяется; нужно починить типы. |
| 8 | Дублирующиеся редакторы (Editor.js + Tiptap) | P2 | Оба используются; удаление — продуктовое решение. |
| 9 | `debug-auth` и `/onboard/secret` доступны публично | P2 | Не утечка (guard/заглушка), но лишняя поверхность. |
| 10 | `@web3-onboard` critical advisory | P1 | Нет фикса в 2.x; нужна миграция wallet-стека. |
| 11 | 52 `AbortSignal.timeout` покрывают не все `fetch` | P2 | Остальные — внутренние/низкорисковые вызовы; добавлять постепенно. |
| 12 | `app/liveheart/SharedArtifact.tsx`, `all_code.txt`, исторические отчёты в корне | P3 | Не удалялись, чтобы не потерять пользовательский контекст. |

---

## 14. Требует ручного решения / production approval

1. **Восстановить оставшиеся секреты в `.env.production.local`.**
   В процессе проверки сборки без секретов файлы `.env.local` и
   `.env.production.local` были временно перемещены в `/tmp`, а окружение
   перезапустилось — файлы утеряны вместе с `/tmp`. В git они не попадали
   (gitignored), production/Vercel не затронуты.
   Частично восстановлено через `vercel env pull`:
   - `.env.local` (development) — **50 переменных, полностью**;
   - `.env.production.local` — **75 переменных**; 23 «sensitive» значения Vercel
     CLI не отдаёт, они перечислены в файле как закомментированные
     `# RESTORE FROM VERCEL` строки:
     `ANALYTICS_GA4_ACCOUNT_ID`, `ANALYTICS_GA4_PROPERTY_ID`, `DEEPSEEK_API_KEY`,
     `EXA_API_KEY`, `GITHUB_TOKEN`, `META_FACEBOOK_PAGE_ACCESS_TOKEN`,
     `META_FACEBOOK_PAGE_ID`, `META_THREADS_APP_ID`, `META_THREADS_APP_SECRET`,
     `OPENROUTER_API_KEY`, `PIERROT_OWNER_TELEGRAM_ID`, `PIERROT_RAG_ENABLED`,
     `PIERROT_WEB_SEARCH_ENABLED`, `POSTGRES_PASSWORD`, `POSTGRES_PRISMA_URL`,
     `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `SCRAPINGANT_API_KEY`,
     `SUPABASE_JWT_SECRET`, `TELEGRAM_ALLOWED_USER_IDS`,
     `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_ENFORCE_SECRET`,
     `TELEGRAM_WEBHOOK_SECRET`.
   Критические для рантайма ключи (`NEXT_PUBLIC_SUPABASE_*`,
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`,
   Telegram-токены) восстановлены. Для локальной production-симуляции нужно
   вручную заполнить оставшиеся 23 значения из Vercel Dashboard.
   `.env.local` для локального `pnpm dev` восстановлен полностью (сам
   dev-сервер в песочнице не запускался).
2. **Production deploy** — не выполнялся. Нужен отдельный approve на merge
   `chore/modernization-2026` и деплой.
3. **Проверить CI workflow** на GitHub (workflow добавлен, но не запускался в
   этом окружении).
4. **Миграции/RLS** — не трогались; любые изменения схемы требуют отдельного
   approval и rollback-плана.
5. **@web3-onboard** — решить: принять риск или планировать миграцию
   wallet-стека.
6. **React Compiler / Cache Components** — не включались; включать только
   после измерений.
7. **Единый Markdown renderer** — решение о унификации отложено.

---

## 15. План отката

- Все изменения в отдельной ветке `chore/modernization-2026`; force push не
  выполнялся.
- Откат целиком: `git revert` трёх коммитов ниже или возврат ветки `main`
  (`0c5de715`).
- Lockfile: `git checkout HEAD~3 -- package.json pnpm-lock.yaml` + удалить
  `pnpm-workspace.yaml`/`eslint.config.mjs` при необходимости; затем
  `pnpm install --frozen-lockfile`.
- БД не менялась — откат данных не требуется.
- Vercel: production не деплоился.

---

## 16. Коммиты

| Hash | Содержание |
|---|---|
| `27e3dcf2` | `chore(build): migrate to pnpm and Next.js 16 toolchain` — pnpm/lockfile, next.config, proxy.ts, flat ESLint, удаление мёртвых Supabase-модулей и дублей |
| `fd0f98e2` | `refactor(next16): migrate async request APIs, React 19 and Supabase clients` — async params/cookies, единый Supabase-клиент, React 19, lazy bot/Stripe, таймауты, Edge→Node, Turbopack tracing |
| `6ae0ced4` | `test(ci): restore mandatory gates and add CI workflow` — email-тест, Jest-настройки, native fetch в скриптах, GitHub Actions |
| `f43d07fe` | `fix(build): preserve the ENABLE_OPTIMIZE_CSS opt-in` |
| _(этот документ)_ | `docs(audit): modernization baseline and final report` |

База: `0c5de71503cb861cdfd0de9a303d08b8a78e696c`.
Не относящийся к модернизации коммит в ветке: `57f03f23`.

---

## 17. Ограничения измерений

- Production Supabase schema, RLS, индексы и гранты не проверялись: нет
  доступа к Management API из этого окружения.
- Vercel runtime-логи и метрики недоступны; выводы о стабильности сделаны по
  коду и тестам, а не по production-телеметрии.
- Полная сборка Next 14 для сравнения бандла не завершилась (лимит памяти
  песочницы).
- GitHub Actions workflow не запускался.
- Все проверки выполнены с placeholder-переменными Supabase; реальные данные
  не читались.
