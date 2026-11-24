# Telegram Mini App integration (Temple + Flow)

This pass reuses the existing Telegram shell (`components/TelegramMiniApp.tsx`),
the shared initData verifier (`lib/telegram/initData.ts`) and the existing
Temple/Flow APIs. No second Telegram layer, editor or publishing pipeline was
added.

## Prerequisites

| Capability | Requirement | Fallback when missing |
| --- | --- | --- |
| Native BottomButton | Telegram client with `WebApp.BottomButton` | Compact in-page owner `WRITE` on `/flow`; Temple keeps its inline controls |
| Haptics | `WebApp.HapticFeedback`; skipped for reduced-motion users | Silent no-op |
| Stories | `WebApp.shareToStory` + HTTPS media (Temple heart asset or published Flow card) | Prepared message → Telegram share link → `navigator.share` → copy |
| `shareMessage` | Bot API 8.0+ `savePreparedInlineMessage` and a server bot token (`PIERROT_BOT_TOKEN`, `OSIRIS_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN`) | Telegram share deep link, native share, copy canonical URL |
| Add to Home Screen | `checkHomeScreenStatus` + `addToHomeScreen` | Prompt is not shown |
| Shared Vigil | Group launch where Bot API supplies HMAC-signed `chat_type` + `chat_instance` in raw `initData` | UI reports “available in group chats”; server refuses to bind |

`savePreparedInlineMessage` must be allowed for the production bot. If the bot
or token cannot call it, `/api/telegram/share/prepared` returns 503 and the
client falls back; no prepared id is fabricated.

## Security notes

- Raw `initData` is HMAC-verified server-side with a 24h freshness window.
- `initDataUnsafe` is only used for the `start_param` hint and Telegram display
  name. `start_param` is resolved through a typed allowlist in
  `lib/telegram/miniAppRoutes.ts`.
- A client-supplied `chat_instance`/`chat_type` is ignored. The Shared Vigil
  route derives the group from the signed `initData` payload only.
- Group participation is stored in private service-role tables
  (`migrations/2026-11-24_telegram_group_vigil.sql`, RLS enabled, no anon
  grants) and never changes `vigil_hearts`/public supporter totals.
- Share payloads contain only published canonical URLs and public titles.

## Before / after

- Before: the Telegram shell forced a dark `#141210` header/background/bottom
  bar on every route and the Temple homepage had no native primary action.
- After: Temple/Flow routes use the existing light `#FAF8F5` Temple palette;
  `/temple` exposes `KEEP THE VIGIL`, `/flow` exposes owner-only `WRITE`, and
  other routes keep their previous chrome.
- Before: the global Header (and its `ComposerTrigger`) was hidden in Telegram,
  so owners could not publish from `/flow`, and `/flow` still reserved the web
  header's `pt-20` space.
- After: the native BottomButton or a compact in-page fallback opens the
  existing `NewPostModal`; Telegram Flow padding is safe-area aware and the
  global Telegram navigation is suppressed on `/flow` in favour of Flow's own
  `← Temple` / `← Flow` links.

## Verification

Automated Telegram WebApp mocks are covered by Jest tests in
`lib/telegram/__tests__` and `app/api/telegram/**/__tests__`. Physical iOS or
Android Telegram clients were not available in this environment and were not
tested.
