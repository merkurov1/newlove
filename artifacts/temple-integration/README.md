# Temple integration evidence

Captured from the local Next.js dev server with Playwright/Chromium on
2026-11-24, after merging the homepage composition and the Traces/Chronicles
feed into one branch.

## Covered viewports

- `desktop-1440x900.png`
- `tablet-768x1024.png`
- `mobile-390x844.png`
- `telegram-390x844.png` — Chromium with a stubbed Telegram `WebApp`

## Checked behaviour

- The heart is the first visual element and sits on the page centre axis.
- The angel and demon are rendered at the outer hero edges with no border,
  card, background panel or drop shadow.
- The ritual menu is centred beneath the hero.
- The Journal section visibly lists the seven server-filtered ritual traces
  from the feed contract (newest first, infrastructure/incomplete excluded).
- `/cast` and `/absolution` keep their existing Temple palettes and modal
  flows; their dedicated Playwright specs pass at phone, tablet, desktop and
  emulated Telegram sizes.

## Limitation

The local Supabase stub has no `temple_log` rows, so the browser spec fulfils
`/api/temple_logs` with the seven public rows and aggregate values observed
through the live endpoint at 2026-11-24T16:22Z. The fixture is a read-only copy
of real records; no trace, chronicle or metric is invented here. The
server-rendered first-paint path is covered by
`app/temple/__tests__/TempleClient.test.tsx` (`initialFeed`). No production row
or metric was written or mutated.
