import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getStoredConnection,
  markConnectionError,
  upsertConnection,
  type StoredConnection,
} from '@/lib/analytics/website/store';
import type { SealedSecret } from '@/lib/analytics/website/tokenCrypto';

import { fetchChannelResource } from './api';
import { getYouTubeChannelId } from './config';
import { getYouTubeSharedProjects } from './projects';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/discovery');

export type YouTubeDiscoveryResult = {
  provider: 'youtube';
  status: 'connected' | 'not_granted' | 'error';
  code: string | null;
  message: string | null;
  channelId: string | null;
  channelTitle: string | null;
};

type DiscoveryInput = {
  accessToken: string;
  scopes: string[];
  sealed?: SealedSecret | null;
  connectedBy?: string | null;
  channelId?: string | null;
};

function existingMeta(existing: StoredConnection | null): Record<string, unknown> {
  return existing?.external_meta && typeof existing.external_meta === 'object'
    ? { ...existing.external_meta }
    : {};
}

function cleanMessage(error: unknown): string {
  if (error instanceof YouTubeError) return error.message;
  return 'YouTube channel discovery failed.';
}

export async function runYouTubeDiscovery(
  store: SupabaseClient,
  input: DiscoveryInput
): Promise<YouTubeDiscoveryResult> {
  const existing = await getStoredConnection(store, 'youtube').catch(() => null);
  const channelId = (input.channelId ?? getYouTubeChannelId())?.trim() || null;

  // Scope validation happens before any API call so the owner gets an explicit
  // "reconnect" state instead of an empty report.
  if (!input.scopes.includes('https://www.googleapis.com/auth/youtube.readonly')) {
    const message = 'Google did not grant the youtube.readonly scope.';
    if (existing) await markConnectionError(store, 'youtube', 'insufficient_permissions', message);

    return {
      provider: 'youtube',
      status: 'not_granted',
      code: 'insufficient_permissions',
      message,
      channelId: existing?.external_id ?? channelId,
      channelTitle: null,
    };
  }

  if (!input.scopes.includes('https://www.googleapis.com/auth/yt-analytics.readonly')) {
    const message = 'Google did not grant the yt-analytics.readonly scope.';
    if (existing) await markConnectionError(store, 'youtube', 'insufficient_permissions', message);

    return {
      provider: 'youtube',
      status: 'not_granted',
      code: 'insufficient_permissions',
      message,
      channelId: existing?.external_id ?? channelId,
      channelTitle: null,
    };
  }

  try {
    const channel = await fetchChannelResource({ accessToken: input.accessToken }, channelId);
    const checkedAt = new Date().toISOString();
    const projectSlugs = getYouTubeSharedProjects().map((project) => project.slug);

    await upsertConnection(store, {
      provider: 'youtube',
      status: 'connected',
      accountLabel: channel.title,
      externalId: channel.id,
      externalMeta: {
        ...existingMeta(existing),
        channel_id: channel.id,
        channel_title: channel.title,
        channel_handle: channel.handle,
        uploads_playlist_id: channel.uploadsPlaylistId,
        hidden_subscriber_count: channel.hiddenSubscriberCount,
        project_slugs: projectSlugs,
        data_api: 'youtube.v3',
        analytics_api: 'youtubeanalytics.v2',
        last_checked_at: checkedAt,
        discovery: {
          status: 'connected',
          checked_at: checkedAt,
          scopes: input.scopes,
        },
      },
      scopes: input.scopes,
      sealed: input.sealed ?? undefined,
      connectedBy: input.connectedBy ?? existing?.connected_by ?? null,
    });

    return {
      provider: 'youtube',
      status: 'connected',
      code: null,
      message: null,
      channelId: channel.id,
      channelTitle: channel.title,
    };
  } catch (error) {
    const code = error instanceof YouTubeError ? error.code : 'request_failed';
    const message = cleanMessage(error);
    const needsReauthorization =
      code === 'needs_reauthorization' || code === 'insufficient_permissions';
    const checkedAt = new Date().toISOString();

    // Keep the same encrypted grant and channel id for a later retry. A
    // transient channel/API error must not force a brand-new authorization.
    if (existing || input.sealed) {
      await upsertConnection(store, {
        provider: 'youtube',
        status: needsReauthorization ? 'needs_reauthorization' : 'error',
        accountLabel: existing?.account_label ?? null,
        externalId: existing?.external_id ?? channelId,
        externalMeta: {
          ...existingMeta(existing),
          channel_id: existing?.external_id ?? channelId,
          data_api: 'youtube.v3',
          analytics_api: 'youtubeanalytics.v2',
          last_checked_at: checkedAt,
          discovery: {
            status: needsReauthorization ? 'needs_reauthorization' : 'error',
            checked_at: checkedAt,
            code,
            message,
            scopes: input.scopes,
          },
        },
        scopes: input.scopes,
        sealed: input.sealed ?? undefined,
        connectedBy: input.connectedBy ?? existing?.connected_by ?? null,
      }).catch(() => undefined);
    }

    await markConnectionError(store, 'youtube', code, message).catch(() => undefined);

    return {
      provider: 'youtube',
      status: 'error',
      code,
      message,
      channelId: existing?.external_id ?? channelId,
      channelTitle: null,
    };
  }
}
