# Flow Mini App Store readiness

Status: **preparation only**. Nothing was submitted. Telegram does not expose a
public “submit to the Mini App Store” API in the documented Bot API; inclusion is
curated by Telegram. Enabling the Main Mini App and uploading quality media makes
the app eligible to appear in the Apps tab / be considered for featuring. It does
**not** guarantee placement.

Sources:

- <https://core.telegram.org/bots/features#mini-app-store>
- <https://core.telegram.org/bots/features#mini-app-previews>
- <https://core.telegram.org/bots/webapps#launching-the-main-mini-app>
- <https://core.telegram.org/bots/webapps#design-guidelines>

## 1. Mandatory technical prerequisites

| #   | Requirement                                              | Status            | Evidence / remaining action                                                                                      |
| --- | -------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Main Mini App enabled for the bot                        | **Owner action**  | BotFather-only. See `docs/telegram-botfather-setup.md`.                                                          |
| 2   | HTTPS launch URL on the canonical origin                 | **Ready**         | `https://www.merkurov.love/flow`; apex redirects to `www`.                                                       |
| 3   | Telegram WebApp SDK available before the app initializes | **Ready**         | Conditional head bootstrap in `lib/telegram/sdkBootstrap.ts`; runtime fallback in `lib/telegram/detection.ts`.   |
| 4   | `ready()` / `expand()` called                            | **Ready**         | `lib/telegram/lifecycle.ts`.                                                                                     |
| 5   | Fullscreen and safe areas handled                        | **Ready in code** | Bot API 8.0+ methods feature-detected; `--tg-safe-area-*` variables used by Flow CSS. Real-device check pending. |
| 6   | BackButton behaves predictably                           | **Ready in code** | Overlays → section home for nested Flow → history → Lobby/close. Unit tested.                                    |
| 7   | Deep links resolve only first-party routes               | **Ready**         | `lib/telegram/miniAppRoutes.ts`; `tgWebAppStartParam` fallback; injection tests.                                 |
| 8   | initData is verified server-side                         | **Ready**         | `lib/telegram/initData.ts`; no client trust.                                                                     |
| 9   | Normal browser site still works                          | **Ready**         | Telegram UI returns `null` outside Telegram; SDK not requested without launch markers.                           |
| 10  | No second origin / no parallel Mini App tree             | **Ready**         | Canonical Next.js routes only.                                                                                   |

## 2. Bot profile and listing metadata

| Field                      | Proposed value                                                                                                                    | Status                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot username               | `@PierrotAi_bot`                                                                                                                  | Confirm in BotFather; do not change.                                                                                                           |
| Public bot name            | `Pierrot`                                                                                                                         | Current; do not change without approval.                                                                                                       |
| Main Mini App display name | `Flow`                                                                                                                            | Proposed; owner approval required if BotFather asks.                                                                                           |
| Short description          | `Flow — notes, links and images from Anton Merkurov.`                                                                             | Proposed. Existing bot short description is persona-level; keep unless the owner wants a Flow-specific listing.                                |
| Long description           | `Flow is Anton Merkurov's publishing stream: notes, links, images and longer essays, readable in the browser or inside Telegram.` | Proposed.                                                                                                                                      |
| Category                   | Art & Culture / Publishing (only if the form asks)                                                                                | **Unverified** — no category field is documented in the Bot API. Do not invent one in BotFather.                                               |
| Icon                       | Download `/icon` (512×512 PNG) and upload it to BotFather                                                                         | **Technical stopgap only.** Generic heart; not Flow-branded. Owner-approved asset missing.                                                     |
| Splash screen              | Light `#f6f1e8`, dark `#141210`, existing icon                                                                                    | Proposed; BotFather validates the file.                                                                                                        |
| Privacy policy URL         | **Missing**                                                                                                                       | There is no `/privacy` page in the repository. Do not publish a dead link. Owner must approve a privacy page or a Telegram-native explanation. |
| Support URL                | `mailto:merkurov@gmail.com` and/or `https://t.me/PierrotAi_bot`                                                                   | The email is already public on the site. Owner should confirm the preferred channel.                                                           |
| Terms of service           | **Missing**                                                                                                                       | Owner decision. Not documented as a hard Telegram requirement.                                                                                 |
| Website                    | `https://www.merkurov.love/flow`                                                                                                  | Ready.                                                                                                                                         |

## 3. Media previews

