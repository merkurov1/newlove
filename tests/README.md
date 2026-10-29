Playwright scaffold for SIWE/Onboard and Pierrot viewport tests

Prereqs
- Node.js >=16
- Install Playwright test runner: `npm i -D @playwright/test`
- Install browsers: `npx playwright install --with-deps chromium`

Pierrot viewport regression suite

```bash
npm run test:pierrot:viewport
```

This uses `tests/pierrot.playwright.config.ts`, starts a local Supabase stub and
`next dev` when no server is already running, and checks real bounding
rectangles for the modal, header, message scroller, footer, textarea and send
button. Chromium emulation is not a substitute for the real iOS/iPadOS device
checklist in `docs/audits/pierrot-viewport-fix.md`.

SIWE/Onboard scaffold

1. Install dependencies:

```bash
npm install
npm i -D @playwright/test
npx playwright install --with-deps
```

2. Run tests (scaffold):

```bash
npx playwright test tests/siwe-onboard.spec.js --config=tests/playwright.config.js
```

Notes
- This is a scaffold to help you add real wallet mocking and SIWE flows. Replace the test with proper mocked wallet providers for CI.
