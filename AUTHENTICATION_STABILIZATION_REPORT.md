# NewLove Authentication & Access Control — Stabilization Report

**Date:** 3 November 2026  
**Repository:** `merkurov1/newlove`  
**Mode:** audit + targeted security corrections. No production migrations, no deploy, no account changes.

---

## A. Authentication methods

| Method             | Registration                                                              | Login                                                | Session behavior                                        | Status                    | Notes                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google OAuth       | Yes, via Supabase                                                         | Yes                                                  | Supabase SSR cookie session; returns to requesting page | Preserved                 | `/login` respects `next`, stored return path and same-origin referrer                                                                                                                                                        |
| Email OTP          | Yes                                                                       | Yes                                                  | Supabase session; returns to requested page             | Preserved                 | OTP verification goes through Supabase Auth                                                                                                                                                                                  |
| Passkey / WebAuthn | Component contains registration helper, but main `/login` exposes sign-in | Yes, where Supabase SDK supports `signInWithPasskey` | Supabase session                                        | Preserved with limitation | Registration is not exposed in the primary login UI; not claimed as fully implemented                                                                                                                                        |
| Wallet / Web3      | New wallet account creation through server endpoint                       | Yes                                                  | Supabase session returned to client                     | Hardened                  | Now requires a server-issued single-use nonce, domain/URI/chain/freshness checks and a random server-only password. A second Supabase `signInWithWeb3` flow still exists in `ModernLoginModal`; consolidation is a follow-up |

Registration through `/register` redirects to `/login?mode=register`, so all new ordinary accounts are created as `USER`.

---

## B. Access matrix

| Capability                                      | Guest                 | User                   | Admin              |
| ----------------------------------------------- | --------------------- | ---------------------- | ------------------ |
| Browse public pages                             | Yes                   | Yes                    | Yes                |
| Public Pierrot / public projects / publications | Yes                   | Yes                    | Yes                |
| Use guest Pierrot interactions                  | Permitted guest paths | Yes                    | Yes                |
| `/profile`                                      | Redirect/guest prompt | Own profile only       | Own profile        |
| Edit profile                                    | No                    | Own public fields only | Own profile        |
| Change own role                                 | No                    | No                     | No through profile |
| `/admin` pages                                  | Denied (`/403`)       | Denied (`/403`)        | Allowed            |
| Admin APIs                                      | 401                   | 403                    | Allowed            |
| Media storage listing API                       | 401                   | 403                    | Allowed            |
| Media upload/delete                             | Denied                | Denied                 | Allowed            |
| Art Engine admin workspace                      | Denied                | Denied                 | Allowed            |
| Brain / RAG / Pierrot admin                     | Denied                | Denied                 | Allowed            |
| Users directory `/users`                        | Denied                | Denied                 | Allowed            |

Server authorization is authoritative; UI role flags are not.

---

## C. Security findings

### Confirmed vulnerabilities found

1. **Media API authorization bypass** — `/api/media` obtained a service-role client before checking the caller. Anonymous requests could reach privileged Storage listing.
2. **Debug endpoint disclosure** — `/api/test-auth` returned user identity and infrastructure diagnostics without administrator verification.
3. **Service-role fallback** — `getUserAndSupabaseForRequest()` could return a service-role client even when no user was authenticated.
4. **Subscriber delete endpoint** — admin check existed, but operation used the ambiguous request helper and returned false success on failure.
5. **Role management mismatch** — admin role updates wrote `auth.users.user_metadata.role`, while server authorization reads `public.users.role`. Promotions could appear in the UI but not grant server access.
6. **Admin user listing trusted metadata** — `/api/admin/users` displayed `user_metadata.role` instead of `users.role`.
7. **Wallet authentication weakness** — deterministic password derived from the service-role secret; no nonce/domain/expiry validation.
8. **Public users directory** — `/users` used service-role `auth.admin.listUsers()` without an admin guard and exposed emails.
9. **Storage policy weakness (pending migration)** — production currently allows public INSERT into `heartandangel` and authenticated INSERT/UPDATE in `media`, plus authenticated INSERT into `artifacts`.

### Fixed

- `/api/media`: admin required first; 401/403; service-role only after verification; 503 on storage/config failure; no empty-success masking.
- `/api/test-auth`: admin-only; 401/403; no email, tokens, cookies or internal errors.
- `getUserAndSupabaseForRequest`: request-scoped client only; no service-role fallback.
- `/api/subscribers/[id]`: admin-only, explicit errors, service-role only after authorization.
- `/api/admin/auth-trigger-errors`: switched to `requireAdminFromRequest`.
- `/api/admin/users` and `/api/admin/users/[id]`: canonical `users.role`, allowlisted updates, 401/403 split.
- `adminUpdateUserRole`: writes `public.users.role`; mirrors auth metadata only for UI compatibility.
- `/api/auth/me` and `/api/user/role`: canonical `users.role` only.
- Header admin UI no longer trusts `user_metadata.role` or hardcoded email.
- `/api/articles/[id]`: service role only for admins; public path uses request client + published filter.
- `/api/auth/wallet`: single-use server nonce, domain/URI/chain/freshness validation, random password, generic errors.
- Added `/api/auth/wallet/nonce`.
- Added `/api/auth/logout`; AuthContext calls it after local sign-out.
- `/api/auth/set-cookie`: verifies the submitted access token with Supabase before setting HttpOnly cookies.

