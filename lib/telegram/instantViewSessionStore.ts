import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';

import type { SealedInstantViewSecret } from './instantViewSessionCrypto';

assertServerOnly('lib/telegram/instantViewSessionStore');

export const INSTANT_VIEW_SESSION_SETTING_KEY = 'telegram_instant_view_session';

export type InstantViewSessionStatus = 'disconnected' | 'pending' | 'connected' | 'error';

/**
 * Outcome of comparing the editor-issued `rhash` with the server-only
 * production secret.
 *
 * - `verified`              editor and server hashes are identical
 * - `mismatch`              editor and server hashes are both present but differ
 * - `missing_server_hash`   editor issued a hash but the server is not configured
 * - `unknown`               the editor hash could not be obtained; never report
 *                           this as a mismatch
 */
export type InstantViewHashStatus = 'verified' | 'mismatch' | 'missing_server_hash' | 'unknown';

/**
 * Whether the template detail/preview page could actually be inspected.
 * A successful listing read alone is not enough to prove anything about the
 * hash.
 */
export type InstantViewTemplateDetailStatus =
  | 'not_attempted'
  | 'loaded'
  | 'unavailable'
  | 'unauthenticated';

export type InstantViewTemplateState = {
  templatePresent?: boolean;
  rhashPresent?: boolean;
  hashMatchesEnv?: boolean | null;
  hashStatus?: InstantViewHashStatus | null;
  serverHashConfigured?: boolean;
  detailStatus?: InstantViewTemplateDetailStatus | null;
  detailChecked?: boolean;
  templateUrl?: string | null;
  checkedAt?: string | null;
};

export type InstantViewSessionState = {
  version: 1;
  status: InstantViewSessionStatus;
  cookie: SealedInstantViewSecret | null;
  pending: SealedInstantViewSecret | null;
  pendingExpiresAt: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  template: InstantViewTemplateState | null;
};

export type InstantViewSessionStore = {
  read(): Promise<InstantViewSessionState>;
  write(state: InstantViewSessionState, actorId?: string | null): Promise<void>;
};

export class InstantViewStorageError extends Error {
  readonly code = 'instant_view_storage_unavailable';

  constructor(message = 'Instant View session storage is unavailable.') {
    super(message);
    this.name = 'InstantViewStorageError';
  }
}

export function emptyInstantViewSessionState(): InstantViewSessionState {
  return {
    version: 1,
    status: 'disconnected',
    cookie: null,
    pending: null,
    pendingExpiresAt: null,
    connectedAt: null,
    lastVerifiedAt: null,
    lastErrorCode: null,
    template: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readSealed(value: unknown): SealedInstantViewSecret | null {
  if (!isRecord(value)) return null;

  const ciphertext = readString(value.ciphertext);
  const iv = readString(value.iv);
  const tag = readString(value.tag);
  const keyVersion = readString(value.keyVersion);

  if (!ciphertext || !iv || !tag || !keyVersion) return null;

  return { ciphertext, iv, tag, keyVersion };
}

function readStatus(value: unknown): InstantViewSessionStatus {
  return value === 'pending' || value === 'connected' || value === 'error' ? value : 'disconnected';
}

function readHashStatus(value: unknown): InstantViewHashStatus | null {
  return value === 'verified' ||
    value === 'mismatch' ||
    value === 'missing_server_hash' ||
    value === 'unknown'
    ? value
    : null;
}

function readDetailStatus(value: unknown): InstantViewTemplateDetailStatus | null {
  return value === 'not_attempted' ||
    value === 'loaded' ||
    value === 'unavailable' ||
    value === 'unauthenticated'
    ? value
    : null;
}

function normalizeState(value: unknown): InstantViewSessionState {
  if (!isRecord(value)) return emptyInstantViewSessionState();

  const template = isRecord(value.template)
    ? {
        templatePresent:
          typeof value.template.templatePresent === 'boolean'
            ? value.template.templatePresent
            : undefined,
        rhashPresent:
          typeof value.template.rhashPresent === 'boolean'
            ? value.template.rhashPresent
            : undefined,
        hashMatchesEnv:
          typeof value.template.hashMatchesEnv === 'boolean'
            ? value.template.hashMatchesEnv
            : value.template.hashMatchesEnv === null
              ? null
              : undefined,
        hashStatus: readHashStatus(value.template.hashStatus),
        serverHashConfigured:
          typeof value.template.serverHashConfigured === 'boolean'
            ? value.template.serverHashConfigured
            : undefined,
        detailStatus: readDetailStatus(value.template.detailStatus),
        detailChecked:
          typeof value.template.detailChecked === 'boolean'
            ? value.template.detailChecked
            : undefined,
        templateUrl: readString(value.template.templateUrl),
        checkedAt: readString(value.template.checkedAt),
      }
    : null;

  return {
    version: 1,
    status: readStatus(value.status),
    cookie: readSealed(value.cookie),
    pending: readSealed(value.pending),
    pendingExpiresAt: readString(value.pendingExpiresAt),
    connectedAt: readString(value.connectedAt),
    lastVerifiedAt: readString(value.lastVerifiedAt),
    lastErrorCode: readString(value.lastErrorCode),
    template,
  };
}

/**
 * Supabase-backed store for the encrypted editor session.
 *
 * It deliberately reuses the existing private `ops_runtime_settings` table
 * (RLS enabled, service-role only, no anon/authenticated grants) instead of
 * adding a schema migration for one singleton document. The stored JSON value
 * contains ciphertext only; the cookie and pending temp_session never appear in
 * plaintext in Postgres.
 */
export function createSupabaseInstantViewSessionStore(): InstantViewSessionStore {
  return {
    async read() {
      try {
        const supabase = getServerSupabaseClient({ useServiceRole: true });
        const { data, error } = await supabase
          .from('ops_runtime_settings')
          .select('value')
          .eq('key', INSTANT_VIEW_SESSION_SETTING_KEY)
          .maybeSingle();

        if (error) {
          throw new InstantViewStorageError('Instant View session could not be read.');
        }

        return normalizeState(data?.value);
      } catch (error) {
        if (error instanceof InstantViewStorageError) throw error;

        throw new InstantViewStorageError('Instant View session storage is not configured.');
      }
    },

    async write(state, actorId) {
      try {
        const supabase = getServerSupabaseClient({ useServiceRole: true });
        const { error } = await supabase.from('ops_runtime_settings').upsert(
          {
            key: INSTANT_VIEW_SESSION_SETTING_KEY,
            value: normalizeState(state),
            updated_by: actorId ? String(actorId).slice(0, 200) : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

        if (error) {
          throw new InstantViewStorageError('Instant View session could not be saved.');
        }
      } catch (error) {
        if (error instanceof InstantViewStorageError) throw error;

        throw new InstantViewStorageError('Instant View session storage is not configured.');
      }
    },
  };
}
