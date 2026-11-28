# Flow inside Telegram

This document records the reader-facing Telegram implementation added for the
Flow Mini App task. It is intentionally limited to reading: publishing,
administration, auth and the shared Telegram navigation are unchanged.

## What changed

| Surface             | File                                                     | Behaviour                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK bootstrap       | `lib/telegram/sdkBootstrap.ts`, `app/layout.tsx`         | Queues `telegram-web-app.js` through Next.js' before-interactive loader only for Telegram launch markers or the WebView bridge; ordinary browsers never request it.                                                      |
| SDK lifecycle       | `lib/telegram/lifecycle.ts`                              | One feature-detected lifecycle: `ready`, `expand`, viewport, safe-area, theme, fullscreen and activation events, with full listener cleanup.                                                                             |
| Shell               | `components/TelegramMiniApp.tsx`                         | Uses the lifecycle; asks for fullscreen only on Flow routes; keeps BackButton, start-param and native chrome behaviour. Reserves masthead space for the fullscreen close control.                                        |
| Feed continuity     | `app/flow/page.tsx`                                      | Stable entry-anchor scroll restoration (including bounded re-pagination), versioned local last-read/progress, a quiet “Continue reading” line and a Home Screen offer.                                                   |
| Reader              | `app/flow/[slug]/page.tsx`                               | Focused publication layout, reading progress, contextual newer/older links, share at the end, source links moved out of the reading path.                                                                                |
| Reader client layer | `components/flow/FlowReaderShell.tsx`                    | Progress line, storage writes, delegated gallery opening and Telegram BackButton handling.                                                                                                                               |
| Image viewer        | `components/flow/FlowImageViewer.tsx`                    | Gallery navigation, swipe, pinch/double-tap zoom, captions/alt, scroll lock, Escape/Back/browser-Back close.                                                                                                             |
| Share               | `components/flow/FlowShare.tsx`, `lib/telegram/share.ts` | Flow's Share action opts out of Story (`storyMode: 'off'`) so reading is never hijacked; Story is a separate action (`'only'`) when supported and media-safe. Existing Vigil callers keep the historical `auto` default. |
| Home Screen         | `components/flow/FlowHomeScreenPrompt.tsx`               | Feature-detected, after-reading, 30-day cooldown, never blocks reading.                                                                                                                                                  |
| State               | `lib/flow/readerState.ts`, `lib/flow/readingProgress.ts` | Versioned, validated, failure-tolerant local state; pure progress maths.                                                                                                                                                 |
| Neighbours          | `lib/flow/items-cash.ts`                                 | Immediate newer/older publications from the existing public ordering; no recommendation engine.                                                                                                                          |

## Telegram API inventory

Already used before this task:

- `ready`, `expand`, `close`
- `setHeaderColor`, `setBackgroundColor`, `setBottomBarColor`
- `BackButton.show/hide/onClick/offClick`
- `HapticFeedback.impactOccurred/notificationOccurred/selectionChanged`
- `openLink`
- `shareMessage` with a server-prepared message id
- `shareToStory` (helper only; now exposed as an explicit action)
- `checkHomeScreenStatus`, `addToHomeScreen`
- `safeAreaInset`, `contentSafeAreaInset`, `viewportHeight`, `viewportStableHeight`
- `onEvent`/`offEvent` for viewport, safe-area and theme changes

Newly exercised by this task:

- Early head bootstrap of `telegram-web-app.js` for real Telegram launches
- `requestFullscreen`, `exitFullscreen` (Bot API 8.0, feature-detected, Flow routes only)
- `disableVerticalSwipes`, `enableVerticalSwipes` (restored on cleanup)
- `colorScheme` + `themeParams` with a luminance fallback
- `activated` / `deactivated` lifecycle events
- `fullscreenChanged` event
- `tgWebAppStartParam` URL fallback for `start_param`
- Route-aware BackButton fallback from `/flow/<slug>` to `/flow`
- In-app BackButton stack that ignores the WebView's blank initial history entry

Unavailable or intentionally not used:

- `requestContact`, `requestWriteAccess`, `requestPhoneAccess`: unrelated to reading.
- `showPopup`, `showAlert`, `showConfirm`: would replace native editorial UI with extra dialogs.
- `lockOrientation`: the task explicitly forbids forcing orientation.
- `initDataUnsafe` for identity: never trusted. Only `start_param` is read for deep links; permissions are server-verified. The signed `initData` remains the only auth input.
- Payments, invoices, clipboard write via Telegram: no scope and no need; the existing browser clipboard/Web Share fallbacks remain.
- `shareToStory` success confirmation: the SDK exposes no completion callback, so Flow never says a Story was posted. The label is “Story editor opened”.

## Tests

- `lib/flow/__tests__/readerState.test.ts` (versioned state, storage failures and progress maths)
- `lib/telegram/__tests__/lifecycle.test.ts`
- `lib/telegram/__tests__/sdkBootstrap.test.ts` (launch-marker detection, no SDK in a normal browser, single fallback injection)
- `lib/telegram/__tests__/miniAppRoutes.test.ts` (`start_param` allowlist, URL fallback and injection rejection)
- `lib/telegram/__tests__/navigation.test.ts` (BackButton section-home fallback and in-app route stack)
- `tests/flow-telegram-launch.spec.ts` (cold/repeat launch, `start_param`, deep link, Back, safe area/fullscreen and browser fallback)
- `components/flow/__tests__/FlowImageViewer.test.tsx`
- `components/flow/__tests__/FlowReaderShell.test.tsx`
- `components/flow/__tests__/FlowHomeScreenPrompt.test.tsx`
- `tests/flow-telegram-reader.spec.ts` (Playwright, iPhone/iPad/browser fallback)

Screenshots are written to `artifacts/flow-telegram-reader/`:

- `flow-feed-390x844.png`
- `flow-reader-390x844.png`
- `flow-reader-progress-390x844.png`
- `flow-image-viewer-390x844.png`
- `flow-image-viewer-second-390x844.png`
- `flow-reader-820x1180.png`
- `flow-image-viewer-820x1180.png`
- `flow-reader-browser-fallback-390x844.png`

## Remaining limitations

- Playwright runs use a mocked Telegram WebApp and a local Supabase stub. They
  prove layout, state and fallbacks, not a physical iPhone/iPad Telegram client.
- Native Story sharing, Home Screen installation and haptics require a real
  device; the browser tests only assert that the calls are feature-detected and
  that unsupported clients hide the affordances.
- The shared `TelegramNavigation` component and its styles are untouched. Any
  final integration with the queued navigation task happens outside this diff.
