# BotFather setup — Pierrot / Flow Main Mini App

Owner-only runbook. Values below are proposals unless marked **current**. Do not
change the bot username, public name, About/Description, profile photo, domain,
Main Mini App URL or short name without the owner's explicit approval.

Bot: **`@PierrotAi_bot`** — confirm with `/mybots` or `getMe` before changing
anything. No token belongs in this document or in chat.

## TL;DR — owner actions in order

1. Confirm the bot is `@PierrotAi_bot`.
2. `Bot Settings` → `Main Mini App` / `Configure Mini App` → **Enable**.
3. URL: `https://www.merkurov.love/flow` (Flow-first, recommended). Short name:
   `flow` — **confirm this public link with the owner first**.
4. Optional: `Configure Splash Screen` → existing `/icon`, light `#f6f1e8`, dark
   `#141210`.
5. Leave the Menu Button on `Open Pierrot` → `/lobby` unless the owner approves a
   change.
6. Open the bot profile → **Launch app** → run the verification list in §7.

Nothing below is applied automatically by this repository.

Official references:

- Main Mini App and direct links: <https://core.telegram.org/bots/webapps#launching-the-main-mini-app>
- Direct Link Mini Apps: <https://core.telegram.org/bots/webapps#direct-link-mini-apps>
- Menu Button: <https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button>
- Loading screen: <https://core.telegram.org/bots/features#customizable-loading-screens>
- Mini App Store / previews: <https://core.telegram.org/bots/features#mini-app-store>

## 0. What the Bot API can and cannot do

| Setting                                   | Bot API                                         | BotFather           |
| ----------------------------------------- | ----------------------------------------------- | ------------------- |
| Commands, descriptions, menu button       | Yes (`setMyCommands`, `setChatMenuButton`)      | Yes                 |
| Main Mini App (URL, short name, previews) | **No**                                          | **Yes, owner only** |
| Splash screen icon/colours                | **No**                                          | **Yes, owner only** |
| Bot public name / About / photo           | Partly (`setMyName`, `setMyDescription`)        | Yes                 |
| Webhook                                   | Yes (`setWebhook`) — do not touch for this task | —                   |

`npm run telegram:configure` sets descriptions, commands and the **Menu
Button** only. It does not configure the Main Mini App. It never changes the
webhook.

## 1. Pre-flight (read-only)

