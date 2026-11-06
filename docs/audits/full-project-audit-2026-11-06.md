# Full project audit — merkurov.love / newlove

Audit date: 2026-11-06
Audited revision: `81086387` (`main`)
Scope: repository implementation, checked-in SQL/migrations, tests, configuration and documentation.

## Audit limits and confidence

This was a read-only repository audit. No production code, database, environment variable, deployment or external service was changed. I did not have a verified live Supabase schema snapshot, Vercel project/deployment access, production logs, or a browser/device session against the live site. Therefore claims about deployed RLS, current data, live social credentials, actual costs, installability and real mobile behavior are marked as unverified unless the repository itself proves them.

The working tree was clean at the end of the audit. The checked-out commit includes the recent Skill Foundry/media changes; local edits seen in the initial workspace were not present after the session was restored.

## A. Executive summary

`newlove` is a functioning but highly expanded personal platform: public multilingual website, editorial CMS, Flow publisher, art/auction tools, Heart & Angel experience, Telegram integrations, owner PWA/workspace, Pierrot chat, Brain/RAG/media intelligence, newsletter, payments, wallet/NFT experiments and a large admin API.

The project is not presently a small one-person application in operational terms. It has 1,469 TypeScript/JavaScript source files, 203 route handlers, 236 client-marked files, 72 top-level migration files, 270 test files and 88 runtime dependencies. The main risk is architectural accumulation: multiple generations of auth, data models, route styles, worker entry points and AI subsystems coexist, while the repository does not prove which migrations and external schedules are actually deployed.

The immediate posture is:

- TypeScript passes.
- The full Jest command is not green: `lib/knowledge/evaluation/c2/__tests__/c2.test.ts` fails because its expected blocker text is stale, and the command remains open until the 90-second timeout used for verification.
- Admin pages are generally server-guarded and most modern admin routes use centralized authorization, but a number of public or legacy routes remain bespoke, incomplete or unauthenticated.
- The strongest confirmed application-level security issues are an unauthenticated auction-search route with verbose debug/provider output, a public legacy link-preview handler whose route does not call the shared SSRF guard, and a public placeholder reservation endpoint that returns success without persisting a reservation.
- Whisper privacy hardening is documented but explicitly not applied. Browser components still upload voice recordings directly into the public `whispers` bucket and expose public URLs.
- Cron/worker handlers are guarded and bounded in code, but `vercel.json` contains no schedules. The system therefore depends on an undocumented external scheduler or manual/admin invocation for autonomous work.
- Pierrot has serious engineering effort and useful bounds, but its request path combines identity, consent, conversation persistence, commercial logic, multiple retrieval paths, web search, media intelligence, memory, owner tools and streaming in one very large route. It is difficult to prove end-to-end correctness without production traces and targeted integration tests.

The best next move is consolidation and verification, not another subsystem. Establish one authoritative deployment/schema manifest, close the three confirmed public endpoint gaps, finish or remove the whisper hardening transition, make the Jest suite deterministic, then instrument and test the Pierrot/Flow critical paths.

## B. Architecture map

### Runtime shape

```text
Browser / Telegram Mini App / Telegram Bot
        |
        v
Next.js 14 App Router + legacy pages/api
  - Server-rendered public pages
  - Client-heavy PWA/workspace components
  - 203 route handlers and server actions
  - middleware.ts for Supabase cookie refresh and markdown rewrites
        |
        +--> Supabase Auth / Postgres / Storage / RPC / Realtime
        |
        +--> AI providers: Gemini, DeepSeek, OpenRouter embeddings
        |
        +--> Telegram, Bluesky, Meta/Threads, Resend, Stripe,
        |    YouTube, Medium, Exa/Jina/Bing/DDG and GitHub
        |
        +--> Vercel serverless execution (deployment config has no cron entries)
```

### Data and feature domains

