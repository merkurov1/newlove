import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getStoredConnection,
  markConnectionError,
  updateConnectionSecret,
  updateManagementConnectionSecret,
  type StoredConnection,
} from '@/lib/analytics/website/store';
import {
  refreshGoogleAccessToken,
  type GoogleTokenSet,
} from '@/lib/analytics/website/providers/oauth';
import { openSecret, sealSecret, type SealedSecret } from '@/lib/analytics/website/tokenCrypto';

import {
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_REQUIRED_SCOPES,
} from './config';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/connection');

export function missingScopes(
  scopes: string[] | null | undefined,
  required: readonly string[]
): string[] {
  const granted = new Set(scopes ?? []);
  return required.filter((scope) => !granted.has(scope));
}

export function missingYouTubeScopes(scopes: string[] | null | undefined): string[] {
  return missingScopes(scopes, YOUTUBE_REQUIRED_SCOPES);
}

export function hasYouTubeScopes(scopes: string[] | null | undefined): boolean {
  return missingYouTubeScopes(scopes).length === 0;
}

export function missingYouTubeManagementScopes(scopes: string[] | null | undefined): string[] {
  return missingScopes(scopes, YOUTUBE_MANAGEMENT_SCOPES);
}

export function hasYouTubeManagementScopes(scopes: string[] | null | undefined): boolean {
  return missingYouTubeManagementScopes(scopes).length === 0;
}

export type YouTubeAccessToken = {
  accessToken: string;
  connection: StoredConnection;
};

type SealedCredential = {
  ciphertext: string | null;
  iv: string | null;
  tag: string | null;
};

type TokenManagerDependencies = {
  readConnection: () => Promise<StoredConnection | null>;
  /** Selects the analytics or the separate management credential columns. */
  readCredential?: (connection: StoredConnection) => SealedCredential;
  refresh: (refreshToken: string) => Promise<GoogleTokenSet>;
  open: (sealed: {
    ciphertext: string | null;
    iv: string | null;
    tag: string | null;
  }) => string | null;
  seal: (plaintext: string) => SealedSecret;
  persistRotated: (sealed: SealedSecret) => Promise<void>;
  markError: (code: string, message: string) => Promise<void>;
  now?: () => number;
};

function defaultCredential(connection: StoredConnection): SealedCredential {
  return {
    ciphertext: connection.token_ciphertext,
    iv: connection.token_iv,
    tag: connection.token_tag,
  };
}

function managementCredential(connection: StoredConnection): SealedCredential {
  return {
    ciphertext: connection.management_token_ciphertext ?? null,
    iv: connection.management_token_iv ?? null,
    tag: connection.management_token_tag ?? null,
  };
}

/**
 * Creates the on-demand token path used by the owner tools. There is no cron
 * and no permanent worker: a token is refreshed only when a report needs it.
 * The refresh token never leaves this module.
 */
