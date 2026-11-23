# NewLove — independent engineering and SEO audit

Date: **2026-11-23**
Repository: `merkurov1/newlove`
Base: `main` @ `f869bc1498978210279a5c65bc4eb386b43db21d`
Production: `https://www.merkurov.love` (observed `server: Vercel`, `x-vercel-id` present)
Audit branch: `pierrot/dev/8717abfd-553a-4c9d-abf5-e73c6cde2d26/2`

This report separates **measured facts**, **hypotheses**, and **data that could not be obtained**.
No production deploy, migration, DDL, Search Console setting, auth/payment change or mass content
rewrite was performed.

---

## 1. Executive answer

The site's organic problem is **not primarily a code-level crawl blocker**. On 2026-11-23 the public
canonical pages return 200, self-canonicalise on the `www` host, emit `index, follow`, appear in a
755-URL sitemap with no duplicate/non-canonical URLs, and have reciprocal hreflang for the five
real locale variants that exist. The previously reported six `/journal/*` 404s are fixed in current
production, and `/flow/join` now canonicals to the `www` host.

The dominant measured problems are:

1. **Host and legacy-URL normalisation are not executing in production.** `https://merkurov.love/*`
   and `http://merkurov.love/*` answer **HTTP 200** instead of redirecting. `/stat`, `/projects` and
   `/feed` also answer **200** (via an internal rewrite) although `next.config.js` defines 308s.
   This is consistent with **production running an older routing configuration than `main`**
   (deployment drift), not with a missing rule in the repository. It is confirmed; the root cause
   cannot be proven from outside Vercel.
2. **Two high-value templates render no meaningful HTML for non-JS crawlers.** `/media` returns an
   H1-less document containing “Loading media archive…” (the client component bails out because of
   `useSearchParams`). `/research/novayagazeta2025` and `/unframed/book` return no H1 before JS.
3. **Content scale + discovery delay.** 228 not-indexed URLs in the 2026-11-22 GSC export are mostly
   *Discovered / Crawled — currently not indexed*, including large numbers of short Flow notes and
   media records. That is normal crawl-queue behaviour for a young, very large archive; it is not
   proof of a technical defect, and no URL should be noindexed just to move a GSC number.
4. **Measurement is the weakest link.** There is no Google credential in this runner and no
   reproducible GSC API slice, so the 2026-11-20/22 exports remain **historical context**, not a
   current baseline.

The site's problem is therefore **technical (host/legacy normalisation + SSR gaps) plus
content/authority and measurement**, in that order of fixability. It is not a site-wide
canonical/hreflang failure.

---

## 2. Baseline method and limits

### 2.1 Repository baseline

- Branch checked out at `main` SHA `f869bc14`; working tree clean before changes.
- `pnpm typecheck` passes.
- `pnpm lint` exits 0 with **1,388 pre-existing warnings, 0 errors**.
- `pnpm test --runInBand`: **506 suites passed, 1 skipped; 3,648 tests passed, 10 skipped**.
- `pnpm build` **fails before our change** with:
  `supabaseUrl is required` at `app/api/cast/capture/route.ts:10` — the runner has no Supabase
  environment. This is a baseline environment failure, not a regression. The build got through
  compilation and TypeScript first.

### 2.2 Production HTTP method

All production observations below were read-only `GET` requests with `redirect: 'manual'`, parsed
for `<title>`, `<meta name="robots">`, `<link rel="canonical">`, `<h1>` count and JSON-LD. They are
not Google crawls.

### 2.3 GSC / OpenAI access

- No Google credentials exist in this runner (`compgen -e` shows only `DEEPSEEK_API_KEY`; no
  `GOOGLE_*`, `GSC_*`, `OPENAI_API_KEY`, `VERCEL_TOKEN`).
- No `vercel` CLI and no `.vercel/` project link exist, so the existing Vercel `openai_api_key`
  cannot be pulled securely. No API call was made, and no workaround that could expose the secret
  was attempted.
- GSC figures below are quoted **only** from the committed historical exports and are explicitly
  labelled historical.

---

## 3. Confirmed technical findings

### P0 — Production does not execute the canonical-host redirects (confirmed)

