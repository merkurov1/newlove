# Flow composer — editorial redesign

Date: 2026-11-27
Surface: `components/flow/NewPostModal.tsx`, `components/flow/new-post/Previews.tsx`
Routes: Flow composer (new post and edit), Telegram Mini App and browser.

## 1. Root cause of the dark frame

The composer auto-focuses its `<textarea>` on open. The field carried:

```
focus-visible:outline-2
focus-visible:outline-offset-[6px]
focus-visible:outline-[#8A8378]
```

Text inputs match `:focus-visible` even when focus is moved
programmatically, so the field painted a 2px dark-grey rectangle with a 6px
offset immediately on open, after returning from an attachment control, and
after a keyboard pan. The global `textarea:focus-visible` rule in `app/main.css`
was a second possible source (`#3b82f6`) whenever a utility did not override it.

The fix removes the field outline entirely. Focus is now indicated by a
restrained 32 × 2px warm-grey margin rule above the first line
(`group-focus-within`), plus the real text caret. Buttons and link receipts keep
their keyboard rings. No full rectangular border is painted around the writing
surface.

## 2. What changed

- Permanent controls are exactly: close (X), attach image, Post/Save. The Clear
  action was removed from the UI; the hook API remains for internal use/tests.
- No title field, labels, helper copy, placeholder, toolbar or link-entry
  control is rendered.
- The writing canvas is larger: mobile uses the full visual viewport; desktop
  grows from a 40rem form to a 54rem editorial canvas with 40px side margins.
- Link and YouTube attachments are compact one-line receipts with a favicon or
  domain initial, a short title and a subtle remove button.
- A failed preview parse keeps the URL attached and says `Preview unavailable`
  instead of implying that metadata was fetched.
- Images are 64 × 64 px thumbnails with an in-thumbnail remove button.
- Parsing and upload status lives in the fixed bottom action row. It does not
  insert a card, shimmer block or layout jump into the writing column.
- The textarea stays editable while a link or image is processing, so the
  keyboard and caret are not dismissed by a transient request.
- Link/YouTube/image processing never renders the old full-width preview cards
  or `aspect-video`/`aspect-[1.91/1]` media.
- Viewport, safe-area, visualViewport resize/pan, Telegram height and late
  request cancellation logic are unchanged.

## 3. Data contract

No API route, database schema, publishing semantics or external channel was
changed. The composer still writes:

- `metadata.link_previews` (and `link_preview` as the first item)
- `metadata.youtube`
- `metadata.images` plus legacy `image` / `public_url` aliases
- `source_url`, `type`, `status`, `visibility`, `lang` on creation
- edits as `PATCH` without rewriting `lang`

URL extraction, HTTP(S) validation, canonical URL handling, deduplication,
fallback attachment retention, YouTube detection, clipboard image paste and the
Telegram auth/cross-post callback path are untouched.

## 4. Verification

Commands run from the repository root:

| Command                                                                                       | Result                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm jest components/flow/__tests__/NewPostModal.test.tsx --runInBand`                       | 40 passed                                                                                                                      |
| `pnpm exec playwright test --config=tests/pierrot.playwright.config.ts flow-composer.spec.ts` | 8 passed                                                                                                                       |
| `pnpm typecheck`                                                                              | passed                                                                                                                         |
| `pnpm lint`                                                                                   | 0 errors (1400 pre-existing warnings)                                                                                          |
| `pnpm test --runInBand`                                                                       | 4513 passed; 1 unrelated failure in `DevWorkbench.test.tsx` (`window.confirm` is not mocked); 10 skipped                       |
| `pnpm build` with the test Supabase env                                                       | passed                                                                                                                         |
| `pnpm build` without Supabase env                                                             | fails at `/api/cast/capture` because `supabaseUrl` is required — pre-existing environment requirement, not caused by this task |

Playwright coverage opens the real Flow page inside a mocked Telegram Mini App,
opens the composer through the native Write/MainButton path, and checks:

- exactly three permanent controls at 390, 768 and 1440 px;
- the field has no dark outline and fills the available width;
- compact link, YouTube, fallback and image receipts;
- parsing status does not create an aspect-ratio preview block;
- a simulated iOS keyboard viewport of 420px keeps the footer inside the
  visible area and leaves usable writing height.

## 5. Screenshots (after)

- `mobile-390x844.png`
- `ipad-768x1024.png`
- `desktop-1440x900.png`
- `link-receipt-mobile.png`
- `link-receipt-desktop.png`
- `youtube-receipt-mobile.png`
- `fallback-receipt-mobile.png`
- `image-strip-mobile.png`
- `keyboard-420-mobile.png`

## 6. Screenshots (before)

- `before/mobile-390x844.png`
- `before/desktop-1440x900.png`
- `before/link-receipt-mobile-390x844.png`
- `before/link-receipt-desktop-1440x900.png`

The before images are rendered from the base commit (`658f6684`) with the same
Telegram/API stubs.

## 7. Device-only checks

The CI environment has Chromium only. iOS Safari and the real Telegram client
cannot be installed or launched here. The Safari keyboard path is covered by
the `visualViewport` resize/pan regression and the 420px viewport Playwright
case, and the Telegram path by the mocked Mini App environment. A final manual
check on a physical iPhone/iPad and in Telegram is still required before the
change is considered device-verified.
