# Cast redesign evidence

## Architecture decision

Cast keeps the shared full-screen `RitualModal` shell used by the other long
Temple rituals. This is deliberate:

- one intercepted route (`app/@modal/(.)cast/page.tsx`)
- one `role="dialog"` layer, one header and one ritual dock
- one shared experience (`app/cast/CastClient.tsx`) in both presentations
- no compact Cast dialog nested inside the shared modal

The modal route passes `variant="modal"` to `CastClient`. In that variant the
experience does **not** render its own `TempleTopBar`, page `<h1>` or
`100dvh` wrapper. It simply occupies and scrolls inside
`.temple-modal__content`. The canonical `/cast` route renders the same
component with the default `variant="page"`.

The standalone page uses the Sanctuary's daylight palette; the modal variant
uses the RitualModal's night palette. Both share the same serif/mono type
scale, amber hairline geometry and single-panel language selector, so the
presentation stays consistent with the completed Temple homepage.

## Covered viewports

- `small-phone-320x568-*` — smallest supported phone width
- `phone-390x844-*` — common modern phone
- `ipad-portrait-768x1024-*`
- `ipad-landscape-1024x768-*`
- `desktop-1440x900-*`
- `telegram-phone-390x844-modal-language.png` — Chromium with a stubbed
  Telegram `WebApp` and `BackButton`
- `small-phone-320x400-keyboard-question.png` — short keyboard viewport

Each regular viewport has standalone and modal screenshots for the language
selector and the first active question. The `phone-390x844-*` files also cover
the completed result, the archetype stamp and the secured-email state.

## Measured behaviour

- `/cast` opens on one language panel with two language buttons, not two
  marketing cards.
- Selecting English or Русский enters the existing ten-question protocol and
  keeps the same `/api/cast` and `/api/cast/capture` payloads.
- The session draft restores answers, the active question, the completed
  analysis, the archetype, the record id and the capture token. Switching from
  the standalone page to the modal keeps `Query 02 / 10`.
- The result renders the Agency Index, archetype scores, analysis text and the
  `[ARCHETYPE]` stamp. The stamp reveals even when `tailwindcss-animate` is not
  loaded.
- The email capture panel remains visible after success and shows the secured
  message while clearing the capture token.
- Modal mode has no duplicate top bar, no duplicate `<h1>`, one dialog and no
  page-level horizontal or vertical overflow.
- Escape, the shared header close control and the Telegram BackButton close the
  modal. Focus returns to the Cast ritual trigger and the Temple scroll position
  is unchanged.
- On the smallest phone and a 320×400 keyboard viewport the question, textarea
  and Next control stay reachable by scrolling the modal content slot.

## Commands used

```bash
pnpm exec jest app/cast/__tests__/CastClient.test.tsx \
  "app/@modal/__tests__/CastModal.test.tsx" \
  app/@modal/__tests__/ritualParity.test.ts --runInBand

pnpm exec playwright test \
  --config=tests/pierrot.playwright.config.ts \
  tests/cast-redesign.spec.ts

pnpm typecheck
pnpm exec eslint app/cast/CastClient.tsx "app/@modal/(.)cast/page.tsx"
pnpm build
```

## Limitations

- No real Telegram client or iOS device was available in the runner. Telegram
  viewport variables and the BackButton were emulated in Chromium.
- The local Playwright run uses the existing Supabase stub; `/api/cast` and
  `/api/cast/capture` were fulfilled by route fixtures, so no production
  analysis record or email capture was written.
- The keyboard viewport is simulated by resizing the browser viewport. Real
  Telegram/iOS keyboard insets should still be spot-checked on a device.
