import { assertServerOnly } from '@/lib/serverOnly';

import {
  assertVideoId,
  classifyYouTubeFailure,
  fetchChannelResource,
  fetchUploadVideoIds,
  fetchVideoDetail,
  fetchVideoResources,
  mergeEditableVideoSnippet,
  type EditableVideoMetadata,
  type FetchLike,
  type YouTubeVideoDetails,
} from './api';
import {
  YOUTUBE_DATA_API,
  YOUTUBE_MANAGEMENT_SCOPE_BY_CAPABILITY,
  YOUTUBE_UPLOAD_API,
} from './config';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/management');

/**
 * Server-only YouTube Data API management operations.
 *
 * Design rules:
 * - every write names the capability scope it needs;
 * - comments/captions use youtube.force-ssl, everything else uses
 *   youtube.upload (least privilege rather than the broad `youtube` scope);
 * - destructive actions are catalogued and require an owner confirmation
 *   token at the route layer;
 * - no function logs or returns access/refresh tokens.
 */

export type YouTubeManagementCapability = keyof typeof YOUTUBE_MANAGEMENT_SCOPE_BY_CAPABILITY;

export type YouTubeManagementActionDefinition = {
  capability: YouTubeManagementCapability;
  write: boolean;
  /** Externally visible or irreversible. Always confirmation-gated. */
  destructive: boolean;
  external: boolean;
};

export const YOUTUBE_MANAGEMENT_ACTIONS = {
  'channel.videos.list': {
    capability: 'channel',
    write: false,
    destructive: false,
    external: false,
  },
  'video.upload': { capability: 'videos', write: true, destructive: false, external: true },
  'video.update': { capability: 'videos', write: true, destructive: false, external: true },
  'video.metadata.update': {
    capability: 'videos',
    write: true,
    destructive: false,
    external: true,
  },
  'video.thumbnail': { capability: 'thumbnail', write: true, destructive: false, external: true },
  'playlist.list': { capability: 'playlists', write: false, destructive: false, external: false },
  'playlist.create': { capability: 'playlists', write: true, destructive: false, external: true },
  'playlist.update': { capability: 'playlists', write: true, destructive: false, external: true },
  'playlist.delete': { capability: 'playlists', write: true, destructive: true, external: true },
  'playlist.add': { capability: 'playlists', write: true, destructive: false, external: true },
  'playlist.remove': { capability: 'playlists', write: true, destructive: true, external: true },
  'comment.list': { capability: 'comments', write: false, destructive: false, external: false },
  'comment.reply': { capability: 'comments', write: true, destructive: false, external: true },
  'comment.moderate': { capability: 'comments', write: true, destructive: true, external: true },
  'comment.delete': { capability: 'comments', write: true, destructive: true, external: true },
  'caption.list': { capability: 'captions', write: false, destructive: false, external: false },
  'caption.upload': { capability: 'captions', write: true, destructive: false, external: true },
  'caption.update': { capability: 'captions', write: true, destructive: false, external: true },
  'caption.delete': { capability: 'captions', write: true, destructive: true, external: true },
} as const satisfies Record<string, YouTubeManagementActionDefinition>;

export type YouTubeManagementAction = keyof typeof YOUTUBE_MANAGEMENT_ACTIONS;

export function isYouTubeManagementAction(value: unknown): value is YouTubeManagementAction {
  return typeof value === 'string' && value in YOUTUBE_MANAGEMENT_ACTIONS;
}

export function requiredScopeForAction(action: YouTubeManagementAction): string {
  return YOUTUBE_MANAGEMENT_SCOPE_BY_CAPABILITY[YOUTUBE_MANAGEMENT_ACTIONS[action].capability];
}

export function actionRequiresConfirmation(action: YouTubeManagementAction): boolean {
  return YOUTUBE_MANAGEMENT_ACTIONS[action].write;
}