- Legacy editorial domain: `articles`, `letters`, tags, projects and older API routes.
- Flow domain: `items`, normalized Markdown/content metadata, `flow_ai_context`, distribution state embedded in `items.metadata`, and cross-post adapters.
- Pierrot domain: conversations/messages/events, identity attribution, consent, human presence, memory records/embeddings, skills, owner tools, commercial analytics and answer/retrieval traces.
- Brain/media domain: knowledge documents/chunks, embeddings, ingestion runs, graph entities/relations, media archive records, analyses and queues.
- Public experiences: Journal, Heritage, Advising, Lobby, Temple, Heart & Angel, Liveheart, Unframed and media/archive pages.
- Admin domain: multiple route families for editorial, Flow, Brain, media intelligence, Art Engine, newsletter, users and Pierrot operations.

### Boundaries

The repository has both a canonical-looking `lib/supabase/server.ts` wrapper and direct `@supabase/supabase-js` clients in route files. It has centralized `requireAdminFromRequest`, browser/cookie auth, Telegram Mini App auth, shared-secret server adapters and route-specific credentials. This makes the security boundary real but distributed.

## C. Critical findings

### C1 — Public auction-search route is unprotected and leaks diagnostics

Evidence: `app/api/monitor/search/route.ts:27-31` accepts POST requests without authentication or rate limiting. The route performs several external fetches and returns `_debug` data including provider URLs, snippets, response lengths, extracted links and raw error messages (`:33-80`, with similar behavior later in the file).

Impact: public cost/abuse surface, scraping amplification, provider quota consumption and unnecessary operational disclosure. The route also has no explicit body-size or artist-length bound.

Severity: High, confirmed from code. Whether it is reachable in production is assumed from its route placement but was not externally tested.

### C2 — Legacy `/api/link-preview` bypasses the shared SSRF protection boundary

Evidence: `pages/api/link-preview.js:3-14` accepts a caller-supplied URL and calls `parseUrl(url)` directly. The shared parser contains `assertSafePublicUrl` and comments that the capability should be admin-only, but this legacy route does not invoke an auth guard in the handler. The same repository also contains a guarded App Router admin parser.

Impact: unauthenticated server-side fetching of attacker-chosen URLs, potential SSRF/DNS-rebinding risk, bandwidth and parser resource consumption. The parser itself limits some URL classes, but route-level protection is missing and the old/new endpoints overlap.

Severity: High, confirmed route-boundary defect.

### C3 — Reservation endpoint is a success-returning stub

Evidence: `app/api/request-variant/route.ts:3-18` accepts `wallet_address`, `variant` and `tx_hash`, checks only that the service-role environment variable exists, and returns `{ ok: true, message: 'reserved (stub)' }`. It performs no database write, signature verification, ownership check, validation or idempotency.

Impact: callers can receive a false success; the API contract is misleading and any UI relying on it can lose user intent. This is a broken feature, not merely technical debt.

Severity: High for the feature, low for general platform security unless connected to a later entitlement flow.

### C4 — Whisper privacy fix is not deployed and code still creates public URLs

Evidence: `components/MicrophoneButton.tsx:61-84` and `components/MicrophoneInline.tsx:95-132` upload directly with the browser Supabase client to `whispers` and call `getPublicUrl`. The hardening SQL explicitly says `STATUS: PROPOSED` and says application work must precede it (`migrations/2026-10-30_security_hardening_storage.sql:1-18`).

Impact: voice recordings are publicly addressable; the browser also posts Telegram identity fields and storage paths to `/api/whispers`. Applying the proposed SQL before changing the clients would break capture, while leaving the current state exposes sensitive user-generated audio.

Severity: High privacy risk, confirmed in repository state; actual bucket/policy state requires live Supabase verification.

### C5 — Worker architecture is bounded but not autonomously reproducible

Evidence: `vercel.json` contains build/deployment settings but no `crons`. The README and `docs/production-operations.md` say workers are driven by an external scheduler or explicit admin API. The repository has five cron/worker route families with `maxDuration` up to 300 seconds and database lock/rate-limit infrastructure.

Impact: Brain ingestion, graph work, media analysis, newsletter delivery and retention may silently stop if an external scheduler is absent or misconfigured. Conversely, an undocumented scheduler can invoke expensive work outside the repository’s deployment contract.

