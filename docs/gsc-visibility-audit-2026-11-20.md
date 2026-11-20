# Google Search Console visibility audit — merkurov.love

Date of this audit: **2026-11-20**
Property under investigation: **`sc-domain:merkurov.love`**
Search type: **`web`**
Status: diagnostic complete for the supplied data and the live technical surface;
the actual period-over-period GSC slice is **not yet reproducible from this
execution environment** because no Google credentials or production database
access are available here.

This document separates **facts**, **hypotheses** and **recommendations**. It
does not change production SEO, canonical URLs, redirects, sitemap or robots.

---

## 1. Executive summary

1. The reported “−69.5%” is **not** a comparison of the latest 28 days with the
   previous 28 days. It compares the two 14-day halves of one 28-day window:
   `2026-10-21..2026-11-03` (128 impressions / 3 clicks) and
   `2026-11-04..2026-11-17` (39 impressions / 0 clicks). The arithmetic
   (−69.53% impressions) is correct, but the comparison is **within-period**.
2. The supplied top-pages extract **cannot belong to the same slice** as the
   167-impression total. Its listed seven rows already sum to **178
   impressions**, and two clicks, against 167 impressions / 3 clicks for the
   whole daily slice. The two extracts are kept separate and are not added
   together.
3. The supplied top-countries rows sum to **120 impressions**, not 167. That is
   consistent with a top-N view, but the extract has no period, property,
   filter or search-type metadata, so it cannot explain the change.
4. No query-level, device-level or search-appearance export was supplied.
   Brand vs non-brand, device and query attribution therefore **cannot be
   established from the supplied files**.
5. The live technical surface checked on 2026-11-20 is healthy for the audited
   URLs: all key pages return 200, canonicalise to themselves on
   `https://www.merkurov.love`, are `index, follow`, `robots.txt` allows public
   content, and all 505 sitemap URLs use the `www` host. Non-`www` and `http`
   requests end on `https://www.merkurov.love`.
6. The real Flow URL for the spy-satellite item is
   `/flow/github-bilawalsidhugods-eye-view-a-spy-satellite-simulator-in-your-browser-excep`.
   It is present in the sitemap, returns 200 and is self-canonical. The short
   path `/flow/github-spy-satellite-simulator` is a different, 404 URL; it
   should not be used as evidence that the indexed Flow page disappeared.
7. Definitive query/page/country attribution requires a read-only GSC OAuth
   grant and a fresh comparable slice. The paid GSC Wizard trial is not a
   dependency and its expiry proves nothing about Pierrot’s backend access.

---

## 2. Existing Pierrot integration — audit

Verified in code:

| Area                   | Existing implementation                                                                  | State                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| OAuth scopes           | `analytics.readonly`, `webmasters.readonly`, `youtube.readonly`, `yt-analytics.readonly` | Read-only; one Google grant                                  |
| Search Console adapter | `lib/analytics/website/providers/searchConsole.ts`                                       | Search Analytics API, `type: "web"`, 25k pages, hard row cap |
| Property selection     | `lib/analytics/website/providers/oauth.ts`, `discovery.ts`                               | Uses real `sites.list`; override must exist in that list     |
| Storage                | `analytics_search_performance`, `analytics_snapshots`, `analytics_sync_runs`             | Additive migration `2026-11-30_website_analytics.sql`        |
| Idempotency            | Unique key on date × site × query hash × page hash × country × device; replace-slice RPC | Re-running a range does not duplicate rows                   |
| Sync modes             | `manual`, `incremental`, `backfill`, `repair`; per-provider lock; recent-day re-read     | Search Console lag is acknowledged in code                   |
| Scheduler              | `/api/cron/analytics-sync` with `CRON_SECRET`                                            | No new schedule is created by this work                      |
| Dashboard              | `/admin/pierrot/analytics`, DASH website panel                                           | Before this change: clicks sparkline only; no full GSC block |
| GSC Wizard             | Not referenced by this integration                                                       | Not required                                                 |

A previous audit documented `redirect_uri_mismatch` on the analytics callback.
This execution has no `.env`, no production Supabase access and no Google
credentials, so it cannot re-test whether the owner has since fixed that URI.
The correct statement is **unknown**, not “working” and not “broken”.

### What was missing before this change

- No explicit search type in the stored slice metadata.
- Totals included rows for days after GSC’s expected finalisation day.
- No brand/non-brand split, no GSC anomaly thresholds and no minimum-sample
  guard in the dashboard.
- No clear `stale` / `unavailable` / `not configured` GSC block.
- No last-successful-sync marker inside the GSC block.
- A row-cap or truncated GSC sync was recorded as completed rather than
  partial.

---

## 3. Reproducible supplied slices

