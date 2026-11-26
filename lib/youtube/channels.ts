import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from '@/lib/analytics/website/providers/oauth';
import { openSecret, sealSecret, type SealedSecret } from '@/lib/analytics/website/tokenCrypto';

import { YouTubeError } from './types';

assertServerOnly('lib/youtube/channels');

/**
 * Multi-account / multi-channel YouTube model.
 *
 * - `youtube_oauth_connections` is one Google OAuth grant.
 * - `youtube_channels` are all channels visible to that grant (including
 *   Brand Accounts and several channels on one Google account).
 * - `youtube_project_bindings` links a project to a channel. A channel may be
 *   linked to several projects.
 *
 * Refresh tokens never leave this module. List functions select explicit safe
 * columns; full rows are read only inside token/revocation helpers and are
 * mapped to safe objects before returning.
 */

export type YouTubeProjectSlug = 'art-engine' | 'unframed' | 'pierrot' | 'heart-and-angel';

export const YOUTUBE_PROJECTS: ReadonlyArray<{
  slug: YouTubeProjectSlug;
  name: string;
  defaultChannelHandle: string | null;
}> = [
  { slug: 'art-engine', name: 'Art Engine', defaultChannelHandle: '@merkurov-art' },
  { slug: 'unframed', name: 'UNFRAMED', defaultChannelHandle: '@unframed-tv' },
  { slug: 'pierrot', name: 'Pierrot', defaultChannelHandle: '@unframed-tv' },
  { slug: 'heart-and-angel', name: 'Heart & Angel', defaultChannelHandle: '@heartandangel' },
];

const PROJECT_SLUGS = new Set<string>(YOUTUBE_PROJECTS.map((project) => project.slug));

export function isYouTubeProjectSlug(value: unknown): value is YouTubeProjectSlug {
  return typeof value === 'string' && PROJECT_SLUGS.has(value);
}

export function youTubeProjectName(slug: string): string {
  return YOUTUBE_PROJECTS.find((project) => project.slug === slug)?.name ?? slug;
}

export type SafeOAuthConnection = {
  id: string;
  googleAccountId: string | null;
  googleAccountEmail: string;
  googleAccountName: string | null;
  status: string;
  scopes: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  hasRefreshToken: boolean;
};

export type YouTubeChannelRecord = {
  id: string;
  connectionId: string;
  channelId: string;
  title: string | null;
  handle: string | null;
  uploadsPlaylistId: string | null;
  thumbnailUrl: string | null;
  status: string;
  hiddenSubscriberCount: boolean;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  lastSyncedAt: string | null;
};

export type YouTubeProjectBinding = {
  id: string;
  projectSlug: string;
  channelRecordId: string;
  channelId: string;
  isActive: boolean;
  updatedAt: string | null;
};

export type ResolvedProjectChannel = {
  binding: YouTubeProjectBinding;
  channel: YouTubeChannelRecord;
  connection: SafeOAuthConnection;
};

const SAFE_CONNECTION_COLUMNS = [
  'id',
  'google_account_id',
  'google_account_email',
  'google_account_name',
  'status',
  'scopes',
  'connected_at',
  'last_checked_at',
  'last_error_code',
  'last_error_message',
  'token_ciphertext',
].join(',');

const CHANNEL_COLUMNS = [
  'id',
  'connection_id',
  'channel_id',
  'title',
  'handle',
  'uploads_playlist_id',
  'thumbnail_url',
  'status',
  'hidden_subscriber_count',
  'subscriber_count',
  'view_count',
  'video_count',
  'last_synced_at',
].join(',');

