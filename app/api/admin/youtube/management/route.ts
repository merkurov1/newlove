import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { getYouTubeManagementRedirectUri } from '@/lib/youtube/config';
import {
  loadYouTubeConnectionState,
  loadYouTubeManagementAccessToken,
} from '@/lib/youtube/connection';
import {
  YOUTUBE_MANAGEMENT_ACTIONS,
  addVideoToPlaylist,
  assertManagementScope,
  createPlaylist,
  deleteCaption,
  deleteComment,
  deletePlaylist,
  isYouTubeManagementAction,
  listCaptions,
  listChannelVideos,
  listComments,
  listPlaylists,
  moderateComment,
  removeVideoFromPlaylist,
  replyToComment,
  requiredScopeForAction,
  setVideoThumbnail,
  updateCaption,
  updatePlaylist,
  updateVideoMetadata,
  uploadCaption,
  uploadVideo,
  type YouTubeManagementAction,
} from '@/lib/youtube/management';
import {
  createManagementConfirmation,
  describeManagementAction,
  verifyManagementConfirmation,
} from '@/lib/youtube/managementConfirmation';
import { recordYouTubeManagementAudit } from '@/lib/youtube/managementAudit';
import { getYouTubeSharedProjects } from '@/lib/youtube/projects';
import { YouTubeError } from '@/lib/youtube/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProjectContext = 'pierrot' | 'unframed';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function projectFrom(value: unknown): ProjectContext | null {
  if (value === undefined || value === null || value === '') return 'pierrot';
  return value === 'pierrot' || value === 'unframed' ? value : null;
}

function targetId(params: Record<string, unknown>): string | null {
  for (const key of ['videoId', 'playlistId', 'playlistItemId', 'commentId', 'captionId']) {
    if (typeof params[key] === 'string' && params[key]) return String(params[key]);
  }
  return null;
}

function errorStatus(error: YouTubeError): number {
  switch (error.code) {
    case 'insufficient_permissions':
      return 403;
    case 'needs_reauthorization':
    case 'not_connected':
      return 401;
    case 'quota_exceeded':
    case 'rate_limited':
      return 429;
    case 'resource_not_found':
      return 404;
    case 'api_not_enabled':
      return 503;
    case 'invalid_request':
      return 400;
    default:
      return 502;
  }
}

function safeError(error: unknown) {
  if (error instanceof YouTubeError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requiredScopes: error.requiredScopes,
    };
  }

  return {
    code: 'request_failed',
    message: 'The YouTube management request failed.',
    retryable: false,
    requiredScopes: [],
  };
}

type ParsedRequest = {
  action: YouTubeManagementAction;
  project: ProjectContext;
  params: Record<string, unknown>;
  confirmationToken: string | null;
  file: { bytes: Uint8Array; mimeType: string; filename: string } | null;
};

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const action = form.get('action');
    const project = projectFrom(form.get('project'));
    const confirmationToken =
      typeof form.get('confirmationToken') === 'string'
        ? String(form.get('confirmationToken'))
        : null;

    if (!isYouTubeManagementAction(action) || !project) {
      throw new YouTubeError({
        code: 'invalid_request',
        message: 'A valid management action and project are required.',
        stage: 'route_validation',
      });
    }

    const file = form.get('file');
    const params: Record<string, unknown> = {};

    for (const [key, value] of form.entries()) {
      if (['action', 'project', 'confirmationToken', 'file'].includes(key)) continue;
      if (typeof value === 'string') params[key] = value;
    }

    if (typeof params.isDraft === 'string') params.isDraft = params.isDraft === 'true';
    if (typeof params.selfDeclaredMadeForKids === 'string') {
      params.selfDeclaredMadeForKids = params.selfDeclaredMadeForKids === 'true';
    }
    if (typeof params.position === 'string' && params.position) {
      params.position = Number(params.position);
    }

    if (!(file instanceof File)) {
      throw new YouTubeError({
        code: 'invalid_request',
        message: 'A file is required for this action.',
        stage: 'route_validation',
      });
    }

    return {
      action,
      project,
      params,
      confirmationToken,
      file: {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || 'application/octet-stream',
        filename: file.name || 'upload',
      },
    };
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const project = projectFrom(body?.project);
  const action = body?.action;

  if (!body || !isYouTubeManagementAction(action) || !project) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'A valid management action and project are required.',
      stage: 'route_validation',
    });
  }

  const params =
    body.params && typeof body.params === 'object' && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : Object.fromEntries(
          Object.entries(body).filter(
            ([key]) => !['action', 'project', 'confirmationToken', 'params'].includes(key)
          )
        );

  return {
    action,
    project,
    params,
    confirmationToken: typeof body.confirmationToken === 'string' ? body.confirmationToken : null,
    file: null,
  };
}

function requireFile(parsed: ParsedRequest) {
  if (!parsed.file) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'A file is required for this action.',
      stage: 'route_validation',
    });
  }
  return parsed.file;
}

