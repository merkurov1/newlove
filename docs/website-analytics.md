# Pierrot Website Intelligence

Owner-facing analytics for `merkurov.love`. The system joins external Google
measurements with the internal Supabase/Brain state, but keeps every source's
definitions separate.

## 1. What existed before this work

Verified against the production Supabase project on 2026-11-09.

| Area                                                          | Existed in code | Existed in production DB | Actually working                                |
| ------------------------------------------------------------- | --------------- | ------------------------ | ----------------------------------------------- |
| GA4 browser tracking (`lib/analytics/ga4.ts`, `G-J1F4ZTK9ND`) | Yes             | n/a                      | Yes, as client-side event tracking only         |
| GA4 Data API (reports)                                        | No              | No                       | No                                              |
| Search Console API                                            | No              | No                       | No                                              |
| Umami adapter                                                 | No              | No                       | No                                              |
| Pierrot analytics views (`pierrot_v_*`)                       | Yes             | Yes — 21 views           | Yes; data present                               |
| `pierrot_v_conversation_overview`                             | Yes             | Yes, 330 rows            | Yes                                             |
| `pierrot_v_purchases`                                         | Yes             | Yes, 0 rows              | Queryable; no confirmed purchases in the period |
| `pierrot_v_subscription_conversions`                          | Yes             | Yes, 2 rows              | Yes                                             |
| `pierrot_v_offer_funnel`                                      | Yes             | Yes, 4 offers            | Yes                                             |
| `pierrot_v_product_interest`                                  | Yes             | Yes, 4 offers            | Yes                                             |
| `pierrot_v_quality_indicators`                                | Yes             | Yes, 330 rows            | Yes                                             |
| `pierrot_v_unanswered_questions`                              | Yes             | Yes, 4 rows              | Yes                                             |
| Observatory / DASH                                            | Yes             | n/a                      | Yes                                             |
| Owner tools (`/stats`, `/analytics`, `/commercial`, …)        | Yes             | n/a                      | Yes                                             |
| Google OAuth via Supabase Auth                                | Yes             | n/a                      | Yes, for login only                             |
| Analytics OAuth grant + server token storage                  | No              | No                       | No                                              |
| External analytics tables                                     | No              | No                       | No                                              |

Important: a Google login session does **not** grant GA4 or Search Console API
access. Before this work there was no server-side Google refresh token for
analytics.

## 2. What was added

### Data layer

`lib/analytics/website/`

- `types.ts` — source-aware vocabulary; no anonymous merged "visitors".
- `config.ts` — env, site URL, measurement ID, property/site overrides.
- `tokenCrypto.ts` — AES-256-GCM sealing, HMAC OAuth state.
- `providers/http.ts` — bounded retries, backoff, 429/5xx only, no token logs.
- `providers/googleAnalytics.ts` — GA4 Data API `runReport` + report definitions.
- `providers/searchConsole.ts` — Search Analytics query + pagination cap.
- `providers/umami.ts` — independent Umami adapter.
- `providers/oauth.ts` — consent URL, code exchange, refresh, revoke, property
  and site discovery, preflight for redirect-URI errors.
- `store.ts` — connections, sync runs, metrics, search rows, snapshots, locks.
- `sync.ts` — idempotent manual/incremental/backfill/repair sync.
- `normalize.ts` — URL/path normalization, project and content matching.
- `period.ts` — timezone-aware periods using the existing
  `lib/pierrot/reportingPeriod.ts`.
- `dataset.ts` — normalized read model + internal Supabase/Brain enrichment.
- `insights.ts` — funnel, anomalies, opportunities, evidence separation.
- `report.ts` — editorial Markdown report.
- `question.ts` — natural-language scope/period/project detection.
- `answer.ts` — owner-tool entry point.
- `tools.ts` — named owner tools.
- `dashboard.ts` — DASH read model.

### Storage (`migrations/2026-11-30_website_analytics.sql`)

Applied to production. Additive only; no existing object was changed.

- `analytics_connections` — provider status, external id, encrypted token.
- `analytics_sync_runs` — every run, error, range and row count.
- `analytics_metrics_daily` — normalized daily metrics with idempotent unique key.
- `analytics_search_performance` — query × page × country × device × day rows.
- `analytics_snapshots` — raw provider JSONB with checksum (audit history).
- `analytics_sync_locks` — cooperative per-provider lock.
- `analytics_try_lock()` / `analytics_unlock()` — service-role only.