export function assertManagementScope(action: YouTubeManagementAction, scopes: string[]): void {
  const required = requiredScopeForAction(action);

  if (!scopes.includes(required)) {
    throw new YouTubeError({
      code: 'insufficient_permissions',
      message: `The YouTube management grant is missing the ${required.split('/').pop()} scope. Reconnect management access.`,
      requiredScopes: [required],
      stage: 'management_scope_check',
    });
  }
}

export type YouTubeManagementAuth = {
  accessToken: string;
  fetchImpl?: FetchLike;
};

type RequestOptions = {
  timeoutMs?: number;
  retries?: number;
  stage: string;
};

const PRIVACY_VALUES = new Set(['public', 'unlisted', 'private']);
const COMMENT_MODERATION_VALUES = new Set(['published', 'heldForReview', 'rejected']);

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} is required.`,
      stage: 'management_validation',
    });
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} is too long.`,
      stage: 'management_validation',
    });
  }

  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, label, maxLength);
}

function privacy(value: unknown): 'public' | 'unlisted' | 'private' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !PRIVACY_VALUES.has(value)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'privacyStatus must be public, unlisted or private.',
      stage: 'management_validation',
    });
  }
  return value as 'public' | 'unlisted' | 'private';
}

function tags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'tags must be an array of strings.',
      stage: 'management_validation',
    });
  }
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).slice(0, 50);
}

function assertBytes(value: unknown, label: string, maxBytes: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} is required.`,
      stage: 'management_validation',
    });
  }
  if (value.byteLength > maxBytes) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} exceeds the allowed size.`,
      stage: 'management_validation',
    });
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function managementFetch(
  auth: YouTubeManagementAuth,
  url: string,
  init: RequestInit,
  options: RequestOptions
): Promise<Response> {
  if (!auth.accessToken) {
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message: 'YouTube management requires an owner OAuth connection.',
      stage: 'management_auth',
    });
  }

  const fetchImpl = auth.fetchImpl ?? fetch;
  const retries = Math.max(0, options.retries ?? 0);
  let lastError: YouTubeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) return response;

      const body = await response.text().catch(() => null);
      const failure = classifyYouTubeFailure(response.status, body);
      lastError = new YouTubeError({
        ...failure,
        message:
          failure.code === 'insufficient_permissions'
            ? 'The Google account cannot perform this YouTube management action. Reconnect management access for the channel owner account.'
            : failure.message,
        status: response.status,
        stage: options.stage,
      });

      if (!failure.retryable || attempt === retries) throw lastError;
      await sleep(Math.min(500 * 2 ** attempt, 5_000));
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof YouTubeError) {
        if (!error.retryable || attempt === retries) throw error;
        await sleep(Math.min(500 * 2 ** attempt, 5_000));
        continue;
      }

      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = new YouTubeError({
        code: aborted ? 'timeout' : 'network_error',
        message: aborted ? 'YouTube did not respond in time.' : 'YouTube could not be reached.',
        retryable: true,
        stage: options.stage,
      });
      if (attempt === retries) throw lastError;
      await sleep(Math.min(500 * 2 ** attempt, 5_000));
    }
  }

  throw (
    lastError ??
    new YouTubeError({
      code: 'request_failed',
      message: 'The YouTube management request failed.',
      stage: options.stage,
    })
  );
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export type YouTubeVideoSummary = {
  videoId: string;
  title: string | null;
  publishedAt: string | null;
  privacyStatus: string | null;
  durationSeconds: number | null;
};

function videoSummary(item: {
  id?: string;
  snippet?: { title?: string; publishedAt?: string };
  status?: { privacyStatus?: string };
}): YouTubeVideoSummary | null {
  if (!item.id) return null;
  return {
    videoId: item.id,
    title: item.snippet?.title ?? null,
    publishedAt: item.snippet?.publishedAt ?? null,
    privacyStatus: item.status?.privacyStatus ?? null,
    durationSeconds: null,
  };
}

