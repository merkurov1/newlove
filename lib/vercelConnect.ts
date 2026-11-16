import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/vercelConnect');

/**
 * Vercel Connect (API Key connector) helper.
 *
 * The connector stores the upstream secret in Vercel; the app only references
 * the connector UID (for example `api-key/my-api`) and exchanges the project's
 * OIDC token for the secret at runtime. This keeps credentials out of source
 * code, client bundles and environment variables on Vercel.
 *
 * Setup:
 *   1. Create an API Key connector in the dashboard:
 *      https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fconnect%3Fcreate%3Dapi-key
 *   2. Attach it to the project: `vercel connect attach api-key/my-api`
 *   3. Set VERCEL_CONNECT_API_KEY=api-key/my-api in the target environment
 *      (or pass `connector` explicitly).
 *
 * Local development: unless VERCEL_OIDC_TOKEN is present, Connect calls fail.
 * Pass `fallbackEnv` to fall back to a plain environment variable locally.
 */

export const DEFAULT_CONNECTOR_ENV = 'VERCEL_CONNECT_API_KEY';

export type ConnectApiKeyOptions = {
  /** Connector UID (`api-key/<name>`). Defaults to `VERCEL_CONNECT_API_KEY`. */
  connector?: string;
  /** Environment variable used when Connect is not available (local dev). */
  fallbackEnv?: string;
  /** Re-validate the grant with Vercel instead of using the local token cache. */
  forceRefresh?: boolean;
};

export class VercelConnectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VercelConnectConfigError';
  }
}

export function getConnectConnectorUid(connector?: string): string {
  const uid = (connector ?? process.env[DEFAULT_CONNECTOR_ENV] ?? '').trim();
  if (!uid) {
    throw new VercelConnectConfigError(
      `Vercel Connect connector is not configured. Set ${DEFAULT_CONNECTOR_ENV} ` +
        'to the connector UID (for example api-key/my-api) or pass `connector`.'
    );
  }
  return uid;
}

export function isVercelConnectConfigured(connector?: string): boolean {
  return Boolean((connector ?? process.env[DEFAULT_CONNECTOR_ENV] ?? '').trim());
}

/**
 * Returns the API key stored in the Vercel Connect connector.
 *
 * @example
 * const apiKey = await getApiKeyFromConnect({ fallbackEnv: 'OPENAI_API_KEY' });
 */
export async function getApiKeyFromConnect(options: ConnectApiKeyOptions = {}): Promise<string> {
  const connector = getConnectConnectorUid(options.connector);

  try {
    // Loaded lazily so client bundles and non-Connect call sites never touch it.
    const { getToken } = await import('@vercel/connect');
    return await getToken(
      connector,
      { subject: { type: 'app' } },
      options.forceRefresh ? { forceRefresh: true } : undefined
    );
  } catch (error) {
    const fallback = options.fallbackEnv ? (process.env[options.fallbackEnv] ?? '').trim() : '';
    if (fallback) {
      console.warn(
        `[vercel-connect] Falling back to ${options.fallbackEnv}; connector ${connector} unavailable:`,
        error instanceof Error ? error.message : error
      );
      return fallback;
    }
    throw error;
  }
}
