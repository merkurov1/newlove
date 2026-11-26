# Journal — current issue as one editorial object

Date: 2026-11-26
Routes: `/journal` (EN), `/ru/journal` (RU)

## 1. Design decision

The current-issue block was rebuilt as a single bordered “issue sheet” instead
of a cover section followed by a separate card grid. The sheet has one reading
order and one visual rhythm:

1. **Issue rail** — `Current issue` / `Текущий выпуск`, the real issue number,
   publication period, material count, original language and the other-language
   edition. This is an `h2` and is deliberately separated from the story title.
2. **Main story** — `01 / Main story`, the normalized lead headline, editorial
   summary, lead preview and the single `Open material` action. The module is
   visually dominant but bounded: it is one numbered chapter of the sheet, not
   the whole issue. On desktop the lead image sits in a dedicated right column;
   on phones the text leads and the image follows it.
3. **Editorial selection** — `What’s inside` / `Что внутри` is a numbered index
   (`02`–`05`), not four equal cards. Text materials use a larger text-only row,
   photography gets a portrait thumbnail, video gets a landscape thumbnail with
   a play marker, and links get a source label with an external-arrow tile. The
   lead story is never repeated.
4. **Full issue** — the dark `Read the full issue` / `Читать полный выпуск` bar
   is now the last element of the sheet, after the selection. It repeats the
   issue number and material count, so the transition is obvious without
   hunting through metadata.

The issue sheet uses the existing paper/ink/accent palette and rules, with one
outer border, shared gutters and continuous numbering. Flow, the archive and
subscription stay outside the sheet as separate page sections.

No story titles, descriptions, images, issue numbers or materials were invented.
When no issue exists, the sheet becomes a localized empty state. When a support
format is missing, the row is skipped. When the lead has no image, the cover
stays typographic. When only the lead exists, the selection says that the main
story is presented above. No synthetic cards are added.

RU/EN copy, locale routes, canonical/hreflang metadata, JSON-LD inputs and all
material links are unchanged.

## 2. Responsive behaviour

| Width | Composition                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 390   | Masthead and issue identity stack; the issue rail metadata becomes a two-column grid; the main story is a text-led module followed by a full-width image; index rows place media below the text. |
| 768   | Issue rail remains stacked but metadata gains a three-column reading; main story is full width; selection rows keep text and a right-side media tile.                                            |
| 1024  | Issue rail splits into identity + metadata columns; the lead story and image become side by side.                                                                                                |
| 1440  | The sheet spans the editorial grid with a large issue number, split rail, asymmetric lead story with image, and wide numbered index rows.                                                        |

## 3. Browser verification

Real Chromium (Playwright 1.65.1) against the running Next.js app with the local
Supabase fixture (EN #18 / RU #26, same period).

Viewports: 390 × 844, 768 × 1024, 1024 × 768 and 1440 × 900. Languages: EN and
RU for every viewport.

For each combination the automated run checks:

- `<html lang>`, one language switcher, canonical and hreflang URLs, OG locale;
- the correct published edition: EN #18 on `/journal`, RU #26 on `/ru/journal`;
- issue identity in its own rail, outside `[data-role="main-material"]`;
- a normalized lead headline without duplicated author, source or Flow suffix;
- exactly four selected materials with one `post`, `photo`, `video` and `link`;
- the lead is not repeated and unselected materials are absent;
- all selected and lead links;
- exactly one full-issue action, inside `#issues` but after `#contents`, with the
  localized label and the correct issue route;
- the full-issue bar is at least 40 px tall and visible when scrolled to;
- no horizontal overflow at document or section level;
- no broken selected-media images;
- the lead type stays bounded and the selection begins in view on desktop;
- no site-wide overflow lock.

The language-switch test changes RU → EN and EN → RU and confirms that the issue
context stays on the same period while the real edition and interface language
change.

Screenshots (32 files):

- `*-first.png` — first screen;
- `*-contents.png` — editorial selection;
- `*-full-issue.png` — closing full-issue transition;
- `*-archive.png` — continuation at the issue archive.

for:

- `mobile-390x844-en-*`, `mobile-390x844-ru-*`
- `ipad-768x1024-en-*`, `ipad-768x1024-ru-*`
- `ipad-landscape-1024x768-en-*`, `ipad-landscape-1024x768-ru-*`
- `desktop-1440x900-en-*`, `desktop-1440x900-ru-*`

## 4. Commands

| Command                                                                                                                | Result                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `pnpm typecheck`                                                                                                       | exit 0                               |
| `pnpm exec jest components/journal/__tests__ lib/journal/__tests__ lib/i18n/__tests__/journal.test.ts --runInBand`     | 9 suites, 82 tests passed            |
| `pnpm exec playwright test tests/journal-redesign.spec.ts --config=tests/pierrot.playwright.config.ts --reporter=list` | 9 tests passed                       |
| `pnpm exec eslint <touched files>`                                                                                     | exit 0, `<img>` policy warnings only |
| `pnpm exec prettier --write <touched files>`                                                                           | applied                              |

The full repository test suite and production build were not rerun for this
focused presentation change.

## 5. Fixture note

Production credentials are not available in the execution environment, so the
browser run uses the existing local Supabase test stub and the fixture that
mirrors the researched production issue pair EN #18 / RU #26 (same period,
translated RU summary/lead, the same real material titles and links). Fixture
images are deterministic inline SVG placeholders with landscape and portrait
proportions so responsive image behaviour is testable offline. No fixture data
or support code is imported by the application.