Stored under `data/analytics/` with explicit metadata. They are deliberately
separate files.

### 3.1 Daily aggregate slice

| Field            | Value                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| Slice ID         | `gsc-merkurov-love-daily-2026-10-21_2026-11-17`                           |
| Source           | owner-provided GSC export, not GSC Wizard                                 |
| Property         | `sc-domain:merkurov.love` — stated by task, **not present in the export** |
| Search type      | `web` — stated by task, **not present in the export**                     |
| Dates            | `2026-10-21` — `2026-11-17` (28 days)                                     |
| Filters          | query all, page all, country all, device all                              |
| Data state       | reported final, **unverified** (no daily rows)                            |
| Totals           | 167 impressions, 3 clicks, CTR 1.796%                                     |
| Average position | not supplied                                                              |

| Window          | Dates                   | Impressions | Clicks |       CTR |
| --------------- | ----------------------- | ----------: | -----: | --------: |
| Earlier 14 days | 2026-10-21 — 2026-11-03 |         128 |      3 |    2.344% |
| Later 14 days   | 2026-11-04 — 2026-11-17 |          39 |      0 |        0% |
| Difference      | —                       |     −69.53% |      — | −2.344 pp |

The sums are internally consistent: `128 + 39 = 167`, `3 + 0 = 3`.

### 3.2 Top pages — unattributed extract

| Page                                 | Impressions | Clicks |    CTR | Position |
| ------------------------------------ | ----------: | -----: | -----: | -------: |
| Flow: GitHub spy satellite simulator |          58 |      1 | 1.724% |    10.98 |
| `/`                                  |          43 |      1 | 2.326% |     2.93 |
| `/heritage`                          |          29 |      0 |     0% |     5.07 |
| `/art-engine`                        |          17 |      0 |     0% |     6.65 |
| `/advising`                          |          11 |      0 |     0% |     3.91 |
| `/research`                          |          10 |      0 |     0% |     4.90 |
| `/flow/the-sanctuary-digital-temple` |          10 |      0 |     0% |     6.50 |
| **Listed total**                     |     **178** |  **2** | 1.124% |        — |

The task says the first eight rows contain “at least 179” impressions, but only
seven rows were supplied. The listed seven already exceed the daily total
(178 > 167), which proves incompatibility regardless of the eighth row.

### 3.3 Top countries — unattributed extract

| Country          | Impressions |
| ---------------- | ----------: |
| United States    |          40 |
| Israel           |          31 |
| Russia           |          31 |
| Ukraine          |          18 |
| **Listed total** |     **120** |

If this were the same 167-impression slice, 47 impressions would be outside the
listed countries. That is not assumed.

### 3.4 Why a lag-safe 28-vs-28 comparison is not possible here

With a 3-day GSC reporting delay and audit date 2026-11-20, the last expected
complete day is **2026-11-17**. That matches the end of the supplied slice.
However:

- the immediately preceding 28-day window (`2026-09-23..2026-10-20`) was not
  supplied;
- no daily rows were supplied, so finalisation of individual days inside
  `2026-11-04..2026-11-17` cannot be checked;
- the top-page and country extracts have no dates at all.

A valid comparison must therefore be re-pulled from the API with the same
property, filters and `type=web` for both windows.

---

## 4. Where the change could be attributed — current evidence

| Segment           | Available?  | Finding                                                                             |
| ----------------- | ----------- | ----------------------------------------------------------------------------------- |
| Impressions       | partial     | 128 → 39 inside one 28-day window. Not a 28-vs-28 comparison.                       |
| Clicks            | partial     | 3 → 0. With three clicks, zero is not a stable percentage signal.                   |
| CTR               | partial     | 2.344% → 0%. Difference is 2.344 pp; sample is too small for a metadata conclusion. |
| Average position  | no          | Not in the daily export.                                                            |
| Queries           | no          | No query export. Brand/non-brand cannot be computed from the supplied files.        |
| Pages             | no          | Top-page extract is incompatible with the daily total.                              |
| Countries         | no          | Top-country extract has no period/filter metadata.                                  |
| Devices           | no          | Not supplied.                                                                       |
| Search appearance | no          | GSC Search Analytics API does not expose it.                                        |
| Search type       | stated only | `web` by task; not present in the export.                                           |

**Conclusion:** the supplied data establish a descriptive 14-day-to-14-day
change, but do **not** establish the cause, the affected queries, the affected
pages or the affected countries. Reporting otherwise would invent evidence.

---

## 5. CTR and position with sample-size caution

The only positions available come from the unattributed top-pages extract.

- `/heritage`: 29 impressions, 0 clicks, average position 5.07. A page at an
  average position around 5 can still receive zero clicks in a 29-impression
  sample; the rule-of-three upper bound is roughly 10% CTR. This is **not**
  enough evidence to rewrite the title or description.
