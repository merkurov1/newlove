# Pierrot Identity, Session Attribution & Visitor Analytics — Audit

**Date:** 2 November 2026  
**Repository:** `merkurov1/newlove`  
**Mode:** read-only audit before implementation.

---

## 1. Current identity mechanics

### 1.1. Browser session identifiers

`lib/pierrot/clientTelemetry.ts` currently stores:

| Key                          | Storage          | Lifetime                | Purpose                     |
| ---------------------------- | ---------------- | ----------------------- | --------------------------- |
| `pierrot_session_id_v1`      | `sessionStorage` | one tab session         | per-tab chat session        |
| `pierrot_conversation_id_v1` | `sessionStorage` | one tab session / reset | conversation id             |
| `pierrot_consent_v1`         | `localStorage`   | until cleared           | transcript/metadata consent |

Both ids are random UUIDs from `createPierrotId()`. There is **no persistent visitor id** today. A returning visitor is indistinguishable from a new visitor.

### 1.2. Server identity

`app/api/pierrot-web/route.ts` resolves identity in this order:

1. Supabase cookie session (`getCurrentUser`) → `role === 'ADMIN'` sets `ragOwnerAuthorized`.
2. Telegram webhook owner: internal secret + allowlisted `x-telegram-owner-id` → owner persona.
3. Verified Telegram Mini App initData / Bearer JWT / cookie admin via `requireAdminFromRequest` → owner, excluding the `system-admin` service identity.
4. `x-admin-key` and shared secrets alone never unlock owner Brain.

This is the correct security boundary and must be preserved. However:

- the resolved owner identity is used only for `ownerMode`/Brain access;
- it is **not written to the conversation row**;
- `pierrot_conversations.user_id` exists in production but every row is `null`;
- no visitor id is written;
- no server-verified attribution timestamp/source exists.

### 1.3. Conversation creation

`ensurePierrotConversation()` inserts/updates:

- `id`, `session_id`, `start_page`, `referrer`, `language`;
- `consent_state`, `consent_version`, timestamps, retention.

It does not receive or persist identity. The client events route (`/api/pierrot/events`) also creates a conversation with no identity.

### 1.4. Where identity is lost

| Point                       | Loss                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Browser chat request        | sends conversation/session ids, no persistent visitor id                                            |
| Server route                | derives owner for access, then drops it before persistence                                          |
| `ensurePierrotConversation` | has no identity input                                                                               |
| Client events route         | creates/updates conversation without owner or visitor                                               |
| Telegram adapter            | owner headers verified in web route, not stored in the conversation                                 |
| New tab                     | new `session_id` and `conversation_id`; no shared visitor id                                        |
| Returning visit             | sessionStorage is gone; no visitor id                                                               |
| Owner logout                | old transcript is cleared client-side, but no identity boundary is recorded in the new conversation |
| Analytics                   | treats every row as an undifferentiated conversation                                                |

### 1.5. Why current assumptions are unsafe

- `user_id IS NULL` does **not** prove visitor.
- `/admin*` does **not** prove owner.
- `session_id` alone cannot distinguish owner from visitor.
- IP, user-agent and fingerprint are deliberately not used and must not be introduced.
- Message text must not be used to infer identity.
- Client-provided `is_owner`, `owner`, `identity_type` or `user_id` must never be trusted.

---

## 2. Production evidence (read-only)

Window: last 30 days (from 2026-10-03).

| Metric                                  | Value |
| --------------------------------------- | ----: |
| Conversations                           |   127 |
| Unique `session_id`                     |    79 |
| Conversations with `user_id`            | **0** |
| Sessions that touched `/admin*`         |    12 |
| Sessions without `/admin*`              |    67 |
| Conversations in admin-touched sessions |    15 |
| Conversations in other sessions         |   112 |
| Consent granted                         |   124 |
| Consent pending                         |     3 |
| Consent denied                          |     0 |

Interpretation:

- None of the 127 conversations has a server-verified user link.
- Admin-page visits are a **hint**, not proof: the owner may test public pages, and other people may open an admin URL without access.
- Therefore **all 127 historical conversations must be `unknown`** unless a future trusted authentication record proves otherwise. There is no such record today.
- The 67 non-admin sessions must not be automatically counted as 67 visitors.

