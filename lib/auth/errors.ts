// Structured authentication failures.
//
// API route handlers must distinguish an expected "not signed in / not an
// admin" denial from a database or other internal failure. The former is a
// security event and maps to 401; the latter is an application error and maps
// to 500. Keeping the classification in one place prevents routes from
// accidentally reporting database failures as unauthorized requests.

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
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
    return (
      /^unauthorized\b/i.test(error.message) ||
      /admin access required/i.test(error.message)
    );
  }

  return false;
}