Severity: High operational risk, confirmed as a deployment/documentation gap; actual scheduler existence is unverified.

### C6 — Database state is not reproducible from a single canonical migration chain

Evidence: the repository contains 72 top-level migration files plus separate `sql/` setup scripts, archive/rollback files and migrations explicitly marked proposed/manual review. Migration filenames extend through `2026-11-20`, while the audited date is `2026-11-06`. Several files use `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, ad-hoc grants and policy drops. There is no checked-in Supabase migration metadata or schema snapshot proving the live sequence.

Impact: a fresh project cannot reliably be inferred from `migrations/` alone; deployment order, applied status and policy state can diverge. Security fixes can exist in the repository while production remains vulnerable.

Severity: High maintainability and security-assurance risk.

## D. Technical debt and architectural weaknesses

### D1 — Two routing generations and overlapping endpoints

The project uses App Router throughout most of the application but retains `pages/api/link-preview.js` and many legacy-compatible routes. Similar domains appear in multiple paths: `/api/flow`, `/api/flow/items`, `/api/admin/items`, legacy article routes, and separate Journal/Letters implementations. This increases the chance that one path receives a security or behavior fix while its sibling does not.

### D2 — Auth is centralized in principle, distributed in practice

`lib/serverAuth.ts` supports a shared admin secret, Telegram init data, Supabase bearer JWT and cookie session. Other routes use `getUserAndSupabaseForRequest`, direct Supabase clients, route-specific secrets, Stripe signatures or cron secrets. The centralized helper resolves admin status from `users.role`; other code and migrations also reference `user_roles`, `profiles.role`, JWT claims and Telegram identity. The system is defensible only if every sensitive route is reviewed against the same matrix.

### D3 — Excessive client surface for a personal admin application

There are 236 files marked `use client`, including most Pierrot workspace tabs, Flow, admin tools and interactive public experiences. This is not automatically wrong, but it increases JavaScript payload, hydration work, state duplication and the number of places that must handle auth, loading, offline and error states. `app/flow/page.tsx` is a client page that fetches items and, for admin users, separately fetches admin item data; that boundary should be justified or simplified.

### D4 — Pierrot route is a concentration point

`app/api/pierrot-web/route.ts` imports identity, consent, commercial, several retrieval systems, web search, memory, skills, human presence, streaming and owner tools. It supports both public and owner behavior. The model layer has Gemini → direct DeepSeek → OpenRouter DeepSeek fallback, while other AI modules separately use provider-specific paths. The design has useful bounded timeouts and resource guards, but a single request can still traverse many deterministic stages before one model call, and the route is hard to test as a unit.

### D5 — Content, distribution and publication state are embedded in JSON metadata

`lib/flow/crosspost.ts` stores channel state in `items.metadata.crosspost.channels`. This avoids more tables, but makes atomic transitions, reporting, retries and uniqueness difficult. The code has `contentHash`, attempts, uncertain state and publishing locks, which is good defensive work; however, without integration tests against real concurrent updates, duplicate prevention is only partially verified.

### D6 — Backups and abandoned implementations remain in the tree

Examples include `.bak` lobby/media components, `ClientPage_new.tsx` and `ClientPage_fixed.tsx`, legacy NextAuth-related schema references, NFT artifacts, old SQL scripts and many archive documents. They increase search noise and make it harder to determine the supported path. This is a simplification opportunity, not a reason to delete blindly.

### D7 — Configuration contains conflicting hosting assumptions

`next.config.js` sets `output: 'standalone'` and comments about Render while `vercel.json` is the active Vercel configuration. Package scripts contain both Vercel and Render commands. This is harmless until deployment behavior differs, at which point standalone tracing, server external packages and environment loading become difficult to reason about.

## E. Functionality verification

| Feature | Expected behavior | Actual implementation | Status | Problems / confidence |
|---|---|---|---|---|
| Public website pages | Render public sections with metadata | App Router pages, shared SEO helpers, dynamic sections | PARTIALLY VERIFIED | Source structure is present; no production/browser smoke test |
| Supabase cookie auth | Refresh and resolve browser session | `middleware.ts`, `@supabase/ssr`, server auth helper | PARTIALLY VERIFIED | Typechecks; multiple legacy cookie conventions remain |
| Admin page protection | Reject non-admin visitors | `app/admin/layout.tsx` calls `requireAdmin()` | VERIFIED | Page-level guard confirmed in source; API coverage still needs matrix testing |
| Admin API protection | Protect all privileged handlers | Most modern routes use centralized guard or knowledge admin authorizer | PARTIALLY VERIFIED | Public `/api/monitor/search`, legacy link preview and several bespoke routes show drift |
| Flow public feed | Paginated published items | Client fetches `/api/flow/items`; cache helpers and public filters exist | PARTIALLY VERIFIED | No browser/API integration run; client-heavy path |
| Flow publishing | Create item, persist, cross-post, record state | `lib/flow/publish.ts` persists then calls crosspost and AI context | PARTIALLY VERIFIED | Duplicate key path exists; no live provider/concurrency verification |
| Flow retry | Resume failed/uncertain channel work | Crosspost state includes attempts, hashes, locks, uncertain and resume states | PARTIALLY VERIFIED | Strong implementation, but no end-to-end replay test against external APIs |
| Bluesky length handling | Fit 300 grapheme limit | Recent commit adds composition and tests | VERIFIED | Unit coverage present; live posting unverified |
| Pierrot public chat | Stream bounded response with consent and rate limits | `/api/pierrot-web` plus stream protocol and provider fallback | PARTIALLY VERIFIED | Unit tests exist; full retrieval/provider/persistence chain not verified |
| Pierrot owner mode | Owner-only Brain/tools/admin context | Owner identity and authorization modules are wired into route | PARTIALLY VERIFIED | No live auth/RAG boundary test; route complexity is high |
| Pierrot memory | Create/search/update/archive records | Dedicated memory stores/routes and UI exist | PARTIALLY VERIFIED | Schema application and cross-user isolation unverified |
| Pierrot skills | Define, validate, analyze and run skills | Admin Skill Foundry, validation, analysis and SQL tables exist | PARTIALLY VERIFIED | Repository has schema/code; actual execution/tool integration is not proven |
| Brain ingestion/RAG | Ingest, embed, retrieve evidence | Knowledge routes, workers, vector/hybrid SQL and evaluation suites exist | PARTIALLY VERIFIED | C2 test fails; external DB embeddings not tested |
| Brain autonomous worker | Process bounded queue without overlap | Cron route, DB locks, budgets and kill switches exist | PARTIALLY VERIFIED | No Vercel schedule; external scheduler unknown |
| Media intelligence | Ingest/analyze/search media archive | Admin routes, queue, graph/coverage and retrieval modules exist | PARTIALLY VERIFIED | Heavy surface; no live queue/AI verification |
| Whisper recorder | Upload private audio and create moderation record | Browser uploads public `whispers` object and posts public URL | BROKEN / privacy unsafe | Proposed private-storage migration conflicts with current client |
| Reservation/variant request | Reserve a variant and persist entitlement | Returns success stub without DB write | BROKEN | Explicit TODO in route |
| Auction monitor search | Admin search with bounded output | Unauthenticated multi-provider search with `_debug` output | BROKEN security boundary | No auth/rate limit/body bound |
| Newsletter worker | Claim job, send, log, finish | Cron secret, atomic status claim, batch processing | PARTIALLY VERIFIED | Code is bounded; scheduler/provider delivery unverified |
| PWA site installability | Installable site shell | Manifest route exists with standalone display | PARTIALLY VERIFIED | No site-wide service worker; only Pierrot/Heart & Angel paths register workers |
| Heart & Angel offline mode | Offline experience for scoped app | Dedicated manifest/layout and service-worker references exist | PARTIALLY VERIFIED | Browser cache/install behavior not tested |
| Sitemap | Include public static and dynamic content | Dynamic Supabase-backed sitemap with language alternates | PARTIALLY VERIFIED | DB unavailable fallback returns partial sitemap; no live URL audit |
| Internationalization | Language-aware pages and alternates | `lib/i18n/config`, localized routes and sitemap alternates | PARTIALLY VERIFIED | Only selected sections have explicit localized routes; no browser language matrix |
| Tests | Prevent regressions | 270 test files; Jest runs but full command fails/hangs | BROKEN | C2 expectation mismatch and open-handle/timeout behavior |
| Type safety | Build-blocking TS validation | `tsc --noEmit` passed | VERIFIED | `allowJs: true` and `any` usage still reduce effective coverage |

## F. Security assessment

### Confirmed or highly credible findings

1. **High — unauthenticated `/api/monitor/search`**: external fetch fan-out, AI fallback and verbose `_debug` response. Add admin auth if it is an admin tool; otherwise add strict abuse controls and remove diagnostics.
2. **High — unauthenticated legacy link preview**: `pages/api/link-preview.js` does not use the shared SSRF/auth boundary. Remove it or make it a thin wrapper around a guarded implementation.
3. **High — public whisper storage path**: current clients upload with anon/browser credentials and call `getPublicUrl`; hardening SQL is explicitly not applied.
4. **Medium/High — false-success reservation endpoint**: no validation or persistence and returns caller input. Remove the route until implemented or return `501 Not implemented`.
5. **Medium — shared-secret admin model**: `ADMIN_API_SECRET`, Telegram init data, internal adapter secrets and Supabase sessions coexist. Long-lived shared headers are difficult to rotate and audit. Prefer one operator auth path, retaining narrowly scoped webhook secrets only for webhooks.
6. **Medium — `dangerouslyAllowSVG: true`** in `next.config.js`. The configured image CSP is restrictive, but SVG handling should be justified and limited to trusted sources; otherwise remove SVG allowance.
7. **Medium — request debug/error output**: monitor/search includes raw debugging; multiple legacy handlers return `err.message` or `String(error)` to clients. Normalize public errors and log correlation IDs instead.
8. **Medium — rate limiting is partly in-memory**: repository documentation describes per-instance limits as a speed bump. This is insufficient for hard abuse protection across serverless instances; use provider/WAF limits for public AI, search and upload routes.

### Supabase-specific conclusions

The repository contains good security patterns in newer SQL: RLS enablement, explicit revokes, service-role-only tables, fixed search paths on security-definer functions, bounded worker locks and explicit storage limits. However, proposed/manual-review migrations are not evidence of deployed state. A live audit must compare `pg_policies`, table grants, function execute grants, storage bucket policies, view security mode and migration history with the checked-in files.

Do not assume the public anon key is a secret; it is expected in browser code. The service-role key must remain server-side. The checked-in `.env.example` contains placeholders only, and `.env.local`/`.env.production.local` are ignored rather than tracked. No secret value is reproduced in this report.

## G. Performance and cost

- **Pierrot request cost**: retrieval can involve Brain, Flow/public RAG, media evidence, web evidence, memory/context and commercial logic before the LLM call. Timeouts and token budgets exist, but the route’s broad import/call graph makes accidental multi-source work hard to detect. Add per-request stage traces and a hard maximum external-call budget.
- **AI fallback cost**: the model layer intentionally tries Gemini, then DeepSeek, then OpenRouter DeepSeek. This is reliable only if failures are classified correctly. A timeout or provider-side partial failure can still consume paid work before fallback. Record provider attempts and enforce a total request deadline.
- **Worker cost**: Brain, graph and media workers have five-minute serverless limits and queue processing. The resource-safety migration is a good control plane, but live scheduler frequency and queue growth are unknown. Measure queue age, claims, failures and AI calls before enabling more automation.
- **Public integrations**: YouTube, Medium, Bluesky and search routes use dynamic external fetches. Public pages should use bounded caches and avoid re-fetching on every request. `app/layout.tsx` caches projects/subscriber counts for five minutes; many other routes are explicitly `force-dynamic`.
- **Client payload**: 236 client components, Framer Motion, editors, charts, blockchain libraries, media tooling and multiple AI/UI packages create a large potential bundle. Run a production bundle report and identify the largest route-specific chunks before optimizing broadly.
- **Sitemap scale**: dynamic lists are capped at 2,000 articles/items, 1,000 letters/lots and 500 tags. This is safe for now but silently truncates future content; use sitemap indexes when growth approaches limits.
- **Storage growth**: public media/artifact/whisper assets and generated reels have no repository-wide retention job visible. The proposed bucket caps address upload size, not lifecycle/duplicate cleanup. Add retention policy only after identifying business-required assets.

Measured cost: none. The repository does not contain production billing or invocation data, so numeric cost estimates would be speculative.

## H. Simplification opportunities

1. Declare App Router as the only HTTP route architecture; remove or redirect legacy `pages/api` handlers after consumers are migrated.
2. Keep one server Supabase factory and one auth decision table. Direct clients should be limited to explicit, reviewed service-role operations.
3. Split Pierrot into a thin request coordinator plus independently testable stages: identity/consent, intent, retrieval, owner tools, model call, persistence and stream encoding.
4. Make Flow distribution either a first-class table or a deliberately documented JSON state machine. Do not add another abstraction layer until duplicate/retry behavior is covered by integration tests.
5. Remove abandoned backups and renamed component copies only after confirming no imports; retain historical audit documents in an archive.
6. Pick Vercel as the deployment contract and remove Render-specific output/scripts, or document a supported dual-hosting contract with separate build checks.
7. Replace `any` in auth/profile/database boundaries with generated Supabase types. This will reduce false confidence from a passing TypeScript check.
8. Treat Brain graph, media intelligence and autonomous workers as opt-in owner tools until queue/embedding/provider observability is proven.

## I. Prioritized roadmap

### P0 — Critical

| Recommendation | Evidence / why | Solution | Complexity / dependencies | Verification |
|---|---|---|---|---|
| Close public monitor/search | `app/api/monitor/search/route.ts:27-80` has no auth/rate limit and returns `_debug` | Require admin auth; bound JSON/body and artist length; remove debug from public responses; add provider timeout | Small; no schema dependency | Unauthenticated request returns 401/403; admin request has bounded sanitized response |
| Remove or guard legacy link preview | `pages/api/link-preview.js:3-14` bypasses auth/SSRF wrapper | Delete after consumer migration or delegate to a guarded App Router endpoint; apply `assertSafePublicUrl` before any fetch | Small/medium; find all callers | Tests for unauthenticated, private IP, credentials, redirect and allowed URL |
| Resolve whisper privacy transition | Browser public upload at `components/MicrophoneButton.tsx:61-84`; SQL says proposed | Implement server upload + signed admin reads, deploy together, then apply storage policy migration; add MIME/size limits | Medium; coordinated app + Supabase change | Capture works; object is not publicly readable; admin signed URL expires |
| Stop false success from reservation stub | `app/api/request-variant/route.ts:14-16` | Return 501 until implemented, or implement validated idempotent persistence and entitlement flow | Small to remove; medium to implement | Contract test proves no success without durable row and duplicate requests are safe |
| Make CI test command terminate green | C2 test fails and full Jest needed a timeout | Update stale expected blocker only if behavior is intended; investigate open handles; run tests with `--detectOpenHandles` in CI diagnostic mode | Small/medium | `npm test -- --runInBand` exits 0 without external timeout |

### P1 — Important

| Recommendation | Evidence / why | Solution | Complexity / dependencies | Verification |
|---|---|---|---|---|
| Establish authoritative schema/deployment state | 72 migrations, separate `sql/`, proposed files and future-dated names | Record applied migration hash/state; adopt one migration directory; mark proposed SQL outside deploy path; document scheduler and bucket state | Medium; requires Supabase read access and migration policy | Fresh database replay plus live schema diff produce the same expected objects |
| Build an endpoint authorization matrix | Multiple auth mechanisms and route drift | Generate an inventory of every route/method with intended audience, credential and rate limit; test sensitive routes unauthenticated/authenticated/admin | Medium | Matrix is checked in and route tests cover every privileged handler |
| Consolidate auth roles | `users.role`, `user_roles`, profiles/JWT/Telegram paths coexist | Select one authoritative admin source; keep adapters only at ingress; remove role decisions from user-editable metadata | Medium; migration and token refresh implications | Cross-path tests prove non-admin cannot access admin route and role changes take effect predictably |
| Instrument Pierrot stages and provider attempts | Very large `app/api/pierrot-web/route.ts`; fallback chain in `lib/pierrot/model.ts` | Emit correlation ID, stage timings, provider attempts, retrieval counts, token estimates and final outcome without prompt/PII | Medium | One trace shows bounded stage count and no duplicate provider/retrieval work |
| Add end-to-end Flow publication tests | `lib/flow/publish.ts` persists, cross-posts and writes AI context | Test unique/idempotent replay, partial channel failure, uncertain delivery, retry and concurrent publication with fake providers and DB transaction semantics | Medium | Replaying same idempotency key creates one item and never duplicates confirmed external posts |
| Document scheduler ownership | `vercel.json` has no cron entries, workers expect external invocation | Name the scheduler, URLs, frequency, secret rotation, alerting, kill switch and manual recovery | Small if scheduler exists; high if absent | A dry-run schedule invokes each worker and reports queue health |

### P2 — Worth doing

- Reduce client boundaries on public/static pages and lazy-load editors, blockchain code and admin-only libraries.
- Replace public error messages with stable codes and server-side correlation IDs.
- Add generated Supabase types and remove `any` from auth, route payload and database result boundaries.
- Add storage lifecycle/duplicate reporting before implementing cleanup.
- Add browser smoke tests for login, new Pierrot conversation, streaming interruption, Flow publish, mobile navigation and PWA install/offline behavior.
- Replace the failing C2 assertion with a stable semantic error code rather than matching prose.
- Add route-level body-size limits and rate limits to public write endpoints such as cast/liveheart/contact/checkout.

### P3 — Optional / future

- Move cross-post channel state into a normalized distribution table only if JSON metadata becomes a measurable bottleneck.
- Introduce a queue service only if current bounded DB queues cannot meet measured throughput. Do not add workers merely to make the architecture look more scalable.
- Consider a monorepo/package split only if the public site, admin/Pierrot and tooling have independent release needs. Current splitting would add maintenance.

## J. What NOT to change

- Do not rewrite working public pages or the Next.js/App Router foundation for architectural elegance.
- Do not replace Supabase with another database; it is already the intended canonical source and is integrated across auth, storage, RAG and publishing.
- Do not remove the existing Gemini → DeepSeek fallback before measuring it; the important work is bounding and observing it.
- Do not replace the Flow publication state machine or cross-post adapters wholesale. They already contain content hashes, channel state, resume logic and uncertain-delivery handling; test and simplify around those mechanisms first.
- Do not add Vercel cron entries until the scheduler ownership and cost model are decided. The current absence is safer than accidental recurring AI work.
- Do not apply the proposed whisper/storage SQL alone. It must ship with the matching upload/read implementation.
- Do not delete archive/audit documents or old tables as a cleanup shortcut. Establish retention, migration and rollback evidence first.
- Do not expand Brain graph, media intelligence or skill automation into uncontrolled background processing. Keep explicit owner-triggered, bounded runs until operational data proves the need.

## Bottom line

The project has substantial working infrastructure and unusually strong recent defensive intent, especially around Pierrot identity, rate limits, streaming, worker locks, RAG evidence and Flow cross-post state. Its weakness is not lack of sophistication; it is that too many sophisticated paths now coexist without one operational source of truth. Fix the few confirmed public boundaries, finish the storage transition, make the test suite deterministic and establish live schema/scheduler evidence. After that, reduce duplicated paths before adding new intelligence features.
