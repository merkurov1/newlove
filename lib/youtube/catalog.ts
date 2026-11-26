import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchChannelResource,
  fetchUploadsPage,
  fetchVideoDetail,
  fetchVideoDetails,
  type YouTubeVideoDetails,
} from './api';
import {
  loadChannelAccessToken,
  resolveProjectChannel,
  type SafeOAuthConnection,
  type YouTubeChannelRecord,
} from './channels';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/catalog');

/**
 * Read-only video catalog and metadata reader for one project binding.
 * Pagination uses YouTube's opaque page token; no unbounded crawl is created.
 */

export type CatalogVideoItem = {
  videoId: string;
  title: string;
  descriptionPreview: string;
  tags: string[];
  categoryId: string | null;
  defaultLanguage: string | null;
  privacyStatus: string | null;
  uploadStatus: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  url: string;
};

export type CatalogPage = {
  channel: {
    id: string;
    title: string | null;
    handle: string | null;
    thumbnailUrl: string | null;
  };
  connection: {
    googleAccountEmail: string;
    status: string;
  };
  items: CatalogVideoItem[];
  pageToken: string | null;
  nextPageToken: string | null;
  pageSize: number;
  totalResults: number | null;
};

function toCatalogItem(video: YouTubeVideoDetails): CatalogVideoItem {
  const description = video.description.replace(/\s+/g, ' ').trim();

  return {
    videoId: video.videoId,
    title: video.title,
    descriptionPreview: description.length > 280 ? `${description.slice(0, 280)}…` : description,
    tags: video.tags,
    categoryId: video.categoryId,
    defaultLanguage: video.defaultLanguage,
    privacyStatus: video.privacyStatus,
    uploadStatus: video.uploadStatus,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
  };
}

export async function getProjectCatalogPage(input: {
  store: SupabaseClient;
  ownerId: string;
  projectSlug: string;
  pageToken?: string | null;
  pageSize?: number;
}): Promise<CatalogPage> {
  const resolved = await resolveProjectChannel(input.store, input.ownerId, input.projectSlug);

  if (!resolved) {
    throw new YouTubeError({
      code: 'not_connected',
      message: 'Проект ещё не привязан к YouTube-каналу.',
      stage: 'catalog_binding',
    });
  }

  const token = await loadChannelAccessToken(input.store, {
    ownerId: input.ownerId,
    channelRecordId: resolved.channel.id,
  });

  let uploadsPlaylistId = token.channel.uploadsPlaylistId;
  let title = token.channel.title;
  let handle = token.channel.handle;

  if (!uploadsPlaylistId) {
    const resource = await fetchChannelResource(
      { accessToken: token.accessToken },
      token.channel.channelId
    );
    uploadsPlaylistId = resource.uploadsPlaylistId;
    title = resource.title;
    handle = resource.handle;
  }

  if (!uploadsPlaylistId) {
    throw new YouTubeError({
      code: 'resource_not_found',
      message: 'Канал не отдаёт uploads playlist, каталог недоступен.',
      stage: 'catalog_uploads',
    });
  }

  const page = await fetchUploadsPage(
    { accessToken: token.accessToken },
    uploadsPlaylistId,
    { pageToken: input.pageToken ?? null, maxResults: input.pageSize ?? 25 }
  );

  const details = await fetchVideoDetails({ accessToken: token.accessToken }, page.videoIds);

  return {
    channel: {
      id: token.channel.channelId,
      title,
      handle,
      thumbnailUrl: token.channel.thumbnailUrl,
    },
    connection: {
      googleAccountEmail: token.connection.googleAccountEmail,
      status: token.connection.status,
    },
    items: details.map(toCatalogItem),
    pageToken: input.pageToken ?? null,
    nextPageToken: page.nextPageToken,
    pageSize: page.videoIds.length,
    totalResults: page.totalResults,
  };
}

export async function getProjectVideo(
  input: {
    store: SupabaseClient;
    ownerId: string;
    projectSlug: string;
  } & { videoId: string }
): Promise<{
  video: YouTubeVideoDetails;
  channel: YouTubeChannelRecord;
  connection: SafeOAuthConnection;
}> {
  const resolved = await resolveProjectChannel(input.store, input.ownerId, input.projectSlug);

  if (!resolved) {
    throw new YouTubeError({
      code: 'not_connected',
      message: 'Проект ещё не привязан к YouTube-каналу.',
      stage: 'catalog_binding',
    });
  }

  const token = await loadChannelAccessToken(input.store, {
    ownerId: input.ownerId,
    channelRecordId: resolved.channel.id,
  });

  const video = await fetchVideoDetail({ accessToken: token.accessToken }, input.videoId);

  // Owner-only hardening: a bound project cannot read or edit a video that
  // belongs to a different channel even if its id is known.
  if (video.channelId && video.channelId !== token.channel.channelId) {
    throw new YouTubeError({
      code: 'resource_not_found',
      message: 'Видео не принадлежит каналу, привязанному к этому проекту.',
      stage: 'catalog_scope',
    });
  }

  return { video, channel: token.channel, connection: token.connection };
}

export async function resolveProjectAccessToken(input: {
  store: SupabaseClient;
  ownerId: string;
  projectSlug: string;
}): Promise<{
  accessToken: string;
  channel: YouTubeChannelRecord;
  connection: SafeOAuthConnection;
}> {
  const resolved = await resolveProjectChannel(input.store, input.ownerId, input.projectSlug);

  if (!resolved) {
    throw new YouTubeError({
      code: 'not_connected',
      message: 'Проект ещё не привязан к YouTube-каналу.',
      stage: 'catalog_binding',
    });
  }

  const token = await loadChannelAccessToken(input.store, {
    ownerId: input.ownerId,
    channelRecordId: resolved.channel.id,
  });

  return token;
}
