# BotFather configuration record — Pierrot / Flow Main Mini App

This document records the owner-confirmed Telegram configuration for the Flow
Mini App. It is **not** an instruction to enable or change anything: the owner
has confirmed that the required BotFather settings are already enabled.

Do not change the bot username, public name, About/Description, profile photo,
domain, Main Mini App URL, short name, menu button or webhook as part of a Flow
code task. No token belongs in this document or in chat.

Bot: **`@PierrotAi_bot`**

## 1. What is confirmed

| Setting                  | Status                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Main Mini App            | Owner-confirmed enabled in BotFather.                                                                                  |
| Public direct-link name  | `flow` — `https://t.me/PierrotAi_bot/flow` resolves to **Open App**.                                                   |
| `startapp` launch        | `https://t.me/PierrotAi_bot?startapp=flow` and `?startapp=flow__…` resolve to **Open App**.                            |
| Menu Button              | Repository configuration is `Open Pierrot` → `https://www.merkurov.love/lobby`; unchanged by this task.                |
| Canonical host           | `https://www.merkurov.love`; the apex host redirects to `www` in `next.config.js`.                                     |
| Main Mini App target URL | Owner-controlled BotFather value. It may be `/flow` (Flow-first) or `/lobby` (Lobby-first); both routes are supported. |
| Webhook                  | Out of scope. Do not change it while working on the Mini App shell.                                                    |

The public `t.me` preview was checked without a bot token. It proves that the
direct-link short name and `startapp` routes exist; it cannot prove what the
installed Telegram client renders after opening. See
`docs/flow-main-mini-app-audit.md` for the verification matrix.

## 2. Read-only diagnostics

Run these only in a trusted server shell when diagnosing a real problem. Never
paste the token or full `initData` into chat or a document.

```bash
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getMe"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getChatMenuButton"
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getWebhookInfo"
```

Record only `username`, the menu-button type/URL, `url`,
`pending_update_count`, `last_error_date` and `last_error_message`.

The Bot API cannot read or write the Main Mini App URL, short name, icon or
splash screen. Those remain BotFather-only and owner-only. The repository's
`npm run telegram:configure` script sets descriptions, commands and the menu
button; it does not configure the Main Mini App and does not touch the webhook.

## 3. The one remaining check that needs a device

Everything else is covered by code, unit tests, a production build and a
mocked-Telegram browser run. The installed Telegram client is the only surface
this environment cannot automate. Open these links once on iOS and once on
Android:

1. `https://t.me/PierrotAi_bot/flow` — cold launch. The Flow index must appear
   without a loading loop.
2. Close the Mini App, then open `https://t.me/PierrotAi_bot/flow` again.
3. Open a Flow publication, then press Telegram Back. It must return to
   `/flow`, not to a blank page or a chat.
4. Open a crosspost link of the form
   `https://t.me/PierrotAi_bot?startapp=flow__…`. It must open the exact
   publication.
5. Repeat on the other platform.

If any step fails, record the platform, Telegram version, URL and the visible
symptom. Do not change public bot settings to work around a code issue.

## 4. Explicit non-goals

- No Mini App Store application or catalog submission. The catalog is a
  separate, later decision for Temple, not Flow.
- No rename, new bot, new domain, paid feature or Telegram Stars.
- No change to Telegram crossposting or the Flow publication pipeline.
