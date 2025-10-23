Playwright scaffold for SIWE/Onboard tests

Prereqs
- Node.js >=16
- Install Playwright test runner: `npm i -D @playwright/test`

Quick start

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
