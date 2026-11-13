# Technical stabilization — baseline and changes
Date: 2026-11-13

## 1. Baseline (read-only, production)

### Database snapshot

| Metric | Value |
|---|---|
| Database size | 187 MB |
| Connections (snapshot) | 12 idle, 2 active, 2 null-state pooler |
| `pg_stat_statements` reset | 2025-09-27 |
| `pg_stat_database` reset | not set |
| Cumulative temp bytes | ~2.09 TB (since stats reset — not current load) |
| Cumulative temp files | 744,931 |
| Cache hit | 100.00% |
| Active Realtime subscriptions | 0 |
| pg_cron jobs | `brain_worker_tick()` every 5 minutes |
| RLS tables with multiple permissive policies | 13 |
| Vercel production deployments in last 4 days | 20 (one canceled, most ~3 min) |

`pg_stat_statements` is cumulative since 2025-09-27 and cannot be used as a
current-load metric. A 30-second delta showed essentially no application query
load at the time of measurement; only pg_net queue maintenance and the
diagnostic query itself.

### Confirmed structural load sources

1. `brain_worker_tick()` sent **three HTTP requests every 5 minutes** even when
   `brain_ingestion_jobs`, `brain_graph_jobs` and `media_analysis_runs` were all
   empty. That is up to 864 Vercel Function invocations per day with zero work.
2. Middleware called `supabase.auth.getClaims()` for **every non-API page**,
   including public `/`, `/lots`, `/media`, `/flow`, `/journal`, `/letters`.
3. `/lots`, `/lots/[id]`, `/media`, `/media/record/[slug]` were forced dynamic
   with `revalidate = 0` / `force-dynamic`, causing a DB read on every visit.
4. Swiper CSS was imported globally in `app/layout.tsx` even though Swiper
   components import their own CSS and the selection page can own its CSS.
5. The admin analytics page rebuilt a 30-day dataset on every request.
6. `analytics_metrics_daily` reads filtered by provider and ordered by
   `metric_date` without an index starting `(provider, metric_date)`, causing
   sort/temp work for larger ranges.

### Limitation

Supabase Management API logs and Vercel runtime logs for the 24-hour Warp
timeout count were not available with the current credentials/plan. The
historical `867` Warp errors could not be re-counted from this environment;
no conclusion is drawn from that number. The changes below remove confirmed
sources of unnecessary work and add the missing analytics read index.

## 2. Changes

### Conditional cron dispatch

`migrations/2026-11-13_stabilize_brain_worker_tick.sql`

- Checks the three durable queues first.
- Sends an HTTP request only for a queue with `queued`/`processing` work.
- Returns `{status: "idle"}` without any HTTP call when all queues are empty.
- Rollback: `migrations/rollback/2026-11-13_stabilize_brain_worker_tick_rollback.sql`.

Verified in production:
`select public.brain_worker_tick()` → `idle`, `brain=false`, `graph=false`,
`media=false`, no HTTP responses created.

### Middleware auth scope

`lib/auth/routeProtection.ts`, `middleware.ts`

- `getClaims()` now runs only for `/admin`, `/profile`,
  `/research/telegram`, `/heartandangel/world`.
- Public pages return `NextResponse.next()` without creating a Supabase SSR
  client.
- API routes keep their own authorization (matcher already excludes `/api`).
- Tests: `lib/auth/__tests__/routeProtection.test.ts`.

### Caching / ISR

- `app/lots/page.tsx`: `revalidate = 300` (was `0`).
- `app/lots/[id]/page.tsx`: `revalidate = 3600` (was `0`).
- `app/media/page.tsx`: `revalidate = 300` (was `force-dynamic`).
- `app/media/record/[slug]/page.tsx`: `revalidate = 3600` (was
  `force-dynamic`).
- Vault publish route revalidates `/lots` and the specific `/lots/[id]`.
- Admin analytics dashboard wrapped in `unstable_cache` for 60 seconds.

### Global CSS

