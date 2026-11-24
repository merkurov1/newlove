# Temple homepage screenshots

Captured from the production build (`next build` + `next start`) of this
attempt.

| File | Viewport | Notes |
| --- | --- | --- |
| `temple-desktop.png` | 1440 × 1000 | desktop browser |
| `temple-mobile.png` | 390 × 844 | mobile browser |
| `temple-telegram.png` | 390 × 844 | Telegram WebApp `initData` present |

The authoritative `/api/vigil/state` response was replaced with a visual test
fixture of **24 supporters** so the heart intensity and label are representative.
The page still reads the count from that server route; no client-side counting
or hard-coded count is used in the application.

Artwork, mapped exactly to the owner-supplied files:

- centre heart: `https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1775.png`
- left panel: `https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1776.jpeg`
- right panel: `https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Temple/IMG_1777.jpeg`

All three are rendered as-is with `object-contain`, preserving their aspect
ratios. No generated or recoloured stained-glass artwork was added.