export async function listChannelVideos(
  auth: YouTubeManagementAuth,
  input: { limit?: number } = {}
): Promise<{ channelId: string; videos: YouTubeVideoSummary[] }> {
  const channel = await fetchChannelResource({ accessToken: auth.accessToken }, null, {
    fetchImpl: auth.fetchImpl,
  });

  if (!channel.uploadsPlaylistId) {
    return { channelId: channel.id, videos: [] };
  }

  const uploads = await fetchUploadVideoIds(
    { accessToken: auth.accessToken },
    channel.uploadsPlaylistId,
    { fetchImpl: auth.fetchImpl }
  );
  const ids = uploads.videoIds.slice(0, Math.max(1, Math.min(input.limit ?? 25, 50)));
  const videos = await fetchVideoResources({ accessToken: auth.accessToken }, ids, {
    fetchImpl: auth.fetchImpl,
  });

  return {
    channelId: channel.id,
    videos: videos.map((video) => ({
      videoId: video.id,
      title: video.title,
      publishedAt: video.publishedAt,
      privacyStatus: null,
      durationSeconds: video.durationSeconds,
    })),
  };
}

export type UploadVideoInput = {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  publishAt?: string;
  selfDeclaredMadeForKids?: boolean;
  mimeType?: string;
  bytes: Uint8Array;
};

export type UploadedVideo = {
  videoId: string;
  title: string | null;
  privacyStatus: string | null;
  uploadStatus: string | null;
};

/**
 * Resumable upload. The metadata is sent first, then the bytes are uploaded to
 * the URL Google returns. Uploads are never retried automatically: retrying a
 * non-idempotent insert could publish a duplicate video.
 */
