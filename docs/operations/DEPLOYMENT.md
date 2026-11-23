# Deployment and recovery

Vercel is the primary deployment contract for this repository. `vercel.json`
disables automatic deployments for `main` and leaves preview deployments
enabled for other branches. A merge to `main` therefore never deploys to Vercel
Production; production is published only by the owner-triggered release in
Admin → Pierrot Dev → EXECUTION → RELEASE.

## Normal deployment

1. Confirm the working tree and intended commit:

```bash
git status --short
git rev-parse HEAD
```

2. Run local gates:

```bash
npx tsc --noEmit --pretty false
npm run lint
npm test -- --runInBand
npm run build
```

3. Open Admin → Pierrot Dev → EXECUTION → RELEASE. Confirm that the displayed
   `main` SHA is the commit you reviewed, then press **Release**. The server pins
   the SHA and shows the last production SHA, commits/files since production, CI
   status, migration preflight and blockers before the confirmation.
4. The release applies only ordered, safe pending migrations, creates/reuses an
   immutable preview deployment for that exact SHA, promotes it, waits for
   `READY` and verifies that production serves the same commit. It then runs the
   live smoke paths (`/api/health`, `/`) and records the result in the release
   ledger. Rollback to the previous production deployment is attempted if a
   post-promotion step fails. Migration preflight reads
   `PIERROT_RELEASE_DATABASE_URL`/`SUPABASE_DB_URL`/`DATABASE_URL` in a
   read-only session; applying the ordered safe pending set additionally needs
   DDL rights. If those rights are absent, the release stops instead of skipping
   migrations.
5. Do not use `vercel --prod` from a workstation as a substitute. If the Admin
   release reports a missing `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, production
   database read URL or GitHub permission, fix that blocker; do not bypass the
   pinned preview → production promotion.
6. Verify the deployment health endpoint and public smoke paths:

```text
/api/health
/
/lobby
/journal
/flow
/heartandangel
/admin
```

7. Verify one authenticated admin request and one unauthenticated rejection for each changed sensitive endpoint. Do not use real financial, newsletter or public-user content for smoke tests.
8. The release ledger records the Vercel deployment ID, commit SHA, build result and rollback target. Use `PIERROT_RELEASE_SMOKE_PATHS` and `PIERROT_RELEASE_PRODUCTION_URL` to extend or target the smoke check without changing code.

## Environment variables by purpose

The authoritative names are in `.env.example` and feature code. Never copy values into documentation.

- Core: `NODE_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL`.
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Auth/operator: `ADMIN_API_SECRET`, `NEXTAUTH_SECRET`/`NEXT_JWT_SECRET`, Telegram allowlist and init-data secrets.
- Pierrot/AI: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, provider/model/timeout flags, `PIERROT_RAG_ENABLED`, `FLOW_AI_RAG_ENABLED`, `PIERROT_PUBLIC_RAG_ENABLED`.
- Worker safety: `CRON_SECRET`, `OPS_WORKERS_ENABLED`, `OPS_KILL_SWITCH`, worker lock, queue, duration and daily/hourly budget variables.
- Telegram: bot tokens, webhook secrets, allowed IDs, owner/admin IDs and `PIERO_API_SECRET`.
- Publishing: Bluesky, Meta/Threads and channel flags.
- Email/payment: Resend, Stripe secret/signing variables and sender identity.
- Optional integrations: OpenAI transcription, Exa search, GitHub Dev Mode, YouTube, Medium and wallet/NFT variables.

Production must be checked for required values, not just copied from `.env.example`. Missing optional integrations should degrade to a clear disabled state, not trigger retries.

## Webhooks and workers

- Telegram webhook routes validate their configured secret where enabled; verify both registration and environment enforcement before relying on them.
- Stripe webhook requires signature verification; use Stripe test mode only for non-production verification.
- `/api/cron/brain-worker`, `/api/cron/graph-worker`, `/api/cron/media-analysis-worker`, `/api/cron/newsletter-worker` and `/api/cron/pierrot-retention` require `CRON_SECRET`/cron authorization and have bounded work. Their scheduler is external to `vercel.json`; document the actual owner and schedule before enabling.
- Never add a recurring schedule merely to make a queue appear active. If a queue grows, inspect the oldest item, provider failure and worker lock first.

## Recovery

- Roll back to the last known-good Vercel deployment when a release breaks a critical public or auth path.
- Use the worker kill switch and disable individual scopes before investigating runaway AI or queue processing.
- For provider failures, rely on existing bounded fallback/circuit behavior; do not manually replay a job unless its idempotency and external delivery state are known.
- For Flow cross-post uncertainty, inspect the stored channel state and content hash before retrying. Do not blindly republish.
- For whisper failures, preserve the private object and database row for manual reconciliation; do not publish the object to make it easier to access.

## Post-deploy verification

Record:

- Commit SHA and Vercel deployment ID.
- `/api/health` result.
- Authenticated admin and unauthenticated endpoint checks.
- Supabase migration/schema verification from `DATABASE_STATE.md`.
- Worker scheduler status and last successful invocation.
- External integration status without exposing tokens or user data.
