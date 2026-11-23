# NewLove — independent engineering and SEO audit

- Date: **2026-11-23**
- Repository: `merkurov1/newlove`
- Audited base: `main` at `5738df0113fc79ff2833da1010f67d97e6d3f32b`
- Production: `https://www.merkurov.love`
- Production observations: **2026-11-23 20:00–20:14 UTC**, read-only HTTP fetches

This report separates current production facts, historical GSC evidence, and hypotheses. No
deployment, migration, SQL, external-account change, content rewrite, or monitoring implementation
was performed in this attempt.

## 1. Executive result

Current production has no verified P0 crawl/indexing blocker. The P0/P1 fixes from the earlier audit
are now present on `main` and observable in production: host and legacy paths reach their canonical
destinations, `/media` renders its H1 in initial HTML, `/debug-auth` is noindex, and sitemap future
dates are suppressed. Their regression suite passes.

The highest-confidence remaining work is P2:

1. `/media` is server-rendered but produced **568,391 bytes** and took **6.76 s** in one uncached
   probe (`private, no-cache, no-store`, `x-vercel-cache: MISS`).
2. `/journal` produced **168,245 bytes** and took **6.30 s** in one uncached probe. It is explicitly
   dynamic (`app/journal/page.tsx:5`) and therefore remains an origin/crawl-efficiency concern.
3. `/research/novayagazeta2025` and `/unframed/book` still contain no H1 in raw HTML. These are
   verified presentation/SSR gaps, not proof of non-indexing.
4. Historical GSC exports show a large discovery backlog, but no current GSC slice is available.
   Content quality and authority remain hypotheses until current query/page data exists.

No new code fix is justified as P0/P1. Changing the remaining client-heavy templates or caching
strategy is not a safe narrow fix without product/browser regression work, so this attempt updates
the evidence and backlog only.

## 2. Prior work reviewed (not reimplemented)

- `docs/seo-audit.md`: route/metadata/structured-data baseline and prior remediation.
- `docs/archive/SEO_AUDIT_2025-11-09.md`: older historical baseline.
- `docs/gsc-visibility-audit-2026-11-20.md`: supplied performance-data analysis.
- `docs/gsc-coverage-audit-2026-11-22.md`: 161-URL discovered-not-indexed drilldown.
- PR **#61**, merge commit `d48e7868`: reviewed through its 16-file git diff. It added the existing
  GSC monitor, stored export metadata, reconciliation/insight logic, and tests. It was not redone.
- Existing adapter evidence: `lib/analytics/website/providers/searchConsole.ts:33-55` fixes the
  dimensions, `dataState=final`, 25k request cap and `type=web`; lines 97-146 paginate with a hard
  cap. Existing dashboard/monitor code remains unchanged.
- Earlier task implementation, PR **#92** / commit `c825dff0`, is already merged into current main.
  This attempt independently rechecked those fixes rather than duplicating them.

## 3. Evidence and limitations

### Current production method

Responses were fetched without credentials and parsed for final URL, final HTTP status, title,
canonical, robots meta, H1 count, JSON-LD, response bytes and cache headers. The available HTTP
transport follows redirects even when manual mode is requested. It reports `redirected=true` and
the final 200 URL, but does **not** expose the intermediate 301/308 response or `Location`; exact
redirect status is therefore not independently verified. Current source declares permanent
redirects at `next.config.js:21-35`, and the host guard emits 308 at `proxy.ts:13-25`.

### GSC boundary

There is no GSC resource or OAuth grant exposed to this session (MCP resource discovery returned no
resources/templates). No current Search Console API call or setting change was made. Current URL
Inspection, crawl stats, Manual Actions, query/device/country breakdowns and current coverage totals
are unavailable. Missing data is not reported as zero.

### Core Web Vitals boundary

No CrUX/PSI field data or browser trace is available. TTFB-like elapsed fetch time, HTML bytes,
cache headers and raw-HTML visibility below are **proxies**, not LCP/INP/CLS measurements. No layout
or performance code changed, so no browser/mobile visual regression was claimed.

## 4. Current production technical audit

### Robots, noindex and sitemap

