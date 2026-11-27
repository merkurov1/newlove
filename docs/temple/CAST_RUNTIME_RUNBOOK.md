# Cast runtime runbook

Scope: `/cast`, `POST /api/cast`, `POST /api/cast/capture`, the private `casts`
record and the public Temple trace. This runbook describes repository behaviour;
it does not claim that the migration is applied in production.

## 1. Submit pipeline

```
client (10 answers, language, optional Supabase bearer)
  → POST /api/cast
      → verify identity server-side (resolveTempleIdentity)
      → shared rate limit (postgres, hashed bucket)
      → idempotency lookup by x-idempotency-key
      → DeepSeek direct, then OpenRouter fallback
      → validate structure + reject clinical claims
      → insert into casts (service role, status from identity)
      → public temple_log trace (archetype only)
  → response: analysis, recordId, captureToken (+ expiresAt)
```

### Identity and status

`status` is derived only from a verified credential:

| Credential | `user_id` | `status` |
| --- | --- | --- |
| Supabase bearer / cookie session | Supabase UUID | `identified` |
| Telegram `temple_session` | `null` (never a Telegram id) | `anonymous` |
| none / forged | `null` | `anonymous` |

Client-supplied `status`, `user_id`, `author` are ignored. The 2026-11-26
incident row that had `user_id` + `email` with `status = 'anonymous'` cannot be
produced by this code path.

### Raw answers

- anonymous → `answers = {}`
- Telegram → `answers = {}`
- Supabase owner → `answers` only when the request says
  `retain_answers: true` (UI checkbox, default off)

### Idempotency

- Client sends `X-Idempotency-Key` (also in the body).
- The server looks the key up before calling the model and returns the stored
  reading (`replayed: true`) when found.
- A unique index (`casts_idempotency_key_uidx`) resolves concurrent races; the
  23505 path also returns the stored reading.
- A key is reused on retry and regenerated only by “Start a new reading”.
- The key is scoped to the same verified owner; a different session gets 409.

### Rate limits

`public.consume_rate_limit(bucket, limit, window_seconds)` is a Postgres
function, so limits are shared across serverless instances.

| Endpoint | Scope | Limit |
| --- | --- | --- |
| `/api/cast` | per verified user, else per IP | 6 / 15 min |
| `/api/cast/capture` | per IP | 6 / hour |

Counters store a SHA-256 digest only — no raw IP or user id. If the function is
missing (migration not applied), the code falls back to the in-process limiter
and logs `[cast-rate-limit] distributed limiter unavailable`. That fallback is a
compatibility bridge, not the target state.

### AI providers

Order: DeepSeek direct (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`,
`DEEPSEEK_MODEL`) → OpenRouter (`OPENROUTER_API_KEY`,
`deepseek/deepseek-chat`, `deepseek/deepseek-r1:free`). The disclosure names both.

Private provenance stored in `casts.analysis_metadata`: provider, model, prompt
version (`cast.system.v2`), temperature, provider request id, token usage and
cost when the provider returns it. None of it is public.

### Analysis guardrails

The system prompt carries an explicit epistemic-limits block: no diagnosis, no
clinical vocabulary, hedged hypotheses only, low confidence, no invented
biography. A response containing clinical claim terms is discarded and the next
model is tried; if none passes, the reader gets an honest error instead of a
diagnosis.

“Not applicable” / “Не применимо” is a valid answer for any question and is
submitted by the skip control.

## 2. Capture and email

1. Token `v2.<expiry>.<nonce>.<hmac>` is bound to record id + `created_at` +
   expiry + nonce and expires after `CAST_CAPTURE_TTL_SECONDS`
   (default 7 days, clamped 1 h – 30 days).
2. The database update sets `capture_consumed_at` only when it is still null,
   so a token is single-use even inside its TTL.
3. The email is sent by Resend (`RESEND_API_KEY`, `CAST_EMAIL_FROM`). The
   message contains the reading only — never answers, record id or provider
   metadata.
4. Truthful delivery states:
   - `200 { emailDelivered: true }` — provider accepted the message;
   - `202 { emailDelivered: false, code: 'email_delivery_not_configured' }`
     — record linked, no message sent;
   - `502 { emailDelivered: false, code: 'email_delivery_failed' }`
     — record linked, provider failed.
   The UI never prints “copy sent” unless `emailDelivered` is true.

## 3. Session recovery

- Draft key `cast:draft:v1` stores language, step, answers, analysis, record id,
  capture token, idempotency key and `analysisStatus`.
- A reload during analysis restores `analysisStatus = 'pending'` and shows a
  retry panel instead of a blank final step.
- Retry reuses the same idempotency key → no duplicate record or AI call.
- After success the draft drops `answers` and `currentAnswer`; only the result
  and capture token remain.
- “Start a new reading” clears the draft and all Cast state.

## 4. Observability rules

Allowed in logs: correlation id, status, duration, model/provider, prompt
version, error code.
Never log: answers, analysis text, email, capture token, user UUID, IP.

The route returns a `correlationId` on fatal errors so a support request can be
matched to the log line without exposing the payload.

## 5. Verification commands

```bash
pnpm typecheck
pnpm lint
pnpm test --runInBand app/api/cast lib/cast app/cast
pnpm test --runInBand app/api/admin/youtube lib/youtube components/youtube
```

## 6. Known limits

- The model is not deterministic. Two genuine readings of the same answers can
  differ; identical answers are only guaranteed to be identical when the same
  idempotency key is replayed. This is the defensible fix for the 2026-10-12
  STONE/VOID case, not a claim that the model is stable.
- E2E verification on iPhone/iPad Safari, desktop and Telegram WebView requires
  a browser session and cannot be asserted from this repository alone.
- The historical anonymous backlog is inventoried in
  `docs/temple/CAST_PRIVACY_CLEANUP.md`; redaction is gated on owner approval.
