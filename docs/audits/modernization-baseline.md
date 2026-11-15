# Modernization baseline — MERKUROV / newlove

Дата: 2026-11-15
Ветка: `chore/modernization-2026`
Исходный commit: `0c5de71503cb861cdfd0de9a303d08b8a78e696c` (`main`)
Рабочее дерево на момент старта: чистое (`git status` без изменений).

Документ фиксирует **фактическое** состояние репозитория, полученное чтением
файлов, сканированием импортов и запуском проверок. Всё, что нельзя было
проверить (production schema, Vercel runtime-логи, Supabase logs), помечено как
непроверенное. Предыдущие аудиты использовались только как контекст.

---

## 1. Снимок окружения

| Параметр | Значение |
|---|---|
| Node.js (факт) | `v22.23.2` (`.nvmrc` → `22`, `engines.node` → `22.x`) |
| npm | `10.9.8` |
| pnpm (глобальный) | `11.24.0` |
| bun | `1.4.4` |
| Package manager в проекте | **не определён**: одновременно `package-lock.json` (lockfileVersion 3, 673 KB) и `pnpm-lock.yaml` (lockfileVersion 9.0, 617 KB). Поле `packageManager` отсутствует. `node_modules` установлен npm-ом (1092 пакета, 3.7 GB). |
| Next.js | `14.2.5` (точный пин) |
| React / React DOM | `18.3.1` / `18.3.1` |
| TypeScript | `5.5.4` |
| ESLint | `8.57.1` (legacy config) |
| Jest | `30.2.0` + `@swc/jest` |
| Tailwind | `3.4.17` |
| Размер репозитория | 2343 tracked files, 1695 `.ts/.tsx` |
| app/ | 403 директории, 157 `page.tsx`, 234 `route.ts` |

---

## 2. Конфигурация сборки

`next.config.js`:

- `output: 'standalone'` — нужен для Render, на Vercel не мешает.
- `reactStrictMode: true`, `poweredByHeader: false`.
- `eslint.ignoreDuringBuilds: true` — **lint в сборке отключён**.
- `typescript.ignoreBuildErrors: false` — typecheck блокирует сборку.
- `experimental.optimizePackageImports: ['lucide-react', 'date-fns', '@tiptap/react']`.
- `experimental.outputFileTracingIncludes` для `/api/admin/knowledge/**` и `/api/unframed/**`.
- Кастомный `webpack()` — только выставляет `infrastructureLogging.level`; иной
  функциональности нет.
- `images`: 12 `remotePatterns`, включая `*.supabase.co` и `*.medium.com`,
  `dangerouslyAllowSVG: true` с CSP `script-src 'none'; sandbox;`,
  `minimumCacheTTL: 31536000`, `formats: ['image/avif','image/webp']`,
  `imageSizes` включает `16`.
- `redirects()` содержит 4 правила, `headers()` — security headers +
  no-store для `/research/telegram/*` + SW/manifest cache rules.

`tsconfig.json`: `strict: true`, `noImplicitAny: true`, `moduleResolution: bundler`,
`paths: {"@/*": ["./*"]}`, `types: []`, `incremental: true`,
`exclude: ["node_modules","tests","**/__tests__/**","app/liveheart/SharedArtifact.tsx"]`.
Исключение `SharedArtifact.tsx` из typecheck — отдельный риск (файл не проверяется).

`vercel.json`: `buildCommand: next build`, cron `15 3 * * *` →
`/api/cron/analytics-sync`, деплой включён только для `main`.

### Проблемы конфигурации, подтверждённые фактически

1. `.eslintrc.json` расширяет `plugin:@typescript-eslint/recommended` и
   `plugin:react/recommended`, но **ни `@typescript-eslint/*`, ни `eslint-plugin-react`
   не объявлены в `package.json`**. Пакеты присутствуют в `node_modules` только
   транзитивно. Конфигурация не воспроизводима.
2. `eslint.config.js` содержит `export default []` — пустой flat-config заглушка,
   при этом проект CommonJS (нет `"type": "module"`). Файл не используется и
   вводит в заблуждение.
