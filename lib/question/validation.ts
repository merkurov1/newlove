import {
  QUESTION_MAX_CHARS,
  QUESTION_MAX_WORDS,
  QUESTION_MIN_CHARS,
  QUESTION_MIN_WORDS,
} from './constants';

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/**
 * Counts words without relying on `split(' ')`.
 *
 * Cyrillic, Latin, numbers and internal apostrophes/hyphens are one word.
 * Punctuation-only input counts as zero.
 */
export function countQuestionWords(value: string): number {
  if (typeof value !== 'string' || value.trim().length === 0) return 0;

  return value.normalize('NFC').match(WORD_PATTERN)?.length || 0;
}

export type AnswerValidation =
  | { ok: true; content: string; wordCount: number }
  | { ok: false; reason: 'empty' | 'too_short' | 'too_long'; wordCount: number };

/**
 * Server and client share this validation. The server remains authoritative.
 */
export function validateQuestionAnswer(value: unknown): AnswerValidation {
  const content = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  const wordCount = countQuestionWords(content);

  if (!content) return { ok: false, reason: 'empty', wordCount };

  if (content.length > QUESTION_MAX_CHARS || wordCount > QUESTION_MAX_WORDS) {
    return { ok: false, reason: 'too_long', wordCount };
  }

  if (wordCount < QUESTION_MIN_WORDS || content.length < QUESTION_MIN_CHARS) {
    return { ok: false, reason: 'too_short', wordCount };
  }

  return { ok: true, content, wordCount };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isQuestionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

/** Only same-origin absolute paths are accepted for login return URLs. */
export function safeQuestionReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed.startsWith('/question')) return null;
  if (trimmed.startsWith('//') || trimmed.includes('\\')) return null;

  try {
    const parsed = new URL(trimmed, 'https://merkurov.local');
    if (parsed.origin !== 'https://merkurov.local') return null;
    if (parsed.pathname !== '/question') return null;

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
