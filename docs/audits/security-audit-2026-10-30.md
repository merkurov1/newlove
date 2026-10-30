# Security audit & production hardening — NewLove / Supabase

**Date:** 2026-10-30
**Scope:** production Supabase project (`txvkqcitalfbjytmnawq`), Data API, storage, RPCs and the application routes that touch them.
**Method:** read-only inspection of `pg_catalog`, `information_schema`, `pg_policies`, grants, function definitions, storage buckets; anonymous Data API probes using the public anon key. **No rows were exported and no production record was modified.** No migration in this change set has been applied. No credential was rotated.

Severity: **Critical** = direct private-data or asset compromise; **High** = private data or privileged action reachable with a low-privilege credential; **Medium** = meaningful abuse/integrity risk; **Low** = hardening/defence in depth.

---

## 1. Executive summary

The starting point ("RLS disabled on 12 tables") was confirmed, but none of those 12 tables is currently reachable through the Data API: `anon` and `authenticated` have no table grants, and every probe returned `401`. They are still a serious latent risk because a single future grant or a `SECURITY DEFINER` helper would expose OAuth tokens, sessions, verification tokens, orders, messages and roles.

The real, *current* exposure is elsewhere:

| # | Finding | Severity |
| --- | --- | --- |
| S-01 | `subscribers` is readable with the public anon key: **22 rows** with email and wallet_address | **Critical** |
| S-02 | `users` is readable with the public anon key: **14 rows** with email and role (admin identification) | **Critical** |
| S-03 | UNFRAMED paywall/admin gate uses forgeable `true` cookies; manuscript readable without payment | **Critical** |
| S-04 | Mint voucher can be requested for a wallet the caller does not control (`/api/generate-signature`); `mark-claimed` used an `ilike` pattern that could mark every subscriber | **Critical** |
| S-05 | `/api/admin/items/[id]/publish` (GET/PATCH) had no auth and used the service role: read/edit any Flow item | **Critical** |
| S-06 | Telegram bot webhooks accept forged updates: `/api/bot` has no secret validation, `/api/pierrot` enforcement is opt-in and not enabled in production env | **Critical** |
| S-07 | `/api/temple/auth` creates a session from an unverified body `id` when `initData` is absent; session secret falls back to the service-role key / a hard-coded value | **Critical** |
| S-08 | Private voice "whispers": public bucket + public policies; `/api/whispers/reply` and `/api/transcribe` were unauthenticated and used the service role | **Critical** |
| S-09 | `get_articles_by_tag()` SECURITY DEFINER returns **unpublished** articles and **author email**; `/api/articles?includeTag=` proxies it | **High** (latent; 0 drafts at audit time) |
| S-10 | Anonymous DML on `temple_log`, `temple_users`, `vigil_hearts`, `todo` | **High** (integrity / personal data) |
| S-11 | Any authenticated account could write `Tag` / `_ArticleToTag` | **High** (site-wide content integrity) |
| S-12 | `get_my_user_roles_any(uid_text)` executable by anon — enumerate any user's roles | **Medium** |
| S-13 | `newsletter_jobs` / `newsletter_logs` readable by any authenticated account (`USING true`, misleading policy name) | **High** |
| S-14 | Unauthenticated SSRF/abuse: `/api/admin/parse-url`, `/api/transcribe` (arbitrary URL fetch, storage writes, OpenAI cost) | **High** |
| S-15 | `/api/user/role` trusted an unverified JWT `sub` and returned the raw cookie header in JSON | **High** |
| S-16 | `temple_log` / `temple_users` exposed Telegram identities (6) and activity logs (755 entries) to anon | **High** |
| S-17 | Storage: public `whispers` bucket; any authenticated user could update any `media` object | **High** |
| S-18 | `subscribe` used `ilike` on email (pattern injection can deactivate arbitrary subscribers) | **Medium** |
| S-19 | `unframed/admin` compared the admin secret non-constant-time and issued a forgeable flag cookie | **High** (part of S-03) |
| S-20 | No public exposure of the RLS-disabled token/session/order tables today, but no defence copy | **High (latent)** |

A full list, including low-severity and unresolved items, is in §4 and §8.

---

## 2. What is actually reachable through the Data API