3. `package.json` содержит **вне `scripts`** ключ `"vercel-build": "pnpm build"` —
   он не выполняется и создаёт ложное впечатление настроенной сборки.
4. `scripts.vercel:install` = `npm install --force && npm install framer-motion clsx tailwind-merge --no-save` —
   неконтролируемая установка поверх lockfile.
5. `pnpm-workspace.yaml` содержит невалидный фрагмент (`allowBuilds:` с текстом
   «set this to true or false») — это вывод интерактивного промпта pnpm, а не
   конфигурация. Файл сломал бы `pnpm install`.
6. 7 зависимостей закреплены как `latest`: `clsx`, `date-fns`, `dotenv`,
   `recharts`, `tailwind-merge`, `telegraf`, `yahoo-finance2` — сборка
   невоспроизводима.
7. Два lockfile расходятся: `pnpm-lock.yaml` разрешает `@supabase/supabase-js@2.84.0`,
   `@atproto/api` spec `^0.17.5`, тогда как `package.json` требует `^0.17.7` и
   `^2.76.1`. Ни один lockfile не гарантированно соответствует `package.json`.
8. `middleware.ts` использует `@supabase/ssr`, но `@supabase/auth-helpers-nextjs`
   всё ещё в зависимостях (см. §4).

---

## 3. Архитектура (фактическая карта)

- **App Router**, `app/` — единственная точка входа. Pages Router отсутствует.
- **Route Handlers**: 234 файла `route.ts`.
  - `nodejs` runtime объявлен явно в 130; остальные наследуют Node (Edge не
    используется намеренно).
  - `dynamic = 'force-dynamic'` — 207, `force-static` — 3.
  - `maxDuration`: 15 (2), 20 (1), 30 (2), 60 (23), 120 (5), 180 (2), 300 (16).
- **Middleware**: `middleware.ts`, matcher исключает `_next/*`, `favicon.ico`,
  `api`, статику. Markdown-двойники (`*.md`, `Accept: text/markdown`)
  переписываются на `/api/markdown`. Auth-refresh (`supabase.auth.getClaims()`)
  выполняется только для защищённых путей (`lib/auth/routeProtection.ts`).
- **Server Actions**: 4 файла с `'use server'` (`app/admin/actions.ts`,
  `app/research/actions.ts`, newsletter/letters actions).
- **Client boundary**: 254 файла с `'use client'` (app 72, components 182, lib 6).
  Корневой layout рендерит `PierrotChat`, `Header`, `Footer`, `AuthProvider`,
  `GlobalAudioProvider`, аналитику — это влияет на First Load JS всех страниц.
- **Динамические импорты**: 6 `next/dynamic`, плюс `await import()` в
  route handlers и `highlight.js` в Pierrot (lazy).
- **Доменные модули**: `lib/` (около 40 доменных папок: `pierrot`, `knowledge`,
  `analytics`, `flow`, `temple`, `newsletter`, `operations`, `media` и др.).
- **Дублирующиеся слои Supabase-клиента** (см. §7).
- **Крупные файлы-монолиты**: `app/api/pierrot-web/route.ts` — 6934 строки;
  `components/pierrot/PierrotContext.tsx` — 2376; `lib/knowledge/brain/process.ts` — 2108.
  Это осознанно не переписывается в рамках модернизации.

---

## 4. Реестр зависимостей

Прямых: 88 `dependencies` + 21 `devDependencies`.

### 4.1 Фактически не используются (подтверждено сканированием импортов и конфигов)

