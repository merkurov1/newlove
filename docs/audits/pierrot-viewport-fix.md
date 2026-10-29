# Pierrot modal viewport fix

Date: 2026-10-29  
Component: one global Pierrot portal (`components/PierrotChat.tsx`)

## Root cause

The modal shell and the keyboard hook used two different definitions of the
visible viewport:

1. `useKeyboardViewportHeight` decided whether a keyboard was open by comparing
   `window.innerHeight` with `visualViewport.height`. If iOS/iPadOS had already
   resized the layout viewport, or reported both sizes as equal, the difference
   was not greater than `120px`, so the hook returned `null`.
2. On `null`, the shell fell back to `100dvh`/`--tg-viewport-height`. The
   composer footer was then laid out against a viewport that still included the
   keyboard area and rendered below the screen.
3. The hook also returned height/offset only and the shell only set
   `height`/`maxHeight`/`top`. It did not use the visual viewport width or
   `offsetLeft`, and the modal section carried a vertical entrance transform
   that could briefly push the footer outside the shell.
4. `PierrotInput` focused the textarea whenever `isLoading` changed, including
   the initial mount. Opening the modal therefore raised the mobile keyboard
   and started the viewport changes before the user had touched the composer.

The flex structure was close to correct, but the footer could also grow past a
short keyboard-visible viewport because the textarea's 144px maximum was
absolute rather than derived from the current modal height.

## Implementation

- `useKeyboardViewportHeight` now returns a single geometry object
  `{ width, height, offsetTop, offsetLeft }` read directly from
  `VisualViewport`. It does not compare against `window.innerHeight` and has no
  aria/keyboard inset threshold.
- VisualViewport `resize`/`scroll`, window `resize` and `orientationchange`
  events are coalesced into one `requestAnimationFrame`; identical geometry is
  ignored. The modal also reads the live visual viewport during the first render
  after opening, so it does not paint at `100dvh` for a frame.
- With no usable VisualViewport, the shell keeps the CSS fallback
  `var(--tg-viewport-height, 100dvh)`.
- The shell is positioned with the same geometry as its size:
  `top`, `left`, `width`, `height`, `maxWidth`, `maxHeight`. It publishes
  `--pierrot-viewport-height` for descendants.
- Horizontal safe-area padding is applied once on the shell. Header top and
  footer bottom safe areas remain single-purpose; no safe inset is added twice.
- Structure: fixed shell, stable `shrink-0` header, `min-h-0 flex-1` message
  scroller as the only conversation scroll container, `shrink-0` footer with
  the composer outside the scroller. The modal section is
  `min-h-0 min-w-0 overflow-hidden`; the wrapper clips overflow and disables
  overscroll.
- The textarea still grows from 38px to 144px. Its CSS maximum is capped
  against `--pierrot-viewport-height` (with a 264px reserve for header, footer
  and a message row), so a very short keyboard-visible viewport shrinks the
  textarea instead of pushing the footer out. Beyond its height it scrolls
  internally.
- Focus: opening on a fine-pointer device still focuses the composer; touch
  devices focus the dialog section (`tabIndex={-1}`) without summoning the
  keyboard. The loading effect that focused the textarea on every
  `isLoading` change was removed. The textarea is `readOnly` while loading, so
  focus/caret stay where the user left them instead of closing and reopening
  the keyboard after a response. Closing restores the previously focused
  element.
- `<html>` and `<body>` are both locked while the modal is open and restored on
  close.

## Verification in this workspace

- Jest: full suite 63 suites / 384 tests pass.
- TypeScript: `tsc --noEmit` passes.
- Production build: `next build` reaches `Compiled successfully` and type
  validation. Page-data collection then requires real deployment secrets
  (Supabase, Telegram bot token, Stripe key) and Google Fonts access; those
  environment failures are unrelated to this diff.
- Playwright (`tests/pierrot-viewport.spec.ts`) checks real bounding rectangles
  at 320, 360, 375, 390, 430, 768, 820 and 1024 CSS px, portrait and landscape:
  shell, header, message scroller, footer, textarea and send button. It also
  covers mocked VisualViewport keyboard open/offset/close, long input,
  loading/response, repeated open/close and desktop focus.
- Chromium emulation is **not** iOS Safari. It validates layout and the
  VisualViewport contract, not WebKit keyboard behavior.

## Real-device checklist (required before closing the iOS/iPadOS bug)

Run against the deployed preview/build on physical hardware:

### iPhone Safari, portrait

1. Open Pierrot from the header P. The keyboard must **not** appear and the
   composer must be fully visible at the bottom of the screen.
2. Tap the textarea. The keyboard appears; header, message list and footer must
   remain inside the area above the keyboard. No gray/blank strip at the top or
   bottom.
3. Scroll the page behind the modal (rubber-band) and pan/zoom. The modal must
   stay aligned with the visible viewport; the page must not scroll.
4. Type 10+ lines. The textarea stops at 144px and scrolls internally; the send
   button and footer stay visible.
5. Send. While "Thinking…" is shown the composer stays put. After the reply the
   composer is still visible; the keyboard must not unexpectedly reopen or jump
   the page.
6. Close with X, reopen, repeat at least five times. No cumulative offset,
   scroll jump or blank strip.

### iPhone Safari, landscape

Repeat steps 1-5. The visible viewport is short; the textarea should shrink
below 144px and still scroll internally. Header and footer must both remain
visible.

### iPad Safari

Repeat in portrait and landscape, with the keyboard both docked and floating
(if the floating keyboard exposes a visualViewport change). Check that the
composer is above the keyboard and that dismissing the keyboard restores the
full-height modal without a permanent vertical offset.

### Safari tab bar / toolbar

Open the modal with the compact tab bar and the expanded tab bar. The shell must
fill the actual visible page area, without a strip at the bottom or the footer
sitting under browser chrome.

### Regression check

On desktop Chrome/Safari, opening Pierrot should still focus the composer, look
unchanged and keep Escape, Tab trapping and close-focus restoration working.