export async function uploadVideo(
  auth: YouTubeManagementAuth,
  input: UploadVideoInput
): Promise<UploadedVideo> {
  const bytes = assertBytes(input.bytes, 'Video file', 100 * 1024 * 1024);
  const title = text(input.title, 'Title', 100);
  const description = optionalText(input.description, 'Description', 5_000) ?? '';
  const status = privacy(input.privacyStatus) ?? 'private';
  const madeForKids = input.selfDeclaredMadeForKids === true;

  const metadata = {
    snippet: {
      title,
      description,
      ...(tags(input.tags)?.length ? { tags: tags(input.tags) } : {}),
      ...(input.categoryId ? { categoryId: text(input.categoryId, 'Category', 10) } : {}),
    },
    status: {
      privacyStatus: status,
      selfDeclaredMadeForKids: madeForKids,
      ...(input.publishAt ? { publishAt: input.publishAt } : {}),
    },
  };

  const start = await managementFetch(
    auth,
    `${YOUTUBE_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.mimeType || 'application/octet-stream',
        'X-Upload-Content-Length': String(bytes.byteLength),
      },
      body: JSON.stringify(metadata),
    },
    { stage: 'management.videos.insert.start', timeoutMs: 30_000 }
  );

  const location = start.headers.get('location');

  if (!location) {
    throw new YouTubeError({
      code: 'upstream_error',
      message: 'YouTube did not return an upload URL.',
      stage: 'management.videos.insert.location',
    });
  }

  const upload = await managementFetch(
    auth,
    location,
    {
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType || 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    },
    { stage: 'management.videos.insert.bytes', timeoutMs: 120_000 }
  );

  const raw = await json<{
    id?: string;
    snippet?: { title?: string };
    status?: { privacyStatus?: string; uploadStatus?: string };
  }>(upload);

  if (!raw.id) {
    throw new YouTubeError({
      code: 'upstream_error',
      message: 'YouTube did not return the uploaded video id.',
      stage: 'management.videos.insert',
    });
  }

  return {
    videoId: raw.id,
    title: raw.snippet?.title ?? title,
    privacyStatus: raw.status?.privacyStatus ?? status,
    uploadStatus: raw.status?.uploadStatus ?? null,
  };
}

export type UpdateVideoInput = {
  videoId: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  publishAt?: string;
  selfDeclaredMadeForKids?: boolean;
};

export async function updateVideoMetadata(
  auth: YouTubeManagementAuth,
  input: UpdateVideoInput
): Promise<YouTubeVideoSummary> {
  const videoId = assertVideoId(input.videoId);
  const changesSnippet =
    input.title !== undefined ||
    input.description !== undefined ||
    input.tags !== undefined ||
    input.categoryId !== undefined;
  const snippet: Record<string, unknown> = {};

  if (changesSnippet) {
    // `videos.update?part=snippet` replaces the whole snippet. Read the current
    // resource first and re-send every writable field the caller did not edit.
    const current = await fetchVideoDetail(auth, videoId, { fetchImpl: auth.fetchImpl });
    const merged = mergeEditableVideoSnippet(current, {
      title: input.title !== undefined ? text(input.title, 'Title', 100) : undefined,
      description:
        input.description !== undefined
          ? optionalText(input.description, 'Description', 5_000) ?? ''
          : undefined,
      tags: input.tags !== undefined ? tags(input.tags) ?? [] : undefined,
    });
    Object.assign(snippet, merged.snippet);

    if (input.categoryId !== undefined) {
      snippet.categoryId = text(input.categoryId, 'Category', 10);
    }
  }

  const status: Record<string, unknown> = {
    ...(input.privacyStatus !== undefined ? { privacyStatus: privacy(input.privacyStatus) } : {}),
    ...(input.publishAt !== undefined ? { publishAt: input.publishAt } : {}),
    ...(input.selfDeclaredMadeForKids !== undefined
      ? { selfDeclaredMadeForKids: input.selfDeclaredMadeForKids === true }
      : {}),
  };

  if (Object.keys(snippet).length === 0 && Object.keys(status).length === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'At least one video metadata field must be provided.',
      stage: 'management_validation',
    });
  }

  const part = [
    Object.keys(snippet).length ? 'snippet' : null,
    Object.keys(status).length ? 'status' : null,
  ]
    .filter(Boolean)
    .join(',');

  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/videos?part=${part}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        id: videoId,
        ...(Object.keys(snippet).length ? { snippet } : {}),
        ...(Object.keys(status).length ? { status } : {}),
      }),
    },
    { stage: 'management.videos.update', retries: 1 }
  );

  const raw = await json<{
    id?: string;
    snippet?: { title?: string; publishedAt?: string };
    status?: { privacyStatus?: string };
  }>(response);

  return (
    videoSummary(raw) ?? {
      videoId,
      title: input.title ?? null,
      publishedAt: null,
      privacyStatus: input.privacyStatus ?? null,
      durationSeconds: null,
    }
  );
}

export type EditableVideoUpdateResult = {
  videoId: string;
  changedFields: Array<'title' | 'description' | 'tags'>;
  preservedFields: string[];
  before: EditableVideoMetadata;
  after: EditableVideoMetadata;
  privacyStatus: string | null;
  defaultLanguage: string | null;
  categoryId: string | null;
};

function editableText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} must be a string.`,
      stage: 'management_validation',
    });
  }

  if (value.length > maxLength) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} is too long.`,
      stage: 'management_validation',
    });
  }

  return value;
}

/**
 * Owner-confirmed metadata edit for an already published video.
 *
 * YouTube's `videos.update` replaces the requested part. This function reads
 * the current video first and re-sends every writable snippet field the owner
 * cannot edit here, so categoryId, defaultLanguage, defaultAudioLanguage,
 * localized metadata and existing tags are not silently cleared. `status` is
 * never sent, which leaves privacy/visibility untouched.
 */
export async function updateEditableVideoMetadata(
  auth: YouTubeManagementAuth,
  input: {
    videoId: string;
    title?: string;
    description?: string;
    tags?: string[];
  }
): Promise<EditableVideoUpdateResult> {
  const videoId = assertVideoId(input.videoId);

  const changes: Partial<EditableVideoMetadata> = {};

  if (input.title !== undefined) {
    const title = editableText(input.title, 'Title', 100);
    if (!title.trim()) {
      throw new YouTubeError({
        code: 'invalid_request',
        message: 'Title cannot be empty.',
        stage: 'management_validation',
      });
    }
    changes.title = title;
  }

  if (input.description !== undefined) {
    changes.description = editableText(input.description, 'Description', 5_000);
  }

  if (input.tags !== undefined) {
    changes.tags = tags(input.tags) ?? [];
  }

  if (Object.keys(changes).length === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'Choose at least one metadata field to edit.',
      stage: 'management_validation',
    });
  }

  const current: YouTubeVideoDetails = await fetchVideoDetail(auth, videoId, {
    fetchImpl: auth.fetchImpl,
  });
  const merged = mergeEditableVideoSnippet(current, changes);

  if (merged.changedFields.length === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'The proposed metadata is identical to the current video.',
      stage: 'management_validation',
    });
  }

  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/videos?part=snippet`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ id: videoId, snippet: merged.snippet }),
    },
    { stage: 'management.videos.update.metadata', retries: 1 }
  );

  const raw = await json<{
    id?: string;
    snippet?: { defaultLanguage?: string; categoryId?: string };
    status?: { privacyStatus?: string };
  }>(response);

  return {
    videoId: raw.id ?? videoId,
    changedFields: merged.changedFields,
    preservedFields: merged.preservedFields,
    before: merged.before,
    after: merged.after,
    privacyStatus: raw.status?.privacyStatus ?? current.privacyStatus,
    defaultLanguage: raw.snippet?.defaultLanguage ?? current.defaultLanguage,
    categoryId: raw.snippet?.categoryId ?? current.categoryId,
  };
}

