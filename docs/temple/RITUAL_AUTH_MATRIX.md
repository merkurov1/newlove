# Temple ritual authorization matrix

Status: implemented 2026-11-25. This document is the contract for Temple
ritual identity and authorization. It records repository code; it does not
claim that a database migration was applied to production.

## 1. Principles

1. Public Temple pages, the Vigil, Chronicles/Traces and public ritual results
   never require registration.
2. A Telegram Mini App participant is authenticated by a verified
   `temple_session`, created only from raw, HMAC-signed `initData`. Google or
   Supabase Auth is not requested for an action that only needs Temple identity.
3. A normal browser uses the existing Supabase Auth session (Google, email OTP,
   passkey or wallet).
4. Every mutation endpoint resolves identity on the server. Client flags,
   `username`, `displayName`, `initDataUnsafe`, query parameters and supplied
   ids are never proof of identity.
5. Telegram identity is the Telegram numeric user id namespaced as `tg:<id>`.
   Supabase identity is the Supabase UUID namespaced as `sb:<uuid>`. They are
   never merged by username, display name or email.
6. A claimed display name is only a label. It never selects a cooldown row,
   grants a role, links accounts or authorizes a mutation.

## 2. Server identity resolution

Single implementation: `lib/temple/identity.ts` (`resolveTempleIdentity`).
`lib/vigil/identity.ts` re-exports it as `resolveVigilIdentity` for historical
callers.

Precedence:

1. An explicit bearer token is verified first. A valid signed Telegram session
   JWT returns `source: 'telegram'`; otherwise the token is verified with
   Supabase Auth and returns `source: 'supabase'`.
2. If no bearer is present, the HttpOnly `temple_session` cookie is verified as
   a signed Telegram session.
3. No credential means anonymous. A forged, stale or malformed credential
   resolves to anonymous and cannot be upgraded by a client body field.

| Identity | Key | Stored UUID | Display name source |
| --- | --- | --- | --- |
| Telegram | `tg:<numeric telegram id>` | never (stays `null`) | signed session payload |
| Supabase | `sb:<supabase uuid>` | Supabase UUID | `public.profiles.name`, `public.users.name`, metadata, then email prefix |
| Anonymous | none | `null` | explicit public label only, never treated as a user |

`/api/temple/auth` is the only place that exchanges Telegram `initData` for a
session. It verifies the HMAC, freshness and user payload before signing the
HttpOnly `temple_session` cookie. No Google prompt is involved.

## 3. Ritual / action matrix

