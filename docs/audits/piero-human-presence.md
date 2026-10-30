# PIERO HUMAN PRESENCE — architecture audit, implementation and deployment

Date: 2026-10-30

## 1. What already existed

The audit was performed against the actual repository, not an assumed schema.

| Area | Existing implementation | Reused for human presence |
| --- | --- | --- |
| Visitor chat | `components/PierrotChat.tsx`, `components/pierrot/PierrotContext.tsx`, `components/pierrot/PierrotConversation.tsx` | Same modal, composer and transcript |
| Chat API | `app/api/pierrot-web/route.ts` | Same AI route; human intent and AI blocking added before generation |
| Conversation storage | `pierrot_conversations`, `pierrot_messages`, `pierrot_events` (`migrations/2026-10-29_create_pierrot_conversations.sql`) | Same conversation rows and transcript |
| Idempotent writes | `pierrot_append_message`, `pierrot_record_event` | Reused for human-mode messages/audit events |
| Telegram bot | `app/api/pierrot/route.ts` using `PIERROT_BOT_TOKEN` (grammy) | Same bot, same webhook, same owner chat |
| Telegram helpers | `lib/telegram.ts`, `lib/telegram/pierrotAdapter.ts` | Same Bot API transport |
| Server storage | `lib/pierrot/serverStore.ts`, service-role Supabase client | Same server-only service-role pattern |
| Client identity | random conversation id + session id in `lib/pierrot/clientTelemetry.ts` | Same pair, plus a new recovery token for restarts |
| Realtime | no private Pierrot channel existed | server-mediated polling selected (see §5) |

No second bot, second chat, VPS, Docker container or long-running process was introduced.

## 2. Database changes

Migration: `migrations/2026-10-30_z_create_pierrot_human_presence.sql`

### `pierrot_human_requests`

- `id UUID` primary key.
- `conversation_id` references `pierrot_conversations` (cascade delete).
- `status`: `pending`, `active`, `closed`, `declined`, `expired`.
- `access_token_hash`: SHA-256 of a 256-bit visitor recovery token. The raw token is returned once to the browser and never stored.
- `visitor_label` (`#A821` style), `start_page`, `context_summary` (max 280 chars), `language`.
- `resolved_by`: `owner`, `visitor`, `system`.
- Telegram notification/status message ids.
- timestamps: created, expires, accepted, declined, closed, expired.

Indexes include one pending request per conversation and one active request per conversation.

### `pierrot_human_sessions`

- One row per accepted request (`request_id` unique).
- `status`: `active`, `closed`; `closed_by`.
- `owner_telegram_id`.
- Partial unique indexes enforce:
  - at most one active session per conversation;
  - at most one active session per Anton Telegram account.

The second invariant makes plain Telegram text routing unambiguous and prevents two simultaneous accepts from creating two live conversations.

### `pierrot_human_message_links`

- Metadata only: `message_id` references `pierrot_messages`.
- Direction: `visitor_to_telegram` or `telegram_to_visitor`.
- Telegram chat/message ids and delivery status.
- Unique `message_id`; partial unique `(telegram_chat_id, telegram_message_id)`.
- Message content is **not duplicated**; it remains in `pierrot_messages`.

### Existing tables changed

- `pierrot_messages.role` now allows `user`, `assistant`, `human`.
  - `user` = visitor;
  - `assistant` = Piero;
  - `human` = Anton.
- `pierrot_events` event constraint/function extended with human audit events (`human_requested`, `human_accepted`, `human_declined`, `human_expired`, `human_closed`, `human_message_sent`, `human_message_received`, `human_ai_blocked`).
- `pierrot_append_message` recreated with the extended role contract.
- No existing transcript rows are deleted or rewritten.

## 3. State machine

```text
pending ── accept ──> accepted ──> active ── close ──> closed
   │                     (transactional: accepted_at + session row)
   ├── decline ──> declined
   ├── visitor cancel ──> declined (resolved_by = visitor)
   └── timeout ──> expired
```

`accepted` is an instantaneous transition inside the accept RPC; the observable stored states are `pending`, `active`, `closed`, `declined`, `expired`. This avoids a window in which a request is accepted but no owner session exists.

Race handling:

- `pg_advisory_xact_lock` on the conversation serialises request creation.
- `pg_advisory_xact_lock` on request and owner serialises accept/decline/close.
- `SELECT ... FOR UPDATE` locks the request row.
- Partial unique indexes back-stop the state checks.
- Duplicate accept returns `already_active`, never creates a second session.
- Two different requests accepted at the same time by the same owner: one wins, the other receives `owner_busy`.
- Duplicate decline returns `already_declined`.
- Duplicate close returns `already_closed`.
- Expired pending requests are lazily expired when read or accepted, and `pierrot_human_expire_due()` is available for a cron/manual sweep.

## 4. API and server functions

New server module: `lib/pierrot/humanPresence.ts`