const BINDING_COLUMNS = 'id,project_slug,channel_record_id,channel_id,is_active,updated_at';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isMissingYouTubeSchema(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code ?? '')} ${String(
          (error as { message?: unknown }).message ?? ''
        )}`
      : String(error ?? '');
  return /42P01|PGRST205|PGRST204|does not exist|could not find the table/i.test(value);
}

export type YouTubeMultichannelSchemaStatus = {
  ready: boolean;
  reason: 'ready' | 'missing_tables' | 'database_error';
  missingTables: string[];
  code: string | null;
};

const YOUTUBE_MULTICHANNEL_TABLES = [
  'youtube_oauth_connections',
  'youtube_channels',
  'youtube_project_bindings',
] as const;

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code ? code.slice(0, 40) : null;
}

/**
 * Verifies that every additive multi-channel table exists *and* that the
 * server-side (service-role) client can select from it. A stale PostgREST
 * schema cache and a missing/unauthorised table both must report `ready:false`;
 * treating an arbitrary database error as "ready" hides the real fault from the
 * owner and makes the next API call fail with a generic 500.
 */
export async function checkYouTubeMultichannelSchema(
  store: SupabaseClient
): Promise<YouTubeMultichannelSchemaStatus> {
  const checks = await Promise.all(
    YOUTUBE_MULTICHANNEL_TABLES.map(async (table) => {
      try {
        const { error } = await store.from(table).select('id').limit(1);

        if (!error) {
          return { table, ok: true, missing: false, code: null as string | null };
        }

        return {
          table,
          ok: false,
          missing: isMissingYouTubeSchema(error),
          code: errorCode(error),
        };
      } catch (error) {
        return {
          table,
          ok: false,
          missing: false,
          code: errorCode(error),
        };
      }
    })
  );

  const failed = checks.filter((check) => !check.ok);

  if (failed.length === 0) {
    return { ready: true, reason: 'ready', missingTables: [], code: null };
  }

  const missingTables = failed.filter((check) => check.missing).map((check) => check.table);

  return {
    ready: false,
    reason: missingTables.length > 0 ? 'missing_tables' : 'database_error',
    missingTables,
    code: failed.find((check) => check.code)?.code ?? null,
  };
}

export async function youtubeMultichannelSchemaReady(store: SupabaseClient): Promise<boolean> {
  const status = await checkYouTubeMultichannelSchema(store);
  return status.ready;
}

export function mapSafeConnection(row: Record<string, unknown>): SafeOAuthConnection {
  return {
    id: text(row.id),
    googleAccountId: text(row.google_account_id) || null,
    googleAccountEmail: text(row.google_account_email),
    googleAccountName: text(row.google_account_name) || null,
    status: text(row.status) || 'error',
    scopes: Array.isArray(row.scopes)
      ? row.scopes.filter((value): value is string => typeof value === 'string')
      : [],
    connectedAt: text(row.connected_at) || null,
    lastCheckedAt: text(row.last_checked_at) || null,
    lastErrorCode: text(row.last_error_code) || null,
    lastErrorMessage: text(row.last_error_message) || null,
    hasRefreshToken: Boolean(row.token_ciphertext),
  };
}

export function mapChannel(row: Record<string, unknown>): YouTubeChannelRecord {
  return {
    id: text(row.id),
    connectionId: text(row.connection_id),
    channelId: text(row.channel_id),
    title: text(row.title) || null,
    handle: text(row.handle) || null,
    uploadsPlaylistId: text(row.uploads_playlist_id) || null,
    thumbnailUrl: text(row.thumbnail_url) || null,
    status: text(row.status) || 'active',
    hiddenSubscriberCount: row.hidden_subscriber_count === true,
    subscriberCount: numberOrNull(row.subscriber_count),
    viewCount: numberOrNull(row.view_count),
    videoCount: numberOrNull(row.video_count),
    lastSyncedAt: text(row.last_synced_at) || null,
  };
}

export function mapBinding(row: Record<string, unknown>): YouTubeProjectBinding {
  return {
    id: text(row.id),
    projectSlug: text(row.project_slug),
    channelRecordId: text(row.channel_record_id),
    channelId: text(row.channel_id),
    isActive: row.is_active === true,
    updatedAt: text(row.updated_at) || null,
  };
}

export async function listOAuthConnections(
  store: SupabaseClient,
  ownerId: string
): Promise<SafeOAuthConnection[]> {
  const { data, error } = await store
    .from('youtube_oauth_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('owner_id', ownerId)
    .order('connected_at', { ascending: false });

  if (error) {
    if (isMissingYouTubeSchema(error)) return [];
    throw new Error('youtube_oauth_connections: could not list connections.');
  }

  return (data ?? []).map((row) => mapSafeConnection(row as unknown as Record<string, unknown>));
}

export async function listYouTubeChannels(
  store: SupabaseClient,
  ownerId: string
): Promise<YouTubeChannelRecord[]> {
  const { data, error } = await store
    .from('youtube_channels')
    .select(CHANNEL_COLUMNS)
    .eq('owner_id', ownerId)
    .order('title', { ascending: true });

  if (error) {
    if (isMissingYouTubeSchema(error)) return [];
    throw new Error('youtube_channels: could not list channels.');
  }

  return (data ?? []).map((row) => mapChannel(row as unknown as Record<string, unknown>));
}

export async function listProjectBindings(
  store: SupabaseClient,
  ownerId: string
): Promise<YouTubeProjectBinding[]> {
  const { data, error } = await store
    .from('youtube_project_bindings')
    .select(BINDING_COLUMNS)
    .eq('owner_id', ownerId)
    .order('project_slug', { ascending: true });

  if (error) {
    if (isMissingYouTubeSchema(error)) return [];
    throw new Error('youtube_project_bindings: could not list bindings.');
  }

  return (data ?? []).map((row) => mapBinding(row as unknown as Record<string, unknown>));
}

export type SaveOAuthConnectionInput = {
  ownerId: string;
  googleAccountEmail: string;
  googleAccountId?: string | null;
  googleAccountName?: string | null;
  scopes: string[];
  sealed?: SealedSecret | null;
};

export async function saveOAuthConnection(
  store: SupabaseClient,
  input: SaveOAuthConnectionInput
): Promise<SafeOAuthConnection> {
  const email = input.googleAccountEmail.trim().toLowerCase();

  if (!email) {
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message: 'Google did not return the account identity. Reconnect and allow the email scope.',
      stage: 'oauth_identity',
    });
  }

  const { data: existing, error: readError } = await store
    .from('youtube_oauth_connections')
    .select('*')
    .eq('owner_id', input.ownerId)
    .eq('google_account_email', email)
    .maybeSingle();

  if (readError && !isMissingYouTubeSchema(readError)) {
    throw new Error('youtube_oauth_connections: could not read the existing connection.');
  }

  if (!input.sealed && !existing?.token_ciphertext) {
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message:
        'Google did not return a refresh token and no previous credential exists. Reconnect with consent.',
      stage: 'oauth_token',
    });
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    owner_id: input.ownerId,
    google_account_email: email,
    google_account_id: input.googleAccountId ?? null,
    google_account_name: input.googleAccountName ?? null,
    status: 'connected',
    scopes: Array.from(new Set(input.scopes)),
    last_checked_at: now,
    last_error_code: null,
    last_error_message: null,
    revoked_at: null,
    updated_at: now,
    ...(existing ? {} : { connected_at: now }),
  };

  if (input.sealed) {
    payload.token_ciphertext = input.sealed.ciphertext;
    payload.token_iv = input.sealed.iv;
    payload.token_tag = input.sealed.tag;
    payload.token_key_version = input.sealed.keyVersion;
  }

  const { data, error } = await store
    .from('youtube_oauth_connections')
    .upsert(payload, { onConflict: 'owner_id,google_account_email' })
    .select(SAFE_CONNECTION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error('youtube_oauth_connections: could not save the connection.');
  }

  return mapSafeConnection(data as unknown as Record<string, unknown>);
}

export type DiscoveredChannelInput = {
  channelId: string;
  title: string | null;
  handle: string | null;
  uploadsPlaylistId: string | null;
  thumbnailUrl: string | null;
  hiddenSubscriberCount: boolean;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
};

/**
 * Upserts every channel returned by the OAuth grant and marks channels that
 * disappeared from the grant as unavailable. A channel that moved to another
 * Google account is moved to the latest connection instead of duplicated.
 */
export async function replaceConnectionChannels(
  store: SupabaseClient,
  input: { connectionId: string; ownerId: string; channels: DiscoveredChannelInput[] }
): Promise<YouTubeChannelRecord[]> {
  const now = new Date().toISOString();
  const discovered = input.channels.filter((channel) => channel.channelId);

  if (discovered.length > 0) {
    const rows = discovered.map((channel) => ({
      connection_id: input.connectionId,
      owner_id: input.ownerId,
      channel_id: channel.channelId,
      title: channel.title,
      handle: channel.handle,
      uploads_playlist_id: channel.uploadsPlaylistId,
      thumbnail_url: channel.thumbnailUrl,
      status: 'active',
      hidden_subscriber_count: channel.hiddenSubscriberCount,
      subscriber_count: channel.subscriberCount,
      view_count: channel.viewCount,
      video_count: channel.videoCount,
      metadata: {},
      last_synced_at: now,
      updated_at: now,
    }));

    const { error } = await store
      .from('youtube_channels')
      .upsert(rows, { onConflict: 'owner_id,channel_id' });

    if (error) {
      if (isMissingYouTubeSchema(error)) {
        throw new YouTubeError({
          code: 'not_configured',
          message: 'The multi-channel YouTube migration has not been applied.',
          stage: 'schema',
        });
      }
      throw new Error('youtube_channels: could not save discovered channels.');
    }
  }

  const { data: existing, error: listError } = await store
    .from('youtube_channels')
    .select('id,channel_id')
    .eq('connection_id', input.connectionId)
    .eq('owner_id', input.ownerId);

  if (listError && !isMissingYouTubeSchema(listError)) {
    throw new Error('youtube_channels: could not reconcile discovered channels.');
  }

  const activeIds = new Set(discovered.map((channel) => channel.channelId));
  const staleIds = (existing ?? [])
    .filter((row) => !activeIds.has(text((row as unknown as Record<string, unknown>).channel_id)))
    .map((row) => text((row as unknown as Record<string, unknown>).id))
    .filter(Boolean);

  if (staleIds.length > 0) {
    await store
      .from('youtube_channels')
      .update({ status: 'unavailable', updated_at: now })
      .in('id', staleIds)
      .then(
        () => undefined,
        () => undefined
      );
  }

  return listYouTubeChannels(store, input.ownerId);
}

export async function bindChannelToProject(
  store: SupabaseClient,
  input: {
    ownerId: string;
    projectSlug: YouTubeProjectSlug;
    channelRecordId: string;
    createdBy?: string | null;
  }
): Promise<YouTubeProjectBinding> {
  const { data: channelRow, error: channelError } = await store
    .from('youtube_channels')
    .select(CHANNEL_COLUMNS)
    .eq('id', input.channelRecordId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();

  if (channelError && isMissingYouTubeSchema(channelError)) {
    throw new YouTubeError({
      code: 'not_configured',
      message: 'The multi-channel YouTube migration has not been applied.',
      stage: 'schema',
    });
  }

  if (!channelRow) {
    throw new YouTubeError({
      code: 'resource_not_found',
      message: 'The selected channel does not belong to this owner.',
      stage: 'binding',
    });
  }

  const channel = mapChannel(channelRow as unknown as Record<string, unknown>);
  const now = new Date().toISOString();

  // Update the existing active row in place when possible. This keeps the
  // project bound if a later insert/network step fails and avoids a window with
  // no active binding. The partial unique index still guarantees at most one
  // active channel per project; one channel can be active in several projects.
  const { data: existing } = await store
    .from('youtube_project_bindings')
    .select(BINDING_COLUMNS)
    .eq('owner_id', input.ownerId)
    .eq('project_slug', input.projectSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (existing && text((existing as unknown as Record<string, unknown>).id)) {
    const { data, error } = await store
      .from('youtube_project_bindings')
      .update({
        channel_record_id: channel.id,
        channel_id: channel.channelId,
        updated_at: now,
      })
      .eq('id', text((existing as unknown as Record<string, unknown>).id))
      .eq('owner_id', input.ownerId)
      .select(BINDING_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error('youtube_project_bindings: could not update the binding.');
    }

    return mapBinding(data as unknown as Record<string, unknown>);
  }

  const { data, error } = await store
    .from('youtube_project_bindings')
    .insert({
      owner_id: input.ownerId,
      project_slug: input.projectSlug,
      channel_record_id: channel.id,
      channel_id: channel.channelId,
      is_active: true,
      created_by: input.createdBy ?? input.ownerId,
      updated_at: now,
    })
    .select(BINDING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error('youtube_project_bindings: could not save the binding.');
  }

  return mapBinding(data as unknown as Record<string, unknown>);
}

export async function unbindProject(
  store: SupabaseClient,
  input: { ownerId: string; projectSlug: YouTubeProjectSlug }
): Promise<void> {
  const { error } = await store
    .from('youtube_project_bindings')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('owner_id', input.ownerId)
    .eq('project_slug', input.projectSlug)
    .eq('is_active', true);

  if (error && !isMissingYouTubeSchema(error)) {
    throw new Error('youtube_project_bindings: could not remove the binding.');
  }
}

export async function resolveProjectChannel(
  store: SupabaseClient,
  ownerId: string,
  projectSlug: string
): Promise<ResolvedProjectChannel | null> {
  const { data: bindingRow, error: bindingError } = await store
    .from('youtube_project_bindings')
    .select(BINDING_COLUMNS)
    .eq('owner_id', ownerId)
    .eq('project_slug', projectSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (bindingError || !bindingRow) return null;

  const binding = mapBinding(bindingRow as unknown as Record<string, unknown>);
  const { data: channelRow, error: channelError } = await store
    .from('youtube_channels')
    .select(CHANNEL_COLUMNS)
    .eq('id', binding.channelRecordId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (channelError || !channelRow) return null;

  const channel = mapChannel(channelRow as unknown as Record<string, unknown>);
  const { data: connectionRow, error: connectionError } = await store
    .from('youtube_oauth_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('id', channel.connectionId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (connectionError || !connectionRow) return null;

  return {
    binding,
    channel,
    connection: mapSafeConnection(connectionRow as unknown as Record<string, unknown>),
  };
}

type CachedAccessToken = {
  connectionId: string;
  fingerprint: string;
  accessToken: string;
  expiresAtMs: number;
};

const tokenCache = new Map<string, CachedAccessToken>();

export type ChannelAccessToken = {
  accessToken: string;
  channel: YouTubeChannelRecord;
  connection: SafeOAuthConnection;
};

/**
 * Refreshes and caches an access token for one channel connection. The refresh
 * token is decrypted only inside this function and is never returned.
 */
export async function loadChannelAccessToken(
  store: SupabaseClient,
  input: { ownerId: string; channelRecordId: string }
): Promise<ChannelAccessToken> {
  const { data: channelRow, error: channelError } = await store
    .from('youtube_channels')
    .select(CHANNEL_COLUMNS)
    .eq('id', input.channelRecordId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();

  if (channelError || !channelRow) {
    throw new YouTubeError({
      code: 'not_connected',
      message: 'The project has no accessible YouTube channel binding.',
      stage: 'connection',
    });
  }

  const channel = mapChannel(channelRow as unknown as Record<string, unknown>);
  const { data: connectionRow, error: connectionError } = await store
    .from('youtube_oauth_connections')
    .select('*')
    .eq('id', channel.connectionId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();

  if (connectionError || !connectionRow) {
    throw new YouTubeError({
      code: 'not_connected',
      message: 'The Google connection for this channel is missing.',
      stage: 'connection',
    });
  }

  const raw = connectionRow as unknown as Record<string, unknown>;
  const connection = mapSafeConnection(raw);

  if (connection.status !== 'connected') {
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message: 'The Google connection for this channel needs to be reconnected.',
      stage: 'connection',
    });
  }

  const fingerprint = `${text(raw.token_ciphertext)}:${text(raw.token_tag)}`;
  const cached = tokenCache.get(channel.connectionId);
  const now = Date.now();

  if (cached && cached.fingerprint === fingerprint && cached.expiresAtMs > now + 30_000) {
    return { accessToken: cached.accessToken, channel, connection };
  }

  const refreshToken = openSecret({
    ciphertext: text(raw.token_ciphertext) || null,
    iv: text(raw.token_iv) || null,
    tag: text(raw.token_tag) || null,
  });

  if (!refreshToken) {
    await markOAuthConnectionError(store, connection.id, 'needs_reauthorization', 'missing_token');
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message: 'The stored Google authorization cannot be decrypted. Reconnect the account.',
      stage: 'token',
    });
  }

  let token;
  try {
    token = await refreshGoogleAccessToken(refreshToken);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const needsReauth = code === 'invalid_grant' || code === 'needs_reauthorization';

    await markOAuthConnectionError(
      store,
      connection.id,
      needsReauth ? 'needs_reauthorization' : 'upstream_error',
      needsReauth ? 'refresh_rejected' : 'refresh_failed'
    );

    throw new YouTubeError({
      code: needsReauth ? 'needs_reauthorization' : 'upstream_error',
      message: needsReauth
        ? 'Google no longer accepts this authorization. Reconnect the Google account.'
        : 'Google could not refresh the YouTube access token.',
      stage: 'refresh',
    });
  }

  let effectiveFingerprint = fingerprint;

  if (token.refreshToken && token.refreshToken !== refreshToken) {
    const sealed = sealSecret(token.refreshToken);
    await store
      .from('youtube_oauth_connections')
      .update({
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        token_key_version: sealed.keyVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('owner_id', input.ownerId);
    effectiveFingerprint = `${sealed.ciphertext}:${sealed.tag}`;
  }

  const expiresAtMs = token.expiresAt ? Date.parse(token.expiresAt) : now + 3_000_000;

  tokenCache.set(channel.connectionId, {
    connectionId: channel.connectionId,
    fingerprint: effectiveFingerprint,
    accessToken: token.accessToken,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 3_000_000,
  });

  return { accessToken: token.accessToken, channel, connection };
}

export async function markOAuthConnectionError(
  store: SupabaseClient,
  connectionId: string,
  code: string,
  message: string
): Promise<void> {
  await store
    .from('youtube_oauth_connections')
    .update({
      status:
        code === 'needs_reauthorization' || code === 'invalid_grant'
          ? 'needs_reauthorization'
          : 'error',
      last_error_code: code.slice(0, 120),
      last_error_message: message.slice(0, 300),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .then(
      () => undefined,
      () => undefined
    );
}

/**
 * Revokes the Google grant (best effort), clears the sealed token and disables
 * every channel and project binding owned by that connection. Local state is
 * always cleared even when Google revocation is unavailable.
 */
export async function disconnectOAuthConnection(
  store: SupabaseClient,
  input: { ownerId: string; connectionId: string }
): Promise<{ revoked: boolean }> {
  const { data, error } = await store
    .from('youtube_oauth_connections')
    .select('*')
    .eq('id', input.connectionId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();

  if (error || !data) {
    throw new YouTubeError({
      code: 'resource_not_found',
      message: 'The Google connection was not found for this owner.',
      stage: 'disconnect',
    });
  }

  const raw = data as unknown as Record<string, unknown>;
  const refreshToken = openSecret({
    ciphertext: text(raw.token_ciphertext) || null,
    iv: text(raw.token_iv) || null,
    tag: text(raw.token_tag) || null,
  });

  let revoked = false;
  if (refreshToken) {
    try {
      await revokeGoogleToken(refreshToken);
      revoked = true;
    } catch {
      revoked = false;
    }
  }

  const now = new Date().toISOString();

  await store
    .from('youtube_oauth_connections')
    .update({
      status: 'revoked',
      token_ciphertext: null,
      token_iv: null,
      token_tag: null,
      token_key_version: null,
      revoked_at: now,
      updated_at: now,
    })
    .eq('id', input.connectionId)
    .eq('owner_id', input.ownerId);

  const { data: channels } = await store
    .from('youtube_channels')
    .select('id')
    .eq('connection_id', input.connectionId)
    .eq('owner_id', input.ownerId);

  const channelIds = (channels ?? [])
    .map((row) => text((row as unknown as Record<string, unknown>).id))
    .filter(Boolean);

  await store
    .from('youtube_channels')
    .update({ status: 'disconnected', updated_at: now })
    .eq('connection_id', input.connectionId)
    .eq('owner_id', input.ownerId);

  if (channelIds.length > 0) {
    await store
      .from('youtube_project_bindings')
      .update({ is_active: false, updated_at: now })
      .eq('owner_id', input.ownerId)
      .in('channel_record_id', channelIds);
  }

  tokenCache.delete(input.connectionId);
  return { revoked };
}

/** Test-only reset for the in-process access-token cache. */
export function clearChannelTokenCache(): void {
  tokenCache.clear();
}
