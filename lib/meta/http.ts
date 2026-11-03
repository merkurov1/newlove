/**
 * Small helpers shared by the Meta adapters.
 *
 * Security rule: access tokens travel in the Authorization header, never in a
 * logged URL, and are redacted from every error that is persisted or returned.
 */

export function isTimeoutError(error: unknown): boolean {
  if (!error) return false;

  const name = (error as { name?: unknown }).name;
  const message = error instanceof Error ? error.message : String(error);

  return (
    name === 'AbortError' || name === 'TimeoutError' || /timeout|timed out|aborted/i.test(message)
  );
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Extract the human-readable message from a Meta API error response. */
export function metaErrorMessage(payload: unknown): string | null {
  const root = readRecord(payload);
  if (!root) return null;

  const error = readRecord(root.error);
  if (!error) return readString(root.message);

  const message = readString(error.message);
  const code = error.code;
  const subcode = error.error_subcode;

  if (!message) return null;

  const parts = [message];
  if (typeof code === 'number') parts.push(`code ${code}`);
  if (typeof subcode === 'number') parts.push(`subcode ${subcode}`);

  return parts.join(' · ');
}

/**
 * Never persist a token or a token-shaped query parameter. Also trims Meta's
 * verbose errors to something readable in the admin interface.
 */
export function sanitizeMetaError(error: unknown, token?: string | null): string {
  let message = '';

  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    message = metaErrorMessage(error) ?? 'Meta API request failed.';
  }

  if (!message) message = 'Meta API request failed.';

  if (token) {
    message = message.split(token).join('[redacted]');
  }

  message = message
    .replace(/([?&]access_token=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim();

  return message.slice(0, 300);
}

export function metaResponseIsUncertain(status: number): boolean {
  // 5xx means Meta may have committed the action before failing. Any local
  // network/timeout error is handled separately and is also uncertain.
  return status >= 500 || status === 408 || status === 429;
}
