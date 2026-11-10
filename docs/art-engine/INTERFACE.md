# Art Engine — unified interface

## Routes

- `/art-engine` — workspace, composer and Vault.
- `/art-engine?view=vault` — opens the Vault tab.
- `/art-engine?lot=<uuid>` — opens a Vault record inside the workspace.
- `/art-engine/lots` — compatibility redirect to `?view=vault`.
- `/art-engine/lots/[id]` — compatibility redirect to `?lot=<id>`.
- `/admin/ai-selection` — compatibility redirect to `/art-engine`.

## Interface model

The authenticated workspace is no longer a two-column admin form.

- A compact URL field is fixed at the bottom of the page.
- Enter (or the send arrow) starts ingestion; the field is locked while extracting.
- The result replaces the empty state in the same workspace.
- Vault is a tab in the same workspace; it shows works, attempts, failures and
  records that need attention.
- Opening a Vault record loads it into the workspace; the composer stays
  available for the next URL.
- The artwork view follows the Selection composition: large original image,
  centred serif artist/title, essay-like source description, monospace specs,
  then a small extraction/service panel.

The retired presentation is not part of the main flow: no top URL panel, no
separate Ingest button, no manual Artist/Title fields, no Synthesize button and
no Investment Memorandum card.

## Composer and Pierrot

The Art Engine composer remains route-scoped inside `/art-engine` and uses
`z-30` (Pierrot trigger is `z-40`, the Pierrot modal is `z-9999`). On small
screens the composer reserves right-side space for the Pierrot trigger. It
respects `env(safe-area-inset-bottom/right)` and is lifted by the
visual-viewport keyboard gap on iOS.

Art Engine is also available as a mode inside the main Pierrot dialog:

- `«Включи Art Engine»`, `«Запусти Art Engine»`, `«Перейдём в Art Engine»`,
  `«Хочу создать изображение»` (and the English equivalents) enter the mode.
- The dialog keeps the same Pierrot header and appends a short confirmation to
  the existing transcript. No navigation or new page is created.
- The workspace is mounted with the existing `ArtEngineWorkspace` component and
  the same admin API calls. The inline composer variant only changes layout and
  typography; parsing, Vault, Wikipedia, essay and publication logic are
  unchanged.
- `«Вернуться в обычный чат»`, `«Выключить Art Engine»`, `«Обычный режим»`
  (and the English equivalents) leave the mode. The previous dialog is kept.
- Matching is exact and lives in `lib/pierrot/artEngineMode.ts`; mentioning art,
  images or Art Engine in ordinary conversation does not switch the mode.

The existing Art Engine is an auction-lot research and editorial workflow. It
does not contain an image-generation model, so the integration reuses its URL
ingestion pipeline rather than adding a second generator.

## Editorial workflow

The opened Vault record exposes five real stages: Parsing, Research, Essay,
Vault and Selection. Their states come from `lots.vault`, not from a decorative
stepper.

- Parsing is saved automatically by `/api/admin/parse-url`.
- Research stores a verified Wikipedia article in `lots.vault.wikipedia`.
- Essay stores DeepSeek (Gemini fallback) drafts and versions in
  `lots.vault.editorial`.
- Vault depth is shown as saved state; no duplicate save button is needed.
- Selection is manual: preview, image-rights confirmation, then
  `/api/admin/art-engine/lots/[id]/publish`.

Publication creates or updates the existing `articles` row. Repeating the same
version is idempotent; a newer essay version requires **Update Publication**.

## Pierrot PWA tab

The owner PWA exposes Art Engine as a separate rail tab at
`/admin/pierrot/art-engine` (`Cmd/Ctrl+6`, label `ART`). It mounts the same
workspace inside the Pierrot shell. The URL composer is offset to the right of
the desktop rail and above the mobile bottom rail; it does not overlap the
Pierrot navigation. The tab is included in `SiteChromeVisibility` so the public
Header/Footer stay hidden.

## Screenshots

All screenshots are in `docs/art-engine/screenshots/`.

- `before-desktop.png`, `before-mobile.png` — previous Stage 1 dashboard.
- `after-desktop-empty.png`, `after-mobile-empty.png`, `after-tablet-empty.png`.
- `after-desktop-processing.png`, `after-mobile-processing.png`.
- `after-desktop-dossier.png`, `after-mobile-dossier.png`,
  `after-tablet-dossier.png`.
- `after-desktop-dossier-details.png`, `after-mobile-dossier-details.png`.
- `after-desktop-vault.png`, `after-mobile-vault.png`,
  `after-tablet-vault.png`.
- `after-desktop-vault-failed.png`, `after-mobile-vault-failed.png`.
- `after-desktop-guest.png`, `after-mobile-guest.png`.

Screenshots use a mocked admin session and the dedicated `ADMIN_API_SECRET`
header for visual verification only. Live ingestion was tested with real
Christie's and Sotheby's lots. The `lots.vault` / `parse_logs.payload`
migration is now applied.

## Verification

- Targeted Art Engine `tsc` — passes.
- `npx jest lib/lots lib/art-engine --runInBand` — 40 tests pass.
- `npx jest components/art-engine --runInBand --forceExit` — 5 tests pass.
- Playwright checks: desktop 1440×1000, tablet 834×1112, mobile 390×844.
- Composer Enter submission, processing state, Vault opening, failed-attempt
  filter, legacy redirects and `?lot=` deep link were checked.