Probe: `HEAD /rest/v1/<table>?select=*` with `Prefer: count=exact`, public anon key, no service key. Only status and `Content-Range` were recorded.

### 2.1 Confirmed readable by anon (real exposure)

| Table | Result | Rows | Assessment |
| --- | --- | --- | --- |
| `subscribers` | `200 0-21/22` | 22 | **Critical** — email + wallet_address + userId |
| `users` | `200 0-13/14` | 14 | **Critical** — email + role (admin enumeration) |
| `temple_users` | `200 0-5/6` | 6 | **High** — Telegram ids/usernames |
| `temple_log` | `200 0-754/755` | 755 | **High** — activity log, author, metadata |
| `articles` | `200 0-33/34` | 34 | **Medium** — currently all published; policy allowed drafts |
| `lots` | `200 0-22/23` | 23 | Intended public auction data (contains `ai_content`, currently presented publicly by `/lot/[id]`) |
| `letters` | `200 0-16/17` | 17 | Intended (published only) |
| `vigil_hearts` | `200 0-4/5` | 5 | Intended public art participation |
| `postcards` | `200 0-0/1` | 1 | Intended public catalogue |
| `media_archive_records` | `200 0-3/4` | 4 | Intended (published only) |
| `Tag`, `_ArticleToTag` | `200` | 3 / 27 | Intended public read; writes were not |

### 2.2 Confirmed NOT reachable by anon (401)

`accounts`, `sessions`, `verificationtokens`, `subscriber_tokens`, `orders`, `user_roles`, `roles`, `messages`, `revalidation_audit`, `liveheart_shares`, `project_tags`, `subscribers_backup_20251128`, `products`, `newsletter_logs`, `newsletter_jobs`, `postcard_orders`, `items`, `profiles`, `whispers`, `casts`, `tributes`, `access_requests`, `art_service_leads`, `pierrot_*`, `knowledge_*`, `brain_*`, `item_versions`, `flow_ai_context`, `article_to_tag_view`.

This is because PostgREST requires both a grant and (when enabled) an RLS policy. The RLS-disabled tables have no anon/authenticated grants. That is luck, not design: the default ACL is service-role-only for new tables, but grants have been added ad hoc over time.

### 2.3 RPCs

| Function | Anon execution | Result |
| --- | --- | --- |
| `get_my_user_roles_any(text)` | yes | `200 []` for an arbitrary uid — callable by anyone; returns roles for *any* uid |
| `get_my_user_roles(uuid)` | yes | delegates to the above |
| `get_articles_by_tag(text,int)` | yes | returns article `content`, `published` flag and `author.email`; no `published = true` filter |
| `get_articles_by_tag_slug(text,int)` | yes | wrapper |
| `get_tag_by_slug(text)` | yes | intended public |
| `assign_default_user_role*`, `handle_new_user`, `set_jwt_role_claim*` | yes (trigger functions) | cannot be invoked directly as triggers, but EXECUTE was unnecessary |
| `clean_old_logs`, `cleanup_old_newsletter_jobs`, `sync_user_subscription_status`, `attach_tags_to_articles`, `get_newsletter_job_stats`, `update_*` | yes | unnecessary public EXECUTE; some perform writes when invoked by a role with grants |

`anon` executed 13 `SECURITY DEFINER` functions; all had `search_path` pinned except the two `pierrot_*`/`purge_*` internal functions (not anon-executable).

### 2.4 Storage

- `storage.objects` RLS is enabled.
- Buckets: `articles`, `artifacts`, `heartandangel`, `liveheart-og`, `media`, `whispers` are **public**; `knowledge-map` is private.
- `whispers`: public SELECT and public INSERT policies. The recorder uploads with the anon client and stores a public URL (`components/MicrophoneButton.tsx`, `MicrophoneInline.tsx`) — voice confessions are listable/downloadable by URL.
- `artifacts`: INSERT policy named "Authenticated Upload" applies to `public` and only checks `bucket_id`.
- `media`: a permissive UPDATE policy (`auth.role() = 'authenticated'`, no owner check) overrides the owner-scoped policy, so any signed-in account can move/rename another user's object.
- Public buckets have no size or MIME limits.

### 2.5 Tables with RLS disabled (the audit starting list)