- `/art-engine`: 17 impressions, 0 clicks, position 6.65. Same limitation.
- `/advising`: 11 impressions, 0 clicks, position 3.91. Same limitation.
- `/research`: 10 impressions, 0 clicks, position 4.90. Same limitation.
- `/flow/the-sanctuary-digital-temple`: 10 impressions, 0 clicks, position 6.50.
  Same limitation.
- Homepage: 43 impressions, 1 click, CTR 2.33%, position 2.93. Still a small
  sample; a single click moves CTR by 2.3 pp.
- Flow spy-satellite page: 58 impressions, 1 click, CTR 1.72%, position 10.98.
  It is the largest single page row, but still below a reliable metadata-test
  threshold.

Average position is impression-weighted and is not a page’s rank in one query.
No metadata change is recommended from these samples.

---

## 6. Technical SEO checks — live facts

Checked read-only on 2026-11-20.

### 6.1 Host, redirects and canonical

| Request                      | Final URL                    | Result                 |
| ---------------------------- | ---------------------------- | ---------------------- |
| `http://merkurov.love/`      | `https://www.merkurov.love/` | reaches canonical host |
| `https://merkurov.love/`     | `https://www.merkurov.love/` | reaches canonical host |
| `http://www.merkurov.love/`  | `https://www.merkurov.love/` | reaches canonical host |
| `https://www.merkurov.love/` | itself                       | 200                    |

The homepage HTML contains:

```html
<link rel="canonical" href="https://www.merkurov.love" />
<meta name="robots" content="index, follow" />
<meta property="og:url" content="https://www.merkurov.love" />
```

The exact intermediate redirect status (301 vs 308) was not captured; the final
destination and canonical host are correct. `next.config.js` declares a
permanent host redirect from `merkurov.love` to `www.merkurov.love`.

### 6.2 Key public pages

| URL                                          | Status | Canonical   | Robots        |
| -------------------------------------------- | -----: | ----------- | ------------- |
| `/`                                          |    200 | self, `www` | index, follow |
| `/heritage`                                  |    200 | self, `www` | index, follow |
| `/art-engine`                                |    200 | self, `www` | index, follow |
| `/advising`                                  |    200 | self, `www` | index, follow |
| `/research`                                  |    200 | self, `www` | index, follow |
| `/lots`                                      |    200 | self, `www` | index, follow |
| `/media`                                     |    200 | self, `www` | index, follow |
| `/journal`                                   |    200 | self, `www` | index, follow |
| `/flow/the-sanctuary-digital-temple`         |    200 | self, `www` | index, follow |
| real spy-satellite Flow URL                  |    200 | self, `www` | index, follow |
| short `/flow/github-spy-satellite-simulator` |    404 | `/flow`     | noindex       |

The short slug is not the URL in the sitemap. The real URL is:

```
/flow/github-bilawalsidhugods-eye-view-a-spy-satellite-simulator-in-your-browser-excep
```

It is no longer than the export’s truncated label suggests; the label was not
the URL.

### 6.3 Sitemap and robots

- `/sitemap.xml`: 200, **505 URLs**, all on `https://www.merkurov.love`.
- Contains `/research`, `/heritage`, `/flow/the-sanctuary-digital-temple` and the
  real spy-satellite Flow URL.
- No non-`www` sitemap entries.
- `/robots.txt`: allows public content, disallows `/admin`, `/api`, `/auth`,
  `/draft`, `/unframed/debug`, `/question/dashboard`; declares the sitemap and
  host.

### 6.4 What could not be checked

- URL Inspection / indexing status per URL (needs GSC API or UI access).
- Soft 404, crawl anomalies, manual actions and security issues.
- Search-appearance data (not exposed by Search Analytics API).
- The production deploy timeline. Repository history shows changes during the
  period (e.g. the Next.js 16 migration `27e3dcf2` and routing repair
  `0c5de715`, both 2026-11-15), but mapping commits to deploys is not possible
  from this environment. That remains a **hypothesis**, not a proven cause.

---

## 7. Findings by evidence level

### Facts

1. Supplied daily totals are 167 impressions / 3 clicks for
   `2026-10-21..2026-11-17`; the two 14-day halves are 128/3 and 39/0.
2. The “−69.5%” is within one 28-day window, not period-over-period.
3. Top-page rows sum to 178 impressions / 2 clicks, so they cannot be merged
   with the 167/3 daily slice.
4. Top-country rows sum to 120 impressions and have no period metadata.
5. Live canonical, `www`, robots, sitemap and HTTP status checks pass for all
   audited URLs.
6. The real spy-satellite Flow page is 200, self-canonical and in the sitemap.
7. No query, device, search-appearance or indexing data was supplied.

