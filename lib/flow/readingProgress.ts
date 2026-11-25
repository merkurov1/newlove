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

/**
 * Inverse of `computeReadingProgress` for a safe, vertical resume.
 *
 * The result is a viewport scroll offset, never a pixel inside the text, so
 * restoring a publication keeps normal selection and scrolling behaviour.
 */
export function computeScrollTopForProgress(args: {
  progress: number;
  viewportHeight: number;
  contentTop: number;
  contentHeight: number;
}): number {
  const { progress, viewportHeight, contentTop, contentHeight } = args;
  const value = Number(progress);
  const safeProgress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;

  const start = Math.max(0, Number.isFinite(contentTop) ? contentTop : 0);

  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return start;
  }

  const end = start + contentHeight - viewportHeight;

  if (end <= start) return start;

  return Math.max(0, Math.round(start + safeProgress * (end - start)));
}

/**
 * A saved position is only useful while the reader is inside the article.
 * Positions at the very beginning or the very end should not move the page.
 */
export function shouldRestoreReadingProgress(progress: number): boolean {
  return Number.isFinite(progress) && progress > 0.005 && progress < 0.98;
}