`accounts`, `sessions`, `verificationtokens`, `subscriber_tokens`, `orders`, `user_roles`, `roles`, `messages`, `revalidation_audit`, `liveheart_shares`, `project_tags`, `subscribers_backup_20251128` — plus `products`. All returned `401` for anon. Their contents are still high-value:

- `accounts`: OAuth `access_token`, `refresh_token`, `id_token`
- `sessions`: NextAuth `sessiontoken`
- `verificationtokens`: magic-link tokens
- `subscriber_tokens`: confirm/unsubscribe tokens
- `orders`, `orders.*`: purchase records
- `messages`, `liveheart_shares`, `subscribers_backup_20251128` (emails + wallets)

No grants were added in this change; the migration enables RLS and revokes explicitly so a future grant cannot expose them.

---

## 3. Database metadata snapshot

- 70 relations in `public` (69 tables + 1 view), 82 policies, 158 functions (28 `SECURITY DEFINER`).
- `service_role` has `rolbypassrls = true`; `anon` and `authenticated` do not.
- Public schema default ACL for new tables: `service_role` only (good).
- Realtime publication: `temple_log`, `tributes`, `vigil_hearts` (+ Supabase internal `realtime.messages_*`).
- Extensions in `public`: `vector`, plus `http`, `pg_net`, `dblink`, `postgres_fdw`, `supabase_vault` in `extensions`.
- `public.article_to_tag_view` was created without `security_invoker`; it is not granted to anon, but the definer function uses it.

---

## 4. Findings and remediation

Status legend: **fixed in code** = repository change, not deployed; **migration** = proposed SQL, not applied; **open** = requires a product decision or deployment action.

### Critical

#### S-01 — Public subscriber directory
`public.subscribers` had `grant select to anon` and policy `select_subscribers_public USING (true)`. Any visitor with the publishable anon key could read every subscriber's email, wallet address and user id (22 rows).

**Impact:** newsletter-list disclosure, phishing, wallet targeting, GDPR exposure.
**Fix (migration):** revoke anon; keep `authenticated` SELECT only for the caller's own row (`auth.uid()::text = "userId"`), which preserves `/api/subscription-status`; all writes remain service-role only. Drop the open INSERT policy.

#### S-02 — Public user directory + admin identification
`public.users` had `grant select to anon` and policy `Users can view all profiles USING (true)`. 14 rows were readable, including `email` and `role`. The admin account is identifiable from the public API.

**Impact:** account enumeration, targeted phishing, disclosure of the administrator identity.
**Fix (migration):** revoke anon; authenticated users can select/insert/update only their own row; column-level grants exclude `email` and `role` from INSERT/UPDATE (blocks self-promotion); admins can select all via a corrected `is_current_user_admin()`. Public profile pages already use the service role (`app/you/[username]/page.tsx`), so they keep working.

#### S-03 — UNFRAMED paywall and admin bypass
`/api/unframed/content` checked `cookie.unframed_access === 'true'` and `unframed_admin === 'true'`; `/api/unframed/verify` set the flag after Stripe payment. A visitor can create the cookie manually and read the paid manuscript; `unframed_admin` also unlocks the admin preview.

**Fix (code):** signed HMAC tokens (`lib/unframed/access.ts`) with scope + expiry; verify uses signed `access`/`admin` tokens; `unframed/admin` compares the secret in constant time, rate-limits and issues a signed admin token. **Deployment note:** existing `true` cookies stop working; paid readers must re-open their success URL (`/api/unframed/verify?session_id=…`) once.

#### S-04 — Wallet voucher / claim takeover
- `/api/generate-signature` accepted a `wallet_address` and, when the caller had no subscriber row, looked it up by wallet. Any signed-in account could request a voucher for another subscriber's eligible wallet.
- `/api/mark-claimed` updated `subscribers` with `.ilike('wallet_address', wallet)`; `%` or `_` in the body could match many rows (`.limit(1)` limits the response, not the UPDATE).
- `/api/user/connect-wallet` attached an arbitrary wallet to the account without proof.

