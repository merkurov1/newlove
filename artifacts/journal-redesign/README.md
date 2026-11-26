# Journal editorial front page — verification report

Date: 2026-11-26
Task: `58530381-168a-493a-a1f7-4c24a4b7a022`
Routes: `/journal` (EN), `/ru/journal` (RU)

## 1. What changed

The current-issue block now reads as one explicit hierarchy — main material,
then the “What’s inside” selection, then the full issue:

- the cover is labelled `Main story` / `Главный материал` and keeps the
  headline, editorial summary, lead preview and the separate `Open material`
  action for the lead publication;
- the full-issue action no longer sits inside the cover metadata row;
- it is now a solid, high-contrast button in the “What’s inside” block, labelled
  `Read the full issue` / `Читать полный выпуск`, and points to the complete
  issue route (`/en/flow-issues/...` for EN, `/flow-issues/...` for RU);
- the selection heading is now literally `What’s inside` / `Что внутри`, with
  the note that it is a selection, not the full issue;
- the selection still contains at most four additional materials, one per
  format `post`, `photo`, `video` and `link`, and never repeats the main story;
- the main material link and the full-issue button have deliberately different
  treatments: a small underlined text action versus a filled primary button;
- on 390 px the button spans the block width and stays above the selection
  cards, so it is not buried in metadata;
- RU and EN use the same order, labels and destination rules;
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
- exactly one full-issue button, located inside `#contents` rather than the
  cover metadata, with the localized label and the correct issue route;
- at 390 px the full-issue button is in view at the start of the selection and
  is at least 40 px tall;
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
| `pnpm exec jest components/journal/__tests__ lib/journal/__tests__ lib/i18n/__tests__/journal.test.ts --runInBand`     | 9 suites, 82 tests passed                                                 |
| `pnpm exec playwright test tests/journal-redesign.spec.ts --config=tests/pierrot.playwright.config.ts --reporter=list` | 9 tests passed                                                            |
| `pnpm exec eslint <touched files>`                                                                                     | exit 0, warnings only (`<img>` policy already used by the issue renderer) |
| `pnpm exec prettier --write <touched files>`                                                                           | passed after apply                                                        |

The full repository test suite and production build were not rerun for this
focused presentation change; the changed area is covered by the focused Jest
and Playwright runs above.

## 4. Fixture note and limitations

Production credentials are not available in the execution environment, so the
browser run uses the existing local Supabase test stub extended with a fixture
that mirrors the researched production issue pair EN #18 / RU #26 (same
period, translated RU summary/lead, the same real material titles and links).
Images in the fixture are deterministic inline SVG placeholders with landscape
and portrait proportions so the responsive image behaviour is testable offline.
Production uses the real issue images; no fixture data or support code is
imported by the application.
