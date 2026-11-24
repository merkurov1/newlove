# Absolution redesign evidence

Captured from the local Next.js dev server with Playwright/Chromium using the
existing Supabase test stub. The Temple artwork and the Absolution heart/stamp
are loaded from the existing public Supabase media bucket.

## Covered viewports

- `small-phone-320x568-*` — smallest supported phone width
- `phone-390x844-*` — common modern phone
- `ipad-768x1024-*` — iPad portrait
- `desktop-1440x900-*` — desktop
- `telegram-phone-390x844-modal.png` — Chromium with a stubbed Telegram
  `WebApp` and BackButton (`telegram-app` body state)

Each viewport has:

- `-modal.png` — compact Absolution dialog over the Temple
- `-certificate.png` — certificate element screenshot after the stamp reveal
- `-certificate-view.png` — the certificate inside the compact dialog
- `-controls.png` — download and reset controls after scrolling the dialog body

`desktop-standalone-certificate.png` is the canonical `/absolution` full-page
route, and `phone-390x844-certificate-export.png` is the actual html2canvas PNG
download produced by the Save Certificate button.

## Measured behaviour

- The modal is a compact centered dialog (`max-width: 34rem`) over the still
  mounted and visible Temple page, not the shared full-screen `RitualModal`.
- The primary confession button, close button, download and reset controls stay
  inside the modal and viewport bounds at every captured size. On the shortest
  phone the dialog body scrolls instead of clipping controls.
- Escape, the close control, the backdrop and the Telegram BackButton all close
  the dialog and remove the `absolution-modal-open` body lock.
- Escape restores focus to the Absolution ritual link and restores the Temple
  scroll position.
- `/absolution` still renders the same `AbsolutionClient` as a standalone full
  page with its own Temple top bar.
- The certificate export includes the heart crest and the preserved
  `IMG_0947.png` stamp at 2× scale. The exported file is committed as
  `phone-390x844-certificate-export.png`.

## Limitations

- No real Telegram client or iOS device was available in the runner. Telegram
  insets and the WebView were emulated in Chromium only.
- The local dev server uses placeholder Supabase credentials, so the ABSOLUTION
  trace write is reported by the component tests through a mocked logger; no
  production event was written.
- Remote artwork availability depends on the existing public Supabase bucket.