export async function setVideoThumbnail(
  auth: YouTubeManagementAuth,
  input: { videoId: string; mimeType: string; bytes: Uint8Array }
): Promise<{ videoId: string; thumbnailUrl: string | null }> {
  const videoId = assertVideoId(input.videoId);
  const bytes = assertBytes(input.bytes, 'Thumbnail', 2 * 1024 * 1024);

  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': input.mimeType || 'image/jpeg' },
      body: bytes as unknown as BodyInit,
    },
    { stage: 'management.thumbnails.set', retries: 1 }
  );

  const raw = await json<{ items?: Array<{ default?: string }> }>(response);
  return { videoId, thumbnailUrl: raw.items?.[0]?.default ?? null };
}

export type YouTubePlaylistSummary = {
  playlistId: string;
  title: string | null;
  privacyStatus: string | null;
  itemCount: number | null;
};

function playlistSummary(item: {
  id?: string;
  snippet?: { title?: string };
  status?: { privacyStatus?: string };
  contentDetails?: { itemCount?: number };
}): YouTubePlaylistSummary | null {
  if (!item.id) return null;
  return {
    playlistId: item.id,
    title: item.snippet?.title ?? null,
    privacyStatus: item.status?.privacyStatus ?? null,
    itemCount: item.contentDetails?.itemCount ?? null,
  };
}

