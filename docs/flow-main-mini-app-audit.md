# Flow × Telegram Main Mini App — audit (2026-11-28)

This audit covers the existing Flow / Pierrot Mini App integration. It does not
change public bot metadata. Production settings that require the bot token or
BotFather were **not** read or changed from this environment.

Official references checked:

- Telegram Mini Apps: <https://core.telegram.org/bots/webapps>
- Bot features / Main Mini App / Mini App Store:
  <https://core.telegram.org/bots/features#mini-apps>
- Bot API 8.0 fullscreen, safe area, Home Screen and loading screen:
  <https://core.telegram.org/bots/webapps#recent-changes>

## 1. Bot and public configuration

| Item                       | Repository evidence                                                                                                                                                                               | Live status                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Primary Flow / Pierrot bot | `@PierrotAi_bot` is the bot username used by the Mini App link tests and Instant View fixtures (`lib/telegram/__tests__/miniAppLinks.test.ts`, `lib/flow/__tests__/telegramInstantView.test.ts`). | **Not verified from this environment.** Confirm with `getMe` / BotFather. No token was read.         |
| Bot token source           | `PIERROT_BOT_TOKEN` (fallbacks `OSIRIS_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`) in `lib/telegram/botToken.ts`.                                                                                           | Presence in production is not asserted.                                                              |
| Webhook                    | Repository expects `https://www.merkurov.love/api/pierrot` for the primary bot (`docs/telegram-operations.md`).                                                                                   | **Not verified.** Run `getWebhookInfo` server-side; do not change it as part of Mini App work.       |
| Menu button                | `scripts/telegram/configure-bot.mjs` sets `setChatMenuButton` → `https://www.merkurov.love/lobby`, text `Open Pierrot`.                                                                           | **Not verified.** The script was not run.                                                            |
| Main Mini App              | BotFather-only setting. Bot API has no method to set it.                                                                                                                                          | **Not configured/verified.** Owner action required.                                                  |
| Short name / direct link   | Direct link format is `https://t.me/<bot>/<short_name>` and `https://t.me/<bot>?startapp=<param>`.                                                                                                | **Not configured/verified.** Choosing a short name is a public-link decision for the owner.          |
| Domain                     | Canonical origin is `https://www.merkurov.love`; `merkurov.love` redirects to `www` in `next.config.js`.                                                                                          | Code verified. TLS/redirect behaviour should be confirmed in production.                             |
| Allowed Mini App URLs      | Telegram requires an HTTPS URL. The repository uses one canonical origin and canonical routes; no second Mini App host exists.                                                                    | Code verified. BotFather may additionally confirm the domain; record the prompt instead of guessing. |

### Exact owner read-only checks

Do not paste the token into chat. Run locally / in a trusted server shell:

```bash
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getMe"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getWebhookInfo"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getChatMenuButton"
```

Record only `username`, `url`, `pending_update_count`, `last_error_date`,
`last_error_message` and the menu button type/URL. Never record the token or
full `initData`.

## 2. Mini App shell audit

