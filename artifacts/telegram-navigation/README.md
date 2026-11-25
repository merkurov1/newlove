# Telegram navigation visual evidence

Captured by `tests/telegram-navigation.spec.ts` with a mocked Telegram WebApp
(390 × 844, safe-area top 47 / bottom 34, plus an 820 × 1180 expanded view) and
locally stubbed public APIs. No production database or Telegram client is used.

## After — current implementation

- `flow-home-390x844-closed.png` — Flow trigger at 390px, closed.
- `flow-home-390x844-open.png` — Flow editorial sheet, Flow active.
- `flow-detail-390x844-open.png` — Flow detail route, Flow index still active.
- `flow-home-820x1180-open.png` — wider expanded viewport.
- `flow-home-390x844-reduced-motion.png` — reduced-motion sheet.
- `temple-home-390x844-open.png` — light Temple sheet, Temple active.
- `temple-world-390x844-open.png` — nested World route, World active.
- `temple-ritual-route-390x844.png` — ritual route keeps its own chrome; the
  floating navigation stays hidden as before.

## Before

The pre-redesign screenshots were not captured. The old dark amber "Threshold"
modal no longer exists in the working tree and this repository does not keep a
runnable snapshot of the previous Mini App shell, so a genuine before image
would have to be recreated from code rather than observed. The before state is
documented in the task audit: centred dark modal, amber accents, compass pill,
and Temple rituals shown inside Flow.