### Hypotheses (not confirmed)

1. If the 14-day change is real and not a finalisation artefact, it could be
   driven by a few low-volume queries/pages, because the property total is very
   small.
2. The 2026-11-15 site toolchain/routing changes could have coincided with a
   crawl or rendering change, but no deploy/indexing evidence supports this.
3. Zero clicks on pages at average positions 3.9–6.7 could reflect weak
   snippets or intent mismatch, but samples of 10–29 impressions cannot
   distinguish that from normal variance.

### Recommendations

1. Grant read-only Search Console access to the existing Pierrot integration
   and run one backfill. This is the only blocker to a definitive answer.
2. Pull **28 complete days vs the previous 28 days** for property
   `sc-domain:merkurov.love`, `type=web`, all countries/devices/pages, with a
   3-day delay guard. Save the `search_analytics_slice_meta` snapshot.
3. Break the result down by query, page, country and device; compute
   brand/non-brand; compare impressions, clicks, CTR and position separately.
4. Only after that, inspect title/snippet for pages that still show meaningful
   impressions and materially low CTR. Do not rewrite metadata from 10–30
   impressions.
5. Do not mass-reindex, change canonical/redirects, rewrite robots or regenerate
   the sitemap: no technical fault was found.
6. Keep monitoring weekly, not by frequent polling. The existing
   `incremental` sync already re-reads the delayed recent days.

---

## 8. Monitoring added to Pierrot

### Dashboard block

`/admin/pierrot/analytics` now renders a dedicated Google Search Console block:

- clicks, impressions, CTR, average position;
- current period vs the previous comparable period;
- top queries, pages, countries and devices;
- brand vs non-brand, with the brand terms and the heuristic disclosed;
- substantial anomalies with minimum-sample thresholds;
- low-CTR pages above the impression floor (at least 30 impressions and 1% of
  property impressions, whichever is larger);
- property, search type, reporting delay, expected final day, freshness and
  last successful sync;
- `unavailable`, `stale`, `partial` and `not configured` states instead of zero
  values.

### Sync behaviour

- Rows after the expected finalisation day are excluded from GSC totals.
- A `search_analytics_slice_meta` snapshot records property, `type=web`,
  dimensions, filters, dates, data state, aggregation, row count, truncation
  and retrieval time.
- A reached row cap is now marked `partial`, not completed.
- A stored grant with an explicit scope list must contain
  `webmasters.readonly`; otherwise the sync fails with
  `insufficient_permissions` before calling Google.
- Pagination, idempotent replace-slice and the per-provider lock are unchanged.

No new cron was added. No Google write scope or production setting was changed.

---

## 9. Tests added

`lib/analytics/website/__tests__/searchInsights.test.ts` covers:

- Search Console pagination until a short page, and row-cap truncation;
- 3-day lag exclusion and 28-day previous-window construction;
- duplicate-safe comparison inputs and the existing merge test in
  `store.test.ts`;
- brand/non-brand classification;
- anomaly minimum-sample thresholds;
- missing GSC scope handling;
- partial provider results (`syncOutcome`);
- the supplied slices’ metadata and non-mergeability.

Existing coverage tests already assert that a partial previous window disables
growth comparison.

---

## 10. Owner action (minimal, no forms)

If the existing analytics Google grant is still valid, open
`/admin/pierrot/analytics` and run a 90-day backfill (or wait for the existing
scheduler to call `/api/cron/analytics-sync`).

If Google rejects the callback, the only owner-side step is to register the
exact redirect URI shown on that page in the same OAuth 2.0 Client ID used by
Supabase Auth, then reconnect Google and approve the read-only scopes. No data
entry in Pierrot is required.

Until that happens the dashboard correctly shows Search Console as
stale/unavailable rather than “0 impressions”.

---

## 11. Priority plan

| Priority | Action                                                                      | Evidence gate                       |
| -------- | --------------------------------------------------------------------------- | ----------------------------------- |
| P0       | Restore/reuse read-only GSC OAuth and run a backfill                        | `last successful sync` is fresh     |
| P0       | Pull 28d vs 28d with `type=web` and 3-day lag guard                         | stored slice metadata               |
| P1       | Segment the delta by query/page/country/device and brand                    | comparable coverage in both windows |
| P1       | Review title/snippet only for pages with meaningful impressions and low CTR | minimum sample threshold            |
| P2       | Check URL Inspection for the handful of high-impression URLs                | GSC indexing data                   |
| P2       | Review the 2026-11-15 deploy against crawl data                             | deploy + crawl evidence             |
| —        | Do **not** change canonical/redirects/sitemap/robots                        | no fault found                      |
| —        | Do **not** mass-reindex or bulk-edit metadata                               | no confirmed cause                  |