export function createYouTubeTokenManager(deps: TokenManagerDependencies) {
  const now = deps.now ?? Date.now;
  let cached: {
    connectionId: string;
    credentialFingerprint: string;
    accessToken: string;
    expiresAtMs: number;
  } | null = null;

  async function getAccessToken(
    requiredScopes: readonly string[] = YOUTUBE_REQUIRED_SCOPES
  ): Promise<YouTubeAccessToken> {
    const connection = await deps.readConnection();

    if (!connection) {
      throw new YouTubeError({
        code: 'not_connected',
        message: 'The shared YouTube channel is not connected yet.',
        stage: 'connection',
      });
    }

    if (connection.status === 'disabled') {
      throw new YouTubeError({
        code: 'not_connected',
        message: 'The shared YouTube channel connection is disabled.',
        stage: 'connection',
      });
    }

    const missing = missingScopes(connection.scopes, requiredScopes);

    if (missing.length > 0) {
      await deps.markError(
        'insufficient_permissions',
        'The stored Google grant is missing required YouTube scopes.'
      );

      throw new YouTubeError({
        code: 'insufficient_permissions',
        message: 'The stored Google grant is missing required YouTube scopes.',
        requiredScopes: missing,
        stage: 'scope_check',
      });
    }

    const credential = (deps.readCredential ?? defaultCredential)(connection);
    const fingerprint = [credential.ciphertext, credential.tag].filter(Boolean).join(':');
    const nowMs = now();

    if (
      cached &&
      cached.connectionId === connection.id &&
      cached.credentialFingerprint === fingerprint &&
      cached.expiresAtMs > nowMs + 30_000
    ) {
      return { accessToken: cached.accessToken, connection };
    }

    const refreshToken = deps.open({
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      tag: credential.tag,
    });

    if (!refreshToken) {
      throw new YouTubeError({
        code: 'needs_reauthorization',
        message: 'The stored YouTube authorization cannot be decrypted. Reconnect the channel.',
        stage: 'token',
      });
    }

    let token: GoogleTokenSet;

    try {
      token = await deps.refresh(refreshToken);
    } catch (error) {
      if (error instanceof YouTubeError) throw error;

      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || 'upstream_error')
          : 'upstream_error';
      const message =
        code === 'invalid_grant' || code === 'needs_reauthorization'
          ? 'Google no longer accepts the stored YouTube authorization. Reconnect the channel.'
          : 'Google could not refresh the YouTube access token.';

      await deps.markError(code, message);

      throw new YouTubeError({
        code:
          code === 'invalid_grant' || code === 'needs_reauthorization'
            ? 'needs_reauthorization'
            : 'upstream_error',
        message,
        stage: 'refresh',
      });
    }

    if (token.refreshToken && token.refreshToken !== refreshToken) {
      const sealed = deps.seal(token.refreshToken);
      await deps.persistRotated(sealed);
    }

    const expiresAtMs = token.expiresAt ? Date.parse(token.expiresAt) : nowMs + 3_000_000;
    cached = {
      connectionId: connection.id,
      credentialFingerprint: fingerprint,
      accessToken: token.accessToken,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : nowMs + 3_000_000,
    };

    return { accessToken: token.accessToken, connection };
  }

  return {
    getAccessToken,
    clearCache(): void {
      cached = null;
    },
  };
}

