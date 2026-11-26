# Journal editorial front page — verification report

Date: 2026-11-26
Task: `e421edb9-3c76-4a14-b3f9-6a6a601cce9e`
Routes: `/journal` (EN), `/ru/journal` (RU)

## 1. What changed

The Journal front page now presents a compact editorial selection instead of
reproducing the full issue:

- one main material in the issue cover;
- at most four additional materials, one per format `post`, `photo`, `video`
  and `link`, selected only from the current issue payload;
- the main material is excluded from the selection by id, URL or normalized
  title, so it is never repeated;
- formats that have no real published material are skipped; no placeholder
  cards are created;
- each format has its own visual treatment (text post, bordered link card,
  video still with play mark, portrait photo), so five entries never collapse
  into five identical cards;
- the main headline is normalized for display: duplicated author bylines,
  trailing site names, Flow signature and service suffixes are removed without
  rewriting the story;
- the cover links to the complete issue, where every publication and the
  existing issue structure remain intact;
- Flow, the archive and subscription remain separate sections; Flow is still
  its own chronological stream.

No routes, metadata, canonical/hreflang values, JSON-LD contracts, APIs,
database migrations or editorial source text were changed.

## 2. Browser verification

Real Chromium (Playwright 1.65.1) was used against the running Next.js app with
the local Supabase fixture (EN #18 / RU #26, same period).

Viewports:

- mobile: 390 × 844
- iPad portrait: 768 × 1024
- iPad landscape: 1024 × 768
- desktop: 1440 × 900

Languages: EN and RU for every viewport.

For every combination the automated run checked:

- `<html lang>` matches the route;
- exactly one page-level language switcher;
- canonical and `hreflang` URLs for `/journal` and `/ru/journal`;
- OG locale;
- the correct published edition: EN #18 on `/journal`, RU #26 on
  `/ru/journal`;
- a normalized main headline without the duplicated author or Flow signature;
- exactly four selected materials with one `post`, `photo`, `video` and `link`;
- the main material is not repeated in the selection;
- direct links to the full issue, the lead material and every selected
  material;
- no horizontal overflow at document or section level;
- no broken images in the selected media cards;
- the masthead/cover type stays bounded and the compact selection begins in
  view at desktop;
- no site-wide `overflow` lock is used.

The language-switch test clicks RU from `/journal` and EN from `/ru/journal`,
then verifies the issue context stays on the same period while the real edition
and interface language change.

Screenshots (24 files):

- `*-first.png` — first screen;
- `*-contents.png` — the compact selection;
- `*-archive.png` — continuation at the issue archive;

for:

- `mobile-390x844-en-*`, `mobile-390x844-ru-*`
- `ipad-768x1024-en-*`, `ipad-768x1024-ru-*`
- `ipad-landscape-1024x768-en-*`, `ipad-landscape-1024x768-ru-*`
- `desktop-1440x900-en-*`, `desktop-1440x900-ru-*`

## 3. Commands

| Command                                                                                                                | Result                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                       | exit 0                                                                    |
| `pnpm test --runInBand`                                                                                                | 1 suite skipped, 579 suites passed; 10 skipped, 4209 tests passed         |
| `pnpm build` (placeholder Supabase env, no production access)                                                          | exit 0; 101 static pages generated                                        |
| `pnpm exec jest lib/journal/__tests__ components/journal/__tests__ lib/i18n/__tests__/journal.test.ts --runInBand`     | 9 suites, 79 tests passed                                                 |
| `pnpm exec playwright test tests/journal-redesign.spec.ts --config=tests/pierrot.playwright.config.ts --reporter=list` | 9 tests passed                                                            |
| `pnpm exec eslint <touched files>`                                                                                     | exit 0, warnings only (`<img>` policy already used by the issue renderer) |
| `pnpm exec prettier --check <touched files>`                                                                           | passed after apply                                                        |

## 4. Fixture note and limitations

Production credentials are not available in the execution environment, so the
browser run uses the existing local Supabase test stub extended with a fixture
that mirrors the researched production issue pair EN #18 / RU #26 (same
period, translated RU summary/lead, the same real material titles and links).
Images in the fixture are deterministic inline SVG placeholders with landscape
and portrait proportions so the responsive image behaviour is testable offline.
Production uses the real issue images; no fixture data or support code is
imported by the application.