- `createHumanRequest`
- `getHumanPresenceByToken`
- `getHumanPresenceForConversation` (requires both conversation and session ids)
- `getHumanPresenceByRequestId`
- `acceptHumanRequest`
- `declineHumanRequest`
- `expireHumanRequest`
- `closeHumanSession`
- `appendHumanMessage`
- `loadHumanMessages`
- `getActiveHumanSessionForOwner`
- `getHumanPresenceByTelegramMessage`
- `recordHumanEvent`
- `buildHumanStateResponse`
- token/hash/label/context/id helpers

New Route Handlers:

| Route | Purpose |
| --- | --- |
| `POST /api/pierrot/human/state` | Authorized state + recent human transcript |
| `POST /api/pierrot/human/message` | Visitor → Telegram message |
| `POST /api/pierrot/human/action` | Visitor cancel or close |

All handlers use the service-role client only on the server. No service-role credential is sent to the browser.

## 5. Website-to-Telegram and Telegram-to-website transport

### Visitor → Anton

1. Visitor writes in the existing composer.
2. `PierrotContext` sees `humanPresence.status === 'active'` and calls `/api/pierrot/human/message`.
3. The server validates the recovery token or conversation/session pair, verifies the active session, and calls `pierrot_human_append_message`:
   - writes the message to `pierrot_messages` with role `user`;
   - writes the Telegram link metadata;
   - assigns the next per-conversation sequence under an advisory lock.
4. The server sends the message through the existing Piero bot, replying to the original notification where possible.
5. Telegram's returned message id is stored in `pierrot_human_message_links`.

### Anton → website

1. Anton writes plain text to the existing Piero bot.
2. `app/api/pierrot/route.ts` checks the sender is the configured owner, then resolves the conversation from `reply_to_message` or from the single active owner session.
3. `pierrot_human_append_message` writes role `human`.
4. The browser polls `/api/pierrot/human/state`, which returns messages by `message_index` after authorization.
5. Duplicate Telegram updates produce the same deterministic message id and are ignored by the unique constraint.

### Transport choice

Supabase Realtime private channels require an authorization story for anonymous visitors. The existing architecture has no private Pierrot channel. A server-mediated polling endpoint is therefore used as the "equally secure server-mediated realtime mechanism":

- active: every 2 s;
- pending: every 4.5 s;
- first tick after 1.2 s;
- pauses while the tab is hidden;
- never overlaps requests;
- stops immediately when the request is closed/declined/expired;
- requires token or conversation+session on every request.

This avoids unbounded public polling and keeps private data server-mediated.

## 6. AI pause/resume

- `app/api/pierrot-web/route.ts` checks for an active human session **before** any model call.
- If active, it returns HTTP 409 with sanitized human state; no model request is made and no AI message is stored.
- The browser then routes the same text to the human endpoint.
- On the Telegram side, owner text is routed to the visitor while a session is active; after `/end`, the same owner chat returns to normal Piero AI.
- On close/decline/expiry, the stored session/request is no longer active, so the next chat request proceeds through normal Piero AI.
- A late in-flight AI response is aborted when the browser observes the active state.
- The server re-checks the human state after model generation and before persisting/returning the assistant turn. If Anton accepted during generation, the AI answer is dropped with a 409 human-mode response.
- If that race already persisted the visitor's user message through the AI route, the human message endpoint attaches delivery metadata to the existing row and relays it instead of creating a duplicate.

## 7. Security and access control

- New tables have RLS enabled, no anon/authenticated policies, and all privileges revoked from `PUBLIC`, `anon`, `authenticated`.
- Only `service_role` may access tables/functions.
- Visitor authorization:
  - opaque 256-bit token (SHA-256 hash stored server-side); or
  - existing random `conversationId` + `sessionId` pair.
- Predictable ids are never sufficient.
- Recovery token is sent in POST bodies, never query strings.
- No token hashes, Telegram ids or other conversations are returned to the browser.
- Telegram authorization is based on `ctx.from.id` against `PIERROT_OWNER_TELEGRAM_ID`; `callback_data` is only a request locator, never authorization.
- Webhook processing is idempotent via:
  - atomic transition RPCs;
  - deterministic Telegram message ids;
  - unique Telegram message link index.
- Webhook secret token validation uses the existing `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1` mechanism.
- Logs contain operation names and safe codes only; no message content, tokens or Telegram credentials.

## 8. Environment variables

Required for the feature:

```bash
PIERROT_BOT_TOKEN=...                 # existing Piero bot
PIERROT_OWNER_TELEGRAM_ID=123456789   # Anton's numeric Telegram user id
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
PIERROT_HUMAN_REQUEST_TTL_MINUTES=20  # 1..60, default 20
TELEGRAM_WEBHOOK_SECRET=...           # existing
TELEGRAM_WEBHOOK_ENFORCE_SECRET=1     # enable after registering the webhook with the secret
```