Telegram lets developers upload screenshots and video demos to the bot profile;
they are shown on the profile, in Search and in the Apps tab. Quality matters.
The repository has mocked Playwright captures, not real Telegram-client captures.

| Asset            | Candidate in repository                                                   | Status                                                                           |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Flow feed        | `artifacts/telegram-navigation/flow-home-390x844-open.png`                | Mocked/emulated; replace with a real-device capture.                             |
| Flow publication | `artifacts/telegram-navigation/flow-detail-390x844-open.png`              | Mocked/emulated; replace.                                                        |
| Reader progress  | `artifacts/flow-telegram-reader/flow-reader-progress-390x844.png`         | Mocked/emulated; replace.                                                        |
| Image viewer     | `artifacts/flow-telegram-reader/flow-image-viewer-390x844.png`            | Mocked/emulated; replace.                                                        |
| Tablet / wide    | `artifacts/flow-telegram-reader/flow-reader-820x1180.png`                 | Mocked/emulated; replace.                                                        |
| Browser fallback | `artifacts/flow-telegram-reader/flow-reader-browser-fallback-390x844.png` | Proves fallback, not a Store screenshot.                                         |
| Video demo       | **Missing**                                                               | Owner must record a short vertical capture: launch → feed → post → image → back. |

Recommended minimum set for the owner:

1. 3–5 portrait screenshots from a real iPhone or Android Telegram client.
2. 1 short vertical video (10–20 s) showing launch from the bot profile, Flow
   feed, a publication, and Back to Flow.
3. No Telegram system UI, notifications, personal data or private chats in the
   captures.

## 4. Supported scenarios (for listing copy / review)

- Launch Flow from the bot profile (Main Mini App).
- Browse the Flow feed and read a publication.
- Open a publication from a Telegram crosspost deep link.
- Return from a publication to Flow home with Telegram Back.
- View an image full-screen, with captions and gallery navigation.
- Share a publication back to Telegram.
- Open the same canonical URLs in a normal browser.
- Owner-only publishing remains in the bot/Admin, not in the public reader.

## 5. Quality gate before any owner submission

| Check                                           | Status                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Cold launch on iOS Telegram                     | **Not run** (no device).                                   |
| Cold launch on Android Telegram                 | **Not run** (no device).                                   |
| Repeat launch / resume                          | **Not run** on device; ready logic is idempotent.          |
| Safe area in fullscreen (notch, home indicator) | **Code ready**, device check pending.                      |
| BackButton from deep-linked post                | **Unit tested**; device check pending.                     |
| Deep link from a real crosspost                 | **Not run**; link builder tested.                          |
| initData auth regression                        | Jest suite; see `docs/telegram-testing.md`.                |
| Browser regression at `merkurov.love/flow`      | Existing tests/Playwright mocks; production smoke pending. |
| Loading screen preview                          | **Not configured**; owner must use BotFather preview.      |
| Icon legibility at small size                   | **Not verified**; current icon is a generic heart.         |
| No console errors in Telegram WebView           | **Not verified** on device.                                |

## 6. Recommendations vs Telegram requirements

### Documented Telegram requirements / strong expectations

- Enable the Main Mini App to get the profile launch button and Apps-tab
  eligibility.
- Serve the Mini App over HTTPS.
- Initialize the WebApp SDK and call `ready()`.
- Respect safe areas and content safe areas, especially in fullscreen.
- Follow the design guidelines: responsive, mobile-first, accessible labels,
  native-feeling interactions, smooth animations, theme awareness.
- Do not misrepresent catalog placement.

### Recommendations (not proven hard requirements)

- Accept payments in Telegram Stars to improve featuring chances — **do not
  enable** for this task; no paid features are in scope.
- Upload high-quality localized previews.
- Add a privacy policy and a support contact.
- Use a branded icon and a matching splash screen.
- Keep the main entry under one canonical origin.

## 7. Owner decisions still open

1. Main Mini App URL: Flow-first (`/flow`) or Lobby-first (`/lobby`)?
2. Short name: `flow` or another public value?
3. Menu Button: keep `Open Pierrot` → `/lobby`, or align it with Flow?
4. Approve a Flow icon / loading-screen asset (no new visual style invented here).
5. Approve privacy and support URLs.
6. Record the real-device demo video and screenshots.
7. Decide whether Telegram Stars / paid features are ever in scope.

No catalog request, message to Telegram or BotFather change was performed by this
task.