| Probe | Observed | Expected |
| --- | --- | --- |
| `https://merkurov.love/` | `200`, no `Location`, canonical `https://www.merkurov.love` | `308` to `https://www.merkurov.love/` |
| `https://merkurov.love/advising` | `200`, canonical `https://www.merkurov.love/advising` | `308` to www |
| `http://merkurov.love/` | `200` (served over the probe) | `308` to `https://www.merkurov.love/` |
| `https://www.merkurov.love/stat` | `200`, `x-matched-path: /liveheart/stat`, canonical `/liveheart/stat` | `308` to `/liveheart/stat` |
| `https://www.merkurov.love/projects` | `200`, canonical `/all` | `308` to `/all` |
| `https://www.merkurov.love/feed` | `200`, canonical `/flow` | `308` to `/flow` |

`next.config.js:21-36` contains exactly these redirects. Their absence in production, combined with
the internal rewrite signature on `/stat`, is evidence that the live deployment predates the current
routing configuration (commit `bae5f388`, 2026-10-30, added `/stat`, `/projects` and `/feed`).
The root cause (stale deployment vs. a Vercel project-level rewrite) cannot be proven without the
Vercel API, which this task forbids.

**Fix applied:** `lib/seo/canonicalHost.ts` + a 308 guard at the top of `proxy.ts`. The guard is
host-based, leaves `*.vercel.app`/localhost untouched, preserves path and query, and is unit-tested.
It still requires a deploy to take effect; the live defect remains until then.
**Owner action still needed:** confirm the production alias points at the current `main` deployment
and remove any dashboard-level rewrite that shadows the config redirects.

### P1 — `/media` ships no H1 and no archive content without JavaScript (confirmed)

- `https://www.merkurov.love/media` returned `200`, `index, follow`, self-canonical, **`<h1>` count 0**.
- Initial HTML body contained `Loading media archive…`; the archive is inside a `Suspense` fallback.
- Cause: `components/media/MediaArchive.tsx` called `useSearchParams()`, which forces a client-side
  rendering bailout for the subtree. The visible `<h1>Public record & commentary</h1>` existed only
  after hydration.
- HTML weight is **425,867 bytes** and the response was `x-vercel-cache: STALE` with
  `max-age=0, must-revalidate`, so every revalidation ships a very large document.

**Fix applied:** the server page now resolves `searchParams` and passes
`initialSearchParams` to the archive. `useSearchParams` was removed; local state keeps filter clicks
immediate, while a changed server query string (back/forward) wins. The entire archive, including the
H1, now renders in the initial HTML. Regression test:
`components/media/__tests__/MediaArchive.test.tsx` asserts the H1 exists in `renderToStaticMarkup`.
**Remaining risk:** the page becomes request-rendered because it reads `searchParams`; the 426 KB
HTML weight is unchanged and remains a separate performance item.

### P1 — `/debug-auth` was indexable and duplicated homepage metadata (confirmed)

- `https://www.merkurov.love/debug-auth` returned `200`, **`index, follow`**, **no canonical**, and
  the inherited homepage title `Anton Merkurov — Art, Love & Money`.
- `app/debug-auth/page.tsx` had no metadata at all.
- `/roles-demo` already emits `noindex, nofollow`, so this was an isolated oversight.

**Fix applied:** explicit `noindex, nofollow` metadata plus `/debug-auth` and `/roles-demo` entries in
`app/robots.ts`. Regression test: `lib/__tests__/robots.test.ts`.

### P1 — Future `lastmod` values can enter the sitemap (confirmed at snapshot time)

- The sitemap snapshot at **2026-11-23T18:56Z** contained future `lastmod` values, e.g.
  `2026-11-24T06:15:24Z`, `2026-11-27T12:35:14Z`, `2026-11-29T11:14:40Z`, while “now” was
  2026-11-23.
- A re-fetch at **19:00Z** contained none (max `2026-11-23T18:21:56Z`). The reason for the change
  (DB edit or cache regeneration) is unknown; the code accepted any future date either way.
- `parseLastModified` only rejected pre-1971 and invalid dates.

**Fix applied:** `lib/sitemap/entries.ts` now drops timestamps more than five minutes in the future.
Tests cover a one-year-ahead date and a future dynamic record, asserting the URL remains but
`lastModified` is omitted.

### P2 — Two public research/reading templates are invisible before JS (confirmed)

- `/research/novayagazeta2025`: `200`, self-canonical, but **H1 count 0**. `NovayaGazetaClient`
  returns `null` until `mounted` is true (`app/research/novayagazeta2025/NovayaGazetaClient.tsx:305`).
  The metadata is English while the client's default content language is Russian.