Fallback owner resolution: `PIERROT_OWNER_TELEGRAM_ID` → `MY_TELEGRAM_ID` → first entry in `TELEGRAM_ALLOWED_USER_IDS`.

No new `NEXT_PUBLIC_*` secret was introduced.

## 9. Deployment checklist

1. **Database**
   - Apply `migrations/2026-10-30_z_create_pierrot_human_presence.sql` using the project's existing migration workflow. The `z_` prefix intentionally makes it run after `2026-10-30_repair_pierrot_event_constraint.sql`.
   - Verify: `pierrot_human_requests`, `pierrot_human_sessions`, `pierrot_human_message_links` exist; RLS is enabled; `pierrot_messages.role` accepts `human`.
2. **Environment**
   - Set `PIERROT_OWNER_TELEGRAM_ID` to Anton's numeric Telegram id.
   - Confirm `PIERROT_BOT_TOKEN` is the existing Piero bot token.
   - Confirm the owner has opened a private chat with the Piero bot at least once; Telegram cannot deliver a bot message to a user who has never started the bot.
   - Confirm `SUPABASE_SERVICE_ROLE_KEY` exists only in server env (Vercel encrypted env), never in `NEXT_PUBLIC_*`.
3. **Telegram webhook** (only if it is not already registered for the existing bot):
   ```bash
   curl -X POST "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/setWebhook" \
     -d "url=https://www.merkurov.love/api/pierrot" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
     -d "allowed_updates=[\"message\",\"callback_query\"]"
   ```
   Order matters when rotating the secret: register the webhook with the new
   `secret_token` first, then update the same `TELEGRAM_WEBHOOK_SECRET` in
   Vercel and set `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`, then redeploy. The
   other order temporarily rejects every Telegram update.
   Verify:
   ```bash
   curl "https://api.telegram.org/bot${PIERROT_BOT_TOKEN}/getWebhookInfo"
   ```
4. **Vercel**
   - Deploy normally (`main` only per `vercel.json`).
   - No new function exceeds the default execution model; state/message/action routes are short-lived.
5. **Smoke tests**
   - Anonymous visitor asks "Позови Антона"; Anton receives one notification.
   - Accept; visitor sees "Антон здесь." within ~2 s.
   - Anton sends text; visitor sees it; visitor replies; Anton receives it.
   - Anton `/end`; visitor sees closure; next message is answered by Piero.
   - Decline path; expiry path; duplicate webhook delivery; unauthorized Telegram account.

## 10. Testing performed

New tests:

- `lib/pierrot/__tests__/humanIntent.test.ts` — RU/EN natural-language requests and negative biography questions.
- `lib/pierrot/__tests__/humanPresence.test.ts` — token generation/hash, label, deterministic Telegram ids, sanitized public state, owner authorization, context summary.
- `lib/pierrot/__tests__/humanPresenceMigration.test.ts` — RLS/grants, no plaintext token, unique active-session indexes, role extension, audit events, non-destructive migration.
- `app/api/pierrot/human/__tests__/routes.test.ts` — unauthorized access, wrong session pair, closed-session rejection, persistence+relay, duplicate delivery, oversized messages, visitor cancel/close.
- `components/pierrot/__tests__/PierrotHumanPresence.test.tsx` — recovery from token, active state notice, Anton message rendering, routing to human endpoint, pending state.

Run:

```bash
npx jest lib/pierrot/__tests__/humanIntent.test.ts \
  lib/pierrot/__tests__/humanPresence.test.ts \
  lib/pierrot/__tests__/humanPresenceMigration.test.ts \
  app/api/pierrot/human/__tests__/routes.test.ts \
  components/pierrot/__tests__/PierrotHumanPresence.test.tsx \
  --runInBand
```

## 11. Known limitations

- One live human conversation per Anton account. Other requests stay pending until the active one is closed; accepting while busy returns a clear Telegram message.
- Human presence requires transcript consent (`consent.state === 'granted'`), because messages must be stored to be delivered.
- The browser transport is polling, not a websocket. This is deliberate and server-mediated.
- AI context after a human session includes visitor turns and maps Anton's turns to assistant context when the browser sends history. Historical server-side `human` messages are excluded from `loadPierrotHistory` (Telegram AI adapter).
- If a notification cannot be delivered to Telegram, the request is resolved by the system (`declined`, `resolved_by = system`) and the visitor is told Anton is unavailable; the AI continues normally.
- Pending requests expire lazily; an optional scheduled `SELECT public.pierrot_human_expire_due();` can be added if strict expiry cleanup is desired.
- API rate limiting uses the existing in-memory limiter, so it is best-effort per serverless instance. Authorization does not depend on it; tokens, the conversation/session pair and RLS remain the primary controls.
- If the visitor clears site storage during an active session, the recovery token is lost and the browser cannot rejoin that takeover. The website starts a new conversation; Anton can still end the old session from Telegram.
