// Structured authentication failures.
//
// API route handlers must distinguish an expected "not signed in / not an
// admin" denial from a database or other internal failure. The former is a
// security event and maps to 401; the latter is an application error and maps
// to 500. Keeping the classification in one place prevents routes from
// accidentally reporting database failures as unauthorized requests.

/**
 * Stable, non-sensitive reason codes for authentication denials.
 *
 * Route handlers can return `code` to the admin UI so the owner can tell an
 * expired browser session (`auth_session_missing`) apart from a signed-in
 * account that is not an administrator (`auth_admin_required`). Neither code
 * contains user identifiers, emails or token material.
 */
export type AuthenticationFailureCode =
  'auth_session_missing' | 'auth_bearer_invalid' | 'auth_admin_required';

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code: AuthenticationFailureCode;
  readonly reason: string | null;

  constructor(
    message = 'Unauthorized',
    options: {
      code?: AuthenticationFailureCode;
      reason?: string | null;
    } = {}
  ) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = options.code ?? 'auth_session_missing';
    this.reason = options.reason ?? null;
  }
}

/**
 * Returns true only for expected authentication/authorization denials.
 *
 * The message fallback keeps compatibility with existing callers and tests
 * that reject with a plain `Error('Unauthorized')`, as well as helper modules
 * that have not been migrated to `AuthenticationError` yet.
 */
export function isAuthenticationError(error: unknown): boolean {
  if (error instanceof AuthenticationError) {
    return true;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AuthenticationError'
  ) {
    return true;
  }

  if (error instanceof Error) {
    return /^unauthorized\b/i.test(error.message) || /admin access required/i.test(error.message);
  }

  return false;
}
