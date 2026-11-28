# Flow × Telegram Main Mini App — audit (2026-11-28)

Scope: the existing Flow / Pierrot Mini App shell and its launch from the
Telegram bot profile. The owner has confirmed that the required BotFather
settings are already enabled; this audit does not ask for them to be re-enabled
and does not change public bot settings.

Out of scope: the Telegram Mini App Store/catalog (a later decision for Temple),
Temple changes, payments, a new bot, the bot webhook, and public bot metadata.

## 1. What was verified

| Check                                   | Evidence                                                                                                                                                                                                                            | Result                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Direct-link Mini App exists             | `https://t.me/PierrotAi_bot/flow` returns the public **Open App** action with `appname=flow`.                                                                                                                                       | Confirmed without a token.                                                             |
| `startapp` launch exists                | `https://t.me/PierrotAi_bot?startapp=flow` and `?startapp=flow__…` return **Open App**.                                                                                                                                             | Confirmed without a token.                                                             |
| Main Mini App enabled                   | Owner-confirmed. BotFather is not readable from the repository; no token was read.                                                                                                                                                  | Confirmed by owner; not independently provable from source.                            |
| Canonical browser URL                   | `https://www.merkurov.love/flow` returns `200`, `<link rel="canonical" href="https://www.merkurov.love/flow">`.                                                                                                                     | Confirmed against production.                                                          |
| Production pre-change SDK behaviour     | The current production HTML still contains the old `lazyOnload` Telegram script on ordinary browser pages.                                                                                                                          | Baseline captured; regression to be removed by this change.                            |
| Local production cold launch            | A production build served locally, with a stubbed `telegram-web-app.js`, resolves `/lobby?…&tgWebAppStartParam=flow` to `/flow`, calls `ready`, `expand`, `requestFullscreen`, applies a 47px safe inset and requests the SDK once. | Confirmed in Chromium with a Telegram WebView-sized viewport.                          |
| Deep link to a Flow publication path    | `tgWebAppStartParam=flow__am9pbg` opens the publication-shaped `/flow/join` fixture; the native back handler then returns to `/flow`. The same `flow__<slug>` resolver is unit-tested against real publication slugs.               | Confirmed in the same local production run.                                            |
| Browser fallback                        | `https://…/flow` without launch markers makes zero requests to `telegram.org/js/telegram-web-app.js` and receives no Telegram body class.                                                                                           | Confirmed in Chromium and by unit tests.                                               |
| iOS / Android installed Telegram client | Not available in this environment.                                                                                                                                                                                                  | Not verified here; one device pass remains. See `docs/telegram-botfather-setup.md` §3. |

No bot token, signed `initData`, cookie or private credential was read, printed
or stored during this audit.

## 2. Problems found and fixed

### 2.1 SDK was loaded too late

`app/layout.tsx` used `next/script` with `lazyOnload` for
`telegram-web-app.js`. Telegram's loading placeholder stayed until the browser
went idle, and fullscreen/safe-area setup was delayed until after hydration.

Fix: `lib/telegram/sdkBootstrap.ts` renders a small head bootstrap that queues
the SDK through Next.js' before-interactive loader **only** when the URL carries
Telegram launch markers or the older WebView bridge exists. An ordinary browser
still makes no Telegram request. Runtime detection keeps an idempotent fallback
for clients that block the before-interactive queue.

### 2.2 `start_param` could arrive before the SDK

The shell read only `Telegram.WebApp.initDataUnsafe.start_param`. A cold direct
link can be visible before the SDK finishes loading.

Fix: `readTelegramStartParamFromUrl` now reads the documented
`tgWebAppStartParam` URL value as a fallback. The value remains untrusted and
still passes the first-party allowlist in `resolveTelegramStartParam`; arbitrary
URLs and malformed payloads are rejected.

### 2.3 Back from a cold deep link had no section home

A Flow publication opened from `startapp` had no in-app history. Back could
fall through to the Lobby or out of the app.

Fix: `resolveTelegramSectionHome` returns `/flow` for a nested Flow publication
and the issue archive for `/flow-issues/*` and `/en/flow-issues/*`. The shell
uses it before any generic history fallback.

### 2.4 `window.history.length` is not a reliable Back signal

A Telegram WebView can start with a blank history entry. `history.length` can
therefore be greater than one on a cold launch, and the old fallback could
navigate away from the Mini App instead of closing it. `router.replace` also
keeps the length unchanged, so duplicate entries were possible.

Fix: `components/TelegramMiniApp.tsx` keeps a small in-app route stack
(`lib/telegram/navigation.ts`). It records client-side pushes, models
`router.replace` without duplicates, and treats a cold launch as a single root
entry. Back now returns to the previous in-app screen when one exists, or closes
the Mini App at a root. This also removes the `/lobby` ↔ `/flow` loop.

### 2.5 Documentation drifted from the owner's configuration

The previous draft described BotFather actions that were not required and
included a Mini App Store readiness document, which is explicitly out of scope.
Those instructions/doc were removed. The remaining document records the
owner-confirmed settings and the single device check that cannot be automated.

## 3. Existing behaviour preserved

- Canonical Next.js routes `/flow`, `/flow/[slug]`, `/flow-issues` and
  `/en/flow-issues`; no parallel Mini App pages or second origin.
- `initData` is still HMAC-verified server-side with freshness checks
  (`lib/telegram/initData.ts`). `initDataUnsafe` remains deep-link metadata only,
  never identity or authorization.
- Fullscreen is requested only on Flow routes; leaving Flow restores the normal
  shell. Unsupported clients stay expanded.
- Safe area, content safe area, viewport height and theme events still feed the
  same CSS variables. Flow's CSS uses `max(env(...), var(--tg-safe-area-*))`.
- Loading, retry and empty states in `app/flow/page.tsx` are unchanged.
- Telegram crossposting and Instant View links are unchanged; `startapp` links
  still fall back to the canonical web URL when the bot username is absent.
- No migration, webhook, public bot field, Store submission or paid feature was
  added.

## 4. Verification commands

Focused and full checks are recorded in the task result. The relevant suites are:

```bash
pnpm test --runInBand lib/telegram app/flow/__tests__
pnpm typecheck
pnpm lint
pnpm build   # placeholder Supabase env, same as CI
```

Browser launch coverage lives in
`tests/flow-telegram-launch.spec.ts` (cold launch, repeat launch, deep link,
Back, safe area/fullscreen and browser fallback).

## 5. Honest remaining limitation

The installed Telegram client on iOS and Android is the only unverified surface.
The public `t.me` links, the production build, the unit suite and the
mocked-Telegram Chromium run all pass. A single device pass using the five steps
in `docs/telegram-botfather-setup.md` §3 is the only owner action still needed;
it is a verification step, not a configuration change.
