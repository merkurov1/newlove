/**
 * Pure long-form progress maths. Kept separate from React so the behaviour is
 * testable without a layout engine.
 */
export function computeReadingProgress(args: {
  scrollTop: number;
  viewportHeight: number;
  contentTop: number;
  contentHeight: number;
}): number {
  const { scrollTop, viewportHeight, contentTop, contentHeight } = args;

  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return scrollTop > contentTop ? 1 : 0;
  }

  const start = Math.max(0, contentTop);
  const end = contentTop + contentHeight - viewportHeight;

  if (end <= start) {
    return scrollTop >= start ? 1 : 0;
  }

  const value = (scrollTop - start) / (end - start);

  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** Compact label for a "Continue reading" affordance. */
export function formatReadingProgress(progress: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  if (percent >= 99) return 'Finished';
  if (percent <= 1) return 'Started';

  return `${percent}%`;
}
