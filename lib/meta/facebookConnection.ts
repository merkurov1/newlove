/**
 * Persistence for the Facebook Page connection created by the admin OAuth flow.
 *
 * Only the Page access token is stored, AES-256-GCM sealed with the existing
 * analytics token key. The long-lived User token is used once to obtain Page
 * tokens and is never persisted. Environment credentials remain a read-only
 * legacy fallback for deployments that have not reconnected yet.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { StoredConnection } from '@/lib/analytics/website/store';

import { readFacebookEnvConfig, type FacebookConfig } from './facebookConfig';
import { readString } from './http';

/**
 * The persistence modules are imported lazily so the Flow adapter stays
 * importable in browser-like test environments. They are still server-only and
 * are evaluated only when a real service-role store is used.
 */
async function connectionStoreModule() {
  return import('@/lib/analytics/website/store');
}

async function tokenCryptoModule() {
  return import('@/lib/analytics/website/tokenCrypto');
}

export type FacebookConfigSource = 'database' | 'environment' | 'none';

export type FacebookRuntimeConfig = FacebookConfig & {
  source: FacebookConfigSource;
};

export type FacebookConnectionState = {
  connected: boolean;
  source: FacebookConfigSource;
  status: 'connected' | 'not_connected' | 'error' | 'needs_reauthorization' | 'disabled';
  pageId: string | null;
  pageName: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  externalMeta: Record<string, unknown> | null;
  tokenExpiresAt: string | null;
  tokenExpiryKnown: boolean;
  storageAvailable: boolean;
  storageError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a service-role client only when it is explicitly configured. Unit
 * tests must provide their own store; this avoids hidden network calls.
 */
export function getFacebookAdminStore(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;
  if (process.env.NODE_ENV === 'test') return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function storedPageToken(connection: StoredConnection | null): Promise<string | null> {
  if (!connection || connection.status !== 'connected') return null;

  const { openSecret } = await tokenCryptoModule();

  return openSecret({
    ciphertext: connection.token_ciphertext,
    iv: connection.token_iv,
    tag: connection.token_tag,
  });
}

/**
 * Resolve the token used for publishing. A database connection wins over the
 * environment fallback so an admin reconnect takes effect immediately.
 */
export async function loadFacebookRuntimeConfig(
  input: {
    env?: Record<string, string | undefined>;
    store?: SupabaseClient | null;
  } = {}
): Promise<FacebookRuntimeConfig> {
  const env = input.env ?? process.env;
  const envConfig = readFacebookEnvConfig(env);
  const store = input.store === undefined ? getFacebookAdminStore() : input.store;

  if (!store) {
    return {
      ...envConfig,
      source: envConfig.configured ? 'environment' : 'none',
    };
  }

  try {
    const { getStoredConnection } = await connectionStoreModule();
    const connection = await getStoredConnection(store, 'facebook');

    // An explicit disconnect must stop publishing even if a legacy env token
    // is still present in the deployment.
    if (connection?.status === 'disabled') {
      return {
        pageId: envConfig.pageId,
        accessToken: null,
        version: envConfig.version,
        configured: false,
        source: 'none',
      };
    }

    const accessToken = await storedPageToken(connection);
    const pageId = readString(connection?.external_id) ?? envConfig.pageId ?? null;

    if (accessToken && pageId) {
      return {
        pageId,
        accessToken,
        version: envConfig.version,
        configured: true,
        source: 'database',
      };
    }
  } catch {
    // A missing migration or transient database error must not break the
    // legacy environment token that is still configured.
  }

  return {
    ...envConfig,
    source: envConfig.configured ? 'environment' : 'none',
  };
}

export async function isFacebookRuntimeConfigured(
  input: {
    env?: Record<string, string | undefined>;
    store?: SupabaseClient | null;
  } = {}
): Promise<boolean> {
  return (await loadFacebookRuntimeConfig(input)).configured;
}

export async function loadFacebookConnectionState(
  input: {
    store?: SupabaseClient | null;
  } = {}
): Promise<FacebookConnectionState> {
  const envConfig = readFacebookEnvConfig();
  const store = input.store === undefined ? getFacebookAdminStore() : input.store;
  const environmentConnected = envConfig.configured;

  if (!store) {
    return {
      connected: environmentConnected,
      source: environmentConnected ? 'environment' : 'none',
      status: environmentConnected ? 'connected' : 'not_connected',
      pageId: envConfig.pageId,
      pageName: null,
      scopes: [],
      connectedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      externalMeta: null,
      tokenExpiresAt: null,
      tokenExpiryKnown: false,
      storageAvailable: false,
      storageError: null,
    };
  }

  let connection: StoredConnection | null = null;
  let storageError: string | null = null;

  try {
    const { getStoredConnection } = await connectionStoreModule();
    connection = await getStoredConnection(store, 'facebook');
  } catch {
    storageError =
      'Хранилище подключений недоступно. Проверьте, что подготовленная миграция Facebook применена.';
  }

  const accessToken = await storedPageToken(connection);
  const externalMeta =
    connection?.external_meta && isRecord(connection.external_meta)
      ? connection.external_meta
      : null;
  const hasExpiryKey = Boolean(
    externalMeta && Object.prototype.hasOwnProperty.call(externalMeta, 'token_expires_at')
  );
  const tokenExpiresAt = hasExpiryKey ? readString(externalMeta?.token_expires_at) : null;

  if (connection && connection.status === 'disabled') {
    return {
      connected: false,
      source: 'none',
      status: 'disabled',
      pageId: connection.external_id,
      pageName: connection.account_label,
      scopes: connection.scopes ?? [],
      connectedAt: connection.connected_at,
      lastErrorCode: connection.last_error_code,
      lastErrorMessage: connection.last_error_message,
      externalMeta,
      tokenExpiresAt,
      tokenExpiryKnown: hasExpiryKey,
      storageAvailable: !storageError,
      storageError,
    };
  }

  if (accessToken) {
    return {
      connected: true,
      source: 'database',
      status: 'connected',
      pageId: connection?.external_id ?? envConfig.pageId,
      pageName: connection?.account_label ?? null,
      scopes: connection?.scopes ?? [],
      connectedAt: connection?.connected_at ?? null,
      lastErrorCode: connection?.last_error_code ?? null,
      lastErrorMessage: connection?.last_error_message ?? null,
      externalMeta,
      tokenExpiresAt,
      tokenExpiryKnown: hasExpiryKey,
      storageAvailable: !storageError,
      storageError,
    };
  }

  if (connection) {
    const status = connection.status;

    return {
      connected: false,
      source: environmentConnected ? 'environment' : 'none',
      status:
        status === 'needs_reauthorization' || status === 'error' || status === 'disabled'
          ? status
          : 'not_connected',
      pageId: connection.external_id ?? envConfig.pageId,
      pageName: connection.account_label,
      scopes: connection.scopes ?? [],
      connectedAt: connection.connected_at,
      lastErrorCode: connection.last_error_code,
      lastErrorMessage: connection.last_error_message,
      externalMeta,
      tokenExpiresAt,
      tokenExpiryKnown: hasExpiryKey,
      storageAvailable: !storageError,
      storageError,
    };
  }

  return {
    connected: environmentConnected,
    source: environmentConnected ? 'environment' : 'none',
    status: environmentConnected ? 'connected' : 'not_connected',
    pageId: envConfig.pageId,
    pageName: null,
    scopes: [],
    connectedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    externalMeta: null,
    tokenExpiresAt: null,
    tokenExpiryKnown: false,
    storageAvailable: !storageError,
    storageError,
  };
}

export async function saveFacebookPageConnection(
  store: SupabaseClient,
  input: {
    pageId: string;
    pageName: string;
    pageToken: string;
    scopes: string[];
    tasks?: string[];
    permissions?: string[];
    userId?: string | null;
    userTokenExpiresAt?: string | null;
    connectedBy?: string | null;
    now?: Date;
  }
): Promise<void> {
  if (!input.pageId.trim()) throw new Error('Facebook Page ID is missing.');
  if (!input.pageToken.trim()) throw new Error('Facebook Page token is missing.');

  const { sealSecret } = await tokenCryptoModule();
  const { upsertConnection } = await connectionStoreModule();
  const sealed = sealSecret(input.pageToken);
  const now = input.now ?? new Date();
  const obtainedAt = now.toISOString();
  const userTokenExpiresAt = input.userTokenExpiresAt ?? null;

  await upsertConnection(store, {
    provider: 'facebook',
    status: 'connected',
    accountLabel: input.pageName,
    externalId: input.pageId,
    scopes: input.scopes,
    connectedBy: input.connectedBy ?? null,
    sealed,
    externalMeta: {
      page_id: input.pageId,
      page_name: input.pageName,
      token_type: 'page',
      token_expires_at: null,
      token_expiry_source: 'long_lived_user_token',
      obtained_at: obtainedAt,
      user_id: input.userId ?? null,
      user_token_expires_at: userTokenExpiresAt,
      permissions: input.permissions ?? [],
      tasks: input.tasks ?? [],
      connected_via: 'facebook_login_oauth',
    },
  });
}

export async function markFacebookConnectionError(
  store: SupabaseClient,
  code: string,
  message: string
): Promise<void> {
  const { markConnectionError } = await connectionStoreModule();
  await markConnectionError(store, 'facebook', code, message);
}

export async function disableFacebookPageConnection(store: SupabaseClient): Promise<void> {
  const { disableConnection } = await connectionStoreModule();
  await disableConnection(store, 'facebook');
}
