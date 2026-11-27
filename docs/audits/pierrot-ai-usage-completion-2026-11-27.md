# Pierrot AI usage completion + YouTube admin auth recheck

Date: 2026-11-27  
Task: `303de833-d318-4bc5-89be-48a13783ee56` (attempt 3)  
Scope: finish per-call model telemetry, review the unapplied
`pierrot_llm_calls` migration, and fix the owner-only YouTube status/connect
401 observed in production. No migration was applied, no paid provider call was
made, and no secret value was read or printed.

## 1. Production provider/model

The repository pins these routes:

| Surface                      | Provider order / model                                                                                                                         | Endpoint                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Web Pierrot JSON + streaming | Gemini `gemini-3.5-flash` → DeepSeek `deepseek-chat` / `deepseek-reasoner` → OpenRouter `deepseek/deepseek-chat` / `deepseek/deepseek-r1-0528` | `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai` |
| Telegram bot replies         | DeepSeek `DEEPSEEK_MODEL` or `deepseek-chat`, no fallback                                                                                      | `DEEPSEEK_BASE_URL` or `api.deepseek.com`                                |
| Telegram deep research       | Gemini `deep-research-pro-preview-12-2025`                                                                                                     | `generativelanguage.googleapis.com`                                      |
| Telegram channel enhancement | DeepSeek `deepseek-chat`                                                                                                                       | `api.deepseek.com`                                                       |
| Embeddings                   | OpenRouter `baai/bge-m3`                                                                                                                       | `openrouter.ai/api/v1/embeddings`                                        |

A routing snapshot was generated with `node scripts/ai/provider-routing-report.mjs`
in the execution sandbox. It prints only booleans, model ids and hosts:

- `web.effectiveFirstProvider = deepseek` **in the sandbox**, because only
  `DEEPSEEK_API_KEY` is present there;
- `telegram.replyProvider = deepseek`, model `deepseek-chat`, host
  `api.deepseek.com`;
- `embeddings.configured = false`, `geminiPricing` all false,
  `evaluation.paidLiveRunAllowed = false`.

This is **not** production evidence. The production values remain unconfirmed
until one of the following is done by the owner:

1. run `pnpm ai:routing-report` in a production shell;
2. open `GET /api/admin/pierrot/ai-evaluation` as an admin and read
   `providerRouting` (booleans/models/hosts only);
3. after the telemetry migration is applied, read the first
   `/admin/pierrot/ai-costs` rows, which show the provider/model that actually
   answered.

## 2. Telemetry coverage after this attempt

Added in this attempt:

- Telegram text replies now write one telemetry row per attempt
  (`provider=deepseek`, surface `unknown` because the reviewed migration does
  not yet have a `telegram` surface value). The row contains only token counts,
  prompt/response character counts, latency, provider/model and a stable error
  code. No chat text, user id or answer is stored.
- `chatUsageFrom` centralises OpenAI-compatible usage parsing: an omitted usage
  block stays `unknown`, one-sided usage stays `partial`, and no missing token
  becomes `0`.

Already present and verified by tests:

- one row per web attempt, including failed attempts, retries and fallbacks;
- streaming usage frames;
- OpenRouter embedding attempts, including failed requests and consent denial
  (`store: null` → redacted log only);
- Brain, media, intake, art engine and evaluation surfaces;
- dashboard totals: messages, calls, retries, fallbacks, tokens, unknown usage,
  latency, estimated cost, provider-reported cost, per provider/model/surface;
- NULL stays NULL and is rendered as `—` / `unknown`.

## 3. Migration: reviewed, still not applied

File: `migrations/2026-11-18_pierrot_llm_call_telemetry.sql`  
Review: `docs/audits/pierrot-llm-telemetry-migration-review-2026-11-21.md`

Status in this attempt: **not applied**. No production schema change and no
Supabase/Vercel management API call was made.

The review already contains the read-only preflight and post-apply
verification. The safe path is repeated here so the owner can execute it
without reading two documents:

```sql
-- 1. Preflight (expect NULL/empty before the first apply)
select to_regclass('public.pierrot_llm_calls') as table_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by ordinal_position;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls';
```

If the table already exists, **stop**: the additive `CREATE TABLE IF NOT
EXISTS` will not add missing columns or replace old constraints. Write a
separate additive `ALTER TABLE` review instead.

```sql
-- 2. Apply inside a transaction (owner action only)
begin;
-- paste migrations/2026-11-18_pierrot_llm_call_telemetry.sql here
commit;
```

