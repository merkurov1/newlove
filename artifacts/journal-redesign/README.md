# Journal — an open editorial issue inside merkurov.love

Date: 2026-11-26
Routes: `/journal` (EN), `/ru/journal` (RU)

## 1. Direction

The previous pass wrapped the current issue in a bordered sheet with a dark
full-issue bar. This pass removes that separate surface. The Journal is now one
continuous editorial page on the same paper (`#F5F2EB`), ink (`#1D1B18`) and
hairline rules (`#D8D2C4`) already used by the home page, Flow, Flow Issues and
the rest of the public site. Nothing on the page is a self-contained card,
panel, banner or marketing block.

The reading order is carried by scale and placement, not by numbered service
labels:

1. **Masthead** — `The Journal` / `Журнал` at the largest size, with the italic
   section note and the single language switch. The fixed transparent site
   header stays clear of this block at every tested width.
2. **Current issue / cover** — one open cover: an issue rail (`Current issue`,
   real number, period, original language and the other-language edition) above
   a dominant lead headline, editorial summary, lead preview, `Open material`
   action and the real lead image. There is no outer border, no filled sheet
   and no second visual container.
3. **What's inside** — at most one real material per format. The four formats
   are deliberately different row compositions rather than four equal cards:
   a text-led article row, a portrait photo row, a landscape video row with a
   play affordance, and a text-only link row with its source name. The main
   story is never repeated.
4. **Full issue** — the transition is a serif editorial line at the end of the
   issue, separated by a single rule: issue number, `Read the full issue`,
   item count and an arrow. It is a normal text link, not a black CTA or a
   decorative banner.
5. **Flow** — a quieter two-column tempo with the section title in a narrow
   left rail and dated entries on the right. It links to the real stream.
6. **Issue archive** — a compact catalogue list with issue number, date,
   headline, count and edition language. It keeps the existing archive route.
7. **Subscription** — the existing form and editorial quote, set on the same
   paper with one closing rule and no extra frame.

No publication data, order, selection logic, route, API, database schema or
subscription behaviour was changed. No issue title, issue number, material,
author, image or date was invented. Missing images produce a text-only cover;
missing materials produce the localized honest empty state; missing archives
and Flow entries keep their localized empty states.

RU/EN copy parity, locale routes, canonical/hreflang metadata, JSON-LD inputs,
`lang` attributes and all material links are unchanged.

## 2. Visual decisions

- **Type**: the site serif for masthead, cover, titles and quotes; the site mono
  only for small metadata. Mono labels were cut back to one line per element.
- **Rules**: horizontal hairlines separate sections and rows. There is no
  surrounding border, no double frame and no shadow.
- **Colour**: paper and ink throughout, with the existing maroon accent
  (`#7A2233`) used only for section labels and hover states.
- **Cover**: the lead image is the only large image above the selection; when
  it is missing the cover remains a typographic page.
- **Formats**: image presence and image proportion, not badges or decorative
  chrome, distinguish post, photo, video and link.
- **Flow / archive / subscribe**: Flow uses a sidebar heading and two-column
  entries; the archive uses a full-width catalogue list; subscription uses a
  two-column editorial block. They share the paper and rules but do not repeat
  the cover's composition.

## 3. Responsive behaviour

| Width | Composition                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 390   | Masthead stacks; issue identity spans the rail while period and language sit side by side; the cover is text-first with a full-width image; material rows stack with the image below the text; Flow is a single column.                                             |
| 768   | Masthead note follows the title and the switch aligns right; issue rail keeps identity on the first row and period/language on the second; cover text leads and the image follows full width; material rows keep a narrow metadata rail with the content beside it. |
| 1024  | Issue rail becomes three columns; cover becomes a side-by-side editorial block; material metadata stays in a narrow left rail and media sits beside the text.                                                                                                       |
| 1440  | The page is centred on a 1152 px reading width; the masthead, cover, materials, Flow, archive and subscription share one vertical axis.                                                                                                                             |