export async function listPlaylists(
  auth: YouTubeManagementAuth
): Promise<YouTubePlaylistSummary[]> {
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlists?part=snippet,status,contentDetails&mine=true&maxResults=50`,
    { method: 'GET' },
    { stage: 'management.playlists.list', retries: 1 }
  );
  const raw = await json<{
    items?: Array<{
      id?: string;
      snippet?: { title?: string };
      status?: { privacyStatus?: string };
      contentDetails?: { itemCount?: number };
    }>;
  }>(response);

  return (raw.items ?? [])
    .map(playlistSummary)
    .filter((item): item is YouTubePlaylistSummary => Boolean(item));
}

export async function createPlaylist(
  auth: YouTubeManagementAuth,
  input: { title: string; description?: string; privacyStatus?: 'public' | 'unlisted' | 'private' }
): Promise<YouTubePlaylistSummary> {
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlists?part=snippet,status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        snippet: {
          title: text(input.title, 'Playlist title', 150),
          description: optionalText(input.description, 'Description', 5_000) ?? '',
        },
        status: { privacyStatus: privacy(input.privacyStatus) ?? 'private' },
      }),
    },
    { stage: 'management.playlists.insert' }
  );
  const raw = await json<{
    id?: string;
    snippet?: { title?: string };
    status?: { privacyStatus?: string };
  }>(response);

  return (
    playlistSummary(raw) ?? {
      playlistId: '',
      title: input.title,
      privacyStatus: input.privacyStatus ?? 'private',
      itemCount: 0,
    }
  );
}

export async function updatePlaylist(
  auth: YouTubeManagementAuth,
  input: {
    playlistId: string;
    title: string;
    description?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
  }
): Promise<YouTubePlaylistSummary> {
  const playlistId = text(input.playlistId, 'Playlist id', 100);
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlists?part=snippet,status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        id: playlistId,
        snippet: {
          title: text(input.title, 'Playlist title', 150),
          description: optionalText(input.description, 'Description', 5_000) ?? '',
        },
        ...(input.privacyStatus !== undefined
          ? { status: { privacyStatus: privacy(input.privacyStatus) } }
          : {}),
      }),
    },
    { stage: 'management.playlists.update', retries: 1 }
  );
  const raw = await json<{
    id?: string;
    snippet?: { title?: string };
    status?: { privacyStatus?: string };
  }>(response);

  return (
    playlistSummary(raw) ?? {
      playlistId,
      title: input.title,
      privacyStatus: input.privacyStatus ?? null,
      itemCount: null,
    }
  );
}

export async function deletePlaylist(
  auth: YouTubeManagementAuth,
  input: { playlistId: string }
): Promise<{ playlistId: string; deleted: true }> {
  const playlistId = text(input.playlistId, 'Playlist id', 100);
  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlists?id=${encodeURIComponent(playlistId)}`,
    { method: 'DELETE' },
    { stage: 'management.playlists.delete', retries: 1 }
  );
  return { playlistId, deleted: true };
}

export async function addVideoToPlaylist(
  auth: YouTubeManagementAuth,
  input: { playlistId: string; videoId: string; position?: number }
): Promise<{ playlistItemId: string | null; playlistId: string; videoId: string }> {
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlistItems?part=snippet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        snippet: {
          playlistId: text(input.playlistId, 'Playlist id', 100),
          ...(typeof input.position === 'number' ? { position: input.position } : {}),
          resourceId: {
            kind: 'youtube#video',
            videoId: assertVideoId(input.videoId),
          },
        },
      }),
    },
    { stage: 'management.playlistItems.insert' }
  );
  const raw = await json<{ id?: string }>(response);

  return {
    playlistItemId: raw.id ?? null,
    playlistId: input.playlistId,
    videoId: input.videoId,
  };
}

export async function removeVideoFromPlaylist(
  auth: YouTubeManagementAuth,
  input: { playlistItemId: string }
): Promise<{ playlistItemId: string; removed: true }> {
  const playlistItemId = text(input.playlistItemId, 'Playlist item id', 200);
  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/playlistItems?id=${encodeURIComponent(playlistItemId)}`,
    { method: 'DELETE' },
    { stage: 'management.playlistItems.delete', retries: 1 }
  );
  return { playlistItemId, removed: true };
}

export type YouTubeCommentSummary = {
  commentId: string;
  threadId: string | null;
  authorDisplayName: string | null;
  text: string | null;
  likeCount: number | null;
  publishedAt: string | null;
  moderationStatus: string | null;
};

export async function listComments(
  auth: YouTubeManagementAuth,
  input: { videoId?: string; channelId?: string; maxResults?: number }
): Promise<YouTubeCommentSummary[]> {
  const query = new URLSearchParams({
    part: 'snippet',
    maxResults: String(Math.max(1, Math.min(input.maxResults ?? 25, 100))),
    order: 'time',
    textFormat: 'plainText',
  });

  if (input.videoId) query.set('videoId', assertVideoId(input.videoId));
  else if (input.channelId) query.set('allThreadsRelatedToChannelId', input.channelId);
  else {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'A video id or channel id is required to list comments.',
      stage: 'management_validation',
    });
  }

  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/commentThreads?${query.toString()}`,
    { method: 'GET' },
    { stage: 'management.commentThreads.list', retries: 1 }
  );
  const raw = await json<{
    items?: Array<{
      id?: string;
      snippet?: {
        topLevelComment?: {
          id?: string;
          snippet?: {
            authorDisplayName?: string;
            textDisplay?: string;
            textOriginal?: string;
            likeCount?: number;
            publishedAt?: string;
            moderationStatus?: string;
          };
        };
      };
    }>;
  }>(response);

  return (raw.items ?? [])
    .map((item) => {
      const comment = item.snippet?.topLevelComment;
      if (!comment?.id) return null;
      return {
        commentId: comment.id,
        threadId: item.id ?? null,
        authorDisplayName: comment.snippet?.authorDisplayName ?? null,
        text: comment.snippet?.textOriginal ?? comment.snippet?.textDisplay ?? null,
        likeCount: comment.snippet?.likeCount ?? null,
        publishedAt: comment.snippet?.publishedAt ?? null,
        moderationStatus: comment.snippet?.moderationStatus ?? null,
      };
    })
    .filter((item): item is YouTubeCommentSummary => Boolean(item));
}