| Action | Public route | Client guard | Server mutation | Identity resolver | Namespace | Cooldown / limits | Persistence and access | Telegram behavior | Browser behavior | Anonymous behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Temple home + Chronicles/Traces | `/temple` | none | none (read only) | none | none | feed cache TTL + `GET /api/temple_logs` reads only | `temple_log` select policy for anon/authenticated; writes only through server routes | Reads freely, no auth prompt | Reads freely | Reads freely |
| Keep Calm | `/heartandangel/calm` (`/temple` modal) | none | best-effort `POST /api/temple_logs` only after the shared 30 s completion threshold | optional `resolveTempleIdentity` in `/api/temple_logs` | `tg:` / `sb:` only when verified | shared client/server threshold; trace rate limit 20/min/IP | canvas is local; early exits write nothing; trace via service role | Works without Google; verified name used when session exists | Works without sign-in | Works; anonymous label only |
| Let It Go | `/heartandangel/letitgo` (modal) | none | best-effort `POST /api/temple_logs` on leaving the scene | same as Calm | same as Calm | same as Calm | same as Calm | Works without Google | Works without sign-in | Works; anonymous label only |
| Vigil spark | `/vigil` (modal) | `useTempleIdentity`; native BottomButton in Telegram, in-scene button in browsers | `POST /api/vigil/claim` | `resolveTempleIdentity` (Telegram session or Supabase bearer) | `tg:<id>` or `sb:<uuid>` | 24 h per namespace key; `POST` 20/min/IP; `GET` 60/min/IP; `GET /api/vigil/state` 120/min/IP | `vigil_spark_claims` private (RLS on, no policies, service role only); `vigil_hearts` public read, server write only; `temple_log` server write only | One native action when `BottomButton` is acquired; an in-scene fallback appears if the SDK is late, unsupported or still owned by another route | Supabase session sparks with the in-scene button | Can witness the flame; spark returns 401 |
| Absolution | `/absolution` (modal) | name field required for the local ceremony | best-effort `POST /api/temple_logs` as an anonymous completion-only event | server write allowlist in `/api/temple_logs` | never public | trace rate limit 20/min/IP | certificate stays in the browser; public trace contains no name, burden or confession text; legacy rows redacted on read | Works without Google | Works without sign-in; editable display name stays local | Works; public trace is always `Anonymous` |
| Cast | `/cast` (modal) | disclosure precedes the first question; answers only; no account required | `POST /api/cast`; optional `POST /api/cast/capture` with signed capture token | `resolveTempleIdentity` in `/api/cast` | `tg:<id>` or `sb:<uuid>`; anonymous has none | trace limiter as above; capture token is HMAC-bound to record id + creation time | signed-in answers and every analysis stay in the private `casts` table; anonymous protocols do not retain raw answers; only the completed ritual appears in `temple_log` | Participates without Google; verified Telegram name and no invented UUID | Supabase user recorded with UUID/email | Participates anonymously after seeing the disclosure |
| Tribute / Support | `/tribute`, `/temple/support` | amount validation is client-side for UX | `POST /api/tribute/checkout`; `GET /api/tribute/verify`; `POST /api/stripe/webhook` | none by design: guest and signed-in donors use the same payment flow | none | verify 30/min/IP; Stripe owns payment anti-abuse | `tributes` writes only after server-side Stripe retrieval or verified webhook; `temple_log` TRIBUTE signal is server-only | Opens the same hosted Stripe Checkout; no Google prompt | Same hosted Stripe Checkout | Same hosted Stripe Checkout; no registration |
| Shared group Vigil | `/vigil` from a Telegram group | none | `POST /api/telegram/group-vigil` (`join` / `leave` / `status`) | `verifyGroupVigilContext` from signed `initData` | Telegram group id + signed `chat_instance`; participant is Telegram numeric id | 30/min/IP | `telegram_group_vigil_*` private (RLS on, no policies, service role only) | Works only inside Telegram; group context is never taken from a client body field | Not available | Not available (no Telegram group context) |
| Whisper capture | `/temple/whispers` | owner UI | `POST /api/whispers`; `POST /api/whispers/reply` | `requireAdminFromRequest` | Supabase admin UUID or allowlisted Telegram admin | 10/min and 20/min/IP | `whispers` private; service role only | Allowlisted Telegram admin only | Supabase admin only | Rejected 401 |
| Live Heart share | `/liveheart` | none | `POST /api/liveheart/save` | none: this creates a public share, not an identity action | none | 20/hour/IP | `liveheart_shares` private (RLS on, no Data API grants); service role only | Works | Works | Works |

"Trace rate limit" refers to `POST /api/temple_logs` (20 requests/minute/IP).
`VIGIL_SPARK`, `TRIBUTE` and the trusted server-only event types cannot be
written through that public trace endpoint.

## 4. Endpoint inventory