- `https://www.merkurov.love/robots.txt` returned 200 and matches `app/robots.ts:8-62`: public
  content allowed; admin/API/auth/draft/debug/private surfaces disallowed; canonical Host and
  sitemap declared.
- `/debug-auth` returned 200 with `noindex, nofollow`, its own title and no canonical. Evidence:
  `app/debug-auth/page.tsx:5-12`; robots exclusion at `app/robots.ts:25-30`.
- Sitemap returned 200, **165,989 bytes**, **755 unique URLs**, 694 `lastmod` values, zero duplicate
  URLs, zero non-`https://www` URLs, and zero dates beyond now + five minutes.
- All 17 entries carrying alternates were reciprocal and self-referencing; no reciprocity errors.
  Code evidence: canonical filtering and date guard in `lib/sitemap/entries.ts:62-76,93-120`, real
  locale expansion at lines 149-175, and dynamic-source filtering from line 178 onward.

### HTTP, canonical and redirects

| Requested URL               | Observed final result                               | Canonical / robots           | Verification                         |
| --------------------------- | --------------------------------------------------- | ---------------------------- | ------------------------------------ |
| `https://merkurov.love/`    | redirected; final `https://www.merkurov.love/`, 200 | www root / index             | current production                   |
| `http://merkurov.love/`     | redirected; final HTTPS www root, 200               | www root / index             | current production                   |
| `http://www.merkurov.love/` | redirected; final HTTPS www root, 200               | www root / index             | current production                   |
| `/stat`                     | redirected; final `/liveheart/stat`, 200            | final URL / index            | current production                   |
| `/projects`                 | redirected; final `/all`, 200                       | final URL / index            | current production                   |
| `/feed`                     | redirected; final `/flow`, 200                      | final URL / index            | current production                   |
| `/letters`                  | 200                                                 | canonical `/journal` / index | intentional duplicate representation |

**Fact:** destination normalization is live. **Unverified:** intermediate status code and hop count.
The source and six canonical-host unit cases support 308 behavior, but source is not live HTTP proof.

### Metadata and raw HTML

Representative canonical pages returned 200, distinct relevant titles, self-canonicals and
`index, follow`: `/`, `/media`, `/journal`, `/flow/join`, `/lots`, `/tags`,
`/case-study/garcia`, `/heartandangel/about`, `/research/novayagazeta2025`, `/unframed/book`.

- `/media`: one H1 and archive heading in initial HTML. The fallback string is also embedded in the
  React payload, so its mere presence is not evidence of a client-render bailout. Server evidence:
  `app/media/page.tsx:37-59,80-93`; SSR regression test:
  `components/media/__tests__/MediaArchive.test.tsx`.
- `/research/novayagazeta2025`: zero raw-HTML H1. The component defaults to Russian and returns null
  until mount (`app/research/novayagazeta2025/NovayaGazetaClient.tsx:297-305`).
- `/unframed/book`: zero raw-HTML H1. It is a client reader that requests gated content after mount
  (`app/unframed/book/page.tsx:1-9,39-88`). A public server-rendered cover/title shell is preferable,
  but must not expose manuscript content.
- `/flow` still has two H1 elements; this is hierarchy polish, not a crawl blocker.

### Structured data

JSON parsing succeeded with zero syntax errors on eight current templates. Observed types included
`WebSite`, `Person`, `Organization`, `ProfilePage`, `CollectionPage`, `ItemList`, `Article`,
`AboutPage` and `BreadcrumbList`. No rating/review schema was observed. This verifies syntax and
types only; it is not a Google Rich Results eligibility result.

### Internal links and content architecture

Eight hubs (`/`, `/journal`, `/media`, `/heritage`, `/flow`, `/research`, `/unframed`, `/tags`)
contained 17–39 same-origin references in raw HTML. A deduplicated sample of **66 internal URLs**
from those hubs was fetched: 66 final 200, zero errors. This supports basic hub connectivity but is
not a complete orphan-page crawl of all 755 sitemap URLs.

