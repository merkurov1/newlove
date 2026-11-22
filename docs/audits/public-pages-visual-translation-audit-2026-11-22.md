# Public pages — visual refinement and translation audit (2026-11-22)

Task: `ae408b3d-ebc2-47e3-8045-e32b9a556441`
Scope: `/`, `/lobby`, `/media`, `/advising`, `/isakeyforall`, `/all`

## 1. Visual verification

### Surface changes

- Added a scoped `.light-gallery` surface in `app/main.css` with warm alabaster
  (`#F5F2EB`), warm ink (`#1D1B18`), muted ink (`#6F6A60`), hairline borders and
  a soft diffused elevation token. The class is applied only by the six scoped
  page shells.
- Shared chrome stays continuous: `body:has(.light-gallery)` and
  `.site-footer` are tinted to the same canvas only when a scoped page is
  present. No admin or unrelated route styles were changed.
- Home, Lobby, Advising and IsAKeyForAll now use the same canvas, capsule,
  hairline and glass-panel language.
- Media Archive keeps its existing component, controls and records; only its
  local CSS variables, type scale, search capsule, focus states and spacing were
  refined.
- `/all` was moved from dark neutral utilities to the light palette while
  keeping the complete project list, link targets, inactive markers and the
  shuffle action.
- Lobby's UNFRAMED feature was changed from a black section to a light
  glass/paper panel; the display headline now uses a responsive `clamp()` so it
  cannot clip on narrow viewports.
- Case study cards on `/isakeyforall` now use glass panels; the badge and arrow
  were moved into normal flow so the subtitle gets the full card width.

### Screenshots

Before: `artifacts/ui-refinement-shots-before/`
After: `artifacts/ui-refinement-shots-after/`

Each folder contains `home`, `lobby`, `media`, `advising`, `isakeyforall` and
`all` at `desktop` (1440×1000), `ipad` (820×1180) and `mobile` (390×844).
Additional locale checks are stored for `ar-advising` (RTL), `ru-lobby`,
`de-advising`, `ru-isakeyforall` and `de-isakeyforall`.

Machine-readable overflow/control report:
`artifacts/ui-refinement-shots-after/report.json`.

Result: all six routes at all three widths report
`documentElement.scrollWidth - clientWidth = 0`, no clipped `h1/h2/h3` or
blockquote boxes and no controls outside the viewport.

### Link audit

The collected internal links from the six routes (desktop, iPad and mobile runs)
were requested against the running app. 48 of 50 unique internal targets
returned `200`. Two pre-existing targets in the `/all` project index return
`404`:

- `/digest` — the route only exists as `/digest/[slug]`.
- `/you` — the route only exists as `/you/[username]`.

Both entries are part of the existing project list. Changing or removing them
would violate the explicit requirement to preserve `/all`’s project list and
link targets, so they are reported here rather than silently rewritten.

### Incidental defects fixed

- `/all` no longer produces a hydration mismatch from `Math.random()` during
  the first render. The first render is deterministic; the existing shuffle
  still runs after mount and on every “shuffle matrix” click.
- Media Archive series summary text now separates the count line from the
  description (the previous inline layout rendered `29 columnsInternet policy…`).
- Media Archive record footer uses a flex wrap gap, so topic and
  “Original publication” no longer run together.
- Media search is full-width on phones and keeps its capsule shape.

### Out-of-scope conflict found in the base implementation

The task description says Lobby must preserve existing ART, SELECTION, ADVISING
and FLOW navigation items in a divided grid. The current `main` Lobby is not a
navigation grid and does not contain those items; it is the editorial
Private Office page (hero, track record, press, dual roots, UNFRAMED feature).
No equivalent grid exists elsewhere in `app/lobby` or `components`. Replacing
the current page with such a grid would delete existing published copy and
invent an information architecture, which the same task forbids. The current
Lobby composition and all of its existing links were therefore preserved and
restyled, and the mismatch is reported for owner review rather than guessed.

## 2. Translation audit

English is unchanged and remains the source of truth. Only non-English strings
with a demonstrable semantic, grammatical or idiomatic defect were edited. No
quotation text was edited.

### Coverage matrix

