# Journal editorial front page — verification report

Date: 2026-11-26
Task: `ea97126a-89e8-4b5a-b6c1-f5776f329a67`
Routes: `/journal` (EN), `/ru/journal` (RU)

## 1. Production research

The public production pages were inspected before changing the code:

- `/journal` presented the globally newest issue, EN #18, with an English
  editorial lead.
- `/ru/journal` presented the same EN #18 content inside a Russian shell:
  Russian labels around an English headline and English lead. The approved
  Russian edition of the same issue period, RU #26, existed and was already
  linked as the "other language edition", but it was not the featured edition.
- The current issue pair is therefore EN #18 / RU #26, sharing the exact
  13–20 November 2026 period. The fix uses this real pair rather than producing
  any translation.

## 2. What changed

- `selectJournalEdition` keeps the same global current-issue context but
  features the published edition in the reader's language when the exact
  period counterpart exists. If it does not exist, the original edition is
  shown unchanged.
- The front page was rebuilt as an editorial cover + contents composition:
  - masthead with one shared RU/EN switcher;
  - issue cover with number/date only from data, editorial headline, summary,
    lead and the existing lead image when present;
  - one visual lead story in the cover, with compact, type-specific contents
    below (text/index rows, image-led links, video spread, photo grid);
  - counterpart edition link kept in the cover;
  - Flow strip, archive and subscribe retained, with the archive visually
    subordinate and the current issue's counterpart not repeated in the short
    archive preview (the full archive is unchanged).
- Removed the page-level `overflow-x-clip` lock. Responsive checks now verify
  actual document and section widths.
- No routes, metadata, canonical/hreflang values, JSON-LD contracts, APIs,
  database migrations or editorial source text were changed.

## 3. Browser verification

Real Chromium (Playwright 1.65.1) was used against the running Next.js app.

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
  `/ru/journal`, including the Russian summary/lead;
- direct links to the issue page and the lead publication;
- real materials and deserialized images in the contents;
- long headline does not overflow;
- cover heading is visually larger than archive titles;
- no horizontal overflow at document or section level.

The language-switch test clicks RU from `/journal` and EN from `/ru/journal`,
then verifies the issue context stays on the same period while the real edition
and interface language change.

Screenshots (24 files):

- `*-first.png` — first screen;
- `*-contents.png` — continuation at “Inside this issue”;
- `*-archive.png` — continuation at the issue archive;

for:

- `mobile-390x844-en-*`, `mobile-390x844-ru-*`
- `ipad-768x1024-en-*`, `ipad-768x1024-ru-*`
- `ipad-landscape-1024x768-en-*`, `ipad-landscape-1024x768-ru-*`
- `desktop-1440x900-en-*`, `desktop-1440x900-ru-*`

## 4. Commands

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test --runInBand components/journal lib/journal lib/i18n/__tests__/journal.test.ts` | 8 suites, 64 tests passed |
| `pnpm exec playwright test --config=tests/pierrot.playwright.config.ts journal-redesign --reporter=list` | 9 tests passed |
| `pnpm exec playwright test --config=tests/pierrot.playwright.config.ts flow-telegram-reader --reporter=list` | 9 tests passed (shared stub regression check) |
| `pnpm exec eslint <touched files>` | exit 0, warnings only (pre-existing `any` + existing `<img>` policy) |
| `pnpm exec prettier --check <touched files>` | passed after apply |

## 5. Fixture note and limitations

Production credentials are not available in the execution environment, so the
browser run uses the existing local Supabase test stub extended with a fixture
that mirrors the researched production issue pair EN #18 / RU #26 (same
period, translated RU summary/lead, the same real material titles and links).
Images in the fixture are deterministic inline SVG placeholders with landscape,
portrait and square proportions so the responsive image behaviour is testable
offline. Production uses the real issue images; no fixture data or support code
is imported by the application.
