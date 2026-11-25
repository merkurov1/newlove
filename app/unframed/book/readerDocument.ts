/**
 * UNFRAMED reader document helpers.
 *
 * The pure heading parser lives in `lib/reader/headings.ts` so the Flow reader
 * can share the same deterministic anchors without copying the implementation.
 */
export {
  extractHeadings,
  headingIdsByLine,
  headingText,
  slugifyHeading,
  type TocItem,
} from '@/lib/reader/headings';