**Fix (code):** added `lib/walletProof.ts` (EIP-191 message with wallet + timestamp, 10-minute TTL, ECDSA recover). `generate-signature`, `mark-claimed` and `connect-wallet` require a valid proof unless the wallet is already linked to the caller's `userId`; all lookups use `.eq` and normalised addresses; updates target a single row id. The mint UI now signs the proof before requesting the voucher and before marking the claim.
**Residual:** legacy wallet-only subscriber rows (there are currently **0** rows with `wallet_address`) are no longer eligible without a signature. This is the intended fail-closed behaviour.

#### S-05 — Unauthenticated Flow item editor
`app/api/admin/items/[id]/publish/route.ts` had GET and PATCH with no auth guard and a service-role client. GET returned the whole row (including drafts/private metadata); PATCH allowed title, slug, body, visibility, status, metadata and `ai_allowed`.

**Fix (code):** `requireAdminFromRequest` on both methods. Also guarded `/api/admin/items` GET (service-role, previously unauthenticated) and `/api/admin/letters/test-render`.

#### S-06 — Forgeable Telegram bot updates
- `app/api/bot/route.ts` calls grammY `webhookCallback` without `secretToken`. Anyone can POST an update with `from.id = MY_TELEGRAM_ID` and run owner commands (research, drafts, files) with the service role.
- `app/api/pierrot/route.ts` supports `secretToken`, but only when `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`; that variable is not present in the production env dump. Legacy `/api/telegram/webhook` already validates the secret.

**Fix (code):** `/api/bot` now accepts secret-token enforcement via `TELEGRAM_BOT_WEBHOOK_ENFORCE_SECRET=1` (or the existing `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`) and warns when the secret is set but enforcement is off.
**Deployment action (open):** set `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`, register the webhook with `secret_token=<TELEGRAM_WEBHOOK_SECRET>` for both bots, and verify delivery. Until then both webhooks remain forgeable.

#### S-07 — Temple auth identity forgery
`app/api/temple/auth/route.ts` only verified `initData` when present; otherwise it trusted body `id/username` and minted a 30-day session. `lib/session.ts` signed with `NEXT_JWT_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'dev_secret_change_me'`. Any visitor could become any Telegram id (including allowlisted/owner ids) and `/api/vigil/claim` trusts that session.

**Fix (code):** `initData` is mandatory and verified (HMAC + `auth_date` + timing-safe compare); identity comes only from the verified `user` payload; sessions fail closed unless `NEXT_JWT_SECRET` (or `NEXTAUTH_SECRET`) is at least 32 chars; the service-role/dev fallbacks are removed; rate limiting added.
**Deployment action (open):** ensure `NEXT_JWT_SECRET` is set (currently `NEXTAUTH_SECRET` is the accepted fallback). Existing temple sessions remain valid until expiry; rotate the secret to invalidate them.

#### S-08 — Whispers privacy and unauthenticated moderation
- The `whispers` bucket is public with public read/upload policies; the browser uploads with the anon key and stores a public URL.
- `POST /api/whispers/reply` (arbitrary Telegram message to any whisper author + row overwrite) and `POST /api/transcribe` (fetch arbitrary URL, update any whisper, OpenAI cost) had no auth and used the service role.

**Fix (code):** `reply` and `transcribe` now require an admin credential, are rate-limited, and `transcribe` validates audio URLs with the existing SSRF guard. `POST /api/whispers` is admin-only and validates the storage path (the capture UI lives behind the admin page).
**Fix (migration, separate file):** make `whispers` private and drop public policies. **Breaking:** the recorder currently uploads directly to the public bucket; deploy the server-upload/signed-URL change before applying the storage migration.

### High

