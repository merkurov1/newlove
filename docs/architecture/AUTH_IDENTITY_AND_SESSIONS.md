# Authentication: identity, roles, sessions and callbacks

Status: implemented in the auth integration task (2026-11-20). This document is
the contract for future auth work. It describes repository code and prepared
migrations; it does not claim that a migration was applied to production.

## 1. Sign-in surface

| Method              | Entry point                                                                    | Session result                                                     |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Google OAuth        | `/login` → `AuthContext.signInWithGoogle()` → Supabase OAuth                   | Supabase SSR cookie session, then `returnTo`                       |
| Email one-time code | `/login` → `supabase.auth.signInWithOtp()` → `verifyOtp({ type: 'email' })`    | Supabase SSR cookie session, then `returnTo`                       |
| Passkey / WebAuthn  | `/login` → `AuthContext.signInWithPasskey()`                                   | Supabase SSR cookie session, then `returnTo`                       |
| Web3 wallet         | `/login` → `/api/auth/wallet/nonce` → signed SIWE message → `/api/auth/wallet` | `setSession()` with the returned Supabase session, then `returnTo` |

Registration is not a second flow. `/register` redirects to
`/login?mode=register&next=…`; the first successful confirmation with any
method creates the account. There is no password, questionnaire or multi-step
onboarding.

`/login` resolves its return path in this order:

1. a valid `?next=` value;
2. the one-time `login_redirect_path` value written by the previous page;
3. a same-origin `document.referrer`;
4. `/art-engine`.

All values pass `safeLoginReturnPath()` (`lib/auth/returnPath.ts`), which rejects
external origins, protocol-relative URLs, backslash paths and `/login` loops.
The same helper is used by `/register`, `/auth/callback`, `AuthContext` and the
legacy session hook.

## 2. Session mechanisms

| Mechanism                   | File                                       | Authority                                                                                    |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Browser Supabase client     | `lib/supabase-browser.ts`                  | Cookie-backed `@supabase/ssr` client used by `AuthContext`                                   |
| Server Supabase client      | `lib/supabase/server.ts`                   | Request cookie adapter; service-role mode never reads user cookies                           |
| Proxy refresh               | `proxy.ts` + `lib/auth/routeProtection.ts` | Refreshes claims only for `/admin`, `/profile`, `/research/telegram`, `/heartandangel/world` |
| OAuth server exchange       | `app/auth/callback/route.ts`               | Exchanges a PKCE code and writes the SSR cookie session                                      |
| User/role endpoint          | `app/api/auth/me/route.ts`                 | Verifies the caller, reads `public.users.role` with the service role                         |
| Canonical profile bootstrap | `app/api/auth/upsert/route.ts`             | Authenticated upsert into `public.users`                                                     |
| Logout                      | `app/api/auth/logout/route.ts`             | Signs out the SSR session and removes legacy duplicate cookies                               |
| Legacy cookie bridge        | `app/api/auth/set-cookie/route.ts`         | Used only by the legacy hash-token hook; verifies the token, not an authorization source     |
| Legacy widget session cache | `hooks/useSupabaseSession.ts`              | UI convenience only; never an authorization source                                           |

Google OAuth currently returns to `/login` and lets the browser PKCE client
exchange the code, which is the flow the owner has confirmed working.
`/auth/callback` remains the server-side exchange used when the Supabase project
is configured to redirect there. Both paths end in the same SSR cookie and both
use the same validated return path; neither accepts an external `next`.

Confirmed defects fixed in this task:

- the login page no longer hydrates with a different return path than the
  server-rendered fallback;
- switching Sign in / Register now follows the current query string instead of
  a mount-only effect;
- `/auth/callback` sent failures to the nonexistent `/auth/auth-code-error` and
  redirected to an unvalidated `next`; it now validates `next` and returns to
  `/login?error=callback`;
- `/register` read `searchParams` synchronously, which silently dropped `next`
  on Next.js 16;
- a Google OAuth rejection produced an unhandled promise rejection; it now
  renders an error and re-enables the method buttons;
- the legacy session hook could navigate to an arbitrary URL from localStorage;
  it now applies `safeLoginReturnPath()`.

## 3. Identity source of truth

- **Authentication identity:** `auth.users.id`.
- **Canonical application profile:** `public.users`, same `id` as text.
- **Canonical role:** `public.users.role` (`USER` / `ADMIN`).
- **Compatibility profile:** `public.profiles`, retained for wallet-era and
  legacy fields. It is read only when `public.users` has no row.
- **Legacy role assignments:** `public.user_roles` + `public.roles`. Retained
  for audit/compatibility; never read by application authorization.
- **Untrusted for authorization:** `user_metadata.role`, `app_metadata.role`,
  client flags, `localStorage`, request IP, referrer.

Server checks are implemented in `lib/serverAuth.ts`, `app/api/auth/me/route.ts`
and `app/api/user/role/route.ts`; all read `public.users.role`. The RLS helper
`public.is_current_user_admin()` is being aligned to the same column by the
prepared migration so database policies and server routes cannot disagree.

`AuthContext` now loads the canonical `users` row first and falls back to
`profiles` only when no canonical row exists. If it had to use the compatibility
row (or found no row), it calls the existing authenticated `/api/auth/upsert`
once so new OAuth/OTP/wallet users get a canonical `public.users` record.
Wallet login also writes `public.users` directly; the legacy `profiles` wallet
upsert is best-effort and not an authorization input.

## 4. Supabase Security Advisor review

### `public.get_my_user_roles()` — SECURITY DEFINER + EXECUTE to authenticated

Actual repository facts:

- no application call site for `get_my_user_roles()`;
- the client receives roles from `/api/auth/me`, which verifies the session and
  uses the service-role client;
- `get_my_user_roles(uuid)` and `get_my_user_roles_any(text)` were already
  revoked from `anon`/`authenticated` by
  `2026-10-30_security_hardening_private_data.sql`;
- the no-argument function definition is not stored in this repository, so its
  production body cannot be asserted from source alone.

Decision: `2026-11-20_auth_role_source_and_rpc_hardening.sql` revokes EXECUTE on
the no-argument function from `public`, `anon` and `authenticated`, grants it to
`service_role`, and fixes `search_path`. This removes the Data API surface
instead of trying to prove that an out-of-repository SECURITY DEFINER body is
safe. No role data becomes readable and no RLS policy is loosened.

### RLS-enabled tables without policies

`public.user_roles` and `public.wallet_auth_nonces` have RLS enabled, no
policies, and no `anon`/`authenticated` table grants. Access paths:

- `user_roles`: legacy audit only; server-side SQL under `service_role` or the
  security-definer admin predicate;
- `wallet_auth_nonces`: `/api/auth/wallet/nonce` and `/api/auth/wallet` use the
  service-role client; the nonce is consumed atomically server-side.

Because the Data API roles have no privileges, an additional policy would be
inert. Adding a grant to make a policy meaningful would expose role/audit data.
No policy or grant was added.

## 5. Verification boundary

- Unit tests cover return-path validation, register redirects, callback
  redirects, profile source precedence, login method rendering, OAuth error
  handling, email OTP flow and stored redirect sanitization.
- Lint, typecheck and build are run for the touched area; results are reported
  in the task hand-off.
- Physical iPhone/iPad Safari, production grants and the production body of
  `get_my_user_roles()` are not verified here and are listed as residual risks.
