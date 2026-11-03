# Telegram operations — Pierrot

## 1. Environment

Required for the primary Pierrot bot:

```env
PIERROT_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_WEBHOOK_ENFORCE_SECRET=1
TELEGRAM_ALLOWED_USER_IDS=...
PIERROT_OWNER_TELEGRAM_ID=...
NEXT_PUBLIC_APP_URL=https://www.merkurov.love
```

Optional:

```env
TELEGRAM_MINI_APP_URL=https://www.merkurov.love/lobby
OPENAI_API_KEY=...                 # existing provider; voice transcription only
TELEGRAM_BOT_WEBHOOK_ENFORCE_SECRET=1  # only if /api/bot has its own bot token
```

Never add bot tokens or webhook secrets as `NEXT_PUBLIC_*`.

## 2. Webhook discovery before any change

Do not guess. For each real bot token, run server-side:

```bash
curl -s "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getWebhookInfo"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Record the `url`, `pending_update_count`, `last_error_date` and
`last_error_message`.

Rules:

- One token → one webhook URL.
- `/api/pierrot` is the primary Pierrot bot endpoint.
- `/api/bot` is the legacy owner research bot and must use a different token.
- `/api/telegram/webhook` is legacy draft ingestion; do not register it for the
  same token that already points at `/api/pierrot`.
- Do not delete old endpoints until `getWebhookInfo` proves they are unused.

## 3. Safe production webhook change

Use this order to avoid losing the working bot:

1. Deploy the new code **without** enabling enforcement. Confirm the current
   bot still answers.
2. Confirm `TELEGRAM_WEBHOOK_SECRET` is a valid Telegram `secret_token`
   (`A-Z`, `a-z`, `0-9`, `_`, `-`, 1–256 chars).
3. Set the Vercel variables:
   - `TELEGRAM_WEBHOOK_SECRET=<same value>`
   - `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`
4. Redeploy.
5. Re-register the primary webhook with the same secret:

```bash
curl -s -X POST \
  "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/setWebhook" \
  -d "url=https://www.merkurov.love/api/pierrot" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"
```

6. Run `getWebhookInfo` again. `url` must match and there must be no new
   delivery error.
7. Send `/start` and one normal message from Telegram.
8. Only after success, consider the same procedure for `/api/bot` with
   `TELEGRAM_BOT_WEBHOOK_ENFORCE_SECRET=1` if it uses its own token.

If the bot stops answering, set enforcement back to `0`, redeploy, and inspect
`getWebhookInfo` before trying again. Never register a second URL for the same
token.

## 4. Supabase migrations

Prepare and run manually from the Supabase SQL editor:

1. `migrations/2026-11-14_telegram_flow_sessions.sql`
   - direct Flow mode state;
   - service-role only;
   - 30-minute state TTL enforced by application code;
   - optional cleanup function.

2. `migrations/2026-11-15_telegram_notifications.sql`
   - owner notification category preferences;
   - deduplicated delivery claims;
   - service-role only.

No migration is applied automatically by deployment.

Pre-existing relevant migrations (verify in Supabase before relying on them):

- `migrations/2026-10-30_z_create_pierrot_human_presence.sql`
- `migrations/2026-10-31_z_restore_event_contract_and_human_activity.sql`
- `migrations/2026-10-31_zz_fix_human_session_close_ambiguity.sql`
- `migrations/2026-11-09_flow_ai_public_rag.sql`
- `migrations/2026-11-13_flow_crosspost_meta_channels.sql`

## 5. Bot configuration

Run once from a trusted local environment:

```bash
PIERROT_BOT_TOKEN=... \
PIERROT_OWNER_TELEGRAM_ID=... \
NEXT_PUBLIC_APP_URL=https://www.merkurov.love \
npm run telegram:configure
```

The script sets profile descriptions, command scopes and the Main Mini App /
Menu Button. It does not change the webhook.

## 6. Flow direct publish operations

- `/flow` is owner-only.
- The selected mode expires after 30 minutes.
- `/cancel` clears it.
- Publication uses the shared `lib/flow/publish.ts` service and existing
  crosspost engine.
- Deterministic slug `tg-<chat>-<message>` makes update redelivery idempotent.
- If the Flow-state table is missing, the bot should report temporary
  unavailability and normal Pierrot chat must continue.

## 7. Notification operations

Owner categories:

- Human requests
- Flow / crossposting
- Art Engine
- Pierrot
- System

`/settings` toggles the categories. Delivery claims are deduplicated by
`(telegram_user_id, event_key)`. There are no retry loops; a failed delivery is
recorded and a new event should be emitted later if needed.

## 8. Incident checks

1. `getWebhookInfo` for the affected token.
2. Vercel logs for `/api/pierrot` (no token/secret values).
3. Supabase: `telegram_flow_sessions` and `telegram_notification_deliveries`.
4. Confirm `flow_ai_context` and `distributions` writes for published items.
5. Confirm `/api/pierrot-web` is reachable from the bot runtime.
6. If AI is down, confirm the bot returns a short failure message and does not
   create a partial Flow item.