Architecture remains broad: static profile/service pages, Journal, high-volume Flow, Media, art
lots, Heritage and research coexist in one sitemap. The historical GSC backlog is concentrated in
Flow/media and supports an editorial curation review; it does not prove that those sections should
be mass-noindexed or redirected.

## 5. GSC analysis: historical versus current

### Historical supplied data only

| Slice                   | Property                                                          | Dates                             | Search type           | Filters/state                                   | Result                       |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------- | --------------------- | ----------------------------------------------- | ---------------------------- |
| Daily visibility export | `sc-domain:merkurov.love` (task metadata; absent from raw export) | 2026-10-21..2026-11-17            | `web` (task metadata) | all query/page/country/device; final unverified | 167 impressions, 3 clicks    |
| First/second half       | same                                                              | 2026-10-21..11-03 vs 11-04..11-17 | same                  | same                                            | 128/3 vs 39/0                |
| Coverage snapshot       | same                                                              | snapshot 2026-11-22               | web context           | coverage categories                             | 417 indexed; 228 not indexed |
| Supplied URL drilldown  | same                                                              | snapshot 2026-11-22               | web context           | Discovered—currently not indexed only           | 161 URLs                     |

Historical coverage categories were 161 discovered-not-indexed, 33 crawled-not-indexed, 17 404,
5 noindex, 4 redirects, 2 alternative canonical and 6 Google-selected-different-canonical. Only the
161-URL list was supplied. The top-page extract (178 impressions in seven rows) exceeds the daily
slice total (167), so those exports cannot be merged; see
`docs/gsc-visibility-audit-2026-11-20.md:89-153`.

### Current data

**Unavailable.** Exact current property/date/search-type/filters cannot be asserted because no API
response was obtained. Required next pull: `sc-domain:merkurov.love`, `type=web`, `dataState=final`,
latest complete 28 days versus preceding 28 days, all query/page/country/device values, with the
existing three-day delay guard. Until then, ranking/CTR causes are hypotheses.

## 6. Ranked matrix

| Rank | Finding                                                            | Severity       | Impact                                   | Verification                                         | Expected effect                              | Change risk / decision                    |
| ---: | ------------------------------------------------------------------ | -------------- | ---------------------------------------- | ---------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
|    1 | `/media` 568 KB, uncached 6.76 s probe                             | P2             | Crawl cost and user latency              | URL/header/byte evidence; `app/media/page.tsx:55-93` | Pagination could reduce HTML/LCP work        | Medium; backlog, measure first            |
|    2 | `/journal` 168 KB, uncached 6.30 s probe                           | P2             | Crawl efficiency and UX                  | URL evidence; `app/journal/page.tsx:5`               | Data-layer cache could reduce origin latency | Medium; backlog                           |
|    3 | Research page absent before mount                                  | P2             | Content understanding for non-JS clients | 0 H1; client lines 297-305                           | Server abstract exposes real page purpose    | Medium; browser/localization tests needed |
|    4 | Book reader has no public SSR heading                              | P2             | Weak raw-HTML landing shell              | 0 H1; client reader lines 1-88                       | Better discovery without exposing book       | Medium; auth/paywall regression risk      |
|    5 | No current GSC comparable slice                                    | P1 measurement | Cannot prioritize search work reliably   | no MCP/GSC resource; historical files only           | Enables evidence-led CTR/content work        | Low; reuse PR #61 only                    |
|    6 | `/letters` serves a 200 representation canonicalized to `/journal` | P3             | Duplicate crawl work                     | current URL/canonical evidence                       | Redirect may consolidate crawl signals       | Low-medium; editorial decision            |
|    7 | Flow/media long tail in historical backlog                         | P2 hypothesis  | Possible quality/crawl dilution          | historical GSC only                                  | Curation may improve selection               | High editorial risk; no bulk action       |
|    8 | `/flow` has two H1s                                                | P3             | Heading hierarchy                        | raw HTML count                                       | Minor semantic cleanup                       | Low, not urgent                           |
|    — | Host/legacy normalization                                          | Resolved P0/P1 | Canonical consolidation                  | current redirect destinations + source/tests         | Already achieved                             | No duplicate fix                          |
|    — | Media SSR, debug noindex, sitemap dates                            | Resolved P1    | Crawlability/hygiene                     | current production + tests                           | Already achieved                             | No duplicate fix                          |

