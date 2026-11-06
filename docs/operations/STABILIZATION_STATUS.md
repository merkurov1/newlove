# Stabilization status

Mission baseline: `81086387` (`main`)
Scope: repository-only stabilization; no production data, secrets, SQL or deployments changed.

## Current status

| Task | Status | Files changed | Tests performed | Result | Remaining risk / external action |
|---|---|---|---|---|---|
| Verify baseline and audit | VERIFIED | `docs/audits/full-project-audit-2026-11-06.md` | Git/history/source inspection | Audited revision confirmed | Live Supabase/Vercel state still requires owner access |
| Protect auction monitor | DONE | `app/api/monitor/search/route.ts` | New route security tests; TypeScript | Admin-only, bounded, rate-limited, no `_debug` response | Deploy and verify admin/non-admin behavior |
| Resolve legacy link-preview boundary | DONE | `pages/api/link-preview.js`, `lib/flow/parseUrl.ts`, security test | Redirect safety test; TypeScript | Shared parser validates redirects; route bounded/rate-limited | DNS rebinding still requires network-level verification |
| Remove reservation false success | DONE | `app/api/request-variant/route.ts` | New endpoint test | Returns explicit 501, never claims durable reservation | Owner decision needed before implementing the real flow |
| Private whisper upload | DONE | Whisper API, microphone clients, admin page/actions | TypeScript; source review | Server-side upload, private path, signed URLs, bounded MIME/size | Apply existing storage SQL only after deployment verification |
| Whisper transcription/reply safety | DONE | `app/api/transcribe/route.ts`, `app/api/whispers/reply/route.ts` | TypeScript; source review | Lookup by stored path, no arbitrary URL input, no false Telegram success | Live Telegram/Supabase test required |
| Route authorization matrix | DONE | `docs/operations/ROUTE_AUTHORIZATION_MATRIX.md` | Static route inventory | Sensitive route families and exceptions documented | Full runtime matrix still needs integration tests |
| Database state procedure | DONE | `docs/operations/DATABASE_STATE.md` | SQL/source cross-check | Production verification procedure documented; no SQL applied | Requires Supabase read-only access |
| Deployment/recovery procedure | DONE | `docs/operations/DEPLOYMENT.md` | Config/source cross-check | Vercel primary contract and worker ownership documented | Scheduler and env presence require owner verification |
| C2 evaluation test | VERIFIED | `lib/knowledge/evaluation/c2/__tests__/c2.test.ts` | Full Jest | Assertion now follows capability probe | None locally |
| Test harness and stale UI assertions | VERIFIED | `jest.setup.js`, Header/Pierrot tests | Focused Jest; full Jest | Removed unused MessageChannel override; async and route-context assertions now match implementation | None locally |
| Full Jest suite | VERIFIED | — | `npm test -- --runInBand --silent` | 267 suites / 1,795 tests passed; exit 0 in ~60s | External services remain untested |
| TypeScript | VERIFIED | — | `npx tsc --noEmit --pretty false` | Passed after P0 changes | Keep as required gate |
| Production build | VERIFIED | — | `npm run build` | Passed locally; exit 0 | Deploy smoke test still required |
| Pierrot observability/routing | IN PROGRESS | — | Existing route tests/source review | Existing protections retained; no broad rewrite | Add bounded stage telemetry only after critical gates |
| Flow recovery/concurrency | VERIFIED | `lib/flow/parseUrl.ts`, security test | Flow posting suite + full Jest | Existing publication state/idempotency mechanisms retained; redirect boundary regression covered | Live platform delivery remains external |
| TypeScript after build | VERIFIED | — | `npx tsc --noEmit --pretty false` (after build) | Passed; do not run concurrently with Next build because `.next/types` is generated | None locally |
| Targeted lint | VERIFIED | — | `npx eslint` on changed runtime files | 0 errors; repository ignore warnings only | `npm run lint` remains a noisy pre-existing baseline failure |
| Supabase exposure verifier | NEEDS OWNER | — | `npm run security:verify` | Correctly refused without Supabase URL/anon credentials | Run against staging/production with `node --env-file=...` |

## External actions required

- Deploy the repository changes through the normal Vercel process.
- Verify the production Supabase schema, RLS, storage bucket privacy and migration history using `DATABASE_STATE.md`.
- Apply the existing whisper storage migration only after the new upload/retrieval code is deployed and tested.
- Confirm the scheduler owner and worker schedule; do not add Vercel cron entries as part of this mission.
- Verify Telegram webhook delivery and signed whisper notification behavior without sending test content to real users unless explicitly approved.

## Status rules

- `DONE` means repository implementation is complete.
- `VERIFIED` means the relevant local test or deterministic inspection passed.
- `IN PROGRESS` means implementation or verification remains.
- `NEEDS OWNER` is reserved for production credentials, external approval or an irreversible product decision.