| Endpoint | Method | Authorization result |
| --- | --- | --- |
| `/api/temple/auth` | POST | Verified Telegram `initData` only |
| `/api/temple/me` | GET | Verified Supabase cookie session or signed `temple_session`; ignores legacy `temple_user` |
| `/api/vigil/state` | GET | Public read-only aggregate |
| `/api/vigil/claim` | GET | Public status; `authenticated: false` without a verified identity |
| `/api/vigil/claim` | POST | Requires verified Temple identity; atomic 24 h claim |
| `/api/cast` | POST | Public; verified identity is recorded when present |
| `/api/cast/capture` | POST | Requires the HMAC capture token for the exact record |
| `/api/temple_logs` | GET | Public feed |
| `/api/temple_logs` | POST | Public trace; a verified identity overrides the body author, but grants nothing |
| `/api/telegram/group-vigil` | POST | Verified Telegram `initData` with signed group context |
| `/api/tribute/checkout` | POST | Public payment initiation; server validates amount/currency |
| `/api/tribute/verify` | GET | Public; confirms only a paid Stripe session |
| `/api/stripe/webhook` | POST | Stripe signature verification |
| `/api/whispers` | POST | Admin (`requireAdminFromRequest`) |
| `/api/whispers/reply` | POST | Admin (`requireAdminFromRequest`) |
| `/api/liveheart/save` | POST | Public share creation |

## 5. Cooldown semantics decision

The Vigil cooldown key is the namespaced identity (`tg:<id>` or `sb:<uuid>`).
Telegram and Supabase records are deliberately not merged, so a person who can
present both identities has two independent 24-hour windows. This is an
explicit decision, not an accidental bypass:

- merging by email/username would violate the identity policy and would let an
  attacker claim another person's cooldown;
- the server also applies a per-IP rate limit (20 claims/minute) as a separate
  anti-abuse layer;
- a single identity cannot bypass its own 24-hour window: the conditional
  `UPDATE ... WHERE last_spark_at <= now() - 24h` is atomic, and concurrent
  requests produce exactly one successful claim.

Changing this decision later requires a product-level identity-linking flow,
not an implicit lookup by display name or email.

## 6. Exceptions and their justification

| Exception | Why it is not a protected mutation |
| --- | --- |
| Calm, Let It Go, Absolution trace writes | The ritual itself is local; the trace is a public, best-effort chronicle. It changes no ownership, payment or private record. A verified name is used when available, but an anonymous label grants nothing. |
| Cast without an account | Cast is intentionally open. When a credential is supplied it is verified and recorded; an invalid credential is ignored rather than converted into a privileged identity. |
| Tribute checkout | The product requirement is a guest donation. Identity is not needed to pay; payment truth comes only from Stripe server retrieval/webhook, never from the browser. |
| Shared group Vigil | Available only from a signed Telegram group launch; the browser has no group context, so there is no alternate identity to accept. |
| Legacy `POST /api/temple/log` and `POST /api/absolution/save-receipt` | Not called by any current ritual UI. They remain public utilities and are not used for ownership or payment. They should be removed or guarded in a separate cleanup, not silently given a new auth contract here. |

## 7. Payment invariants

Unchanged by this work:

- amounts and currency validation (`/api/tribute/checkout`);
- Stripe line item name, destinations and success/cancel URLs;
- `tribute_v1` metadata and the existing webhook;
- confirmation only through a paid Stripe session retrieved server-side or a
  verified webhook;
- duplicate protection through `tributes.stripe_session_id`;
- no registration requirement for paying.

## 8. Verification

Implemented tests cover:

- shared identity namespaces, forged sessions and the ignored legacy
  `temple_user` cookie (`lib/temple/__tests__/identity.test.ts`,
  `lib/vigil/__tests__/identity.test.ts`);
- anonymous, Telegram and Supabase Vigil claims plus atomic cooldown and
  namespace separation (`app/api/vigil/claim/__tests__/route.test.ts`,
  `lib/vigil/__tests__/claim.test.ts`);
- anonymous, Telegram and Supabase Cast attribution
  (`app/api/cast/__tests__/route.test.ts`);
- public trace author override and rejection of server-only event types
  (`app/api/temple_logs/__tests__/route.test.ts`);
- existing Tribute payment tests
  (`app/api/tribute/*/__tests__/route.test.ts`,
  `lib/tributes/__tests__/paymentConfirmation.test.ts`).

Residual risks: this repository cannot prove production RLS/grant state or
verify a real Telegram client from unit tests. Those remain deployment checks.