- `/unframed/book`: `200`, self-canonical, **H1 count 0**. The reader waits for an authenticated
  manuscript fetch (`app/unframed/book/page.tsx`), so the SSR shell has no heading.
- `/flow` and `/art-engine` render two H1s; `/2025` renders two H1s. Low severity, but not ideal.

These are content-presentation issues, not crawl blockers. They should be fixed by moving a static
title/abstract shell into the server component (without exposing paywalled manuscript text).

### P2 — Journal index is uncached and slow (confirmed proxy)

- `/journal` returned `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`, TTFB
  **1,028 ms** in the probe.
- `app/journal/page.tsx` sets `dynamic = 'force-dynamic'`; `JournalPageView` calls `headers()` and
  then fetches its own `/api/flow/items` endpoint with `cache: 'no-store'`.
- This is a self-inflicted origin round-trip on a high-value index. It raises TTFB and wastes crawl
  capacity; it is a performance problem, not an indexation blocker.

### P2 — `/letters` is a 200 duplicate of `/journal` (confirmed, intentionally canonicalised)

- `/letters` returns `200`, canonical `https://www.merkurov.love/journal`, `index, follow`.
- It is already excluded from the sitemap (`NON_CANONICAL_STATIC_ROUTES`) and is a candidate for a
  301 to `/journal`. This was not changed because it is editorially reachable and the canonical is
  correct.

---

## 4. What is healthy (measured, not assumed)

### Sitemap

- **755** `<loc>` entries; **0** duplicates; **0** non-`www`/query/hash URLs.
- **17** hreflang groups; every group is reciprocal and self-referencing (`x-default` + real
  languages); no false locale alternates.
- 694 entries carry `lastmod`; the rest correctly omit it. Static routes carry no fabricated
  generation timestamp.

### Canonical, robots, status

- Homepage, `/lobby`, `/ru/lobby`, `/de/lobby`, `/advising`, `/ru|de|fr|ar/advising`, `/journal`,
  `/heritage`, `/heritage/krass`, `/media`, `/heartandangel/*`, `/unframed/*`, `/flow`,
  `/flow/join`, `/flow-issues`, `/en/flow-issues`, `/tags`, `/lots`, `/art-engine`,
  `/case-study/*`, `/liveheart*`, `/question*`, `/temple`, `/tribute`, `/vigil`, `/absolution`,
  `/silence`, `/research`, `/selection`, `/isakeyforall` all returned `200`, self-canonical,
  `index, follow`.
- Private surfaces checked: `/login`, `/onboard`, `/onboard/secret`, `/research/telegram`,
  `/roles-demo`, `/admin` all emit `noindex` and are disallowed by `robots.txt`.
- `robots.txt` allows public content, disallows `/admin`, `/api`, `/auth`, `/draft`,
  `/unframed/debug`, `/question/dashboard`, and now `/debug-auth`, `/roles-demo`.
- Journal, Flow RSS and JSON feeds are distinct discovery documents and are not in the sitemap:
  `/feed.xml` and `/rss.xml` → `application/rss+xml`; `/flow/rss` → RSS; `/flow/feed.json` → JSON Feed.
  `/llms.txt` and `/llms-full.txt` are served as text and are not treated as indexable pages.

### Multilingual

The five locales that exist in the repository are the only ones advertised:
`en` (unprefixed), `ru`, `de`, `fr`, `ar`. Verified reciprocal hreflang and self-canonicals on
`/lobby`, `/advising`, `/heritage`, `/isakeyforall`, `/journal`. No hreflang is emitted for a
language version that does not exist. RU/EN titles and descriptions are genuinely translated, with
no observed language leakage on those templates.

### Structured data

Eight representative templates were parsed from live HTML with **zero JSON-LD syntax errors**:
homepage, media record, journal article, Flow join, lot (`VisualArtwork`), tag, case study,
Heart & Angel about. Types observed: `WebSite`, `Person`, `Organization`, `Article`/`BlogPosting`,
`VisualArtwork`, `AboutPage`, `BreadcrumbList`. Entity IDs reuse `#person`, `#website`,
`#organization`; no fabricated ratings, prices or reviews were found.

### Prior work re-used and re-verified