All tables have RLS enabled and grants revoked from `anon`/`authenticated`.

### API

- `GET /api/admin/analytics/connect` — starts incremental read-only consent.
- `GET /api/auth/google-analytics/callback` — admin + signed state + nonce.
- `POST /api/admin/analytics/disconnect` — revokes and removes tokens.
- `POST /api/admin/analytics/sync` — manual sync (independent of scheduler).
- `GET /api/admin/analytics/status` — health without secrets.
- `GET|POST /api/cron/analytics-sync` — scheduler-compatible, `CRON_SECRET`.

### UI

- `/admin/pierrot/analytics` — connection management, status, data coverage,
  manual sync, run history, configuration instructions.
- DASH — compact website panel with GA4 sessions, Google clicks/impressions,
  confirmed subscriptions and a sessions sparkline.
- Chat reports use the existing Markdown renderer and editorial typography.

## 3. Google OAuth status (verified, not simulated)

The existing OAuth client is valid. A real preflight against Google returned:

```
redirect_uri_mismatch
```

The authorization endpoint rejected:

```
https://www.merkurov.love/api/auth/google-analytics/callback
```

because that URI is not in the client's Authorized redirect URIs. This is the
only blocker to external data. No token is mocked or invented.

### Owner action (one minute)

1. Google Cloud Console → APIs & Services → Credentials.
2. Open the same OAuth 2.0 Client ID used by Supabase Auth.
3. Add `https://www.merkurov.love/api/auth/google-analytics/callback` to
   **Authorized redirect URIs**.
4. Ensure the GA4 Data API and Search Console API are enabled for the project.
5. Open Pierrot → `/admin/pierrot/analytics` → Connect Google.
6. Approve the two read-only scopes:
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `https://www.googleapis.com/auth/webmasters.readonly`

The callback discovers the numeric GA4 property by matching the web stream
measurement ID `G-J1F4ZTK9ND` through the Google Admin API. The measurement ID
is never used as a property ID.

Optional overrides:

```
ANALYTICS_GA4_ACCOUNT_ID=123456789
ANALYTICS_GA4_PROPERTY_ID=123456789
ANALYTICS_GSC_SITE_URL=sc-domain:merkurov.love
ANALYTICS_GOOGLE_REDIRECT_URI=https://www.merkurov.love/api/auth/google-analytics/callback
```

### Identifier rules

Google uses three distinct identifiers and they are never interchangeable:

- **Account ID** — `accounts/176791840` in the Admin API, stored as
  `external_meta.account_id`.
- **Property ID** — the numeric GA4 property, stored as
  `analytics_connections.external_id` and `external_meta.property_id`.
- **Measurement ID** — the web-stream `G-...` value, stored as
  `external_meta.matched_measurement_id`.

Discovery only connects a property when its web data stream contains the
expected measurement ID. With `ANALYTICS_GA4_PROPERTY_ID` set, discovery calls
`properties.get` and `dataStreams.list` directly and verifies `parent` against
`ANALYTICS_GA4_ACCOUNT_ID` when that is configured. It does not list every
property and it never accepts a measurement ID or account ID as a property ID.

Search Console selection always starts from a real `sites.list` response. An
`ANALYTICS_GSC_SITE_URL` override must exist in that response; a site URL is
never inferred from GA4 identifiers. The stored `external_meta` keeps the
selected `site_url`, `permission_level`, `selection_strategy` and the complete
`discovered_sites` list.

### Error diagnostics

When Google rejects a request, the connection and every sync run retain the
classified code (`api_not_enabled`, `insufficient_permissions`, …) plus the
original Google diagnostic: HTTP status, Google reason such as
`SERVICE_DISABLED`, Google message, API stage and scope. A disabled API is not
reported as “no data” or “zero”. Existing refresh tokens, `connected_at`, the
previous `external_id`, discovered resources and sync history are preserved
when a later discovery attempt fails.

## 4. Configuration

See `.env.example`. Secrets are server-only; nothing is `NEXT_PUBLIC_`.

- `ANALYTICS_TOKEN_ENCRYPTION_KEY` — dedicated refresh-token key. If omitted, a
  domain-separated key is derived from `SUPABASE_SERVICE_ROLE_KEY`; the admin UI
  reports this mode.