async function execute(parsed: ParsedRequest, accessToken: string, fetchImpl?: typeof fetch) {
  const auth = { accessToken, fetchImpl };
  const params = parsed.params;

  switch (parsed.action) {
    case 'channel.videos.list':
      return listChannelVideos(auth, { limit: Number(params.limit) || undefined });
    case 'video.upload': {
      const file = requireFile(parsed);
      return uploadVideo(auth, {
        title: String(params.title || file.filename.replace(/\.[^.]+$/, '')),
        description: typeof params.description === 'string' ? params.description : undefined,
        tags: Array.isArray(params.tags) ? (params.tags as string[]) : undefined,
        categoryId: typeof params.categoryId === 'string' ? params.categoryId : undefined,
        privacyStatus: params.privacyStatus as never,
        publishAt: typeof params.publishAt === 'string' ? params.publishAt : undefined,
        selfDeclaredMadeForKids: params.selfDeclaredMadeForKids === true,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
    }
    case 'video.update':
      return updateVideoMetadata(auth, {
        videoId: String(params.videoId || ''),
        title: typeof params.title === 'string' ? params.title : undefined,
        description: typeof params.description === 'string' ? params.description : undefined,
        tags: Array.isArray(params.tags) ? (params.tags as string[]) : undefined,
        categoryId: typeof params.categoryId === 'string' ? params.categoryId : undefined,
        privacyStatus: params.privacyStatus as never,
        publishAt: typeof params.publishAt === 'string' ? params.publishAt : undefined,
        selfDeclaredMadeForKids:
          typeof params.selfDeclaredMadeForKids === 'boolean'
            ? params.selfDeclaredMadeForKids
            : undefined,
      });
    case 'video.thumbnail': {
      const file = requireFile(parsed);
      return setVideoThumbnail(auth, {
        videoId: String(params.videoId || ''),
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
    }
    case 'playlist.list':
      return listPlaylists(auth);
    case 'playlist.create':
      return createPlaylist(auth, {
        title: String(params.title || ''),
        description: typeof params.description === 'string' ? params.description : undefined,
        privacyStatus: params.privacyStatus as never,
      });
    case 'playlist.update':
      return updatePlaylist(auth, {
        playlistId: String(params.playlistId || ''),
        title: String(params.title || ''),
        description: typeof params.description === 'string' ? params.description : undefined,
        privacyStatus: params.privacyStatus as never,
      });
    case 'playlist.delete':
      return deletePlaylist(auth, { playlistId: String(params.playlistId || '') });
    case 'playlist.add':
      return addVideoToPlaylist(auth, {
        playlistId: String(params.playlistId || ''),
        videoId: String(params.videoId || ''),
        position: typeof params.position === 'number' ? params.position : undefined,
      });
    case 'playlist.remove':
      return removeVideoFromPlaylist(auth, {
        playlistItemId: String(params.playlistItemId || ''),
      });
    case 'comment.list':
      return listComments(auth, {
        videoId: typeof params.videoId === 'string' ? params.videoId : undefined,
        channelId: typeof params.channelId === 'string' ? params.channelId : undefined,
        maxResults: Number(params.maxResults) || undefined,
      });
    case 'comment.reply':
      return replyToComment(auth, {
        parentCommentId: String(params.parentCommentId || ''),
        text: String(params.text || ''),
      });
    case 'comment.moderate':
      return moderateComment(auth, {
        commentId: String(params.commentId || ''),
        moderationStatus: params.moderationStatus as never,
      });
    case 'comment.delete':
      return deleteComment(auth, { commentId: String(params.commentId || '') });
    case 'caption.list':
      return listCaptions(auth, { videoId: String(params.videoId || '') });
    case 'caption.upload': {
      const file = requireFile(parsed);
      return uploadCaption(auth, {
        videoId: String(params.videoId || ''),
        language: String(params.language || ''),
        name: typeof params.name === 'string' ? params.name : undefined,
        isDraft: params.isDraft === true,
        mimeType: file.mimeType,
        filename: file.filename,
        bytes: file.bytes,
      });
    }
    case 'caption.update':
      return updateCaption(auth, {
        captionId: String(params.captionId || ''),
        language: typeof params.language === 'string' ? params.language : undefined,
        name: typeof params.name === 'string' ? params.name : undefined,
        isDraft: typeof params.isDraft === 'boolean' ? params.isDraft : undefined,
      });
    case 'caption.delete':
      return deleteCaption(auth, { captionId: String(params.captionId || '') });
    default:
      throw new YouTubeError({
        code: 'invalid_request',
        message: 'Unsupported YouTube management action.',
        stage: 'route_validation',
      });
  }
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const project = projectFrom(url.searchParams.get('project'));

  if (!project) {
    return json({ error: 'Unknown project context' }, 400);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const connection = await loadYouTubeConnectionState(store);

  return json({
    ok: true,
    ownerOnly: true,
    project,
    sharedProjects: getYouTubeSharedProjects(),
    channel: {
      id: connection.channelId,
      title: connection.channelTitle,
      accountLabel: connection.accountLabel,
      googleAccountEmail: connection.googleAccountEmail,
      shared: true,
    },
    connection: {
      connected: connection.connected,
      status: connection.status,
      connectedAt: connection.connectedAt,
      lastCheckedAt: connection.lastCheckedAt,
      projectSlugs: connection.projectSlugs,
      lastErrorCode: connection.lastErrorCode,
    },
    permissions: {
      analytics: connection.connected && connection.missingScopes.length === 0,
      missingAnalyticsScopes: connection.missingScopes,
      management: connection.managementAuthorized,
      managementScopes: connection.scopes.filter(
        (scope) => scope.includes('/youtube.upload') || scope.includes('/youtube.force-ssl')
      ),
      missingManagementScopes: connection.missingManagementScopes,
      managementAuthorizedAt: connection.managementAuthorizedAt,
      connectUrl: `/api/admin/youtube/management/connect?project=${project}`,
      requiredRedirectUri: getYouTubeManagementRedirectUri(),
    },
    actions: Object.entries(YOUTUBE_MANAGEMENT_ACTIONS).map(([action, definition]) => ({
      action,
      ...definition,
      scope: requiredScopeForAction(action as YouTubeManagementAction),
    })),
  });
}

export async function POST(request: Request) {
  let user;
  let parsed: ParsedRequest;

  // Authenticate before any database read or request parsing so a visitor can
  // never observe channel state or trigger an audit/write path.
  try {
    user = await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return json({ error: 'Unauthorized' }, 401);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  let connection = await loadYouTubeConnectionState(store);

  try {
    parsed = await parseRequest(request);
  } catch (error) {
    const safe = safeError(error);
    return json(
      { error: safe.code, message: safe.message },
      safe.code === 'invalid_request' ? 400 : 500
    );
  }

  const definition = YOUTUBE_MANAGEMENT_ACTIONS[parsed.action];
  const requiredScope = requiredScopeForAction(parsed.action);

  try {
    if (!connection.scopes.includes(requiredScope)) {
      await recordYouTubeManagementAudit(store, {
        userId: user.id,
        project: parsed.project,
        action: parsed.action,
        status: 'scope_missing',
        channelId: connection.channelId,
        targetId: targetId(parsed.params),
        errorCode: 'insufficient_permissions',
      });

      return json(
        {
          error: 'insufficient_permissions',
          message:
            'This action needs the incremental YouTube management grant. Connect management access for the channel owner Google account.',
          requiredScopes: [requiredScope],
          connectUrl: `/api/admin/youtube/management/connect?project=${parsed.project}`,
          project: parsed.project,
        },
        403
      );
    }

    if (definition.write && !parsed.confirmationToken) {
      const confirmation = createManagementConfirmation({
        userId: user.id,
        action: parsed.action,
        params: parsed.params,
        project: parsed.project,
      });

      await recordYouTubeManagementAudit(store, {
        userId: user.id,
        project: parsed.project,
        action: parsed.action,
        status: 'confirmation_required',
        channelId: connection.channelId,
        targetId: targetId(parsed.params),
      });

      return json(
        {
          ok: false,
          confirmationRequired: true,
          confirmationToken: confirmation.token,
          expiresAt: confirmation.expiresAt,
          destructive: definition.destructive,
          externallyVisible: definition.external,
          preview: describeManagementAction({
            action: parsed.action,
            params: parsed.params,
            project: parsed.project,
          }),
          message: 'Review the action and confirm it explicitly before it is sent to YouTube.',
        },
        409
      );
    }

    if (definition.write && parsed.confirmationToken) {
      verifyManagementConfirmation({
        token: parsed.confirmationToken,
        userId: user.id,
        action: parsed.action,
        params: parsed.params,
        project: parsed.project,
      });
    }

    const { accessToken } = await loadYouTubeManagementAccessToken(store);
    assertManagementScope(parsed.action, connection.scopes);
    // Re-read after token refresh: a rotated management credential is now the
    // authoritative state, never the value captured before the request.
    connection = await loadYouTubeConnectionState(store);

    const result = await execute(parsed, accessToken);

    await recordYouTubeManagementAudit(store, {
      userId: user.id,
      project: parsed.project,
      action: parsed.action,
      status: 'completed',
      channelId: connection.channelId,
      targetId: targetId(parsed.params),
    });

    return json({
      ok: true,
      project: parsed.project,
      action: parsed.action,
      channel: {
        id: connection.channelId,
        title: connection.channelTitle,
        googleAccountEmail: connection.googleAccountEmail,
      },
      result,
    });
  } catch (error) {
    const safe = safeError(error);

    await recordYouTubeManagementAudit(store, {
      userId: user.id,
      project: parsed.project,
      action: parsed.action,
      status: 'failed',
      channelId: connection.channelId,
      targetId: targetId(parsed.params),
      errorCode: safe.code,
    });

    return json(
      {
        error: safe.code,
        message: safe.message,
        retryable: safe.retryable,
        requiredScopes: safe.requiredScopes,
        project: parsed.project,
      },
      errorStatus(safe as YouTubeError)
    );
  }
}
