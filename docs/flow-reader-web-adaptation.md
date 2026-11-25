# Flow reader: Mini App ↔ website audit and web adaptation

## Scope

This audit compares the shared Flow publication reader used by the website and
the Telegram Mini App, then records the narrow set of missing **web** reading
adaptations. Publication rendering, the editor, feed semantics, server APIs,
Telegram navigation and Telegram native chrome are out of scope and unchanged.

References used for the behaviour, not the visual design: Readwise Reader's
focused long-form reading (controls outside the text column, appearance and
progress treated as reading chrome) and Apple's accessibility guidance for body
text (Dynamic Type / browser text zoom, 44 pt targets, focus visibility,
reduced motion, contrast).

## File-by-file audit

| File                                  | Mini App                                                                  | Website                                             | Gap found                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `app/flow/[slug]/page.tsx`            | Same server-rendered publication                                          | Same server-rendered publication                    | No heading anchors or contents metadata were available to the shared shell.                                   |
| `components/flow/FlowReaderShell.tsx` | Progress line, last-read write, Telegram Back handler, gallery delegation | Same shell                                          | No appearance controls, focus mode or contents panel; saved progress was written but never restored.          |
| `components/flow/FlowImageViewer.tsx` | Gallery, swipe, pinch, Escape/back/Telegram Back close                    | Same viewer                                         | None. Reused unchanged.                                                                                       |
| `lib/flow/readerState.ts`             | Versioned last-read + feed position, no identity                          | Same                                                | No validated, versioned appearance-preference state.                                                          |
| `lib/flow/readingProgress.ts`         | Forward progress math only                                                | Same                                                | No inverse math for resuming a saved vertical position.                                                       |
| `app/flow/page.tsx`                   | Feed continuity, Continue-reading line, Telegram BottomButton for owners  | Same feed continuity                                | None. Fake/real feed restore behaviour is unchanged.                                                          |
| `components/TelegramMiniApp.tsx`      | Fullscreen, BackButton, native colours, Mini App close                    | Renders nothing without Telegram                    | None. Not touched, so Telegram-only behaviour stays Telegram-only.                                            |
| `app/flow/flow.css`                   | Editorial typography + Telegram safe areas                                | Same CSS                                            | Reader themes, reading-scale typography, control/sheet styles and focus mode were missing.                    |
| `app/unframed/book/*`                 | n/a                                                                       | Separate manuscript reader with preferences and TOC | Useful prior art, but not duplicated. Only the pure Markdown heading parser was extracted to a shared module. |

## What was implemented

- **One reader state module.** Appearance preferences are added to
  `lib/flow/readerState.ts` as a separate, versioned, validated key
  (`flow_reader_prefs_v1`). Values are clamped and unknown themes or fields are
  discarded. No Telegram initData, user id, token or any identity field is
  stored.
- **One reader shell.** `FlowReaderShell` remains the only place that owns the
  progress line, image viewer, Telegram Back handling, and now appearance,
  focus and contents controls. No second progress bar, state store or viewer
  was introduced.
- **Appearance controls outside the text column.** Theme (light / sepia / dark),
  text size and line spacing are edited in an accessible sheet. The controls
  live in the publication header row; the only fixed element remains the 2 px
  reading line, which has `pointer-events: none`.
- **Distraction-reduced focus mode.** A persisted Focus toggle hides publication
  metadata, source links, the Home Screen offer and (outside Telegram) the
  global site header. The article, back link, pager, share and all exit paths
  remain available.
- **Contents panel.** Markdown headings are parsed once, assigned deterministic
  ids, and rendered with matching `id` attributes. The panel appears only when
  a publication has headings, supports Arrow/Home/End roving focus, closes with
  Escape or the backdrop, and moves focus to the chosen heading.
- **Vertical resume.** A saved last-read position is restored on the existing
  vertical document, using the inverse of the existing progress math. Resume is
  skipped for explicit `#heading` URLs and disabled as soon as the reader
  scrolls, swipes, taps or types. Late images and viewport changes retry the
  target for a bounded window; it never introduces horizontal pagination.
- **Typography that respects text zoom.** Reading text is rem-based and scaled
  through a CSS variable, so browser zoom and iOS text-size settings still
  apply. Selection and copying are untouched.

## Accessibility mapping

| Requirement               | Implementation                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus visible             | 2 px `focus-visible` outlines on every control, heading and panel item.                                                                                                      |
| Semantics                 | Toolbar is a labelled `group`; sheets are `role="dialog"`, `aria-modal`, labelled by their title; contents is a labelled `nav`; progress remains one labelled `progressbar`. |
| Target size               | Every control, theme choice, stepper and close affordance is at least 44 × 44 px.                                                                                            |
| Keyboard                  | Tab/Shift+Tab trapped inside sheets, Escape closes, Arrow/Home/End moves through contents, Enter/Space activates native buttons and the range input.                         |
| Reduced motion            | CSS disables reader/sheet animations and control transitions; TOC scrolling uses `auto` when reduced motion is requested.                                                    |
| Text zoom                 | rem-based reading text, no fixed viewport, no `user-scalable=no`; no horizontal text pagination.                                                                             |
| Contrast / forced colours | Theme-specific ink, muted and line colours; `prefers-contrast` and `forced-colors` adjustments.                                                                              |
| Selection                 | `user-select` is never disabled on the article; the viewer continues to disable selection only on the full-screen image.                                                     |

## Tests added

- `lib/flow/__tests__/readerState.test.ts`: appearance round-trip, validation,
  clamping, corrupt/future-version/blocked storage; inverse progress math and
  dynamic content height.
- `components/flow/__tests__/FlowReaderShell.test.tsx`: exactly one progress
  bar, dynamic resize progress, resume + resize recalculation, explicit-anchor
  opt-out, appearance persistence and root CSS variables, focus-mode
  persistence, contents visibility/keyboard/focus, viewer close focus and
  scroll preservation, modified-click pass-through.
- `tests/flow-telegram-reader.spec.ts`: website controls at 390 px and
  1280 px, persisted appearance across reload, contents sheet, focus mode,
  text selection, 200 % root text size without horizontal overflow, and
  reduced-motion behaviour.

## Non-goals / explicitly unchanged

- No audio, sound effects or media playback was added.
- No server API, publication visibility, canonical URL, CSP or auth change.
- No Telegram navigation, fullscreen, safe-area or native-chrome change.
- No editor or feed-meaning change.
- No horizontal pagination or gesture-only reading path.