### Remaining risks / follow-ups

- Storage policy migration is prepared but **not applied**.
- Wallet native SIWE uses a custom compatibility endpoint; two wallet flows still exist (custom endpoint + Supabase `signInWithWeb3`). Consolidation should follow after observation.
- `public.user_roles` remains as legacy data; it is no longer authoritative. Migration preserves existing admins but does not delete the table.
- Some older admin routes return 401 instead of 403 for authenticated non-admins. This does not grant access but is inconsistent.
- Not every one of the 183 API routes has been exhaustively re-reviewed; high-risk auth, admin, media, user and debug paths were prioritized.
- Production RLS/storage state was inspected read-only; repository migrations and production state are recorded separately.

### RLS / Storage status (production read-only inspection)

- RLS enabled on `users`, `profiles`, `subscribers`, `articles`, `projects`, `user_roles`, `orders`.
- `users` own/admin select and own insert/update policies present.
- `profiles` select is own-or-admin; update is own only.
- `subscribers` authenticated select own only; writes service-role only.
- `user_roles` has no anon/authenticated grants.
- Storage public read remains intentional for `media`, `artifacts`, `heartandangel`.
- Storage direct upload policies are the remaining confirmed weakness; see migration.

---

## D. Architecture

- **Canonical identity:** Supabase Auth `auth.users.id`.
- **Canonical application profile:** `public.users`, keyed by the same id.
- **Compatibility profile:** `public.profiles` remains for wallet/legacy fields; not the role authority.
- **Canonical role:** `public.users.role` (`USER` / `ADMIN`).
- **Legacy roles:** `public.user_roles` / `public.roles` preserved; not authoritative for server authorization.
- **Untrusted:** `user_metadata.role`, `app_metadata.role`, client flags, `/admin` history, IP, fingerprint.
- **Session:** Supabase SSR cookie session; middleware refreshes claims; server helpers verify with Supabase Auth.
- **Authorization helpers:** `requireAdmin`, `requireAdminFromRequest`, `requireUser`, `isVerifiedOwnerUser`, `isVerifiedOwnerCredential`, `authorizeKnowledgeAdmin`.
- **Admin APIs:** must call `requireAdminFromRequest(req)` independently; page-level guards are not sufficient.

---

## E. Database migrations

Created, **not applied automatically**:

1. `migrations/2026-11-03_wallet_auth_nonces.sql`
   - single-use nonce table, RLS enabled, service-role only.
2. `migrations/2026-11-03_auth_storage_policy_hardening.sql`
   - removes public/authenticated direct upload policies for `heartandangel`, `media`, `artifacts`;
   - keeps intentional public read policies.
3. `migrations/2026-11-03_auth_role_consolidation.sql`
   - preserves legacy ADMIN assignments in `users.role`;
   - defaults empty role to USER;
   - documents `users.role` as authoritative and `user_roles` as legacy.

No seed, delete, truncate, account deletion or destructive operation.

**Manual action required:** review and apply in Supabase SQL Editor in this order:
role consolidation → wallet nonces → storage hardening. Then deploy code (wallet login requires the nonce table).

---

## F. Regression results

Executed:

- `npx tsc --noEmit` — only one pre-existing unrelated error in `lib/flow/publish.ts` from other worktree changes; new auth files compile.
- Targeted Jest:
  - `app/api/media/__tests__/route.test.ts` — 5 passed.
  - `app/api/test-auth/__tests__/route.test.ts` — 3 passed.
  - `lib/auth/__tests__/walletMessage.test.ts` — 6 passed.
  - `lib/auth/__tests__/returnPath.test.ts` — 4 passed.
  - **Total: 19 passed.**
- Full repository suite was not claimed as clean because unrelated worktree changes currently produce failures/timeouts outside auth.
- Production build was not run to completion after these changes; no deployment performed.

---

## G. Observation period

Recommend **7–14 days without changing authentication architecture**.

Monitor:

- Google OAuth callback errors and redirect loops.
- OTP delivery/verification and resend behavior.
- Passkey availability and WebAuthn errors.
- Wallet nonce failures, replay rejections and login success rate.
- 401/403 rates on `/api/media`, `/api/admin/*`, `/users`.
- Profile creation/synchronization between `auth.users`, `users`, `profiles`.
- Logout followed by admin API access.
- Role changes and their effect on admin access.
- Storage upload failures after the policy migration.

Do not add new auth methods or redesign the flow during this period unless a critical security issue is confirmed.

---

## Changed files (auth stabilization)

- `app/api/media/route.ts`
- `app/api/test-auth/route.ts`
- `app/api/subscribers/[id]/route.ts`
- `app/api/admin/auth-trigger-errors/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/users/[id]/route.ts`
- `app/api/auth/wallet/route.ts`
- `app/api/auth/wallet/nonce/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/set-cookie/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/user/role/route.ts`
- `app/api/articles/[id]/route.ts`
- `app/users/page.tsx`
- `app/admin/actions.ts`
- `app/login/page.tsx`
- `components/WalletLoginButton.tsx`
- `components/AuthContext.tsx`
- `components/Header.tsx`
- `components/admin/ContentForm.tsx`
- `lib/getUserAndSupabaseForRequest.ts`
- `lib/auth/walletMessage.ts`
- `lib/auth/returnPath.ts`
- tests for media, test-auth, wallet message and return path
- three migration files listed above

No secrets were printed. No production data, roles or sessions were modified.
