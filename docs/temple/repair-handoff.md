# Temple repair handoff

This note records the verified Temple repair and its reconciliation with current
`main`. It is a handoff record only: the reconciliation does not redesign the
Temple, change the Telegram integration, payments or authentication, and it does
not change any unrelated source file.

## Provenance

- Source repair commit: `5afd8bd72f1e44bac96ef9fa4daff632935fbd26`
  (`pierrot(dev): task f6abc9a7-370b-411d-a55d-a21c5bc90899 attempt 1`)
- Parent and main SHA at repair time: `54bc3cddae13fc77a5c98a584dca2f86f0f20461`
  (merge of PR #110)
- Publication head before reconciliation: `eb38db934d92bfe116e99d7347b4ae79c3928a2f`
  (PR #113, one handoff-note commit on top of the source repair commit)
- Reconciliation base: `1d725c2bd79463d52f290ad7f18f70e49c05658e`
  (current `main`, merge of PR #112)

## Reconciled conflict areas

The repair reconciles the Temple redesign with the merged Telegram Mini Apps
work in three places:

1. **`app/temple/TempleClient.tsx`** — kept the sanctuary redesign (stage,
   rituals, support card, traces, chambers) while preserving the merged
   Telegram behaviour: `useIsTelegram`, the registered Telegram back handler,
   haptic helpers, the native bottom button and the Telegram-specific account /
   heart presentation. The support CTA now targets `/temple/support`.
2. **`components/TelegramMiniApp.tsx`** — no delta against `main` in the repair
   commit; the merged Telegram shell (initData flow, fullscreen and Flow
   navigation) was retained as the resolved version. Route-scoped Temple/Flow
   chrome was kept in `lib/telegram/chrome.ts` (`TEMPLE_LIGHT_CHROME`) rather
   than overriding the shell, so the light Temple palette is applied only where
   intended.
3. **`lib/temple/routes.ts`** — added `/temple/support` to both
   `TELEGRAM_NAV_HIDDEN_ROUTES` and `TEMPLE_AUDIO_ROUTES`, with matching
   assertions in `lib/temple/__tests__/routes.test.ts`, so the support page keeps
   the shared Temple audio and does not stack a second Telegram navigation.

The same repair commit also adds `app/temple/support/*`,
`lib/tributes/checkoutClient.ts` and its tests. They are included as-is.

## Reconciliation with PR #112

PR #112 (`1d725c2b`, "Flow/Telegram route behaviour") landed after the original
repair base. Reconciling it with PR #113 keeps the newer Flow behaviour and the
Temple repair together:

- `app/flow/page.tsx`, `app/flow/__tests__/FlowPage.telegram.test.tsx` and the
  removal of `lib/telegram/flowActions.ts` stay exactly as merged by PR #112.
  No Flow fallback writer or duplicate Flow header row is reintroduced.
- `/flow` stays out of `TELEGRAM_NAV_HIDDEN_ROUTES`, because PR #112 keeps the
  global Telegram navigation on Flow. `/temple/support` is the only route added
  to that list by this repair.
- `/temple/support` remains in `TEMPLE_AUDIO_ROUTES`; the route test asserts
  `isTempleAudioRoute('/temple/support') === true` and
  `isTelegramNavigationHidden('/flow') === false`.
- `docs/telegram-mini-app-integration.md` auto-merged: PR #112's Flow fallback
  wording is retained while the repair's light Temple palette values stay in
  place.

## Prior verification recorded on the source commit

Before this handoff, the source repair commit recorded passing runs of:

- typecheck
- lint
- full Jest suite
- full Playwright suite
- production build

Playwright screenshot artifacts are committed under
`artifacts/temple-sanctuary/`: desktop 1440x900 (top, full, fixed rails and OS
dark-night variants), tablet 768x1024, mobile 390x844, Telegram 390x844 and the
support step.

## Reconciliation verification

The reconciliation ran focused checks instead of repeating the full Playwright
and production-build runs:

- `pnpm install --frozen-lockfile` — exit 0.
- `pnpm test --runInBand lib/temple/__tests__/routes.test.ts` — 1 suite,
  6 tests, all passing.
- Focused Jest for `TempleClient`, `TempleSupportClient`, Temple routes, tribute
  checkout client, Telegram chrome and the PR #112 `FlowPage.telegram` suite —
  5 suites, 28 tests, all passing.
- `pnpm typecheck` — exit 0.
- Focused ESLint over the Temple, tributes, Telegram and Flow files touched by
  the repair — exit 0, 0 errors and 18 warnings.
- `git diff --check` — exit 0.

## Telegram device verification

The Telegram screenshot was produced with Playwright emulation of the Telegram
WebApp environment. Physical iOS or Android Telegram client verification
(header/bottom-bar colours, native bottom button, back gesture and haptics) is
a separate runtime check and is **not** covered by this handoff or by the
Playwright artifacts.
