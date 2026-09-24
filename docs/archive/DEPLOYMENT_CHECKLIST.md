Deployment checklist — Newlove

This checklist collects the steps and environment settings we recommend before deploying to Vercel (or another host).

1) Secrets & env
  - NEXT_PUBLIC_SUPABASE_URL — your Supabase URL (https://<project>.supabase.co)
  - NEXT_PUBLIC_SUPABASE_ANON_KEY — anon key for browser client (public)
  - SUPABASE_SERVICE_ROLE_KEY — service_role key (server-side only)
  - DATABASE_URL — (if CI or scripts need direct DB access)
  - RESEND_API_KEY — for sending emails
  - ADMIN_API_SECRET — optional admin API secret used by some server endpoints
  - SENTRY_AUTH_TOKEN and related Sentry project envs (if using Sentry)

2) Build & migrations
  - Run database migrations in a staging environment (check `migrate_*.sql` in repo)
  - Run `npm ci` then `npm run build` locally or in CI
  - Confirm `next build` completes without OOM (CI runners typically have enough RAM)

3) CI / Lint
  - Ensure GitHub Actions (or similar) runs `npm run lint` and `npx tsc --noEmit`
  - Run unit/integration tests where applicable

4) Vercel project setup
  - Create a Vercel project linked to this repository
  - Set the environment variables in Vercel dashboard (Production and Preview)
  - Set `Build Command: npm run build` and `Output Directory: .next`
  - If using Edge functions or Sentry, add required extra envs (SENTRY_DSN, etc.)

5) Smoke tests (after deploy)
  - Visit the site root; ensure the homepage loads and critical pages render
  - Test auth-protected admin flow (with a staging admin account)
  - Run `node scripts/test-tags.js --apply` in the staging env (with service role key) to validate DB access

6) Rollback plan
  - If a deployment fails, rollback to the last successful Vercel deployment
  - Keep database migrations reversible or run compensating migrations if necessary

Notes
  - We disabled heavy local Sentry/optimizeCss behaviors to avoid OOM during development. CI and Vercel should run full build (SKIP_SENTRY unset).
  - Add secrets to both Vercel and GitHub Actions (for CI jobs that need service-role key). Prefer Vercel for runtime secrets; limit service_role exposure in CI.
