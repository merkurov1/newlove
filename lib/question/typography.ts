/** Presentation-only helpers for verbatim question text. */

/**
 * Seeded questions are short single lines and keep the original display
 * headline. Restored verbatim questions may be much longer and may contain
 * their original paragraphs, so they need a calmer reading scale.
 */
export const QUESTION_LONG_TEXT_MIN_CHARS = 180;
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