- `ANALYTICS_TIMEZONE` — default `Europe/London`.
- `ANALYTICS_BACKFILL_DAYS` — default 90.
- `ANALYTICS_INCREMENTAL_DAYS` — default 3 (repairs delayed Google data).
- Umami: `ANALYTICS_UMAMI_API_URL`, `ANALYTICS_UMAMI_API_KEY`,
  `ANALYTICS_UMAMI_WEBSITE_ID`.

## 5. Sync behaviour

- Modes: `manual`, `incremental`, `backfill`, `repair`.
- First sync: up to 90 days.
- Incremental: last 3 days before the previous sync day, with a floor.
- Backfill/repair are explicit; no uncontrolled loops.
- Per-provider lock prevents parallel runs.
- Retries: 408/429/5xx and network errors, exponential backoff, `Retry-After`.
- Idempotent: unique indexes + upserts. Re-running a period does not duplicate.
- Raw snapshots are appended by checksum; normalized daily rows are updated.
- No automatic schedule was created. The compatible endpoint is documented; an
  external scheduler must call it with `Authorization: Bearer CRON_SECRET`.

## 6. Objectivity rules enforced in code

- GA4 sessions ≠ Search Console clicks ≠ Umami visits ≠ Pierrot conversations.
- Impressions ≠ visits; users ≠ sessions; new users ≠ new subscribers.
- Started subscription ≠ confirmed subscription; checkout ≠ purchase; button
  click ≠ donation.
- Missing source/data renders `—` with a reason, never `0`.
- Owner/test conversations are excluded from internal audience counts.
- Confirmed actions are not attributed to a channel or query. The report says
  "attribution unknown".
- Facts, interpretation, hypotheses, recommendations and limitations are
  separate fields and separate Markdown labels.
- GA4 returning users is explicitly labelled derived (`activeUsers − newUsers`).

## 7. Owner tools

Named functions in `lib/analytics/website/tools.ts`:

`get_website_overview`, `get_traffic_analytics`, `get_search_performance`,
`get_page_performance`, `compare_analytics_periods`, `get_project_performance`,
`get_conversion_funnel`, `find_content_opportunities`,
`detect_analytics_anomalies`, `get_source_health`, `get_analytics_evidence`.

They are reachable through the existing `ownerTools` mechanism. Natural
questions are detected without slash commands. `/site` is an optional explicit
command. All execution remains inside `ownerMode && ragOwnerAuthorized`; public
Pierrot cannot access visitor analytics.

## 8. Tests and verification

- Unit suites cover detection, normalization, periods, crypto, providers,
  retries, insights, funnel and sync ranges.
- Production Supabase was queried read-only for inventory and smoke tests.
- Idempotency was verified on production with temporary rows, then removed.
- Google endpoints were called with an invalid token and correctly returned
  `unauthorized` (401), proving connectivity and error mapping.
- Google OAuth preflight correctly detected `redirect_uri_mismatch`.
- TypeScript: a scoped `tsc` check covering the new module and every touched
  route/page passes. A full-repo `tsc` run is memory-heavy in this environment.

## 9. Known limitations

- External GA4/Search Console data is unavailable until the redirect URI is
  registered and the owner grants consent.
- Search Console API does not expose search appearance or full indexing data.
- Search Console lags 2–3 days.
- GA4 cannot reliably identify the owner's own sessions; that needs a separate
  internal filter, not an assumption.
- Umami visitor totals are stored only for the exact synced range; arbitrary
  report windows may show `—` rather than a false number.
- Attribution from search query to confirmed subscription/donation is unknown
  and is never fabricated.

## 10. Next steps after consent

1. Run the first backfill (90 days).
2. Enable an external scheduler for `/api/cron/analytics-sync` if desired.
3. Review the first weekly report with the owner and tune thresholds.
4. Optionally add Google Trends / YouTube Analytics as additional adapters
   using the same connection, sync, snapshot and source-health contracts.

## 11. Report length and history

Analytical replies are displayed up to 24,000 characters. The current chat
turn always returns the full report. History storage is capped at 15,800
characters on the v2 history RPC and 4,000 on the legacy RPC; when the stored
copy is shorter, it is cut at a Markdown section boundary and explicitly
labelled. The full data remains available through the Analytics screen and the
owner tools.
