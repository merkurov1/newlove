# Flow issue public page — visual verification

Rendered a representative Russian issue payload through `FlowIssueArticle`
inside a fixed site header shell and checked it in headless Chromium at four
viewport widths.

| Width | Document scroll width | Root / page width | Headline clipping | Page-level horizontal overflow |
| --- | --- | --- | --- | --- |
| 1440 px | 1440 px | 1440 / 1440 px | none (`scrollWidth = clientWidth`) | none |
| 1024 px | 1024 px | 1024 / 1024 px | none (1 px subpixel rounding in `scrollHeight`) | none |
| 768 px | 768 px | 768 / 768 px | none (`scrollWidth = clientWidth`) | none |
| 390 px | 390 px | 390 / 390 px | none (`scrollWidth = clientWidth`) | none |

Notes:

- The source-index table scrolls horizontally inside its own `.scroll` panel
  on narrow widths. The document itself never widens.
- All editorial images compute `object-fit: contain`; the photo frames keep
  `height: auto`, so portrait and landscape images keep their natural ratios.
- Screenshots: `desktop-1440.png`, `tablet-landscape-1024.png`,
  `tablet-768.png`, `mobile-390.png`.
- Raw measurements: `measurements.json`.
