# Temple repair handoff

This note records the verified Temple repair that is published as a replacement
PR. It is a handoff record only: this attempt does not change the Temple design,
the Telegram integration, payments, authentication or any other source file.

## Provenance

- Source repair commit: `5afd8bd72f1e44bac96ef9fa4daff632935fbd26`
  (`pierrot(dev): task f6abc9a7-370b-411d-a55d-a21c5bc90899 attempt 1`)
- Parent and main SHA at repair time: `54bc3cddae13fc77a5c98a584dca2f86f0f20461`
  (merge of PR #110)
- The replacement attempt branch starts at the source repair commit, which is a
  descendant of `54bc3cdd`.

## Reconciled conflict areas

The repair reconciled the Temple redesign with the merged Telegram Mini Apps
work in three places:

1. **`app/temple/TempleClient.tsx`** — kept the sanctuary redesign (stage,
   rituals, support card, traces, chambers) while preserving the merged
   Telegram behaviour: `useIsTelegram`, the registered Telegram back handler,
   haptic helpers, the native bottom button and the Telegram-specific account /
   heart presentation. The support CTA now targets `/temple/support`.
2. **`components/TelegramMiniApp.tsx`** — no delta against main in the repair
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

## Handoff verification

This attempt only adds this note, so it ran focused checks instead of repeating
the full Playwright and production-build runs:

- `pnpm typecheck` — exit 0.
- Focused ESLint over the Temple, tributes and Telegram files touched by the
  repair — exit 0, 0 errors and 7 `react-hooks/set-state-in-effect` warnings.
- Focused Jest: `TempleClient`, `TempleSupportClient`, Temple routes, tribute
  checkout client and Telegram chrome tests — 5 suites, 32 tests, all passing.
- Existing screenshots were inspected directly; they show the approved
  sanctuary layout at desktop, tablet, mobile and Telegram-emulated viewports
  and the support step, with no source change in this attempt.

## Telegram device verification

The Telegram screenshot was produced with Playwright emulation of the Telegram
WebApp environment. Physical iOS or Android Telegram client verification
(header/bottom-bar colours, native bottom button, back gesture and haptics) is
a separate runtime check and is **not** covered by this handoff or by the
Playwright artifacts.
