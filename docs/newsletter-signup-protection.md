# Newsletter signup protection and lifecycle

## What changed

- `/api/subscribe` and the `subscribeToNewsletter` server action require
  server-validated honeypot, minimum form age and Cloudflare Turnstile
  verification before writing a subscriber. Client-only checks are never
  trusted.
- **Turnstile fails closed in production.** If `TURNSTILE_SECRET_KEY` is
  missing, the server returns `turnstile_not_configured` and the signup is
  rejected instead of silently skipping the challenge. Non-production
  environments keep the explicit skip so local development and early preview
  deployments still work.
- If only the public site key is missing, the widget cannot issue a token, so
  the server still rejects the signup in production. Both variables are
  required:
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public widget key;
  - `TURNSTILE_SECRET_KEY` — server-only secret, never logged or exposed.
- The newsletter signup, confirmation and unsubscribe endpoints use the
  existing `pierrot_rate_limits` / `pierrot_rate_limit` durable cross-instance
  limiter. IP and normalized-email buckets are separate; the IP window is
  deliberately loose so offices, campuses and carriers that share an address
  are not blocked by a single busy colleague. The in-memory limiter is only a
  fallback when Supabase is unavailable.
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
  confirmation rate, rate-limit blocks, suspected automated attempts and a
  signup-burst signal. Only confirmed rows count as audience.

## Recipient selection contract

All dispatch paths use `lib/newsletter/recipients.ts`. A subscriber is eligible
only when **both** conditions hold:

1. `isActive === true`;
2. `confirmedAt IS NOT NULL`.

The database query applies both filters and the in-memory selector repeats the
guard. After eligibility, recipients are filtered by the exact issue language:
an `en` issue can only reach `en*` locales, and a `ru` (or unspecified) issue
can only reach `ru*` / legacy rows without an English locale.

Dispatch paths covered by this contract:

- `lib/newsletter/processJob.ts` (direct Flow issue send);
- `app/api/cron/newsletter-worker/route.ts` (queued worker);
- `app/admin/actions.ts` fallback/direct path;
- `app/api/admin/flow-issues/route.ts` (counts and queue guard).

A job is also idempotent: recipients with an existing terminal
`newsletter_logs` row for that job are skipped, and `processJob` claims only
jobs still in `pending` status.

## Admin manual subscription

Two authenticated paths can enable a subscription explicitly:

- `toggleUserSubscription` — the signed-in account owner opts in from their
  profile (`source: account_self_service`);
- `adminToggleUserSubscription` — an admin enables a user
  (`source: admin_manual`).

Both set `confirmedAt` in the same write that sets `isActive=true`, and both
record a `subscription_confirmed` event. They never create an
`isActive=true` row without `confirmedAt`. Public signup still requires the
email confirmation link (double opt-in).

## Admin preview / dry-run

`GET /api/admin/newsletter/preview?lang=ru` (admin session required) returns:

- confirmed + active total and the RU/EN split;
- the exact recipient list for the requested issue language with masked email
  addresses;
- `dryRun: true`, `emailsSent: 0`.

It never calls Resend, queues a job or writes to the database. The same preview
links are shown on `/admin/newsletter-jobs`. The page also shows whether both
Turnstile variables are configured in the current environment (presence only,
never values).

## Configuration

| Variable                            | Required   | Purpose                                                                                                                 |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`    | Production | Public Cloudflare Turnstile site key rendered in signup forms.                                                          |
| `TURNSTILE_SECRET_KEY`              | Production | Server-only Turnstile secret used by `siteverify`. Never expose it. Missing secret = signup fails closed in production. |
| `TRUSTED_PROXY_HOPS`                | Optional   | Number of trusted proxies between the edge and the app. Default `1`.                                                    |
| `TRUSTED_CLIENT_IP_HEADER`          | Optional   | Custom edge header containing the caller IP.                                                                            |
| `TRUSTED_PROXY_PROVIDER`            | Optional   | Set to `cloudflare` to trust `CF-Connecting-IP`.                                                                        |
| `NEWSLETTER_PENDING_RETENTION_DAYS` | Optional   | Stale pending retention, default `30`, clamped to `14..365`.                                                            |
| `NEWSLETTER_TOKEN_GRACE_DAYS`       | Optional   | Extra days after token expiry before token row removal, default `7`.                                                    |

Turnstile is free for this volume. No new paid service or database migration is
required; the limiter reuses `2026-11-10_pierrot_rate_limit.sql`.

## Rollout

1. Create a Turnstile widget for the production and preview hostnames in the
   Cloudflare dashboard.
2. Add both Turnstile keys to the deployment environment. If the secret is
   absent in production, public signup is blocked with a clear message while
   existing subscribers and newsletter sending continue to work.
3. Deploy the application. No migration is needed for this change.
4. Call `/api/cron/pierrot-retention` once manually with the existing
   `CRON_SECRET` and inspect the returned `newsletterRetention` counters.
5. Verify read-only production counts by confirmed/pending status and compare
   before/after signup cohorts. Pending rows are not audience growth.
6. Before the next Russian issue, open
   `/api/admin/newsletter/preview?lang=ru` and confirm the recipient list.
   Expected post-incident state: 18 confirmed active RU recipients and 0
   confirmed active EN recipients. This preview does not send email.
7. Read-only cross-check (does not expose addresses):

   ```sql
   select locale, count(*) as eligible
   from public.subscribers
   where "isActive" = true and "confirmedAt" is not null
   group by locale
   order by locale;
   ```

   For the 2026-11-26 cleanup snapshot this must return `ru = 18` and no
   confirmed active `en` rows.

## Incident interpretation rules

- Do not label an address as a bot from its domain, language or confirmation
  speed. Only server-side challenge failures, honeypot/timing signals and
  rate-limit blocks are evidence.
- The English signup wave was explicitly rejected by the owner and disabled;
  this is an owner decision, not an automatic bot classification.
- Subscription history and `newsletter_logs` are preserved. Disabling a wave
  means deactivation and token revocation, not deletion.

## Privacy

Rate-limit identifiers are hashed by the shared limiter before persistence.
Analytics events store reason codes only; no email, raw IP, Turnstile token or
secret is written to logs or telemetry. Admin preview masks email addresses.
Heuristic bot signals are reported but never used to suppress or delete a
person.