| Пакет | Доказательство | Решение |
|---|---|---|
| `@supabase/auth-helpers-nextjs` | 1 legacy импорт `createClientComponentClient` в `app/admin/media/page.jsx`; весь остальной код уже на `@supabase/ssr` | удалить после миграции этого файла |
| `@google/generative-ai` | 0 импортов; Gemini вызывается напрямую через REST (`lib/ai/gemini.ts`) | удалить |
| `groq-sdk` | 0 импортов; провайдеры вызываются через `fetch`/OpenAI-совместимый клиент | удалить |
| `telegraf` | 0 импортов; используется `grammy` | удалить |
| `sanitize-html` | 0 импортов; используется DOMPurify (`lib/sanitizeHtml.ts`) | удалить |
| `html-react-parser` | 0 импортов | удалить |
| `react-dropzone` | 0 импортов | удалить |
| `lowlight` | 0 импортов | удалить |
| `rehype-highlight` | 0 импортов | удалить |
| `rimraf` | 0 импортов/скриптов | удалить |
| `express-rate-limit` | 0 импортов (rate limiting свой, `lib/rateLimit.ts`) | удалить |
| `glob` | 0 импортов/скриптов | удалить |
| `clsx` | 0 импортов (`cn()` не используется) | удалить |
| `tailwind-merge` | 0 импортов | удалить |
| `@editorjs/code` | не подключён в `EditorJsArticle.js` | удалить |
| `@react-email/render` | 0 импортов; `render` берётся из `@react-email/components` | удалить (после обновления) |
| `@tiptap/extension-table*`, `@tiptap/extension-highlight`, `@tiptap/extension-code-block-lowlight`, `@tiptap/html` | 0 импортов; в `TiptapEditor` используется StarterKit + Image + Link + Placeholder | удалить |
| `@swc/jest` | не используется ни в `jest.config.js`, ни в transform | удалить |
| `@testing-library/user-event` | 0 импортов в тестах | удалить |

Не удаляются без отдельного решения:
`@nomicfoundation/solidity-analyzer-linux-x64-gnu` (platform-specific optional
dependency для hardhat-скриптов; `hardhat` при этом **не установлен** — скрипты
`compile:contracts`/`deploy:hardhat` неработоспособны уже сейчас),
`viem` (используется в `scripts/deploy_unified.js`), `node-fetch` (3 скрипта),
`pdf-parse`, `sharp`, `pg` (серверная обработка).

### 4.2 Дублирующие библиотеки

| Домен | Пакеты | Фактическое использование |
|---|---|---|
| Supabase auth | `@supabase/auth-helpers-nextjs` + `@supabase/ssr` | только `ssr` |
| Telegram | `telegraf` + `grammy` | только `grammy` |
| Rich text editor | Editor.js (7 пакетов) + Tiptap (9 пакетов) | оба используются в админке (`EditorJsArticle.js`, `TiptapEditor.tsx`) — **не удалять**, зафиксировать как legacy |
| Markdown | `markdown-to-jsx` + `react-markdown` + `remark-gfm` | оба используются в разных сценариях |
| HTML sanitization | `dompurify` + `sanitize-html` | только `dompurify` |
| Web3 | `ethers` + `viem` + `wagmi` + `@web3-onboard/*` | `ethers` в клиенте, `@web3-onboard` в клиенте, `viem` только в скрипте, `wagmi` не используется |
| Markdown → Telegram HTML | свой конвертер | — |

`wagmi` не импортируется нигде (единственное упоминание — комментарий в
`app/heartandangel/NFT/ClientPage.tsx`). Однако он транзитивно тянет
`@reown/appkit`, `@walletconnect/*` и значительную часть критических
уязвимостей из `npm audit` (§4.4). Кандидат на удаление — требует проверки,
что `@web3-onboard` не резолвит wagmi динамически.

### 4.3 Тяжёлые библиотеки в клиенте

- `ethers` — 8 клиентских файлов (`login`, `onboard`, `ModernLoginModal`,
  `WalletLoginButton`, NFT-страницы). Не lazy.
- `framer-motion` — 21 клиентский компонент, включая `PierrotChat` и `Header`,
  которые смонтированы глобально в корневом layout.
- `recharts` — `SilenceClient` (статически) и Pierrot (корректно lazy через
  `next/dynamic`).
