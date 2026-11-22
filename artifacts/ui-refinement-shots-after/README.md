# After screenshots

Captured after the visual pass.

Routes: `/` (home), `/lobby`, `/media`, `/advising`, `/isakeyforall`, `/all`.
Viewports: `desktop` 1440×1000, `ipad` 820×1180, `mobile` 390×844.

Locale/RTL spot checks: `ar-advising-*`, `de-advising-*`, `ru-lobby-*`,
`ru-isakeyforall-*`, `de-isakeyforall-*`.

`report.json` records, per route and viewport:

- `documentElement.scrollWidth - clientWidth` (must be `0`);
- clipped heading/blockquote boxes (must be empty);
- controls outside the viewport (must be empty);
- browser console/page errors (must be empty);
- the resolved body background (`rgb(245, 242, 235)` = `#F5F2EB`).

The audit is in `docs/audits/public-pages-visual-translation-audit-2026-11-22.md`.
