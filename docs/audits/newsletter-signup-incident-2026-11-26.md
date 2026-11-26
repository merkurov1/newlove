# Newsletter signup incident — 2026-11-26

## Owner-provided production snapshot

- 111 `locale=en` records; all 111 deactivated; 120 unused confirmation tokens
  for these subscribers revoked (`used=true`).
- 19 `locale=ru` records; 18 active + confirmed; one already inactive.
- After cleanup: EN eligible = 0, RU eligible = 18, active-unconfirmed = 0.
- The English wave was explicitly rejected by the owner as spam. Records and
  `newsletter_logs` were preserved; nothing was physically deleted.

## Root cause supported by repository evidence

1. `verifyTurnstileToken()` returned `{ ok: true, skipped: true }` whenever
   `TURNSTILE_SECRET_KEY` was absent.
2. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was also absent, so
   `components/newsletter/TurnstileWidget.tsx` returned `null` and no hidden
   `turnstileToken` field was rendered.
3. The server therefore had neither a configured secret nor a token and
   silently skipped the challenge. Honeypot, minimum form age and the
   instance-local rate limiter remained, but they are weak against scripted
   requests distributed across IPs and Vercel instances.
4. Double opt-in was still the last line of defence: an unconfirmed record was
   never eligible to receive a newsletter. This is why the cleanup check
   reports `active-unconfirmed = 0` and why confirmed vs unconfirmed must be
   counted separately.

## What could not be reconstructed here

The repository does not contain a production export of `subscription_events`,
`subscribers` or Vercel request logs for 2026-10-11..2026-11-20. Only local
build logs are present. Therefore this change does not claim to know exactly
how many of the 111 addresses clicked a confirmation link. The admin analytics
now reports the confirmation rate and uses only `isActive=true AND
confirmedAt IS NOT NULL` as audience, so future cohorts can be split reliably.

Do not classify addresses as bots from their domain or English language. Bot
classification is limited to server-side challenge/honeypot/timing/rate-limit
signals. The English wave's removal is an owner decision, not an automatic
bot verdict.

## Preventive changes

- Turnstile fails closed in production when the secret is missing.
- All dispatch paths require `isActive=true AND confirmedAt IS NOT NULL`,
  then filter by exact issue language.
- Admin/manual activation writes `confirmedAt` together with `isActive=true`
  and records a `subscription_confirmed` event with its source.
- Confirmation rate, blocked-reason breakdown and a signup-burst signal are
  exposed in the newsletter analytics.
- Admin preview (`/api/admin/newsletter/preview?lang=ru`) lists masked
  recipients with `dryRun: true` and `emailsSent: 0`.