---

## 3. Data that can support reliable attribution

| Signal                                                  | Reliable?                           | Use                                |
| ------------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| Supabase ADMIN cookie session                           | yes                                 | owner, source `supabase_session`   |
| Verified Bearer JWT with ADMIN role                     | yes                                 | owner, source `bearer_jwt`         |
| Verified Telegram Mini App initData + allowlist         | yes                                 | owner, source `telegram_init_data` |
| Telegram webhook internal secret + allowlisted owner id | yes, for the existing Telegram flow | owner, source `telegram_owner`     |
| Random first-party visitor id after consent             | yes, pseudonymous                   | visitor                            |
| `session_id`                                            | no                                  | session grouping only              |
| Visit to `/admin`                                       | no                                  | never identity proof               |
| `user_id = null`                                        | no                                  | stays unknown                      |
| IP / user-agent / fingerprint                           | forbidden                           | not collected                      |
| Message text                                            | no                                  | never used for identity            |

---

## 4. Minimal necessary changes

1. Add attribution fields to `pierrot_conversations`:
   - `identity_type` (`owner` / `visitor` / `unknown`);
   - `visitor_id` (nullable random pseudonym);
   - `user_id` (existing column, used only for verified UUID users);
   - `identity_verified_at`;
   - `identity_source`.
2. Resolve identity server-side from existing trusted auth only; client identity flags ignored.
3. Create a persistent first-party visitor id in `localStorage`, only after explicit consent.
4. Pass the visitor id with chat and event requests; server validates it and owner always takes precedence.
5. Persist identity on conversation creation; owner upgrades may replace visitor attribution; visitor/anonymous updates must never overwrite owner.
6. Add identity filters and separate owner/visitor/unknown metrics to the existing analytics snapshot; keep Unknown out of visitor totals.
7. Do not backfill history by guessing.
8. Keep code functional before the migration is applied: chat must continue even when the new columns do not exist.

---

## 5. Required migration

Additive only:

- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the five fields;
- check constraints for identity values, visitor-id format, source values and consistency;
- indexes on `(identity_type, started_at)`, `visitor_id` and `user_id`;
- no RLS/grant changes;
- no destructive operation;
- no backfill.

The migration is in `migrations/2026-11-12_pierrot_identity_attribution.sql`. It must be applied manually before identity metrics become complete.

---

## 6. Identity lifecycle

```text
Request
  │
  ├─ verified ADMIN session / JWT / Telegram owner? ── yes ──► owner
  │                                                       user_id when UUID exists
  │                                                       verified_at = now
  │
  ├─ no owner + consent granted + valid visitorId? ───── yes ──► visitor
  │                                                       visitor_id = pseudonym
  │                                                       verified_at = null
  │
  └─ otherwise ───────────────────────────────────────────────► unknown
                                                          no visitor_id
                                                          no user_id
```

Owner is always decided before visitor. A visitor id can never grant owner mode, Brain access or owner tools.

---

## 7. Historical classification plan

- Keep every existing row at `identity_type = 'unknown'`.
- Do not update rows based on `/admin`, null `user_id`, session grouping, IP or message text.
- Report 127 unknown conversations / 79 unknown sessions.
- If a trusted auth record is later discovered that proves ownership for a specific conversation, update only that row with an explicit source and audit note. No bulk backfill.

---

## 8. Acceptance risks

| Risk                             | Control                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| Owner tests counted as visitors  | owner precedence from verified credential; separate metrics   |
| Visitor can self-assign owner    | server ignores all client owner fields                        |
| New tab creates a new visitor    | visitor id in `localStorage`, session id remains per tab      |
| Storage cleared merges users     | new random visitor id; old id is never reused                 |
| Shared device                    | visitor id is rotated on auth sign-in/sign-out/account change |
| Pre-migration deploy breaks chat | missing-column fallback in conversation store and analytics   |
| Unknown inflated into visitor    | explicit `unknown` bucket, never included in visitor totals   |
| Historical guesses               | no backfill; all historical rows unknown                      |
