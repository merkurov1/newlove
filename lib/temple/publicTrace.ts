/**
 * Public Temple traces are an allowlist, not a copy of every stored column.
 *
 * Absolution is deliberately anonymous and completion-only: the certificate
 * keeps the pilgrim's name and selected burden in the browser, while the
 * public chronicle records that the ritual happened. Cast answers are private
 * as well; only the completed ritual is journaled.
 *
 * The same helpers are used on write (POST routes) and on read (feed
 * selection), so legacy rows written before this contract are redacted too.
 */
export const ABSOLUTION_PUBLIC_MESSAGE = 'Completed the Absolution ritual.';
export const CAST_PUBLIC_MESSAGE = 'Completed the Cast ritual.';
export const ABSOLUTION_PUBLIC_AUTHOR = 'Anonymous';

const PRIVATE_AUTHOR_EVENTS = new Set(['ABSOLUTION']);
const PRIVATE_USER_ID_EVENTS = new Set(['ABSOLUTION']);
const COMPLETION_ONLY_EVENTS: Record<string, string> = {
  ABSOLUTION: ABSOLUTION_PUBLIC_MESSAGE,
  CAST: CAST_PUBLIC_MESSAGE,
};

export function publicTempleTraceUserId(eventType: string, userId: string | null): string | null {
  return PRIVATE_USER_ID_EVENTS.has(eventType) ? null : userId;
}

export function publicTempleTraceAuthor(eventType: string, author: string): string {
  return PRIVATE_AUTHOR_EVENTS.has(eventType) ? ABSOLUTION_PUBLIC_AUTHOR : author;
}

export function publicTempleTraceMessage(eventType: string, message: string): string {
  return COMPLETION_ONLY_EVENTS[eventType] ?? message;
}

export function redactPublicTempleTrace(input: {
  eventType: string;
  author: string;
  message: string;
}): { author: string; message: string } {
  return {
    author: publicTempleTraceAuthor(input.eventType, input.author),
    message: publicTempleTraceMessage(input.eventType, input.message),
  };
}