The compact navigation also tightens its tracking and gaps below `sm` so the
five section links stay on one line at 390 px.

## 4. Browser verification

Real Chromium (Playwright 1.65.1) against the running Next.js app with the local
Supabase fixture (EN #18 / RU #26, same period).

Viewports: 390 × 844, 768 × 1024, 1024 × 768 and 1440 × 900. Languages: EN and
RU for every viewport. The automated run checks:

- `<html lang>`, one language switcher, canonical and hreflang URLs, OG locale;
- the fixed site header does not cover the masthead;
- the correct published edition: EN #18 on `/journal`, RU #26 on `/ru/journal`;
- issue identity in its own rail, outside `[data-role="main-material"]`;
- a normalized lead headline without duplicated author, source or Flow suffix;
- the current issue has no background fill and no border on any side;
- exactly four selected materials with one `post`, `photo`, `video` and `link`;
- post/link rows have no image, photo/video rows have a real decoded image;
- the lead is not repeated and unselected materials are absent;
- all selected and lead links;
- exactly one full-issue action inside `#issues` and after `#contents`, with the
  localized label and correct route;
- the full-issue action has a transparent background, ink text and a top rule
  (not the previous dark bar);
- no horizontal overflow at document or section level;
- masthead > cover headline > material title > archive title in type size;
- the full vertical order issue → cover → contents → full issue → Flow →
  archive → subscribe;
- no broken images anywhere inside `#issues`;
- localized issue, Flow and archive empty states keep the same page composition
  (see `empty-state/`).

The language-switch test changes RU → EN and EN → RU and confirms that the issue
context stays on the same period while the real edition and interface language
change.

Screenshots (32 after files in this folder):

- `*-first.png` — first screen and masthead/cover;
- `*-contents.png` — editorial selection;
- `*-full-issue.png` — closing full-issue transition and Flow start;
- `*-archive.png` — archive and subscription ending.

for:

- `mobile-390x844-en-*`, `mobile-390x844-ru-*`
- `ipad-768x1024-en-*`, `ipad-768x1024-ru-*`
- `ipad-landscape-1024x768-en-*`, `ipad-landscape-1024x768-ru-*`
- `desktop-1440x900-en-*`, `desktop-1440x900-ru-*`

The 32 matching screenshots in `before/` are the previous bordered-sheet
version from `main`, kept for a direct before/after comparison.

`empty-state/` contains four full-page screenshots (EN and RU at 390 and 1440)
taken against a temporary empty Supabase stub. They verify the current-issue,
Flow and archive empty states keep the same composition, with the subscription
form still present and usable.

## 5. Commands

| Command                                                                                                                                                          | Result                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `pnpm typecheck`                                                                                                                                                 | exit 0                               |
| `pnpm exec jest components/journal/__tests__ lib/journal/__tests__ lib/i18n/__tests__/journal.test.ts --runInBand`                                               | 9 suites, 82 tests passed            |
| `pnpm exec playwright test tests/journal-redesign.spec.ts --config=tests/pierrot.playwright.config.ts --reporter=list`                                           | 9 tests passed                       |
| `pnpm exec eslint components/journal/FrontPage.tsx components/journal/IssueEdition.tsx components/journal/JournalArchiveList.tsx tests/journal-redesign.spec.ts` | exit 0, `<img>` policy warnings only |
| `pnpm exec prettier --write <touched files>`                                                                                                                     | applied                              |

The full repository test suite and production build were not rerun for this
focused presentation change.

## 6. Fixture note

Production credentials are not available in the execution environment, so the
browser run uses the existing local Supabase test stub and the fixture that
mirrors the researched production issue pair EN #18 / RU #26 (same period,
translated RU summary/lead, the same real material titles and links). Fixture
images are deterministic inline SVG placeholders with landscape and portrait
proportions so responsive image behaviour is testable offline. No fixture data
or support code is imported by the application.
