# Stabilization report

Date: 2026-11-06
Baseline: `81086387f3a690235db60f42bddcd94b8a5ddfd2`
Scope: repository-only stabilization. No production database, secrets, deployment, external service, publication or scheduler was changed.

## 1. What was fixed

- Protected `/api/monitor/search` with server-verified admin authorization, request bounds, IP rate limiting, bounded provider fetches, timeout, bounded model retries and sanitized responses.
- Hardened the retained public legacy `/api/link-preview` route. It now has method/input/rate limits and uses redirect-by-redirect public URL validation. Unsafe schemes, credentials, private targets and unsafe redirect destinations are rejected.
- Removed the false-success behavior from `/api/request-variant`; it returns an explicit `501` until a durable reservation design exists.
- Moved Whisper capture behind the server. Audio is MIME- and size-validated, stored through the service role under a private storage path, and exposed only through expiring signed URLs. Browser clients no longer upload to or construct public audio URLs.
- Changed transcription to resolve audio by the authenticated admin’s stored `whisperId` and private storage path. Arbitrary caller-supplied audio URLs are no longer used.
- Added bounded Telegram notification behavior and stopped recording a successful reply when Telegram rejects the request.
- Removed the Jest `MessageChannel` override that held React tests open while retaining the `MessagePort` compatibility shim required by Undici.
- Corrected stale tests for Flow’s route-local admin composer and asynchronous Pierrot route-link rendering.

## 2. What was simplified and documented

- Added [route authorization matrix](./ROUTE_AUTHORIZATION_MATRIX.md), [database state procedure](./DATABASE_STATE.md), [deployment/recovery procedure](./DEPLOYMENT.md), and [stabilization status](./STABILIZATION_STATUS.md).
- Kept the existing Flow, Pierrot, Vercel and worker architecture; no new provider, worker, cron job or recurring automation was introduced.
- Removed browser-side Whisper storage coupling and the unused transcription URL path.

## 3. Verification performed

Passed locally:

- `npm test -- --runInBand --silent` — 267 suites, 1,795 tests, exit 0, approximately 60 seconds.
- `npx tsc --noEmit --pretty false` — exit 0 when run after the build.
- `npm run build` — exit 0.
- Focused security, Whisper, Pierrot and Flow tests — 111 tests passed in the combined critical run; Flow/security regression run 18/18 passed.
- Targeted ESLint on changed runtime files — 0 errors; files were reported as ignored by the repository configuration.
- Prettier checks on changed source and test files — passed after formatting.

The full `npm run lint` command still fails on the repository’s existing broad lint baseline. It emits many unrelated legacy errors and is not a reliable release gate until the project’s ESLint scope is repaired. No broad lint cleanup was attempted.

The Supabase exposure verifier was not run against a live project because no staging/production credentials were available. Its refusal was expected and safe; run it using the documented `node --env-file=...` command before production release.

## 4. What remains unverified

- Actual production Supabase migration history, RLS policies, private `whispers` bucket state, grants and deployed SQL functions.
- Vercel deployment, environment-variable completeness, runtime logs and rollback target.
- Telegram webhook delivery, signed audio notification, transcription provider behavior and external publishing providers.
- Browser-level PWA installability, offline behavior, mobile layout and real streaming over a deployed environment.
- Real Flow cross-post delivery and partial-failure recovery against each enabled social provider.
- DNS rebinding behavior under the production network path. Application-level redirect validation is present; network egress controls remain an infrastructure responsibility.

## 5. Production deployment and owner actions

1. Deploy the reviewed commit through the connected Vercel project.
2. Before applying SQL, follow [DATABASE_STATE.md](./DATABASE_STATE.md) to compare production with the expected schema and migration chain.
3. Apply the existing proposed Whisper storage migration through the normal reviewed Supabase process only after confirming the code and bucket names match. Do not apply it from this audit session.
4. Run the Supabase exposure verifier against staging first, then production, without recording row contents or secrets.
5. Verify `/api/health`, public pages, one authenticated admin request, and unauthenticated rejection for changed sensitive endpoints.
6. Confirm the actual external scheduler owner and worker kill switch. Do not add Vercel cron entries as part of this stabilization.
7. Record the deployment ID, commit SHA, schema verification result and rollback target.

No owner approval is needed for the repository changes themselves. Owner authorization is required for production deployment, live Supabase verification/migration and real external-service smoke tests.

## 6. Residual risks

- The reservation endpoint is intentionally unavailable rather than pretending to reserve. Implementing it requires a product/data decision about the canonical reservation record and idempotency key.
- The in-memory rate limiter is process-local and therefore not a distributed abuse-control system. It is an economical first boundary for serverless routes; Vercel/Supabase-level controls should be used if abuse is observed.
- Production database state may differ from repository migrations. The code cannot prove deployed RLS or storage state without read-only external access.
- The repository still contains a large legacy surface and broad lint debt. This mission reduced confirmed failure points but did not justify a wholesale rewrite.

## 7. Maintenance commands

```bash
npx tsc --noEmit --pretty false
npm test -- --runInBand --silent
npm run build
npm run lint                 # currently known baseline failure; review output
node --env-file=.env.staging scripts/security/verify-supabase-exposure.mjs
git status --short
```

Run TypeScript after, not concurrently with, `next build`, because Next generates `.next/types` during the build.

## 8. 30-day assessment

The repository is materially safer and locally reproducible for the confirmed P0 issues, and it introduces no new recurring maintenance process. It is not honest to claim the deployed system is fully ready for 30 days of independence until the owner performs the documented Supabase/Vercel/external-integration verification. After those checks pass, the remaining risks are primarily legacy lint debt, external provider availability and the intentionally unimplemented reservation feature rather than uncontrolled retries, public audio exposure or false reservation success.