| ID | Finding | Fix |
| --- | --- | --- |
| S-09 | `get_articles_by_tag()` returns drafts + `author.email`; `/api/articles?includeTag=` proxies it | Migration replaces the function (`published = true`, author id/name only); `/api/articles` filters defensively too |
| S-10 | Anon INSERT/UPDATE/DELETE on `temple_log`, `temple_users`, `vigil_hearts`, `todo` with `USING (true)` policies | Migration revokes writes and drops write policies; reads remain for realtime (`temple_log`, `vigil_hearts`); `temple_users` fully private; `todo` API already returns 410 |
| S-11 | Any authenticated user can manage `Tag` / `_ArticleToTag` (`auth.uid() IS NOT NULL`) | Migration changes policies to `is_current_user_admin()`; tag helpers use service role |
| S-13 | Any authenticated user can read all `newsletter_jobs` / `newsletter_logs` (provider errors, subscriber ids) | Migration revokes authenticated access; admin route uses service role; `/api/newsletter-jobs/[jobId]` now requires admin |
| S-14 | SSRF/open proxy: `/api/admin/parse-url` and `/api/transcribe` fetch arbitrary URLs; parse-url also stores downloaded images | Both now require admin; URLs pass `assertSafePublicUrl` (loopback/private/link-local/metadata, credentials, unusual ports rejected); image candidates are validated |
| S-15 | `/api/user/role` decoded the JWT without verifying it and returned `rawCookieHeader` | Rewritten: bearer verified with `supabase.auth.getUser`, cookie via verified session, only `{role}` returned; role resolved from `users.role` + `user_roles` with the service role |
| S-16 | `temple_users` (6 Telegram identities) and `temple_log` (755 rows) readable by anon | Migration removes anon access from `temple_users`, keeps only public read on `temple_log` for the realtime feed |
| S-17 | Public whisper bucket; unrestricted media UPDATE | Separate storage migration (private whispers, owner-scoped media writes, size/MIME limits) |
| S-20 | 13 RLS-disabled high-value tables | Migration enables RLS and revokes anon/authenticated explicitly |

### Medium / Low

| ID | Finding | Status |
| --- | --- | --- |
| S-12 | `get_my_user_roles_any(text)` anon-executable | Migration revokes PUBLIC/anon/authenticated, grants service_role only |
| S-18 | `subscribe` used `.ilike('email')`; `%`/`_` in a valid-looking email can match another subscriber and reset their state | Code now uses `.eq` |
| S-19 | `unframed/admin` non-constant-time secret + forgeable cookie | Fixed with S-03 |
| S-21 | `/api/auth/set-cookie` trusts body access/refresh tokens and has a self-referential origin check (`expected = env || origin`) | **Open** — login-CSRF / cookie-injection risk. Recommended: remove the endpoint and let Supabase's PKCE callback set cookies, or verify the tokens server-side and require a one-time nonce |
| S-22 | `ADMIN_API_SECRET`, `ADMIN_SECRET_KEY`, `PIERO_API_SECRET` are long-lived shared secrets accepted as admin identities | **Open** — document holders, rotate on schedule, prefer per-user credentials; not rotated automatically |
| S-23 | Two/three role sources (`users.role`, `user_roles`, `profiles.role`); `profiles.role` had no ADMIN row while `users.role` did | Migration makes `is_current_user_admin()` authoritative on `users.role` + `user_roles`; consolidate the model later |
| S-24 | In-memory rate limiter is per-instance and trusts `x-forwarded-for` | **Open** — acceptable as a speed bump; use Vercel WAF/Upstash for hard limits |
| S-25 | `admin/items/route.ts` GET and `admin/letters/test-render` were unauthenticated (public data / preview) | Fixed with admin guard |
| S-26 | `/api/newsletter-jobs/[jobId]` was unauthenticated job status (errors, letter id) | Fixed with admin guard |
| S-27 | `/api/whispers` POST and `/api/temple_logs` / `/api/temple/log` public writes (spam/log injection) | Whispers now admin; temple log routes keep public feature but are rate-limited |
| S-28 | `/api/cast/capture`, `/api/liveheart/save`, `/api/admin/request-access` unthrottled public writes | Added IP rate limits and payload/size validation for liveheart |
| S-29 | `/api/test-auth` returns user id/email/role (no secrets) | **Open** — remove or admin-gate in a future cleanup |
| S-30 | `/api/cron` is a public no-op | Low; leave or guard with `CRON_SECRET` when implemented |
| S-31 | Storage public buckets have no size/MIME limits | Storage migration |
| S-32 | `subscribers_backup_20251128` retains emails/wallets | **Open** — retention decision; export to an encrypted archive and drop later (do not delete now) |
| S-33 | Legacy NextAuth tables (`accounts` with OAuth tokens, `sessions`, `verificationtokens`) | **Open** — confirm migration is complete, then archive and drop after retention; rotate OAuth client secrets if they were ever exposed |
| S-34 | `article_to_tag_view` had no `security_invoker` | Migration sets it and revokes all |
| S-35 | `tributes` has a public-read policy but no anon grant, so the realtime tribute page is effectively broken | Not changed; decide public read vs private |
| S-36 | `LoungeInterface` subscribes to `messages` with the anon key, but the table is not in the realtime publication and is now RLS-private | Feature is non-functional; do not add it to the publication without a server API |