- `docs/gsc-visibility-audit-2026-11-20.md` and `docs/gsc-coverage-audit-2026-11-22.md` reviewed.
- Existing Search Console monitoring (PR #61 work) is present and was **not** re-implemented:
  `lib/analytics/website/providers/searchConsole.ts` (Search Analytics API, `type: 'web'`,
  `dataState: 'final'`, 25k row cap), `lib/analytics/website/dashboard.ts`, and
  `/admin/pierrot/(workspace)/analytics`.
- The six `/journal/*` URLs that the 2026-11-22 audit reported as 404 now return **200**,
  self-canonical, `index, follow`.
- `/flow/join` now canonicals to `https://www.merkurov.love/flow/join` (the prior non-www canonical
  is fixed in current production).

---

## 5. GSC analysis — what is available and what is not

**No GSC API call was made.** Missing permission/data is marked unavailable, never zero.

Historical facts from the supplied exports:

| Item | Value | Status |
| --- | --- | --- |
| Coverage snapshot date | 2026-11-22 | historical |
| Indexed | 417 | historical |
| Not indexed | 228 | historical |
| Discovered — not indexed | 161 | historical |
| Crawled — not indexed | 33 | historical |
| 404 | 17 | historical |
| Excluded by noindex | 5 | historical |
| Page with redirect | 4 | historical |
| Alternative canonical | 2 | historical |
| Google-selected canonical | 6 | historical |
| Visibility window | 2026-10-21..2026-11-17 | historical |
| Clicks / impressions | 3 / 167 | historical, incompatible exports flagged by the prior audit |
| Property / search type | `sc-domain:merkurov.love` / `web` | from prior export metadata |

Not available in this runner: exact current 28-day GSC slice, comparison window, query/page/country/
device drilldowns, URL Inspection results, and crawl stats. Therefore no current CTR, position or
query-opportunity claim is made, and no ranking causality is inferred.

The current production re-check does show that **at least one historical 404 cluster is resolved**,
so the 2026-11-22 numbers must not be presented as current.

---

## 6. SEO matrix

Severity: P0 = blocks consolidation/indexation; P1 = materially harms discovery/understanding;
P2 = quality/performance; P3 = polish.

| # | URL / template | Issue | Evidence | Priority | Change | Verification | Expected impact | Risk |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | apex host, all paths | Apex/HTTP returns 200 instead of 308; duplicate origin of every canonical page | `https://merkurov.love/` → 200, canonical www; `http://merkurov.love/` → 200 | P0 | Middleware host guard added; owner must deploy current `main` and check Vercel alias/rewrites | Unit tests; live probe must show `308` + `Location: https://www...` | Consolidates link equity; stops duplicate host crawling | Very low; guard skips preview/localhost |
| 2 | `/stat`, `/projects`, `/feed` | Legacy URLs return 200 + canonical instead of 308; production config drift | `/stat` → 200 `x-matched-path: /liveheart/stat`; `/projects` → 200 canonical `/all`; `/feed` → 200 canonical `/flow` | P1 | Deploy current `main` (config already correct); do not add more redirect layers | After deploy: `308` + single-hop final 200 | Removes soft duplicates, clarifies crawl paths | Low |
| 3 | `/media` | No H1/archive content in initial HTML; 426 KB HTML | H1 count 0; body “Loading media archive…”; 425,867 bytes | P1 | Server-resolved `initialSearchParams`; removed `useSearchParams` bailout | Jest SSR test; after deploy expect H1 in raw HTML | Media archive becomes understandable/indexable; better LCP | Medium-low; filter behaviour tested |
| 4 | `/debug-auth` | Indexable internal page with duplicate homepage metadata | 200, `index, follow`, no canonical | P1 | `noindex` metadata + robots disallow | Robots test; after deploy meta + robots | Removes an internal duplicate | Very low |
| 5 | sitemap dynamic rows | Future `lastmod` possible | 2026-11-24/27/29 entries seen at 18:56Z | P1 | Reject dates > now + 5 min | 4 new sitemap tests | Restores trust in `lastmod` | Very low |
| 6 | `/research/novayagazeta2025` | Report absent before JS; EN metadata vs RU default content | H1 count 0; `mounted` gate at client line 305 | P2 | Render a server-side title/abstract shell; align default language with metadata | Raw HTML contains H1 + abstract; language switch still works | Report becomes indexable and understandable | Medium (client-only animation/localisation) |
| 7 | `/unframed/book` | Reader shell has no H1 before JS | H1 count 0; auth fetch gate | P2 | Server-render the public cover/title shell; keep manuscript gated | Raw HTML contains H1; paywall unchanged | Book landing becomes indexable | Low-medium |
| 8 | `/journal` | Uncached self-fetch; 1 s TTFB | `private, no-store`, `MISS`, 1,028 ms | P2 | Call the Flow data layer directly; cache/revalidate the index | TTFB before/after; cache header public | Faster crawl + UX | Medium (data access refactor) |
| 9 | `/flow`, `/art-engine`, `/2025` | Two H1s per page | Live H1 count 2 | P3 | Demote one heading to H2 | H1 count 1 | Cleaner hierarchy | Very low visual risk |
| 10 | `/letters` | 200 duplicate of `/journal` | Canonical `/journal`, 200 | P3 | Consider 301 to `/journal` | 308/301 + final 200 | Consolidation | Low; editorial links may need update |
| 11 | Flow/media long tail | Many short/link/photo notes; 161 discovered-not-indexed | Historical GSC + sitemap | P2 (content) | Curate canonical notes; avoid mass noindex; improve titles/summaries | GSC after 30 days | Better crawl selection | Editorial judgement required |
| 12 | Metadata uniqueness | Static routes checked: titles/descriptions unique | Live title/description scan | — | No change | `scripts/check_metadata.js` | Already healthy | — |
| 13 | JSON-LD | Valid on 8 templates, consistent IDs | Live parse | — | No change | Re-parse after deploy | Already healthy | — |

---

## 7. Changes made in this branch

| File | Change | Test |
| --- | --- | --- |
| `lib/sitemap/entries.ts` | Reject future `lastmod` (> 5 min skew) | `lib/__tests__/sitemap.test.ts` (2 new cases) |
| `lib/seo/canonicalHost.ts` (new) | Pure apex→www / http→https canonicaliser | `lib/seo/__tests__/canonicalHost.test.ts` (6 cases) |
| `proxy.ts` | 308 canonical-host guard before all other middleware logic | same unit tests |
| `app/debug-auth/page.tsx` | `noindex, nofollow` + own title/description | covered by robots/metadata policy |
| `app/robots.ts` | Disallow `/debug-auth`, `/roles-demo` | `lib/__tests__/robots.test.ts` (3 cases) |
| `app/media/page.tsx` | Resolve `searchParams` server-side, pass to archive | `components/media/__tests__/MediaArchive.test.tsx` |
| `components/media/MediaArchive.tsx` | Remove `useSearchParams` bailout; prop + local override | same file: 2 new SSR cases, 18 existing cases preserved |
| `lib/i18n/__tests__/config.test.ts` (new) | Hreflang reciprocity / no-false-locale regression checks | 3 cases |

**Verification run**

- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0 (1,388 pre-existing warnings, 0 errors).
- `pnpm test --runInBand` → 505 suites passed, 1 skipped; 3,627 passed, 10 skipped.
- `pnpm build` → fails on the pre-existing missing Supabase environment at
  `app/api/cast/capture/route.ts:10`, after compilation and TypeScript succeed.
- No Vercel Preview was produced because this runner has no Vercel credentials; see §9.

---

## 8. OpenAI API spend ledger

No OpenAI request was made. The hard cap is **$2.00**; the stop threshold is **$1.80**.

| Stage | Model | Input tokens | Output tokens | Rate used | Cost | Cumulative |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| — | none | 0 | 0 | — | $0.00 | **$0.00** |

Reason: no `OPENAI_API_KEY` is present in the runner, no Vercel token/CLI/project link is available,
and reading the repository `.env*` files is forbidden by the security constraints. The credential was
never read, printed, committed, sent to a model or exposed to a browser bundle. Total spend
**$0.00 ≤ $2.00**; the $1.80 stop threshold was never approached.

Because there was no call, independent model review (Phase 4) is **not completed**; it is a blocker,
not a silent omission.

---

## 9. Blockers and unverified items

1. **Vercel access.** No `VERCEL_TOKEN`, `vercel` CLI, or `.vercel/` link. Cannot pull the existing
   `openai_api_key`, cannot inspect the production deployment/alias, cannot create a Preview URL.
2. **Google/GSC access.** No OAuth credentials or stored grant in the runner. No current GSC slice,
   URL Inspection, query/page/device/country reporting, or crawl stats. Historical exports only.
3. **Build.** `pnpm build` cannot complete without Supabase environment variables; this predates the
   change. Build-level verification of the final diff was therefore not possible locally.
4. **Live verification of the fixes.** They are unit-tested and typechecked, but cannot be observed
   in production until the current `main` (plus this branch) is deployed. The live apex and legacy
   redirect defects remain exactly as measured.
5. **Root cause of production routing drift.** Stale deployment vs. Vercel dashboard rewrite cannot
   be distinguished without Vercel API access.
6. **Core Web Vitals.** No field CrUX/Lab data was available. The report uses HTTP TTFB, HTML bytes
   and cache headers as proxies only. INP/CLS/LCP field values are unverified.
7. **Brain/RAG, queues and Supabase deep audit.** Code shows authenticated cron routes, lock-conflict
   handling and telemetry, and the existing analytics sync with `CRON_SECRET`. No production database
   access was available, so queue backlog, stuck jobs, Disk IO, index usage and RLS behaviour could
   not be measured. No SQL was run.

---

## 10. Ranked follow-up backlog (impact first)

1. **Deploy current `main` and verify the canonical host + legacy 308s.** Confirm the apex and
   `/stat`, `/projects`, `/feed` probes; check Vercel domain aliases and any dashboard rewrites.
   Without this, every page is reachable on two origins.
2. **Ship and verify the `/media` SSR fix**, then measure HTML size and LCP. Consider paginating or
   server-limiting the initial archive to reduce the 426 KB document.
3. **Remove the `mounted` gate from `/research/novayagazeta2025`** and render a server-side title,
   standfirst and abstract. Align the initial content language with the English metadata.
4. **Add a server-rendered public shell to `/unframed/book`** without exposing the gated manuscript.
5. **Fix the Journal index TTFB**: call the Flow data layer directly instead of fetching your own
   `/api/flow/items`, and cache the public index with a short revalidate.
6. **Restore GSC API access** through the existing read-only grant and produce a reproducible
   28-day slice with an explicit comparison window, `type=web`, `dataState=final`, and filters.
   The dashboard already supports this; only credentials/verification are missing.
7. **Curate the Flow long tail.** Improve titles/summaries for note/link/photo items that deserve
   indexing; do not mass-noindex or mass-generate pages. Measure selection after 30 days.
8. **Consider 301 for `/letters` → `/journal`** after checking inbound links and analytics.
9. **Fix double H1s** on `/flow`, `/art-engine`, `/2025`.
10. **Run a real engineering pass on Brain/queues/Supabase with read-only production access**:
    worker backlog, retry/dead-letter counts, cron overlap, slow queries and RLS tests.

---

## 11. 30-day plan (realistic, no ranking promises)

- **Days 1–3:** deploy current `main`; verify host/legacy redirects; verify `/media`, `/debug-auth`
  and sitemap `lastmod` in production; re-run raw-HTML checks.
- **Days 4–10:** fix the two JS-gated research/book templates; reduce media HTML weight; fix Journal
  TTFB. Re-check canonical/hreflang and structured data after each deploy.
- **Days 11–20:** restore a reproducible GSC 28-day slice and build a page/query opportunity list
  (positions 4–20, impressions with weak CTR, valuable unindexed pages). Submit nothing in bulk.
- **Days 21–30:** editorial pass on the highest-value Flow and media records; measure index coverage
  and impressions against the day-1 baseline. Do not infer causality from small samples.

---

## 12. Reproduce

```bash
git rev-parse HEAD
pnpm typecheck
pnpm lint
pnpm test --runInBand
node -e "fetch('https://www.merkurov.love/sitemap.xml').then(r=>r.text()).then(t=>console.log((t.match(/<loc>/g)||[]).length))"
curl -sSI https://merkurov.love/            # expect 308 after deploy, currently 200
curl -sSI https://www.merkurov.love/stat    # expect 308 after deploy, currently 200 rewrite
```

---

## 13. Plain-language conclusion

The site is **crawlable and technically well-structured at the page level** — canonicals, hreflang,
JSON-LD and the sitemap are in good shape. What is holding it back is a mix of:

- a **deployment/routing mismatch** that leaves every page reachable on a second host and keeps old
  URLs alive as 200s;
- **two important templates that only exist after JavaScript**, so Google and AI crawlers see a
  loading message instead of the archive/report;
- a **large, young content surface** (hundreds of short Flow notes and media records) where normal
  discovery delay and thin-value selection — not a code bug — explain most “not indexed” URLs;
- **weak measurement**, because no current GSC slice is reproducible in this environment.

Fix the routing and the SSR gaps first. Then restore measurement and curate the long tail. Do not
expect, and do not promise, ranking gains from metadata tweaks alone.
