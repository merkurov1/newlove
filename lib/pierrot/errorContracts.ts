/**
 * Shared, side-effect-free error contracts for Pierrot.
 *
 * This module is imported by both the browser and server routes. It must not
 * contain secrets, Node-only imports or provider details.
 */

export const PIERROT_ERROR_CODES = [
  'CLIENT_ABORTED',
  'AI_TIMEOUT',
  'AI_TEMPORARILY_UNAVAILABLE',
  'AI_RATE_LIMITED',
  'AI_QUOTA_EXCEEDED',
  'AI_NOT_CONFIGURED',
  'AI_EMPTY_RESPONSE',
  'AI_UNAVAILABLE',
  'AI_FAILED',
  'INVALID_RESPONSE',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
] as const;

export type PierrotErrorCode = (typeof PIERROT_ERROR_CODES)[number];

export type PierrotErrorLanguage = 'ru' | 'en';

const COPY: Record<PierrotErrorLanguage, Record<string, string>> = {
  ru: {
    CLIENT_ABORTED: 'Запрос отменён.',
    AI_TIMEOUT: 'Пьеро не успел ответить. Попробуйте ещё раз.',
    AI_TEMPORARILY_UNAVAILABLE: 'Пьеро сейчас недоступен. Попробуйте через минуту.',
    AI_RATE_LIMITED: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    AI_QUOTA_EXCEEDED: 'Пьеро временно недоступен. Попробуйте позже.',
    AI_NOT_CONFIGURED: 'Пьеро временно недоступен. Попробуйте позже.',
    AI_EMPTY_RESPONSE: 'Пьеро не получил ответ. Попробуйте ещё раз.',
    AI_UNAVAILABLE: 'Пьеро временно недоступен. Попробуйте позже.',
    AI_FAILED: 'Не удалось получить ответ. Попробуйте ещё раз.',
    INVALID_RESPONSE: 'Ответ пришёл в неверном формате. Попробуйте ещё раз.',
    NETWORK_ERROR: 'Связь прервалась. Проверьте соединение и попробуйте снова.',
    INTERNAL_ERROR: 'Что-то пошло не так. Попробуйте ещё раз.',
  },
  en: {
    CLIENT_ABORTED: 'The request was cancelled.',
    AI_TIMEOUT: 'Pierrot ran out of time. Please try again.',
    AI_TEMPORARILY_UNAVAILABLE: 'Pierrot is temporarily unavailable. Try again in a minute.',
    AI_RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
    AI_QUOTA_EXCEEDED: 'Pierrot is temporarily unavailable. Please try later.',
    AI_NOT_CONFIGURED: 'Pierrot is temporarily unavailable. Please try later.',
    AI_EMPTY_RESPONSE: 'Pierrot returned no answer. Please try again.',
    AI_UNAVAILABLE: 'Pierrot is temporarily unavailable. Please try later.',
    AI_FAILED: 'The answer could not be produced. Please try again.',
    INVALID_RESPONSE: 'The response was not readable. Please try again.',
    NETWORK_ERROR: 'The connection was interrupted. Check your connection and try again.',
    INTERNAL_ERROR: 'Something went wrong. Please try again.',
  },
};

export function normalizePierrotErrorCode(value: unknown): PierrotErrorCode | null {
  return typeof value === 'string' &&
    (PIERROT_ERROR_CODES as readonly string[]).includes(value)
    ? (value as PierrotErrorCode)
    : null;
}

export function pierrotErrorCopy(
  language: PierrotErrorLanguage,
  code: string | null | undefined,
  fallback?: string
): string {
  const normalized = normalizePierrotErrorCode(code);
  const copy = normalized ? COPY[language][normalized] : undefined;

  return copy || fallback || COPY[language].INTERNAL_ERROR;
}