---

## 5. Application audit (requested areas)

### Admin routes
- `app/admin/layout.tsx` calls `requireAdmin()` and redirects to `/403`; admin UI is server-guarded.
- Most `/api/admin/**` handlers use `requireAdminFromRequest`. Exceptions found and fixed: `items/[id]/publish`, `items` GET, `letters/test-render`, `parse-url`, `newsletter-jobs/[jobId]`.
- Brain/knowledge endpoints use `authorizeKnowledgeAdmin` (verified session or GitHub owner token whose login must equal `VERCEL_GIT_REPO_OWNER`). Good.
- `admin/request-access` is intentionally public (access requests); now IP rate-limited.

### Analytics endpoints
- `/api/admin/pierrot/{analytics,conversations,export,offers}` require admin and use the service role.
- `/api/pierrot/events` is write-only telemetry, rate-limited, consent-gated, no GET handler. Good.
- Analytics views/tables are not granted to anon/authenticated.

### Pierrot owner mode
- `/api/pierrot-web` resolves a verified session first; `mode: "unframed"` requires `isVerifiedOwnerCredential` (a real ADMIN user/Telegram identity, not the shared `system-admin` secret). The legacy `x-admin-key` only sets the general admin flag, not owner mode. Good.
- RAG retrieval is owner-only; non-owners never enter the manuscript path.
- `pierrot_conversations/messages/events` have RLS enabled and no anon/authenticated grants.

### Conversation access
- Visitor human-presence routes require either an opaque recovery token or the `conversationId + sessionId` pair; responses are sanitized (no token hashes/Telegram ids); rate-limited; `Cache-Control: no-store`. Good.
- Conversation deletion is server-side and requires both identifiers.

### Brain retrieval / document import
- Brain graph, radar, runs, ingest and analyze routes require `authorizeKnowledgeAdmin`; no public upload endpoint; `knowledge-map` bucket is private.
- `admin/knowledge/unframed-run` has a GitHub-owner authorization check.

### Payment callbacks
- Stripe webhook validates `stripe-signature` with `STRIPE_WEBHOOK_SECRET` and handles postcard/unframed/tribute paths.
- Postcard checkout resolves the price from the database, ignores client price, validates with Zod and rate-limits. Order status returns only a short reference and no address/PII.
- Unframed verify checks a Stripe session id pattern and `payment_status === 'paid'` before issuing access.
- `mark-claimed` / `generate-signature` were the weak links (S-04), now fixed in code.
- `/api/stripe/checkout` is an open donation endpoint with a client-chosen amount (intended); no rate limit (low).

### Subscriber management
- `GET /api/subscribers` requires admin (returns empty – implementation pending); `DELETE /api/subscribers/[id]` requires admin but uses the request-scoped client, so RLS will block the delete and the route reports success incorrectly — **functional bug, no security impact**.
- `subscribe`, `newsletter-confirm`, `newsletter-unsubscribe` use signed/random tokens with expiry and rate limits; token lookups use the service role. `subscriber_tokens` is private.
- `subscribe` email pattern injection fixed (S-18).

### Uploads / transcription / auth
- `upload/route.ts` and `media/*` require admin; editor-image routes are stubs.
- `/api/auth/upsert` derives identity from the request session and only writes profile fields; safe.
- `/api/auth/set-cookie` remains a hardening item (S-21).
- No service-role key was found in `.next/static` (checked all secrets from the production env against client bundles).

---

## 6. Changes in this repository (not deployed)

