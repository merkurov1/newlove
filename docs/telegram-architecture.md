# Telegram architecture — Pierrot / merkurov.love

Status snapshot: 2026-11-03. This document describes the code that actually
exists in the repository, not a planned architecture.

## 1. Bots and tokens

| Bot / purpose                                      | Token                                                                  | Main endpoint           | Notes                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pierrot assistant + Mini App + Flow direct publish | `PIERROT_BOT_TOKEN`                                                    | `/api/pierrot`          | Primary bot. Uses grammY. Owner commands and human presence live here.                                                             |
| Legacy owner research bot                          | `TELEGRAM_BOT_TOKEN`                                                   | `/api/bot`              | Separate grammY bot for owner research/draft tools.                                                                                |
| Legacy content webhook                             | first of `PIERROT_BOT_TOKEN`, `OSIRIS_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN` | `/api/telegram/webhook` | Saves allowed Telegram messages as private Flow drafts. Do not register this URL for a token that already has a different webhook. |
| Legacy channel/notification token                  | `OSIRIS_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` fallback                     | outbound only           | Used by older Flow/notification helpers.                                                                                           |

**Critical rule:** one bot token can have exactly one webhook URL. Before any
webhook change, run `getWebhookInfo` for each token and record the current URL.
Never point two endpoints at the same token.

The repository cannot prove which webhook URL is registered in production
without the real tokens. Use the owner checklist in `docs/telegram-operations.md`.

## 2. Endpoints

| Endpoint                     | Auth                                                                                                              | Purpose                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /api/pierrot`          | Telegram secret token (opt-in via `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`)                                            | Pierrot bot updates. Public commands, owner commands, human presence, Flow publishing, notifications. |
| `POST /api/bot`              | Telegram secret token (opt-in via `TELEGRAM_BOT_WEBHOOK_ENFORCE_SECRET=1` or `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`) | Legacy owner research bot.                                                                            |
| `POST /api/telegram/webhook` | Mandatory `X-Telegram-Bot-Api-Secret-Token`                                                                       | Legacy draft ingestion. Fails closed if no secret is configured.                                      |
| `POST /api/pierrot-web`      | Internal secret / verified Telegram initData / Supabase session                                                   | Shared Pierrot AI pipeline. The Telegram bot calls it server-to-server.                               |
| `POST /api/temple/auth`      | Verified Telegram initData only                                                                                   | Temple Mini App session.                                                                              |
| `POST /api/flow/items`       | Admin                                                                                                             | Flow creation, publication, crossposting and AI context.                                              |
| `POST /api/flow/crosspost`   | Admin                                                                                                             | Retry/independent channel crossposting.                                                               |

## 3. Identity and data links

- Telegram chat ID is hashed into deterministic Pierrot conversation/session
  IDs by `lib/telegram/pierrotAdapter.ts`. There is no automatic Supabase
  `users` account creation from Telegram.
- The owner identity is never taken from message text or callback data.
  `/api/pierrot-web` accepts an owner request only when the internal secret and
  an allowlisted `x-telegram-owner-id` are both present.
- Mini App initData is verified server-side by
  `lib/telegram/initData.ts`. `initDataUnsafe` is never used as identity.
- `requireAdminFromRequest` accepts a verified admin Telegram initData only for
  IDs in `TELEGRAM_ALLOWED_USER_IDS`.
- `app/api/temple/auth` creates a separate signed Temple session only after
  `verifyTelegramInitData` succeeds.
- Flow items created through Telegram store `metadata.source = 'telegram'`,
  user/chat/message IDs and the selected mode. The item itself remains a normal
  row in `items`.
- `distributions` mirrors crosspost state; `items.metadata.crosspost.channels`
  remains the canonical crosspost state.

## 4. Mini App

- `components/useIsTelegram.ts` detects a real Mini App by the presence of
  `Telegram.WebApp.initData`. It never treats `initDataUnsafe` as auth.
- `components/TelegramMiniApp.tsx` handles `ready`, `expand`, optional
  fullscreen, safe/content safe area, viewport, theme params, BackButton and
  haptic feedback.
- Main entry route is `/lobby`.
- `lib/telegram/miniAppRoutes.ts` resolves only allowlisted `startapp`
  parameters: `lobby`, `flow`, `journal`, `temple`, `selection`, `art`, and a
  concrete Flow slug encoded as `flow__<base64url-slug>`.
- Flow, Temple and Journal remain normal Next.js routes; there are no duplicate
  Mini App pages.

## 5. Flow direct publish

`POST /api/pierrot` handles:

1. `/flow` — owner-only mode picker.
2. Callback `flow:mode:<mode>` — stores a 30-minute mode bound to user + chat.
3. Next text/photo message — calls `lib/telegram/flowPublish.ts`.
4. `createFlowItem` in `lib/flow/publish.ts` creates a published/public item
   immediately, then uses the existing crosspost engine.
5. `/cancel` clears the mode.
6. Deterministic slug `tg-<chat>-<message>` prevents duplicate publication when
   Telegram redelivers the same update.

There is no draft step and no confirmation step. Unsupported attachments get an
explicit reply and do not create an empty item.

## 6. Existing behaviour preserved

- Existing Telegram/Bluesky/Facebook/Threads crossposting.
- Existing `/api/telegram/webhook` draft ingestion.
- Existing `/api/bot` legacy owner research bot.
- Existing human handoff (`Accept`, `Decline`, `/status`, `/end`).
- Existing Pierrot web AI pipeline, Brain and offer policy.
- Existing site design.

## 7. Security invariants

- Webhook secret comparison is timing-safe.
- Enforcement endpoints fail closed when enforcement is enabled but the secret
  is missing.
- initData is signature- and `auth_date`-validated; stale/future data is
  rejected.
- Owner commands are checked against `TELEGRAM_ALLOWED_USER_IDS` / owner ID.
- Flow publishing is restricted to the owner account.
- Callback data is not authorization.
- No bot token, OAuth secret, authorization code or raw message content is
  written to logs.
- Message and callback payloads are bounded before database or Telegram calls.

## 8. Notifications

`lib/telegram/notifications.ts` defines five owner categories:

- Human requests
- Flow and crossposting
- Art Engine
- Pierrot dialogue
- System

Preferences are stored in `telegram_notification_preferences`; delivery claims
are deduplicated in `telegram_notification_deliveries`. `/settings` exposes the
toggles to the owner only. Existing human-request notifications remain in place.

## 9. Known integration boundaries

- Art Engine and system events do not yet call the notification helper directly.
- Photo vision is not enabled in the shared Pierrot pipeline; photos are used for
  Flow Media mode and are otherwise explained to the user.
- Voice transcription uses the existing OpenAI transcription provider and is
  disabled gracefully when `OPENAI_API_KEY` is absent.
- Production webhook registration is an owner action and must be verified with
  `getWebhookInfo`.
