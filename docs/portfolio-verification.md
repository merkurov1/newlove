# /portfolio verification

**Route:** `https://www.merkurov.love/portfolio`  
**Build output:** static (`○ /portfolio`) in `next build`  
**Print edition:** A4, 10 pages, generated through the native browser print dialog and inspected page by page.

## What was built

- A single English editorial page at `app/portfolio/page.tsx`.
- One static content source at `lib/portfolio/content.ts`.
- One client action, `components/portfolio/SaveAsPdfButton.tsx`, which calls `window.print()`.
- A dedicated print stylesheet in `app/portfolio/portfolio.module.css` with `@page`, page-break, orphan/widow, image and chrome rules.
- The site header is suppressed only on `/portfolio`; the page carries its own cover index, project links and the shared site footer.

## Content checks

- Heart & Angel is presented as the centre: `IMAGE → OBJECT → PUBLIC SPACE → DIGITAL ENVIRONMENT → SACRED SPACE → SHARED WORLD`.
- Painting, drawing, made-and-sold objects, public-space interventions, digital artifacts and the Temple use original repository / Supabase assets.
- The Temple is described as a sacred digital space with the central heart, Vigil, light, traces and Chronicles.
- The multiplayer world is labelled **In development** and has no invented product screenshot.
- UNFRAMED, Heritage Archive and Media Archive are present as short secondary projects.
- Biography uses repository-backed facts only (artist, art dealer, media/communication expert, analyst, writer; great-grandson of Sergey Dmitrievich Merkurov; Heart & Angel from 2015; museum/archive work).
- The Media Archive is described without the historical unverified counts.

## Print checks

- Browser print dialog is the only button in the page content.
- Site header, site footer and the Save as PDF button are hidden in print.
- The exported PDF has no blank pages, no clipped text or images, and no headings orphaned at page bottoms.
- Page 8 intentionally carries white space between the closing projects and the biography; it is not an empty page.
- 17 link annotations are present in the exported PDF (rituals, projects, contact email and social links).
- The PDF is approximately 11 MB because Chrome embeds the artwork at print resolution. If a form imposes a 10 MB limit, export from a narrower browser window or compress the file before upload.

## Artifacts

- `artifacts/portfolio/web-desktop.jpg`
- `artifacts/portfolio/web-tablet.jpg`
- `artifacts/portfolio/web-mobile.jpg`
- `artifacts/portfolio/pdf-preview.jpg` (all 10 A4 pages)

## Checks run

| Check                                                                                                                      | Result                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                           | passed                                                                          |
| `pnpm exec eslint` on changed source/tests                                                                                 | passed (only pre-existing `any` warnings in `lib/llms.ts`)                      |
| `pnpm exec jest app/portfolio/__tests__/page.test.tsx lib/__tests__/seo.test.ts lib/__tests__/sitemap.test.ts --runInBand` | 25 tests passed                                                                 |
| `pnpm exec playwright test --config=tests/pierrot.playwright.config.ts portfolio.spec.ts`                                  | 4 tests passed                                                                  |
| `pnpm build`                                                                                                               | passed; `/portfolio` is static                                                  |
| Production HTML check                                                                                                      | 200; canonical, title, description, Open Graph image and sitemap entry verified |
| PDF export and page-by-page render                                                                                         | 10 pages; no blank or clipped pages; 17 links                                   |
| axe-core at 1440 / 768 / 390                                                                                               | 0 violations                                                                    |
| `pnpm lint:css`                                                                                                            | not run; `stylelint` binary is not installed in this workspace                  |