### Application code
- `app/api/admin/items/[id]/publish/route.ts` — admin guard on GET/PATCH.
- `app/api/admin/items/route.ts` — admin guard.
- `app/api/admin/parse-url/route.ts` — admin guard + SSRF validation for page and image candidates.
- `app/api/admin/letters/test-render/route.ts` — admin guard.
- `app/api/admin/request-access/route.ts` — IP rate limit.
- `app/api/newsletter-jobs/[jobId]/route.ts` — admin guard.
- `app/api/whispers/route.ts` — admin guard, rate limit, storage-path validation.
- `app/api/whispers/reply/route.ts` — admin guard, rate limit.
- `app/api/transcribe/route.ts` — admin guard, rate limit, SSRF-safe audio URL.
- `app/api/temple/auth/route.ts` — mandatory verified initData, timing-safe compare, no hash logging, rate limit, no body identity.
- `lib/session.ts` — strong secret required; no service-role/dev fallback.
- `app/api/user/role/route.ts` — verified bearer/cookie identity; no debug/cookie leakage.
- `app/api/generate-signature/route.ts`, `app/api/mark-claimed/route.ts`, `app/api/user/connect-wallet/route.ts` — wallet proof, exact lookups, single-row updates.
- `lib/walletProof.ts` — EIP-191 proof verification.
- `app/heartandangel/NFT/ClientPage.tsx` — signs the wallet proof before voucher/mark-claimed.
- `app/api/unframed/content|verify|admin` + `lib/unframed/access.ts` — signed access tokens, constant-time admin secret.
- `app/api/bot/route.ts` — optional webhook secret enforcement + warning.
- `app/api/subscribe/route.ts` — exact email lookup.
- `app/api/articles/route.ts` — filters RPC output to published rows and strips author email.
- `app/api/cast/capture`, `app/api/liveheart/save`, `app/api/temple/log`, `app/api/temple_logs` — rate limits/validation.

### Proposed migrations (NOT APPLIED)
- `migrations/2026-10-30_security_hardening_private_data.sql`
- `migrations/rollback/2026-10-30_security_hardening_private_data.rollback.sql`
- `migrations/2026-10-30_security_hardening_storage.sql` (breaking; requires the whisper/media app changes)
- `migrations/rollback/2026-10-30_security_hardening_storage.rollback.sql`
- `scripts/security/verify-supabase-exposure.mjs` (post-migration verification; counts only)

### Expected effects of the private-data migration
- Anon loses read access to `subscribers`, `users`, `temple_users`, `newsletter_*`, and every private table.
- Authenticated users can read/update only their own `users` row and can read only their own `subscribers` row.
- Public reads remain for: `articles` (published), `projects` (published), `issues` (published), `letters` (published), `postcards`, `media_archive_records` (published), `lots`, `Tag`, `_ArticleToTag`, `temple_log`, `vigil_hearts`.
- Writes to `temple_log`, `vigil_hearts`, `temple_users`, `todo` via the Data API are removed; server routes keep using the service role.
- `Tag`/`_ArticleToTag` writes require an admin (server actions use the service role).
- `get_articles_by_tag()` returns only published articles and no email.
- `get_my_user_roles_any()` is service-role only.
- `is_current_user_admin()` now recognises the real production admin (`users.role`, `user_roles`).
- Private tables get RLS on, even where a grant is added later.

### Rollout order (recommended)
1. **Snapshot**: database backup + export the current policies/grants (`pg_dump --schema-only` is not enough; capture `pg_policies` and `role_table_grants`).
2. **Staging**: apply the private-data migration and run `scripts/security/verify-supabase-exposure.mjs`. Exercise: `/flow`, `/flow/[slug]`, `/articles` + a tag page, `/letters`, `/temple`, `/vigil`, `/media`, `/lot/[id]`, login, `/profile` save, subscription status, comments, admin login, tag edit, newsletter page, users page, Flow issue editor, postcard test checkout, unframed test session.
3. **Deploy code + private-data migration together** (code expects own-row policies and signed UNFRAMED cookies).
4. **Whispers/media**: deploy server upload + signed URLs, then apply the storage migration. Test the recorder and admin playback.
5. **Bot webhooks**: set `TELEGRAM_WEBHOOK_ENFORCE_SECRET=1`, re-register webhooks with `secret_token`, send a test message in both bots.
6. **Temple**: set `NEXT_JWT_SECRET` (≥32 chars) and rotate it after deployment to invalidate forged/legacy sessions.
7. **Post-checks**: re-run the verify script; review `pg_stat_statements`/logs for `401/403` spikes; confirm admin UI and public pages.

