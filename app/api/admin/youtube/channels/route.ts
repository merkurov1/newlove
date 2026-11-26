import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { listMyChannels } from '@/lib/youtube/api';
import {
  bindChannelToProject,
  disconnectOAuthConnection,
  isYouTubeProjectSlug,
  listOAuthConnections,
  listProjectBindings,
  listYouTubeChannels,
  loadChannelAccessToken,
  replaceConnectionChannels,
  unbindProject,
  youtubeMultichannelSchemaReady,
  YOUTUBE_PROJECTS,
  type YouTubeProjectSlug,
} from '@/lib/youtube/channels';
import {
  YOUTUBE_CHANNEL_CONNECTION_SCOPES,
  getYouTubeChannelsRedirectUri,
} from '@/lib/youtube/config';
import { YouTubeError } from '@/lib/youtube/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof YouTubeError) {
    const status =
      error.code === 'not_connected' || error.code === 'needs_reauthorization'
        ? 409
        : error.code === 'resource_not_found'
          ? 404
          : error.code === 'invalid_request'
            ? 400
            : error.code === 'not_configured'
              ? 503
              : 502;

    return json(
      { error: error.code, message: error.message, requiredScopes: error.requiredScopes },
      status
    );
  }

  return json(
    { error: 'request_failed', message: 'Не удалось выполнить действие с YouTube.' },
    502
  );
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';
  const store = getServerSupabaseClient({ useServiceRole: true });
  const schemaReady = await youtubeMultichannelSchemaReady(store);

  if (!schemaReady) {
    return json({
      ok: true,
      ownerOnly: true,
      schemaReady: false,
      project,
      projects: YOUTUBE_PROJECTS,
      connections: [],
      channels: [],
      bindings: [],
      activeByProject: {},
      config: {
        scopes: [...YOUTUBE_CHANNEL_CONNECTION_SCOPES],
        redirectUri: getYouTubeChannelsRedirectUri(),
        connectUrl: `/api/admin/youtube/channels/connect?project=${project}`,
      },
      message:
        'Аддитивная миграция multi-channel YouTube ещё не применена. Подключение недоступно.',
    });
  }

  const [connections, channels, bindings] = await Promise.all([
    listOAuthConnections(store, user.id),
    listYouTubeChannels(store, user.id),
    listProjectBindings(store, user.id),
  ]);

  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  const activeByProject: Record<string, unknown> = {};

  for (const binding of bindings.filter((item) => item.isActive)) {
    const channel = channelsById.get(binding.channelRecordId);
    if (!channel) continue;
    activeByProject[binding.projectSlug] = {
      binding,
      channel,
      connection: connections.find((item) => item.id === channel.connectionId) ?? null,
    };
  }

  return json({
    ok: true,
    ownerOnly: true,
    schemaReady: true,
    project,
    projects: YOUTUBE_PROJECTS,
    connections,
    channels,
    bindings,
    activeByProject,
    active: activeByProject[project] ?? null,
    config: {
      scopes: [...YOUTUBE_CHANNEL_CONNECTION_SCOPES],
      redirectUri: getYouTubeChannelsRedirectUri(),
      connectUrl: `/api/admin/youtube/channels/connect?project=${project}`,
    },
  });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body.action !== 'string') {
    return json({ error: 'invalid_request', message: 'Action is required.' }, 400);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });

  try {
    if (body.action === 'bind') {
      const project = isYouTubeProjectSlug(body.project) ? body.project : null;
      const channelRecordId =
        typeof body.channelRecordId === 'string' ? body.channelRecordId : null;

      if (!project || !channelRecordId) {
        return json(
          { error: 'invalid_request', message: 'project and channelRecordId are required.' },
          400
        );
      }

      const binding = await bindChannelToProject(store, {
        ownerId: user.id,
        projectSlug: project as YouTubeProjectSlug,
        channelRecordId,
        createdBy: user.id,
      });

      return json({ ok: true, action: 'bind', project, binding });
    }

    if (body.action === 'unbind') {
      const project = isYouTubeProjectSlug(body.project) ? body.project : null;

      if (!project) {
        return json({ error: 'invalid_request', message: 'A valid project is required.' }, 400);
      }

      await unbindProject(store, { ownerId: user.id, projectSlug: project });
      return json({ ok: true, action: 'unbind', project });
    }

    if (body.action === 'disconnect') {
      const connectionId = typeof body.connectionId === 'string' ? body.connectionId : null;

      if (!connectionId) {
        return json({ error: 'invalid_request', message: 'connectionId is required.' }, 400);
      }

      const result = await disconnectOAuthConnection(store, {
        ownerId: user.id,
        connectionId,
      });

      return json({ ok: true, action: 'disconnect', revoked: result.revoked });
    }

    if (body.action === 'refresh') {
      const connectionId = typeof body.connectionId === 'string' ? body.connectionId : null;

      if (!connectionId) {
        return json({ error: 'invalid_request', message: 'connectionId is required.' }, 400);
      }

      const channels = await listYouTubeChannels(store, user.id);
      const channel = channels.find((item) => item.connectionId === connectionId);

      if (!channel) {
        return json(
          {
            error: 'not_connected',
            message: 'У этого подключения нет сохранённых каналов. Переподключите Google-аккаунт.',
          },
          409
        );
      }

      const token = await loadChannelAccessToken(store, {
        ownerId: user.id,
        channelRecordId: channel.id,
      });
      const discovered = await listMyChannels({ accessToken: token.accessToken });
      const updated = await replaceConnectionChannels(store, {
        connectionId,
        ownerId: user.id,
        channels: discovered.channels,
      });

      return json({
        ok: true,
        action: 'refresh',
        channelCount: updated.filter((item) => item.connectionId === connectionId).length,
        truncated: discovered.truncated,
      });
    }

    return json({ error: 'invalid_request', message: 'Unknown action.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
