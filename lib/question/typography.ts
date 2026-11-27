/** Presentation-only helpers for verbatim question text. */

/**
 * Seeded questions are short single lines (the longest seed is 83 characters)
 * and keep the original display headline. Restored verbatim questions are
 * usually full sentences or paragraphs; from this length on the display scale
 * turns them into a poster, so they get the calmer reading scale instead.
 */
export const QUESTION_LONG_TEXT_MIN_CHARS = 100;
export const QUESTION_LONG_TEXT_MIN_LINES = 3;
export const QUESTION_LONG_TEXT_MIN_PARAGRAPHS = 2;

/**
 * Returns true when the question cannot be shown comfortably as a display
 * headline. The text itself is never trimmed, normalized or truncated here.
 */
export function isLongQuestionText(text: string): boolean {
  if (typeof text !== 'string') return false;

  const normalized = text.replace(/\r\n?/g, '\n');

  if (!normalized.trim()) return false;

  if (normalized.trim().length > QUESTION_LONG_TEXT_MIN_CHARS) return true;

  const visibleLines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (visibleLines.length >= QUESTION_LONG_TEXT_MIN_LINES) return true;

  const paragraphs = normalized.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0);

  return paragraphs.length >= QUESTION_LONG_TEXT_MIN_PARAGRAPHS;
}