- `html2canvas` — `AbsolutionClient` (не lazy).
- Tiptap/Editor.js — только админка.
- `highlight.js/lib/common` — lazy внутри `PierrotCode`.

### 4.4 Уязвимости (npm audit на исходном lockfile)

`93` записи: **4 critical, 36 high, 49 moderate, 4 low**.

Критические:
- `next@14.2.5` — cache poisoning + DoS в image optimization (фикс 14.2.35, non-major).
- `@web3-onboard/core` → `bnc-sdk` → `crypto-es` — PBKDF2 weakness (fix недоступен
  на текущей мажорной версии).

Высокие, значимые для проекта: `@atproto/api` (zod/lexicon),
`@reown/appkit*`, `@walletconnect/*`, `viem`, `ws`, `sharp` (libvips/libheif),
`postcss` (транзитивный через next), `playwright`, `happy-dom` (через `@tiptap/html`),
`joi` (через `@web3-onboard`), `glob` (через `@next/eslint-plugin-next`), `nanoid`.

Полный список фиксируется в `docs/audits/modernization-final-2026.md` после
обновления. Политика: не делать `npm audit fix --force`, не поднимать мажоры
без проверки.

### 4.5 Риски React 19

`@react-email/*@0.0.x` объявляют peer `react ^18.2.0`. Это единственная группа
пакетов с несовместимым peer-range, реально используемая в рантайме
(рендер писем на сервере). Перед React 19 требуется обновление до
`@react-email/components@1.x` + `@react-email/render@2.x`
(`render` переезжает в отдельный пакет).

`md-to-react-email@5.0.2` (транзитивный, peer `18.x`) уходит вместе с
обновлением react-email.

---

## 5. Supabase и авторизация

### 5.1 Клиенты (фактически)

| Файл | Назначение | Импортёров |
|---|---|---|
| `lib/supabase/server.ts` | канонический серверный клиент (anon + service-role, cookie adapter) | 39 |
| `lib/supabase-browser.ts` | браузерный клиент | 18 |
| `lib/supabase-server.ts` | **legacy**, использует синхронный `cookies()` — ломается в Next 16 | 2 |
| `lib/supabase-client.ts` | **дубль** browser-клиента | 2 |
| `lib/supabase-build.ts` | не используется | 0 |
| `lib/supabaseInterop.ts` | не используется | 0 |
| `lib/getSupabaseForRequest.ts` | shim, делегирует в `getUserAndSupabaseForRequest` | 4 |
| `lib/serverAuth.ts` | `getCurrentUser` / `requireUser` / `requireAdmin` / `requireAdminFromRequest`, Telegram initData, service-role guard | 215 |

Middleware и route handlers уже используют `@supabase/ssr`; `auth-helpers`
фактически мертв.

### 5.2 Синхронные Request API (блокер Next 16)

Синхронно вызывают `cookies()` (в Next 16 удалено):

- `app/admin/selection/edit/[id]/page.tsx`
- `app/admin/pierrot/(workspace)/page.tsx`
- `app/admin/newsletter-jobs/page.tsx`
- `app/admin/articles/edit/[id]/page.tsx`
- `app/auth/callback/route.ts`
- `app/api/admin/revalidate-letters/route.ts`
- `app/api/auth/google-analytics/callback/route.ts`
- `lib/supabase-server.ts` (и, следовательно, `app/api/absolution/save-receipt/route.ts`)
- `lib/supabase/server.ts` — `createClient()` **синхронная**, читает `cookies()`.
  Это ключевой блокер: 39 файлов вызывают её без `await`.

Страницы с синхронными `params` (Next 16 требует Promise) — 24 места в 20 файлах
(`app/[slug]/page.tsx`, `app/lots/[id]/page.tsx`, `app/liveheart/[slug]/page.tsx`,
`app/media/record/[slug]/page.tsx`, `app/art-engine/lots/[id]/page.tsx`,
`app/digest/[slug]/page.tsx`, `app/tags/[slug]/page.tsx`, `app/selection/[slug]/page.tsx`,
`app/letters/[slug]/page.tsx`, admin-редакторы и др.).
Route handlers частично переведены на `Promise<params>` (16 файлов), но ещё
16 хендлеров с `[id]`/`[slug]` используют синхронный `params` и тоже требуют
миграции. Отдельно: 6 OG/icon-эндпоинтов объявляют `runtime = 'edge'`, который
в Next 16 помечен deprecated.