```sql
-- 3. Post-apply verification
select relrowsecurity from pg_class where oid = 'public.pierrot_llm_calls'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pierrot_llm_calls'
order by grantee, privilege_type;
-- Expected: anon/authenticated absent, service_role present.

select count(*) from public.pierrot_llm_calls; -- 0 immediately after apply.
```

After one real or synthetic non-production attempt:

```sql
select provider, model, attempt, is_retry, fallback_from, ok,
       input_tokens, output_tokens, total_tokens, usage_source,
       estimated_cost_usd, cost_source, latency_ms
from public.pierrot_llm_calls
order by occurred_at desc
limit 20;
```

Expected: one row per attempt; a missing provider usage shows NULL tokens and
`usage_source='unknown'`; an unpriced model shows NULL cost and
`cost_source='unknown'`. Then open `/admin/pierrot/ai-costs` and confirm the
amber “Telemetry is not available” banner is gone.

Do not add the SQL file to a build hook, Prisma migration or Vercel build step.

## 4. Gemini pricing and evaluation

- No Gemini rate is bundled. Only owner-supplied
  `GEMINI_INPUT_USD_PER_MILLION`, `GEMINI_OUTPUT_USD_PER_MILLION` and
  `GEMINI_CACHED_INPUT_USD_PER_MILLION` enable an estimate, and both input and
  output are required. Unknown stays `cost_source='unknown'`.
- `lib/ai/evaluation/*` runs six fixed synthetic cases with identical system
  prompts, user prompts and output budget for Gemini and DeepSeek. Quality
  (deterministic checklist), latency and cost are reported separately.
- The live run is disabled unless `ALLOW_PAID_AI_EVALUATION=true` **and** an
  admin sends `POST {"confirm":true}`. No live run was made here.

## 5. YouTube owner 401 (urgent recheck)

Production observation: repeated `GET /api/admin/youtube/channels` →
`auth_denied reason=admin` (401), no callback log, zero OAuth/channel/binding
rows. The status request and the connect link relied on the Supabase cookie
session only. A long-lived admin tab whose access-token cookie had expired, or
an API request made after the page render but before the next navigation,
therefore produced a 401 even though the page itself had rendered for the
owner. The connect link was a plain `<a>` navigation, so it could not carry an
alternative credential.

Fix in this attempt:

- `lib/auth/adminFetch.ts` refreshes the browser session when the token is
  within 60 seconds of expiry, sends the access token as a Bearer credential,
  keeps cookies enabled, and retries once after a forced refresh on 401.
  `requireAdminFromRequest` already verifies Bearer JWTs against
  `users.role = 'ADMIN'`, so no auth bypass was added.
- Every YouTube workspace request (status, bind/unbind/disconnect/refresh,
  analytics, catalog, video read/write) uses that helper.
- Connect now calls
  `GET /api/admin/youtube/channels/connect?...&format=json` with the Bearer
  session, gets `{ consentUrl }`, and then performs the top-level navigation to
  Google. The route still sets the short-lived OAuth nonce cookie on the JSON
  response, and plain non-JS navigation still receives the original 307
  redirect.
- The status payload now includes a redacted `viewer` (`id`, `email`, `role`).
  The UI shows the authenticated admin email and session expiry, and on 401
  explains that the admin session was not confirmed and offers
  `/login?next=/admin/pierrot/youtube`.

End-to-end acceptance still requires the owner/browser to verify, in order:

1. `GET /api/admin/youtube/channels?project=...` returns 200;
2. connect returns a Google consent URL;
3. consent completes;
4. `/api/auth/youtube-channels/callback` logs a request;
5. a real `youtube_oauth_connections` row exists;
6. channel rows are persisted;
7. the intended project binding is active.

A consent redirect or a READY preview is not success.

## 6. Local verification

- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0 (warnings only, no errors).
- Targeted YouTube/auth/telemetry suites — 37 suites / 225 tests passed.
- Full `pnpm test --runInBand` — 615 suites passed, 1 failed:
  `components/pierrot/workspace/__tests__/DevWorkbench.test.tsx`
  ("opens details and queues a draft…"). That file and component are untouched
  by this attempt and the failure reproduces when the suite runs alone, so it
  is reported as a pre-existing unrelated failure rather than hidden.

## 7. Unknowns

- Effective production provider keys and therefore the production web first
  provider.
- Whether the production `pierrot_llm_calls` table exists; this workspace has
  no production database access.
- Verified Gemini billing rates and the Google Cloud invoice.
- Live Gemini vs DeepSeek quality/latency/cost results (paid run not approved).
- The exact identity used in the failing production YouTube session; the fix
  removes the cookie-only dependency but cannot replay that browser session.