| Page | Locale | Key parity | Visible copy | Accessibility / routes | Result |
| --- | --- | --- | --- | --- | --- |
| Lobby | EN | complete | source | `aria-label` “Language selection” | source, unchanged |
| Lobby | RU | complete | reviewed | switcher `Выбор языка`, `/ru/lobby` | 1 idiomatic fix |
| Lobby | DE | complete | reviewed | switcher `Sprachauswahl`, `/de/lobby` | no edit; brand terms retained |
| Advising | EN | complete | source | `aria-label` “Language selection” | source, unchanged |
| Advising | RU | complete | reviewed | switcher `Выбор языка`, `/ru/advising` | 2 grammar/idiom fixes |
| Advising | DE | complete | reviewed | switcher `Sprachauswahl`, `/de/advising` | 1 semantic fix |
| Advising | FR | complete | reviewed | switcher `Choix de la langue`, `/fr/advising` | no edit |
| Advising | AR | complete | reviewed | switcher `اختيار اللغة`, `/ar/advising`, `dir="rtl"` | 2 terminology/grammar fixes |
| IsAKeyForAll | EN | complete | source | `aria-label` “Language selection” | source, unchanged |
| IsAKeyForAll | RU | complete | reviewed | switcher `Выбор языка`, `/ru/isakeyforall` | 3 strings / 4 edits |
| IsAKeyForAll | DE | complete | reviewed | switcher `Sprachauswahl`, `/de/isakeyforall` | 3 strings / 3 edits |

TypeScript copy records (`LOBBY_COPY`, `ADVISING_COPY`,
`ISAKEYFORALL_COPY`) require every key for every supported locale, so there are
no missing or extra keys. A rendered spot-check of all localized routes also
found no missing visible sections.

### Prioritized findings

1. **High — DE, IsAKeyForAll memoir subtitle**
   `kleinen Gewalten` means “small powers/authorities”, not “small violences”.
   Corrected to `kleinen Gewaltsamkeiten`.
2. **High — RU, Advising principle 03**
   `без второго вопроса` is a literal calque of “without a second thought”.
   Corrected to `без колебаний`; the same sentence also needed
   `в ситуациях с высокой ставкой`.
3. **Medium — DE, Advising manifesto**
   `die feine Kunst` is not the German term for fine art in this context.
   Corrected to `die bildende Kunst`.
4. **Medium — AR, Advising principle 03**
   `لا يساومان` reads as “do not bargain” rather than “uncompromising”.
   Corrected to `لا يقبلان المساومة`.
5. **Medium — AR, Advising retainer label**
   `اشتراك شهري` means a monthly subscription, not a retainer.
   Corrected to `عقد استمراري`.
6. **Medium — RU, IsAKeyForAll closing**
   `полностью принял возможность` is a calque; `в существовании` is also
   unnatural. Corrected to `в полной мере воспользовался возможностью` and
   `в жизни`.
7. **Medium — DE, IsAKeyForAll closing**
   Word order made `die Möglichkeit zu schaffen als Künstler` hard to parse.
   Corrected to `die Möglichkeit, als Künstler zu schaffen`.
8. **Low — RU, IsAKeyForAll “across borders”**
   `поверх границ` corrected to the idiomatic `через границы`.
9. **Low — RU, IsAKeyForAll memoir subtitle**
   Plural `насилиях` is not idiomatic in Russian. Corrected to
   `маленьких жестокостях`.
10. **Low — RU, Lobby press heading**
    `поверх дисциплин` is a literal rendering of “across disciplines”.
    Corrected to `на стыке дисциплин`.
11. **Low — DE, IsAKeyForAll career**
    `im Übergang von Film zu Digital` corrected to
    `im Übergang vom Film zur digitalen Fotografie`.
12. **Accessibility — language switcher**
    The switch label was English on DE/FR/AR pages while Russian had a local
    label. Added German, French and Arabic labels; the visible control is
    unchanged.

### Before / after changelog

Every edited string, with rationale:

| # | Locale / page | Before | After | Rationale |
| --- | --- | --- | --- | --- |
| 1 | RU / Lobby `press.title` | `Публичная летопись — поверх дисциплин.` | `Публичная летопись на стыке дисциплин.` | `поверх дисциплин` is a literal calque; `на стыке дисциплин` is the natural rendering of “across disciplines” in this editorial context. |
| 2 | RU / Advising `principles[2].body` | `...в ситуациях высокой ставки... без второго вопроса.` | `...в ситуациях с высокой ставкой... без колебаний.` | Fixes the missing preposition and replaces the English calque with the idiomatic Russian equivalent of “without a second thought”. |
| 3 | DE / Advising `manifesto.lead` | `...verstehen die feine Kunst nicht...` | `...verstehen die bildende Kunst nicht...` | `feine Kunst` is not the established German term for fine art; `bildende Kunst` is precise and idiomatic. |
| 4 | AR / Advising `principles[2].title` | `ثقة شخصية وتحفّظ لا يساومان` | `ثقة شخصية وتحفّظ لا يقبلان المساومة` | `لا يساومان` means “they do not bargain”; the source means “uncompromising”. The new phrasing also agrees correctly with the dual subject. |
| 5 | AR / Advising `formats[0].kicker` | `اشتراك شهري` | `عقد استمراري` | A retainer is an ongoing engagement, not a monthly subscription. |
| 6 | RU / IsAKeyForAll `heart.values[0].body` | `...объединяющий нас поверх границ.` | `...объединяющий нас через границы.` | `поверх границ` is unidiomatic; `через границы` renders “across borders” naturally. |
| 7 | RU / IsAKeyForAll `closing` | `...полностью принял возможность творить как художник — ... самое важное в существовании.` | `...в полной мере воспользовался возможностью творить как художник — ... самое важное в жизни.` | Removes two calques; `воспользовался возможностью` and `в жизни` are the natural Russian equivalents. |
| 8 | RU / IsAKeyForAll `featured.memoirSubtitle` | `...и мелких насилиях современной жизни.` | `...и маленьких жестокостях современной жизни.` | Russian does not normally pluralise `насилие` this way; `жестокостях` preserves the source’s tone without adding a claim. |
| 9 | DE / IsAKeyForAll `featured.memoirSubtitle` | `...und die kleinen Gewalten des modernen Lebens.` | `...und die kleinen Gewaltsamkeiten des modernen Lebens.` | `Gewalten` means “powers”; the source says “violences”. |
| 10 | DE / IsAKeyForAll `narrative.career` | `...im Übergang von Film zu Digital...` | `...im Übergang vom Film zur digitalen Fotografie...` | Correct German preposition and a complete noun phrase for the film-to-digital transition. |
| 11 | DE / IsAKeyForAll `closing` | `...hat Merkurov die Möglichkeit zu schaffen als Künstler voll angenommen...` | `...hat Merkurov die Möglichkeit, als Künstler zu schaffen, voll angenommen...` | Fixes the nested infinitive so the sentence parses correctly. |
| 12 | DE/FR/AR / language switcher | `aria-label="Language selection"` on non-English pages | `Sprachauswahl` / `Choix de la langue` / `اختيار اللغة` | Localises an accessibility label; no visible copy or control changed. |

### Deliberately not changed / owner review

- **Le Monde quote, RU Lobby**: `Его ведомства пробуют все возможные средства.`
  The pronoun referent (“its agencies”) is ambiguous in the source itself. The
  current Russian is understandable but could be `Её ведомства` if the intended
  referent is ФСБ. Quotation fidelity should be checked against the published
  original before editing; no change was made.
- **Quotation ellipses and punctuation** in The Washington Post, Le Monde and
  The Art Newspaper quotes were left untouched. They are existing published
  quotations and were not re-translated.
- **Lobby RU** `изящного искусства` / **DE** `Heritage`: retained. The Russian
  phrase is a deliberate elevated register, and `Heritage` functions as a
  project/section label in the German copy.
- **Advising AR** `في جزر منفصلة` (“separate islands”) for “silos”: acceptable
  metaphor; `صوامع` would be more technical but is not required for correctness.
- **Advising FR** `en silo`, `beaux-arts` alternatives: no demonstrable error;
  left as published.
- **Root `<html lang="en">`**: Next.js root layout is shared by all routes, so
  localized routes still expose `lang="en"` on the root element while the page
  wrapper correctly exposes `lang` and `dir` (`ar` = `rtl`). Changing the root
  element would require a global language-routing change, which is outside this
  task’s metadata/route constraints. Flagged for owner decision.

## 3. Route and metadata checks

Rendered checks confirmed:

- `/lobby`: canonical `/lobby`; alternates `x-default`, `en`, `ru`, `de`.
- `/advising`: canonical `/advising`; alternates `x-default`, `en`, `ru`,
  `de`, `fr`, `ar`.
- `/isakeyforall`: canonical `/isakeyforall`; alternates `x-default`, `en`,
  `ru`, `de`.
- Localized routes return `200` and self-canonicalize (`/ru/lobby` →
  `/ru/lobby`, `/ar/advising` → `/ar/advising`, etc.).
- The language switcher renders only the locales supported by each section and
  points to the existing localized routes.
- Arabic Advising renders with `dir="rtl"`, no horizontal overflow, and the
  existing mirrored arrow treatment.
- `/media` and `/all` keep their existing English-only canonical/alternate
  behavior.
