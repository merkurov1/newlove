# Ritual modal audit screenshots

Captured from a local production-equivalent dev server with Playwright/Chromium
using placeholder Supabase environment values. Remote artwork is loaded from the
existing public Supabase media bucket.

## Covered viewports

- `small-phone-320x568-*` — smallest supported phone width
- `phone-390x844-*` — common modern phone
- `ipad-portrait-*` — 768 × 1024
- `ipad-landscape-*` — 1024 × 768
- `desktop-*` — 1440 × 900
- `telegram-emulated-phone-letitgo.png` — Chromium with a stubbed Telegram
  `WebApp` object (`telegram-app` body state)

## Measured behaviour

- Keep Calm canvas CSS box and backing-store attributes matched the
  `.temple-modal__content` slot at every viewport before and after orientation
  changes.
- Let It Go filled the scene slot with no content scroll; the released-heart
  counter appeared once in the shared modal header (`❤️ 0`).
- Escape closed the modal and removed the `ritual-modal-open` body lock.
- Scrollable rituals (Absolution, Cast, Vigil, Tribute) used `min-height: 100%`
  inside the modal and scrolled inside the content slot; their standalone pages
  still use the viewport wrapper.
- The in-place Tribute sheet focused its Close control, trapped Tab, closed on
  Escape/Telegram Back, and restored focus to its trigger.

## Limitations

- No real Telegram client or iOS device was available in the runner. Telegram
  insets and the WebView were not exercised; only browser viewport emulation and
  CSS variables were used.
- The local dev server uses placeholder Supabase credentials, so real-time
  Vigil and payment verification calls cannot be validated here.
- Container query units (`cqw`/`cqh`) require the project's declared browser
  targets (Chrome 111+, Safari 16.4+). Older Android WebViews should be checked
  in a real Telegram client.
