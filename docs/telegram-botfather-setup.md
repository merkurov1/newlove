# BotFather setup — Pierrot

Use the real bot username from the BotFather dashboard. Do not invent or change
the username in this document.

## 1. Profile

Open BotFather, select the Pierrot bot, then set:

| Field         | Value                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Name          | `Pierrot`                                                                                                   |
| About         | `A guide to art, ideas and the world of Anton Merkurov.`                                                    |
| Description   | `Meet Pierrot, Anton Merkurov's digital assistant. Explore art, ideas, projects and Flow on merkurov.love.` |
| Profile photo | Existing Pierrot portrait / approved visual                                                                 |
| Profile video | Optional; same visual language as the site                                                                  |

BotFather commands:

```text
/setname
> Pierrot

/setabouttext
> A guide to art, ideas and the world of Anton Merkurov.

/setdescription
> Meet Pierrot, Anton Merkurov's digital assistant. Explore art, ideas, projects and Flow on merkurov.love.

/setuserpic
```

## 2. Main Mini App

Main entry URL:

```text
https://www.merkurov.love/lobby
```

In BotFather use the Mini App / menu-button settings for the Pierrot bot:

```text
/setminiapp
> https://www.merkurov.love/lobby
```

If your BotFather version exposes a separate Main Mini App and Menu Button
setting, set both to the same URL.

```text
/setmenubutton
> Open Pierrot
> https://www.merkurov.love/lobby
```

Do not point the Main Mini App or Menu Button at `/flow`, `/temple` or `/journal`.
Those are reachable through the Lobby and through safe deep links.

## 3. Commands

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

BotFather `/setcommands` can register the public list, but it cannot create a
separate owner-only scope. Use the repository script for both scopes:

```bash
# Server-side environment only. Do not paste the token into chat.
PIERROT_BOT_TOKEN=... \
PIERROT_OWNER_TELEGRAM_ID=... \
NEXT_PUBLIC_APP_URL=https://www.merkurov.love \
npm run telegram:configure
```

The script also sets:

- English short description and description;
- default public commands;
- a `chat` scope with owner commands for the owner chat;
- the Main Mini App / Menu Button web_app URL.

It never changes the webhook.

## 4. Privacy and data

The bot stores transcript only when the user grants consent. `/privacy on`,
`/privacy off` and `/delete` must remain available.

## 5. Verification

After configuration:

1. Open the bot in Telegram.
2. Confirm the profile name, About, Description and photo.
3. Open the Menu Button: it must load `/lobby`.
4. Send `/start`; the welcome message and door buttons must appear.
5. Send `/help`, `/privacy`, `/flow`, `/cancel`.
6. As the owner, confirm `/status`, `/end`, `/human`, `/settings` appear only in
   the owner chat.
7. Confirm a normal visitor does not see owner-only commands.