Facts are rows with current URL/source evidence. Row 7 is explicitly a hypothesis. No ranking gain
is promised.

## 7. Verification and CI evidence

- `pnpm verify` — exit 0: typecheck and lint completed; **506 suites passed, 1 skipped; 3,648 tests
  passed, 10 skipped**. Lint has existing warnings but no blocking errors.
- Focused SEO regression run — exit 0: 5 suites, 48 tests covering canonical host, robots/noindex,
  sitemap membership/date policy, hreflang reciprocity and Media SSR.
- Targeted ESLint — exit 0 with two `react-hooks/set-state-in-effect` warnings in
  `components/media/MediaArchive.tsx:305,319`.
- `pnpm build` — exit 1 after successful compilation and TypeScript. Page-data collection fails at
  `app/api/cast/route.ts:11` with `supabaseUrl is required`; required environment is unavailable.
  This is a baseline environment limitation and no secret was inspected.
- The current task itself runs in GitHub Actions after the mandated preflight passed. This session
  cannot query the enclosing job conclusion, so a final integrated CI conclusion is not claimed.

## 8. OpenAI usage/cost ledger and release handoff

Owner-provided workflow evidence says the mandatory preflight completed with provider `openai`,
model `openai/gpt-5.6`, `model_call=ok`, `worker_api=ok`, and `preflight=passed`. That proves a live
call but does not expose tokens or cost to this session.

| Stage                    | Usage/cost visible here              | Action                                    |
| ------------------------ | ------------------------------------ | ----------------------------------------- |
| Workflow preflight       | model known; tokens/cost unavailable | accepted as successful, cost not invented |
| OpenCode audit session   | no usage/cost metadata exposed       | recorded as unavailable, not `$0`         |
| Separate audit API calls | none made by audit tools             | no additional direct model call           |

Therefore the **$2.50 hard cap and $2.30 stop threshold cannot be independently totaled** from the
available metadata. No further model/API call was initiated. The optional release-handoff subtask is
**skipped** because cumulative spend cannot be proven below $2.30; no deployment or promotion was
performed. No credential was read, printed, stored, transmitted, or added to a client bundle.

## 9. Ranked follow-up backlog and 30-day plan

1. Restore/reuse the existing read-only GSC grant and save a comparable 28-vs-28 slice with complete
   metadata. Do not build a second monitor.
2. Profile `/media` with mobile Lighthouse/CrUX if available; paginate or cap the initial server
   list, preserving filter URLs and JSON-LD accuracy.
3. Replace Journal's dynamic self/origin work with a directly cached data-layer read; compare cache
   headers and repeated TTFB before shipping.
4. Add a localized server-rendered title/abstract shell to the Novaya report; retain language switch
   behavior and run desktop/mobile checks.
5. Add a public server-rendered cover/title shell to `/unframed/book`; explicitly test that gated
   manuscript text never appears to unauthenticated users.
6. Decide editorially whether `/letters` should redirect to `/journal`; inspect inbound links first.
7. Curate only high-value Flow/media records using current GSC evidence; no mass noindex, rewrite,
   redirect, or generated content.

- **Days 1–3:** obtain and freeze the GSC baseline; recheck redirect status with a transport that
  exposes intermediate headers.
- **Days 4–10:** profile Media and Journal on mobile and repeat HTTP probes; implement one bounded
  performance change with regression/browser tests.
- **Days 11–20:** implement the two SSR shells with localization/auth tests; revalidate metadata,
  JSON-LD, canonical and hreflang.
- **Days 21–30:** review only pages supported by current GSC page/query evidence, then compare
  coverage and impressions without claiming causality from small samples.

## 10. Final status

**Review / partially verified**, not fully verified. Technical SEO scope, current production, main,
historical GSC, prior work, matrix and plan are independently evidenced. Current GSC data, exact
intermediate redirect codes, field CWV, final enclosing CI conclusion and the cumulative OpenAI cost
remain unavailable. Those limitations prevent a fully verified task status.
