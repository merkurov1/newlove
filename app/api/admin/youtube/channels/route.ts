import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import {
  explainAdminDenial,
  requireAdminFromRequest,
  getServerSupabaseClient,
} from '@/lib/serverAuth';
import { listMyChannels } from '@/lib/youtube/api';
import {
  bindChannelToProject,
  checkYouTubeMultichannelSchema,
  disconnectOAuthConnection,
  isYouTubeProjectSlug,
  listOAuthConnections,
  listProjectBindings,
  listYouTubeChannels,
  loadConnectionAccessToken,
  replaceConnectionChannels,
  unbindProject,
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
    {
      error: 'request_failed',
      code:
        error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
          ? String((error as { code?: unknown }).code).slice(0, 40)
          : 'request_failed',
      message: 'Не удалось выполнить действие с YouTube.',
    },
    502
  );
}

/**
 * Distinguishes "no session at all" from "signed in, but not an administrator".
 * Both used to be a bare 401, which made the YouTube screen look broken with no
 * actionable explanation.
 */
async function adminDenied(request: Request) {
  const reason = await explainAdminDenial(request);

  return json(
    {
      ok: false,
      error: reason,
      reason,
      statusChecked: false,
      authenticated: reason === 'admin_role_required',
      message:
        reason === 'not_authenticated'
          ? 'Сессия администратора не найдена. Войдите заново на этом домене и повторите.'
          : reason === 'admin_role_required'
            ? 'Вы вошли, но у этой учётной записи нет роли ADMIN. Проверьте users.role для своего профиля.'
            : 'Не удалось проверить сессию администратора. Повторите запрос.',
    },
    401
  );
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return adminDenied(request);
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';
  let store;

  try {
    store = getServerSupabaseClient({ useServiceRole: true });
  } catch (error) {
    console.error('[youtube-channels] service client unavailable', error);
    return json(
      {
        ok: false,
        error: 'server_configuration_error',
        message: 'Серверная конфигурация Supabase неполна. Обратитесь к владельцу окружения.',
      },
      503
    );
  }

  const schema = await checkYouTubeMultichannelSchema(store);

  if (!schema.ready) {
    const missing = schema.missingTables.length
      ? ` Отсутствуют таблицы: ${schema.missingTables.join(', ')}.`
      : '';

    return json({
      ok: true,
      ownerOnly: true,
      schemaReady: false,
      schema,
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
        `Аддитивная миграция multi-channel YouTube ещё не применена или недоступна.${missing} ` +
        'Подключение недоступно до применения миграции.',
    });
  }

  try {
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
      schema,
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
  } catch (error) {
    // Do not return a bare HTML 500: the client would only be able to show a
    // generic "status" failure. Log the server-side detail, expose a safe code.
    console.error('[youtube-channels] state read failed', error);
    const code =
      error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code?: unknown }).code).slice(0, 40)
        : 'state_read_failed';

    return json(
      {
        ok: false,
        schemaReady: true,
        schema,
        project,
        error: 'state_read_failed',
        code,
        retryable: true,
        message:
          'Не удалось прочитать состояние YouTube из базы. Повторите запрос; если ошибка повторится, проверьте серверные таблицы и ключ service role.',
      },
      500
    );
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return adminDenied(request);
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

      // Refresh works even when the first discovery returned zero channels:
      // the connection and its sealed grant still exist, so the owner can
      // retry discovery from the UI.
      const token = await loadConnectionAccessToken(store, {
        ownerId: user.id,
        connectionId,
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
