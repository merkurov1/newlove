# Newsletter signup protection and lifecycle

## What changed

- `/api/subscribe` now requires server-validated honeypot, minimum form age and
  (when configured) Cloudflare Turnstile verification before writing a
  subscriber. Client-only checks are never trusted.
- The newsletter signup, confirmation and unsubscribe endpoints use the
  existing `pierrot_rate_limits` / `pierrot_rate_limit` durable cross-instance
  limiter. IP and normalized-email buckets are separate; the IP window is
  deliberately loose so offices, campuses and carriers that share an address
  are not blocked by a single busy colleague.
- Confirmation-email failure is lifecycle-safe: the new token is invalidated
  and a just-created pending subscriber is removed. An existing pending
  subscriber is restored to its previous state. Confirmed subscribers are
  never deleted or downgraded.
- Link scanners and repeated confirmation GETs are idempotent: a used token for
  an already confirmed subscriber returns success instead of a 404.
- A daily retention pass removes stale pending signups (default 30 days) and
  expired confirmation tokens. It only selects `isActive=false` rows with no
  `confirmedAt` and no `unsubscribedAt`, writes an audit event before deleting,
  and runs in batches.
- Newsletter analytics now report confirmed, pending, delivery failures,
  rate-limit blocks and suspected automated attempts separately. Only
  confirmed rows count as audience.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Production | Public Cloudflare Turnstile site key rendered in signup forms. |
| `TURNSTILE_SECRET_KEY` | Production | Server-only Turnstile secret used by `siteverify`. Never expose it. |
| `TRUSTED_PROXY_HOPS` | Optional | Number of trusted proxies between the edge and the app. Default `1`. |
| `TRUSTED_CLIENT_IP_HEADER` | Optional | Custom edge header containing the caller IP. |
| `TRUSTED_PROXY_PROVIDER` | Optional | Set to `cloudflare` to trust `CF-Connecting-IP`. |
| `NEWSLETTER_PENDING_RETENTION_DAYS` | Optional | Stale pending retention, default `30`, clamped to `14..365`. |
| `NEWSLETTER_TOKEN_GRACE_DAYS` | Optional | Extra days after token expiry before token row removal, default `7`. |

Turnstile is free for this volume. No new paid service or database migration is
required; the limiter reuses `2026-11-10_pierrot_rate_limit.sql`.

## Rollout

1. Create a Turnstile widget for the production and preview hostnames in the
   Cloudflare dashboard.
2. Add both Turnstile keys to the deployment environment. If the secret is
   absent, server verification is skipped and the other controls still apply.
3. Deploy the application. No migration is needed for this change.
4. Call `/api/cron/pierrot-retention` once manually with the existing
   `CRON_SECRET` and inspect the returned `newsletterRetention` counters.
5. Verify read-only production counts by confirmed/pending status and compare
   before/after signup cohorts. Pending rows are not audience growth.

## Privacy

Rate-limit identifiers are hashed by the shared limiter before persistence.
Analytics events store reason codes only; no email, raw IP, Turnstile token or
secret is written to logs or telemetry. Heuristic bot signals are reported but
never used to suppress or delete a person.