### Rollback
- SQL: `psql "$DATABASE_URL" -f migrations/rollback/2026-10-30_security_hardening_private_data.rollback.sql`
- Storage: `psql "$DATABASE_URL" -f migrations/rollback/2026-10-30_security_hardening_storage.rollback.sql`
- Code: revert the commit; signed UNFRAMED cookies and the wallet proof are backward-compatible at the HTTP level only after a user re-verifies.

---

## 7. Verification performed

- Production Data API probes (HEAD, counts only) — documented in §2.
- Schema inspection: RLS flags, 82 policies, table/column grants, 28 definite functions, storage policies, publications, default ACLs.
- Client-bundle secret scan: service-role key, JWT secret, Stripe/OpenAI/DeepSeek/Resend/Telegram/DATABASE_URL/NEXTAUTH were **not** found in `.next/static`.
- Unit tests: `npx jest lib/__tests__/walletProof.test.ts lib/unframed/__tests__/access.test.ts lib/flow-issue lib/flow/__tests__/feed.test.ts lib/flow/__tests__/feedRoute.test.ts` — **71 passed**.
- `npx tsc --noEmit --incremental false` — **0 errors** after clearing a stale `tsconfig.tsbuildinfo`.
- `npm run build` — **completed successfully (exit 0)**. Google Fonts requests failed/retried in the sandbox, but the build fell back and finished. A second verification run was OOM-killed by the environment (exit 137); the successful run used the same source.
- ESLint: the repository currently reports **6,883 pre-existing errors** across untouched files (`no-explicit-any`, unused vars, etc.) and `next.config.js` ignores lint during builds. Lint is not a usable gate here; the changed files introduce no new blocking errors.

---

## 8. Unresolved risks / required follow-up

1. **Whispers storage** — the code still uploads voice notes with the anon key to the public `whispers` bucket. Do not apply the storage migration until `MicrophoneButton`/`MicrophoneInline` upload through a server route and playback uses signed URLs.
2. **Telegram webhooks** — enforcement is coded but not enabled. Set the env flag and re-register both webhooks with `secret_token`.
3. **`temple/auth` secret** — set `NEXT_JWT_SECRET`; current production env only has `NEXTAUTH_SECRET` as a fallback. Rotate after deploy to invalidate old sessions.
4. **Login CSRF / cookie injection** — `/api/auth/set-cookie` should be removed or redesigned (Supabase PKCE callback; one-time nonce).
5. **Shared admin secrets** — `ADMIN_API_SECRET`, `ADMIN_SECRET_KEY`, `PIERO_API_SECRET` are bearer credentials. Rotate and prefer user-scoped auth; do not expose them to browsers.
6. **Legacy auth tables** — `accounts` (OAuth tokens), `sessions`, `verificationtokens` need an archive/delete decision and OAuth secret rotation if there is any chance of prior exposure.
7. **Backup table** — `subscribers_backup_20251128` contains emails/wallets; keep it private, export to encrypted storage, and remove after the retention window.
8. **Role model** — `users.role`, `user_roles` and `profiles.role` are not a single source of truth. The migration makes RLS use `users.role` + `user_roles`; consolidate the writes in the admin user editor.
9. **Storage contents** — public `media`/`artifacts`/`heartandangel` objects should be reviewed for accidentally private files; size/MIME limits are in the storage migration.
10. **Rate limiting** — in-memory buckets are per instance; use the platform/WAF for real abuse protection. `x-forwarded-for` trust is provider-dependent.
11. **No automated policy tests** — the provided verification script is a start; add it to CI/staging with a dedicated test project.
12. **`tributes` / Lounge realtime** — decide whether these are public features; do not add private tables to the realtime publication without RLS and a grant review.
13. **`/api/test-auth`, `/api/cron`** — remove/guard in a cleanup pass.
14. **Migration verification** — the proposed SQL has not been executed against a database in this environment. Run it on staging first; the rollback is provided for emergencies only.

---

## 9. Audit artifacts

- `scripts/security/verify-supabase-exposure.mjs` — repeatable, content-free exposure check.
- Migration and rollback files listed in §6.
- This report: `docs/audits/security-audit-2026-10-30.md`.

**No production migrations were applied, no records were deleted, and no credentials were rotated.**
