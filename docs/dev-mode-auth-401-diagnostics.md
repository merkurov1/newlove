# Dev Mode / admin API 401 diagnostics

Date: 2026-11-27

## Repository base mismatch (important)

The task worktree was created from base commit `d6690ed0b8df7de4dc5917a84facfbd51253ff98`.
At the time of this attempt `origin/main` (production) was
`ee7ed0500dc84a249b78c3d9cc057b8be47f6f89`, i.e. the worktree base is **411
commits behind** production.

Consequences:

- `app/api/admin/youtube/channels/route.ts`
- `app/api/admin/youtube/channels/connect/route.ts`
- `app/api/auth/youtube-channels/callback/route.ts`
- `lib/youtube/channels.ts`
- `components/youtube/YouTubeProjectWorkspace.tsx`

do **not exist** at this base. The YouTube-specific fix, its UI diagnostics and
any end-to-end OAuth verification cannot be applied or executed from this
worktree without replaying hundreds of unrelated upstream commits.

The shared authentication layer does exist at this base and is the layer that
produced the reported 401, so the fix below is implemented there. It is written
against the current production auth module so it can be carried forward.

## What the production evidence showed

- Repeated `GET /api/admin/youtube/channels` → `auth_denied reason=admin` (401).
- No `/api/auth/youtube-channels/callback` request in the reviewed window.
- Zero rows in `youtube_oauth_connections`, `youtube_channels`,
  `youtube_project_bindings`, `youtube_management_audit`.
- A Google consent redirect or a READY preview therefore never proved a
  persisted connection.

These observations are taken from the recheck findings; they were not
reproduced from this worktree because production runtime logs and credentials
are not available here.

## Root cause addressed

The browser-cookie path (`requireAdmin`) validated the Supabase session and then
read `public.users.role` through the same cookie-bound **anon** client. The
Bearer path already re-read the role with the service-role client.

That asymmetry meant any `users` RLS/grant regression, a transient policy
problem, or a mixed-case legacy role could turn a real owner into either an
anonymous visitor or a non-admin. Both outcomes were logged as the same
`reason=admin`, so the log could not distinguish "session missing" from
"signed in but role not recognised".

The fix:

1. Validate the session with Supabase first (unchanged).
2. Read the canonical `public.users` profile with the server-only service-role
   client, falling back to the session client only when no service key is
   configured.
3. Fall back to the legacy `profiles` table only when the canonical row is
   absent.
4. Normalise role casing/whitespace (`ADMIN`, `admin` → `ADMIN`).
5. Distinguish denial reasons in the security log:
   - `reason=session` — no valid cookie session (`auth_session_missing`).
   - `reason=admin` — valid session, account is not an admin
     (`auth_admin_required`).
     Additional boolean flags show whether a cookie header / Supabase auth cookie
     reached the route. Cookie values and tokens are never logged.
6. Expose stable failure codes on `AuthenticationError` so API/UI layers can
   show an actionable message.

## Owner-facing diagnostics

- New owner-only endpoint:
  `GET /api/admin/auth-diagnostics`.
- It exercises the same `requireAdminFromRequest` path used by
  `/api/admin/*`, including YouTube status/connect.
- It returns HTTP status, `code`, role, auth method (`session`, `bearer`,
  `telegram`, `admin-secret`) and profile source, plus booleans describing
  whether a cookie / Supabase session cookie / Bearer / secret header reached
  the route.
- The Dev Mode page (`/admin/pierrot/dev`) now renders a compact
  "API AUTH · Диагностика админ-сессии" panel that calls this endpoint.

## How to verify manually on production

1. Sign in as the owner and open `/admin/pierrot/dev`.
2. Click **Проверить API**. Expected: HTTP `200`, `authorized: true`,
   `role: ADMIN`, `authMethod: session`, `profileSource: users`.
   - HTTP `401` / `auth_session_missing`: the API request did not carry a usable
     Supabase cookie session. Re-login and re-check.
   - HTTP `403` / `auth_admin_required`: the session is valid but the canonical
     `public.users.role` is not `ADMIN`. Fix the role through an approved
     administrative flow; do not add a metadata bypass.
3. Then open the YouTube page, confirm the status GET is `200`, click connect,
   complete Google consent, and verify the callback.
4. Success requires a real persisted row in `youtube_oauth_connections`, channel
   rows and the correct active project binding. A consent redirect alone is not
   success.

## Migration

None. This change is additive and requires no database migration.

## Verification performed in this worktree

- `pnpm exec jest lib/auth app/api/admin/auth-diagnostics app/api/admin/pierrot/__tests__ --runInBand`
  — 5 suites, 28 tests passed.
- `pnpm exec tsc --noEmit` — no errors in changed files; command still exits 2
  because of pre-existing missing modules (`nanoid`, `domhandler`,
  `@types/jsdom`) unrelated to this change.
- `next lint` — the repository's ESLint config reports pre-existing
  `react/react-in-jsx-scope` and `@typescript-eslint/no-explicit-any` errors in
  existing files; no new lint category was introduced by this change.