### 5.3 База данных

- 97 SQL-файлов в `migrations/`, 18 rollback-файлов в `migrations/rollback/`,
  плюс ~35 разрозненных `.sql` в `sql/` и `scripts/`. **Единого механизма
  миграций нет** (нет Supabase CLI config, нет migration runner).
- Production schema из этого окружения не проверялась. Утверждения о RLS,
  индексах и грантах в предыдущем аудите (`stabilization-2026-11-13.md`)
  основаны на read-only снимке production, сделанном владельцем; в этом
  окружении повторить их нельзя.
- `pg_cron` job `brain_worker_tick()` каждые 5 минут — уже сделан условным
  (не шлёт HTTP при пустых очередях).

---

## 6. API и фоновые процессы

- **234 route handler**; 107 в `app/api/admin/*`. Толщина слоя различается:
  часть роутов содержит только транспорт, часть — всю бизнес-логику
  (`pierrot-web/route.ts`, 6934 строки).
- **Централизованной обработки ошибок нет**: каждый роут формирует
  `NextResponse.json` вручную. Есть общий `lib/api.ts`, но он покрывает не всё.
- **Rate limiting**: `lib/rateLimit.ts` используется в 56 файлах. Реализация —
  in-memory (проверить при Phase D), что на serverless даёт лишь частичную защиту.
- **Валидация**: Zod используется в 13 файлах; остальные полагаются на ручные
  проверки. Новую библиотеку не вводим.
- **Фоновые процессы**:
  - `brain-worker`, `graph-worker`, `media-analysis-worker`, `newsletter-worker`,
    `pierrot-retention`, `pierrot-workspace-health` — `/api/cron/*`.
  - `lib/operations/*` — locks, budgets, circuit breaker, kill switch
    (`OPS_KILL_SWITCH`), лимиты на jobs/embeddings/LLM/http.
  - Vercel cron: только analytics-sync (ежедневно).
  - `maxDuration` для worker-роутов — 300 s, dispatch ограничен 120–240 s.
- **AI-провайдеры**: Gemini (`lib/ai/gemini.ts`, REST, pinned model),
  DeepSeek (fallback, `lib/flow-issue/deepseek.ts`), OpenRouter (embeddings,
  `lib/knowledge/rag/*`), OpenAI SDK (21 файл), Groq — через REST/совместимый
  клиент. Роутинг и circuit breaker уже есть; менять архитектуру не требуется.
- **Внешние `fetch` без таймаута**: 24 файла (в т.ч. `lib/openrouter.ts`,
  `lib/analytics/website/providers/oauth.ts`, `lib/video/reelGenerator.ts`,
  `app/api/youtube/shorts/route.ts`, `app/api/og/liveheart/route.ts`).
  Это подтверждённый источник `fetch failed` / таймаутов на Vercel.

---

## 7. Markdown / контент

| Сценарий | Механизм | Защита |
|---|---|---|
| Pierrot prose | `markdown-to-jsx`, `disableParsingRawHTML: true`, `sanitizer: safeMarkdownUrl` | безопасно: URL whitelist (`/`, `#`, `http(s)`, `mailto`), ссылки получают `rel="noopener noreferrer"`, изображения не рендерятся |
| Pierrot structured blocks | собственный renderer (`PierrotResponseRenderer`), lazy chart, lazy highlight.js | `hljs` экранирует код |
| Pierrot workspace | `markdown-to-jsx` | требует проверки настроек |
| Flow article | `react-markdown` + `remark-gfm` | raw HTML по умолчанию не рендерится |
| Unframed book | `react-markdown` + `remark-gfm` | то же |
| Journal/letters/blocks | `dangerouslySetInnerHTML` | **частично**: `components/blocks/TextBlock.tsx` санитизирует через `safeHtml`, но `components/BlockRenderer.tsx` рендерит `block.data.text/html` без санитизации |
| Flow issue body | `dangerouslySetInnerHTML` | источник — админский/сгенерированный контент, требует проверки |