export type YouTubeConnectionState = {
  configured: boolean;
  connected: boolean;
  status: string;
  channelId: string | null;
  channelTitle: string | null;
  accountLabel: string | null;
  /** Google account identity from the incremental management grant, if any. */
  googleAccountEmail: string | null;
  scopes: string[];
  missingScopes: string[];
  managementAuthorized: boolean;
  managementScopes: string[];
  missingManagementScopes: string[];
  managementAuthorizedAt: string | null;
  projectSlugs: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

function metaText(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function loadYouTubeConnectionState(
  store: SupabaseClient
): Promise<YouTubeConnectionState> {
  const connection = await getStoredConnection(store, 'youtube').catch(() => null);
  const meta = connection?.external_meta ?? null;
  const metaManagementScopes = Array.isArray(meta?.management_scopes)
    ? meta.management_scopes.filter((value): value is string => typeof value === 'string')
    : [];
  // A management grant survives an analytics re-consent: its scopes are kept
  // in external_meta even when the read-only OAuth response omits them.
  const effectiveScopes = Array.from(
    new Set([...(connection?.scopes ?? []), ...metaManagementScopes])
  );
  const missingScopes = missingYouTubeScopes(effectiveScopes);
  const missingManagementScopes = missingYouTubeManagementScopes(effectiveScopes);
  const storedStatus = connection?.status ?? 'not_connected';
  const projectSlugs = Array.isArray(meta?.project_slugs)
    ? meta.project_slugs.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    configured: Boolean(connection),
    connected: storedStatus === 'connected' && missingScopes.length === 0,
    // Missing YouTube scopes always require a new consent, even if the row was
    // previously marked connected before the scopes were added.
    status: missingScopes.length > 0 ? 'needs_reauthorization' : storedStatus,
    channelId: connection?.external_id ?? metaText(meta, 'channel_id'),
    channelTitle: metaText(meta, 'channel_title'),
    accountLabel: connection?.account_label ?? null,
    googleAccountEmail: metaText(meta, 'google_account_email'),
    scopes: effectiveScopes,
    missingScopes,
    managementAuthorized:
      Boolean(connection?.management_token_ciphertext) && missingManagementScopes.length === 0,
    managementScopes: [...YOUTUBE_MANAGEMENT_SCOPES],
    missingManagementScopes,
    managementAuthorizedAt: metaText(meta, 'management_authorized_at'),
    projectSlugs,
    connectedAt: connection?.connected_at ?? null,
    lastCheckedAt: metaText(meta, 'last_checked_at'),
    lastErrorCode: connection?.last_error_code ?? null,
    lastErrorMessage: connection?.last_error_message ?? null,
  };
}

let productionStore: SupabaseClient | null = null;
let productionManager: ReturnType<typeof createYouTubeTokenManager> | null = null;
let productionManagementManager: ReturnType<typeof createYouTubeTokenManager> | null = null;

/**
 * Reuse one in-process access-token cache across report calls. Supabase clients
 * are request-scoped, so the dependency reads the latest client on each call.
 */
function ensureProductionManager(): ReturnType<typeof createYouTubeTokenManager> {
  if (!productionManager) {
    productionManager = createYouTubeTokenManager({
      readConnection: () => {
        if (!productionStore) {
          throw new YouTubeError({
            code: 'not_connected',
            message: 'The YouTube connection store is unavailable.',
            stage: 'connection',
          });
        }
        return getStoredConnection(productionStore, 'youtube');
      },
      refresh: refreshGoogleAccessToken,
      open: openSecret,
      seal: sealSecret,
      persistRotated: (sealed) => {
        if (!productionStore) return Promise.resolve();
        return updateConnectionSecret(productionStore, 'youtube', sealed);
      },
      markError: (code, message) => {
        if (!productionStore) return Promise.resolve();
        return markConnectionError(productionStore, 'youtube', code, message);
      },
    });
  }

  return productionManager;
}

export async function loadYouTubeAccessToken(store: SupabaseClient): Promise<YouTubeAccessToken> {
  productionStore = store;
  return ensureProductionManager().getAccessToken(YOUTUBE_REQUIRED_SCOPES);
}

/**
 * Token path for write operations. It reads the separate management grant so
 * connecting the UNFRAMED Google account cannot replace or break the analytics
 * credential. It requires the read scope plus both management scopes.
 */
export async function loadYouTubeManagementAccessToken(
  store: SupabaseClient
): Promise<YouTubeAccessToken> {
  productionStore = store;

  if (!productionManagementManager) {
    productionManagementManager = createYouTubeTokenManager({
      readConnection: () => {
        if (!productionStore) {
          throw new YouTubeError({
            code: 'not_connected',
            message: 'The YouTube connection store is unavailable.',
            stage: 'connection',
          });
        }
        return getStoredConnection(productionStore, 'youtube');
      },
      readCredential: managementCredential,
      refresh: refreshGoogleAccessToken,
      open: openSecret,
      seal: sealSecret,
      persistRotated: (sealed) => {
        if (!productionStore) return Promise.resolve();
        return updateManagementConnectionSecret(productionStore, 'youtube', sealed);
      },
      markError: (code, message) => {
        // A management token problem must not mark the analytics connection as
        // broken. It is reported in the management UI instead.
        void store;
        void code;
        void message;
        return Promise.resolve();
      },
    });
  }

  return productionManagementManager.getAccessToken([
    YOUTUBE_READONLY_SCOPE,
    ...YOUTUBE_MANAGEMENT_SCOPES,
  ]);
}