- Removed global `swiper/css`, `swiper/css/navigation`,
  `swiper/css/pagination` from `app/layout.tsx`.
- Selection page owns them in `app/selection/swiper-init.ts`.
- `HeartAndAngelHub` and `AuctionSlider` already import their required CSS.

### Analytics query index

`migrations/2026-11-13_analytics_metrics_provider_date_idx.sql`

- `analytics_metrics_daily (provider, metric_date)`.
- EXPLAIN ANALYZE for a 10-day GA4 read now uses an index scan:
  ~5.5 ms, no sort/temp.
- Rollback: `migrations/rollback/2026-11-13_analytics_metrics_provider_date_idx_rollback.sql`.

### Images

- `/lots` gallery images use native lazy loading and async decoding.
- No visual redesign.

## 3. Realtime map

| Channel | File | Table/event | Cleanup |
|---|---|---|---|
| `tribute-live` | `app/tribute/page.tsx` | `temple_log` INSERT, `event_type=TRIBUTE` | `removeChannel` on unmount |
| `vigil_live_sync` | `app/vigil/page.tsx` | `vigil_hearts` `*`, `temple_log` INSERT | `removeChannel` on unmount |
| `realtime-talks` | `components/LoungeInterface.tsx` | `messages` INSERT/DELETE + presence | `removeChannel` on session change/unmount |

Current production subscriptions: **0**. No hidden subscriptions were found.
No Realtime changes were made; the existing channels are scoped and cleaned up.

## 4. Cron / background map

| System | Schedule | Purpose | Change |
|---|---|---|---|
| Supabase pg_cron `brain_worker_tick()` | every 5 min | dispatch Brain/Graph/Media workers | now conditional; idle ticks send no HTTP |
| Vercel cron `/api/cron/analytics-sync` | daily 03:15 | GA4/GSC/Bluesky incremental sync | unchanged |
| `/api/cron/brain-worker` | invoked by tick | durable Brain ingestion | unchanged |
| `/api/cron/graph-worker` | invoked by tick | graph extraction | unchanged |
| `/api/cron/media-analysis-worker` | invoked by tick | media analysis queue | unchanged |
| `newsletter-worker` | existing scheduler | newsletter delivery | unchanged |

No new cron job was added in this stabilization pass.

## 5. Public / protected routes

**Public, no Auth middleware refresh:** `/`, `/lots`, `/lots/[id]`, `/media`,
`/media/record/[slug]`, `/flow`, `/journal`, `/letters`, `/heritage`, `/tribute`,
`/vigil`, `/selection`, `/unframed`, `/heartandangel` (except `/world`).

**Protected, Auth refresh retained:** `/admin/*`, `/profile`,
`/research/telegram`, `/heartandangel/world`. API routes remain protected by
their own route handlers and RLS.

## 6. Deliberately unchanged

- RLS policies were **not** consolidated. `letters` has one duplicate public
  SELECT policy, but removing it has negligible load benefit and carries access
  risk. Other "multiple permissive" findings include service-role policies and
  distinct commands; they are not automatically redundant.
- Duplicate/overlapping indexes on `letters`, `articles`, `users`, `items` were
  **not** dropped. `pg_stat_statements` does not have a reliable recent window,
  and dropping indexes without query-plan evidence would risk regressions.
- `force-dynamic` on `/journal` and `/letters` remains: they use search params
  or client-side archive state and are not safely cacheable as a whole.
- PierrotChat remains globally mounted because it is a core site interaction,
  not an optional analytics widget.
- Vercel/Umami analytics were not removed.
- No production tables, rows, RLS policies or indexes were deleted.

## 7. Remaining owner decisions

- Supabase Management API token is needed to re-check PostgREST/Warp timeout
  counts and full Realtime WAL metrics.
- Vercel Hobby does not retain runtime logs for the requested window and does
  not expose Web Analytics/Speed Insights API data.
- Umami API remains unconfigured; tracking script is still active.
- Production deployment of the caching/middleware changes is required before
  the after metrics can be measured on Vercel.