export async function replyToComment(
  auth: YouTubeManagementAuth,
  input: { parentCommentId: string; text: string }
): Promise<YouTubeCommentSummary> {
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/comments?part=snippet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        snippet: {
          parentId: text(input.parentCommentId, 'Parent comment id', 200),
          textOriginal: text(input.text, 'Reply', 10_000),
        },
      }),
    },
    { stage: 'management.comments.insert' }
  );
  const raw = await json<{
    id?: string;
    snippet?: {
      authorDisplayName?: string;
      textOriginal?: string;
      likeCount?: number;
      publishedAt?: string;
      moderationStatus?: string;
    };
  }>(response);

  return {
    commentId: raw.id ?? '',
    threadId: null,
    authorDisplayName: raw.snippet?.authorDisplayName ?? null,
    text: raw.snippet?.textOriginal ?? input.text,
    likeCount: raw.snippet?.likeCount ?? null,
    publishedAt: raw.snippet?.publishedAt ?? null,
    moderationStatus: raw.snippet?.moderationStatus ?? null,
  };
}

export async function moderateComment(
  auth: YouTubeManagementAuth,
  input: { commentId: string; moderationStatus: 'published' | 'heldForReview' | 'rejected' }
): Promise<{ commentId: string; moderationStatus: string }> {
  if (!COMMENT_MODERATION_VALUES.has(input.moderationStatus)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'moderationStatus must be published, heldForReview or rejected.',
      stage: 'management_validation',
    });
  }
  const commentId = text(input.commentId, 'Comment id', 200);

  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/comments/setModerationStatus?id=${encodeURIComponent(
      commentId
    )}&moderationStatus=${encodeURIComponent(input.moderationStatus)}`,
    { method: 'POST' },
    { stage: 'management.comments.setModerationStatus', retries: 1 }
  );

  return { commentId, moderationStatus: input.moderationStatus };
}

export async function deleteComment(
  auth: YouTubeManagementAuth,
  input: { commentId: string }
): Promise<{ commentId: string; deleted: true }> {
  const commentId = text(input.commentId, 'Comment id', 200);
  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/comments?id=${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
    { stage: 'management.comments.delete', retries: 1 }
  );
  return { commentId, deleted: true };
}

export type YouTubeCaptionSummary = {
  captionId: string;
  videoId: string | null;
  language: string | null;
  name: string | null;
  trackKind: string | null;
  isDraft: boolean | null;
};

export async function listCaptions(
  auth: YouTubeManagementAuth,
  input: { videoId: string }
): Promise<YouTubeCaptionSummary[]> {
  const videoId = assertVideoId(input.videoId);
  const response = await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`,
    { method: 'GET' },
    { stage: 'management.captions.list', retries: 1 }
  );
  const raw = await json<{
    items?: Array<{
      id?: string;
      snippet?: {
        videoId?: string;
        language?: string;
        name?: string;
        trackKind?: string;
        isDraft?: boolean;
      };
    }>;
  }>(response);

  return (raw.items ?? [])
    .map((item) =>
      item.id
        ? {
            captionId: item.id,
            videoId: item.snippet?.videoId ?? null,
            language: item.snippet?.language ?? null,
            name: item.snippet?.name ?? null,
            trackKind: item.snippet?.trackKind ?? null,
            isDraft: item.snippet?.isDraft ?? null,
          }
        : null
    )
    .filter((item): item is YouTubeCaptionSummary => Boolean(item));
}