Единый renderer **не создаётся**: сценарии различаются (GFM-таблицы и
исторические публикации в Flow нельзя менять), но правила безопасности
фиксируются и применяются точечно.

---

## 8. Качество и проверки

| Проверка | Состояние до модернизации |
|---|---|
| typecheck (`tsc --noEmit`) | **проходит** (exit 0, 0 ошибок) |
| lint | `next lint` при ESLint 8 + конфиг с необъявленными плагинами; в сборке отключён (`ignoreDuringBuilds: true`) |
| `eslint.config.js` | пустой, не используется |
| unit/integration tests | 398 файлов с test/spec в git; Jest 30 + jsdom; запуск не проверялся на старте |
| production build | запускается, но в этом окружении процесс получает SIGTERM на ~6.5 мин (лимит окружения), BUILD_ID не создаётся; для валидации нужен более быстрый сборщик/Turbopack |
| dependency audit | 93 уязвимости (см. §4.4) |
| CI | в репозитории нет workflow-файлов `.github/workflows` |

---

## 9. Vercel / производительность (наблюдения)

- 207 `force-dynamic` route handlers → каждый запрос идёт в Supabase.
- Публичные страницы уже частично переведены на ISR (см. stabilization-2026-11-13).
- Глобальный layout монтирует PierrotChat + Header + analytics для всех страниц.
- `images.remotePatterns` включает широкий `*.supabase.co` и `*.medium.com`;
  `dangerouslyAllowSVG` включён (с безопасной CSP).
- `fetch` без таймаутов — 24 файла.
- Увеличение `maxDuration` не используется как решение; текущие значения
  осмысленны (60–300 s для worker-ов).

---

## 10. Приоритизированный список проблем

### P0 — блокеры/безопасность

1. Next.js 14.2.5 с критическими уязвимостями (cache poisoning, image DoS).
2. Два lockfile + `latest`-версии + `npm install --force` → невоспроизводимые
   сборки.
3. Lint фактически не работает и отключён в сборке.
4. Синхронные `cookies()` и `createClient()` — прямой блокер Next 16, а также
   источник рассинхронизации сессии.
5. `@react-email/*@0.0.x` несовместим с React 19 (peer `^18`).

### P1 — архитектура/стабильность

6. 5 параллельных Supabase-клиентов, 2 из которых мертвы, 2 дублируют друг друга.
7. 24 внешних `fetch` без таймаута.
8. `BlockRenderer` рендерит HTML без санитизации.
9. Нет единого механизма миграций БД (97 + 35 SQL-файлов в трёх местах).
10. `app/api/pierrot-web/route.ts` — 6934 строки бизнес-логики в транспорте.

### P2 — производительность/поддержка

11. `ethers`, `html2canvas`, `framer-motion` в клиентских бандлах без lazy.
12. Дублирующиеся редакторы (Editor.js + Tiptap) — сохраняются осознанно.
13. `tsconfig` исключает `app/liveheart/SharedArtifact.tsx` из проверки.
14. `src`-подобный комментарий в `tsconfig.paths` вводит в заблуждение.
15. `debug-auth` доступен публично (не утечка, но лишняя поверхность).

---

## 11. Ограничения этого окружения

- Production Supabase schema, RLS и гранты **не проверялись**; destructive SQL
  не выполнялся.
- Vercel runtime-логи и Supabase Management API недоступны.
- Полный `next build` (webpack, Next 14) не завершается в этом окружении из-за
  внешнего SIGTERM на ~6.5 мин; результат сборки фиксируется после перехода
  на более быстрый сборщик.
- Секреты из `.env.local` / `.env.production.local` не читались и не выводились.