| Capability         | Current implementation                                                                                                                                                                                                                                      | Status                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| SDK loading        | `app/layout.tsx` renders a small head bootstrap (`lib/telegram/sdkBootstrap.ts`) that injects `telegram-web-app.js` only when the URL has Telegram launch markers or the older WebView bridge exists. `lib/telegram/detection.ts` keeps a runtime fallback. | **Implemented in this task.** Ordinary browsers do not request Telegram's SDK. |
| `ready` / `expand` | `lib/telegram/lifecycle.ts` calls both before other UI work; all methods are feature-detected.                                                                                                                                                              | Working in code; live client not available.                                    |
| Fullscreen         | `requestFullscreen()` only on `/flow` and `/flow/<slug>`; `exitFullscreen()` when leaving Flow. The close control reserves masthead space.                                                                                                                  | Working in code. Bot API 8.0+; older clients stay expanded.                    |
| Safe area          | `safeAreaInset` + `contentSafeAreaInset` are merged into `--tg-safe-area-*`; Flow CSS uses `max(env(safe-area-inset-*), var(--tg-safe-area-*))`.                                                                                                            | Working in code; physical iOS/Android not available.                           |
| Viewport           | `viewportHeight` / `viewportStableHeight` become `--tg-viewport-*`; `viewportChanged`, `safeAreaChanged`, `contentSafeAreaChanged` update them.                                                                                                             | Working in code.                                                               |
| Theme              | `colorScheme` + `themeParams` become CSS variables with a luminance fallback; `themeChanged` updates live.                                                                                                                                                  | Working in code.                                                               |
| Back button        | Overlays consume Back first; nested Flow publications go “up” to `/flow`; otherwise real history is used; `/lobby` closes or falls back safely.                                                                                                             | **Implemented in this task** for the cold deep-link case.                      |
| `start_param`      | Reads `initDataUnsafe.start_param` and now the documented URL fallback `tgWebAppStartParam`. Only an allowlist of first-party routes is accepted; arbitrary URLs are rejected.                                                                              | **Implemented in this task.**                                                  |
| Deep-link encoding | `flow__<base64url-slug>` for a publication; simple tokens for indexes. Slug is validated against a Unicode-safe allowlist.                                                                                                                                  | Working; tests cover round-trips and injection attempts.                       |
| initData auth      | Raw `initData` is HMAC-verified server-side (`lib/telegram/initData.ts`, 24h freshness). `initDataUnsafe` is never identity.                                                                                                                                | Working in code; existing auth tests pass.                                     |
| Canonical routes   | `/flow`, `/flow/[slug]`, `/flow-issues`, `/en/flow-issues` remain normal Next.js routes. No parallel Mini App pages or second origin.                                                                                                                       | Working.                                                                       |
| Browser fallback   | `TelegramMiniApp` renders nothing outside Telegram; the normal site header/footer remain; no Telegram SDK request without launch markers or the WebView bridge.                                                                                             | Working in code; browser regression checked by existing site tests.            |
| External links     | Existing `openLink` / browser fallbacks are unchanged; no new redirect surface was added.                                                                                                                                                                   | Working by inspection.                                                         |

## 3. What is already working, what BotFather can enable, what needs code

### Already working in the repository

- One canonical origin and one Next.js route tree for browser and Telegram.
- `@PierrotAi_bot` Mini App link building (only when
  `TELEGRAM_MINI_APP_BOT_USERNAME` is configured).
- `initData` server verification and owner allowlist checks.
- Fullscreen, safe-area variables, theme, BackButton and Home Screen helpers.
- Flow publication deep links and crosspost links with a safe canonical fallback.
- Graceful browser behaviour when Telegram is absent.

### Enableable through BotFather (owner action, no code)

- Main Mini App: enable it, set the HTTPS URL, choose the short name, icon and
  splash colours.
- Menu Button URL/text (also settable through `setChatMenuButton`).
- Bot profile name, About, Description, photo, commands.
- Mini App previews (screenshots/video demos) shown on the profile and in
  Search / the Apps tab.
- Splash screen icon and light/dark colours.

### Requires code (this PR)

- Early SDK bootstrap in the document head, only for Telegram launches.
- `tgWebAppStartParam` URL fallback for cold deep links.
- Predictable “up” navigation from a deep-linked Flow publication to `/flow`.
- Audit, BotFather runbook and Store-readiness checklist.

### Not changed without owner approval

- Bot username, public name, About/Description, profile photo.
- Main Mini App URL, short name and public direct link.
- Menu Button text/URL in production.
- Webhook, domain, catalog submission, paid features.

## 4. Verification matrix

| Check                            | Result                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Cold Main Mini App launch        | Not executable here (no Telegram client). Covered by mocked WebApp tests and the owner checklist.    |
| Repeat launch                    | Not executable here. `start_param` handling is idempotent per value.                                 |
| Deep link to a Flow post         | Unit-tested for `startapp` → `/flow/<slug>`, including URL fallback and malicious payload rejection. |
| Return to Flow home              | Unit-tested for `/flow/<slug>` → `/flow`.                                                            |
| initData verification            | Existing Jest suite covers signature, freshness, malformed input and owner/admin boundaries.         |
| iOS / Android WebView            | Not available. Safe-area/fullscreen code is feature-detected; owner must check on devices.           |
| Canonical URL / browser fallback | Existing Flow and site tests; Playwright Telegram mocks in `tests/flow-telegram-reader.spec.ts`.     |
| Production smoke test            | Not run from this environment (no deployment or Telegram client).                                    |

## 5. Honest limitations

- Production bot settings cannot be proven from source code. The owner must run
  the read-only checks above.
- Main Mini App is curated by Telegram; enabling it does not guarantee presence
  in the Mini App Store or the Apps tab.
- No physical iOS/Android device was available. Layout and lifecycle are tested
  with mocks only.