function multipartBody(
  metadata: Record<string, unknown>,
  file: { bytes: Uint8Array; mimeType: string; filename: string }
): { body: Uint8Array; contentType: string } {
  const boundary = `pierrot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.byteLength + file.bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(file.bytes, head.byteLength);
  body.set(tail, head.byteLength + file.bytes.byteLength);

  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

export async function uploadCaption(
  auth: YouTubeManagementAuth,
  input: {
    videoId: string;
    language: string;
    name?: string;
    isDraft?: boolean;
    mimeType?: string;
    filename?: string;
    bytes: Uint8Array;
  }
): Promise<YouTubeCaptionSummary> {
  const videoId = assertVideoId(input.videoId);
  const bytes = assertBytes(input.bytes, 'Caption file', 10 * 1024 * 1024);
  const multipart = multipartBody(
    {
      snippet: {
        videoId,
        language: text(input.language, 'Caption language', 20),
        name: optionalText(input.name, 'Caption name', 150) ?? '',
        isDraft: input.isDraft === true,
      },
    },
    {
      bytes,
      mimeType: input.mimeType || 'text/vtt',
      filename: input.filename || 'captions.vtt',
    }
  );

  const response = await managementFetch(
    auth,
    `${YOUTUBE_UPLOAD_API}/captions?part=snippet&uploadType=multipart`,
    {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body as unknown as BodyInit,
    },
    { stage: 'management.captions.insert' }
  );
  const raw = await json<{
    id?: string;
    snippet?: {
      videoId?: string;
      language?: string;
      name?: string;
      trackKind?: string;
      isDraft?: boolean;
    };
  }>(response);

  return {
    captionId: raw.id ?? '',
    videoId: raw.snippet?.videoId ?? videoId,
    language: raw.snippet?.language ?? input.language,
    name: raw.snippet?.name ?? input.name ?? null,
    trackKind: raw.snippet?.trackKind ?? null,
    isDraft: raw.snippet?.isDraft ?? input.isDraft ?? null,
  };
}

export async function updateCaption(
  auth: YouTubeManagementAuth,
  input: { captionId: string; language?: string; name?: string; isDraft?: boolean }
): Promise<{ captionId: string; updated: true }> {
  const captionId = text(input.captionId, 'Caption id', 200);
  const snippet = {
    ...(input.language !== undefined
      ? { language: text(input.language, 'Caption language', 20) }
      : {}),
    ...(input.name !== undefined ? { name: text(input.name, 'Caption name', 150) } : {}),
    ...(input.isDraft !== undefined ? { isDraft: input.isDraft === true } : {}),
  };

  if (Object.keys(snippet).length === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'At least one caption field must be provided.',
      stage: 'management_validation',
    });
  }

  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/captions?part=snippet`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ id: captionId, snippet }),
    },
    { stage: 'management.captions.update', retries: 1 }
  );

  return { captionId, updated: true };
}

export async function deleteCaption(
  auth: YouTubeManagementAuth,
  input: { captionId: string }
): Promise<{ captionId: string; deleted: true }> {
  const captionId = text(input.captionId, 'Caption id', 200);
  await managementFetch(
    auth,
    `${YOUTUBE_DATA_API}/captions?id=${encodeURIComponent(captionId)}`,
    { method: 'DELETE' },
    { stage: 'management.captions.delete', retries: 1 }
  );
  return { captionId, deleted: true };
}
