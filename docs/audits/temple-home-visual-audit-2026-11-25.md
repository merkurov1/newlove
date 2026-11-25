# Temple home visual and technical audit — 2026-11-25

Scope: `/temple` home composition (`app/temple/TempleClient.tsx` and
`app/temple/temple.module.css`). This audit only records observations and
prioritised suggestions. The only change implemented with this audit is the
approved ritual grid: four columns on desktop, two on tablet, one on mobile.

## Implemented in this pass

- Ritual cards now sit in one row at viewport widths `>= 1024px`.
- Tablets keep a balanced two-column grid; narrow phones keep the existing
  single-column stack.
- Cards use a shared row height, a framed icon, and wrapping label/descriptor
  text so nothing is clipped. Links, labels, order, handlers and Telegram
  haptics are unchanged.

## Prioritised recommendations (not implemented)

1. **Raise the smallest type sizes.** Several labels, notes and trace columns
   use `8px`–`9px` uppercase with wide letter-spacing. On a 1440px desktop this
   is hard to read and likely fails comfortable contrast/legibility targets.
   Proposed: minimum `10px` for metadata and `11px` for trace timestamps, then
   re-check the grid rhythm as one typography pass.
2. **Bring Rituals above the desktop fold.** On a 900px-tall viewport the hero
   (heart, eyebrow, title, lede) consumes most of the first screen, so the
   ritual row starts near or below the fold. Proposed: reduce hero vertical
   padding and the gap before the title by roughly 20–30% without shrinking the
   heart tap target.
3. **Simplify the Support card hierarchy.** The card currently combines a
   primary CTA, three amount buttons, status copy, `SharedVigil` and
   `AddToHomePrompt`. Proposed: keep one primary action plus the amount row,
   and move secondary prompts to a quieter disclosure below the card.
4. **Improve trace legibility.** The trace identity column is fixed at `6.7rem`
   while the timestamp is `8px`. Proposed: widen the identity column slightly
   on desktop and increase the timestamp size; keep the existing single-line
   ellipsis behaviour and full `title`/`aria-label` text.
5. **Normalise chamber chip tap targets.** Chamber chips use `min-height: 40px`,
   below the 44px touch target used elsewhere. Proposed: raise them to `44px`
   and keep the existing wrapping row.
6. **Document the inner-scroll contract on desktop.** The desktop stage scrolls
   only the centre column while the stained-glass rails stay fixed. This works,
   but focus/keyboard scrolling and browser find can surprise users. Proposed:
   verify keyboard focus never leaves the visible centre area and add a short
   note to the accessibility documentation rather than changing the layout.

## Constraints respected

No database, payment, auth, ritual API, shared Vigil logic, feed semantics or
Telegram navigation code was touched. The audit suggestions above are
intentionally separate from this task's diff.