1. Open [@BotFather](https://t.me/botfather) → `/mybots` → `@PierrotAi_bot`.
2. Confirm the username. If it is not `@PierrotAi_bot`, stop and update the plan.
3. Confirm the current Menu Button and Main Mini App values. Record them before
   changing anything.
4. Confirm `https://www.merkurov.love/flow` opens in a normal browser and the
   canonical URL does not redirect to another host.
5. Confirm the apex `https://merkurov.love/flow` redirects to `www` (expected).

Optional server-side checks (never paste the token into chat):

```bash
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getMe"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getChatMenuButton"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getWebhookInfo"
```

## 2. Main Mini App — owner action

**Decision required.** This task prepares Flow as a Main Mini App. The proposed
public launch target is Flow itself; the Menu Button may stay on the broader
Pierrot Lobby. Confirm both before saving.

Recommended (Flow-first):

| Field                      | Proposed value                   | Why                                                                                          |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Enable Main Mini App       | On                               | Adds the profile **Launch app** button and Apps-tab eligibility.                             |
| Main Mini App URL          | `https://www.merkurov.love/flow` | Flow home; canonical origin, HTTPS, no redirect.                                             |
| Short name                 | `flow`                           | Direct link `https://t.me/PierrotAi_bot/flow`. Public-link change — owner approval required. |
| Main Mini App display name | `Flow`                           | If BotFather asks for a title. Do not rename the bot itself.                                 |
| Bot public name            | `Pierrot` (unchanged)            | Do not change without approval.                                                              |

Alternative, only if the owner wants the bot profile to keep opening the
personal Lobby:

| Field             | Value                             |
| ----------------- | --------------------------------- |
| Main Mini App URL | `https://www.merkurov.love/lobby` |
| Short name        | owner choice, e.g. `pierrot`      |

The app supports both. Deep links still resolve to `/flow`, `/flow/<slug>`,
`/lobby`, `/temple` and the other allowlisted sections.

### Sequence in BotFather

1. `/mybots` → `@PierrotAi_bot`.
2. `Bot Settings` → `Main Mini App` / `Configure Mini App`.
3. Choose **Enable Mini App**.
4. Enter the HTTPS URL from the table above. Use the exact `www` host.
5. If asked for a short name, enter the confirmed value. This creates the public
   direct link; do not confirm until the owner approves it.
6. If asked to confirm the domain, confirm only `www.merkurov.love`.
7. Save, then open the bot profile and verify the **Launch app** button.
8. Open the direct link in Telegram and verify it loads Flow, not a chat message.

Do **not** assume `/setminiapp` is a stable command; the documented path is the
BotFather menu above. If a BotFather client shows a `/setminiapp` shortcut, it
opens the same setting. Do not use `http://`, a preview deployment URL, or a URL
with a query string.

## 3. Menu Button — separate setting

Current repository configuration (`setChatMenuButton`): text `Open Pierrot`,
URL `https://www.merkurov.love/lobby`.

Choose one:

- **Keep it** (recommended for this task): public menu button behaviour does not
  change; the Main Mini App is the new Flow entry point.
- Change it only with approval, for example `Open Flow` →
  `https://www.merkurov.love/flow`.

BotFather manual path: `/setmenubutton`. The script equivalent is
`npm run telegram:configure`, which also rewrites descriptions and commands.

## 4. Splash screen (loading screen)

Configure only if the current splash is missing or off-brand. Exact BotFather
fields are validated by the BotFather UI; use these values:

| Field             | Proposed value                                                                     |
| ----------------- | ---------------------------------------------------------------------------------- |
| Icon              | Download `https://www.merkurov.love/icon` (512×512 PNG) and upload it to BotFather |
| Light background  | `#f6f1e8`                                                                          |
| Dark background   | `#141210`                                                                          |
| Light accent/text | `#1d1b18`                                                                          |
| Dark accent/text  | `#f5f0e8`                                                                          |

Asset requirements, as far as they are documented publicly:

- The source image is the public HTTPS `/icon` route; download it and upload the
  file. BotFather rejects unsupported square raster/vector formats.
- The icon must remain legible on both backgrounds and must not contain text
  that becomes unreadable at small sizes.
- Telegram does not publish a guaranteed pixel size for the splash icon in the
  Mini Apps documentation. BotFather is the source of truth; record the exact
  error if a candidate is rejected.

**Do not invent a new Flow logo.** The current `/icon` is a generic heart on a
white square. It is technically usable but not Flow-branded. A proper icon needs
an owner-approved asset. Until then, use the existing asset and record the gap in
the Store-readiness checklist.

## 5. Profile fields (unchanged unless approved)

| Field         | Current / proposed                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Name          | `Pierrot`                                                                                                   |
| About         | `A guide to art, ideas and the world of Anton Merkurov.`                                                    |
| Description   | `Meet Pierrot, Anton Merkurov's digital assistant. Explore art, ideas, projects and Flow on merkurov.love.` |
| Profile photo | Existing approved portrait                                                                                  |
| Commands      | See below                                                                                                   |

```text
/setname
> Pierrot

/setabouttext
> A guide to art, ideas and the world of Anton Merkurov.

/setdescription
> Meet Pierrot, Anton Merkurov's digital assistant. Explore art, ideas, projects and Flow on merkurov.love.
```

## 6. Commands

Public commands:

| Command    | Description                 |
| ---------- | --------------------------- |
| `/start`   | Open Pierrot                |
| `/help`    | Show help and doors         |
| `/privacy` | Manage transcript saving    |
| `/delete`  | Delete the saved transcript |
| `/flow`    | Publish directly to Flow    |
| `/cancel`  | Leave the current Flow mode |

Owner-only commands:

| Command     | Description                |
| ----------- | -------------------------- |
| `/status`   | Current human conversation |
| `/end`      | End the human conversation |
| `/human`    | Human presence commands    |
| `/settings` | Notification settings      |

BotFather `/setcommands` cannot create a separate owner-only scope. Use the
repository script for both scopes:

```bash
# Server-side environment only. Never paste the token into chat.
PIERROT_BOT_TOKEN=... \
PIERROT_OWNER_TELEGRAM_ID=... \
NEXT_PUBLIC_APP_URL=https://www.merkurov.love \
npm run telegram:configure
```

The script prints the bot username from `getMe`, sets descriptions and commands,
and sets the Menu Button. It does not set the Main Mini App or the splash screen.

## 7. Verification after owner configuration

1. Open the bot profile in Telegram: **Launch app** is visible.
2. Cold launch: the app opens Flow (or the chosen Lobby) with no loading loop.
3. Close and reopen: the same entry point loads again.
4. From Flow, open a publication. Telegram Back returns to Flow home.
5. Open `https://t.me/PierrotAi_bot?startapp=flow` in a chat. It opens Flow.
6. Open a crosspost's Mini App link (`?startapp=flow__…`). It opens the exact
   publication.
7. Send `/start`, `/help`, `/flow`, `/cancel`; the bot still answers.
8. Confirm a normal browser at `https://www.merkurov.love/flow` is unchanged.
9. Confirm `/privacy` and the support contact work from inside Telegram.

## 8. Do not do in this task

- Do not rename the bot or change the username.
- Do not change the public description, photo, domain or short name without
  written owner approval.
- Do not change the webhook.
- Do not submit or claim Mini App Store placement.
- Do not enable paid features or Telegram Stars.

Related: `docs/flow-main-mini-app-audit.md` (technical status) and
`docs/flow-mini-app-store-readiness.md` (metadata and media checklist).
