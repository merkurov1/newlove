import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
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
  suggestProjectBindings,
  unbindProject,
  YOUTUBE_PROJECTS,
  type YouTubeProjectSlug,
} from '@/lib/youtube/channels';
import {
  YOUTUBE_CHANNEL_CONNECTION_SCOPES,
  getYouTubeChannelsRedirectUri,
} from '@/lib/youtube/config';
import { getGoogleOAuthConfig } from '@/lib/analytics/website/config';
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
 * Safe runtime diagnostics. Only booleans and environment variable *names*
 * are exposed; values (client secret, service key, encryption key) never leave
 * the server. This lets the owner see whether production has the pieces the
 * OAuth flow needs without reading Vercel's secret store from a terminal.
 */
function runtimeConfig() {
  const oauth = getGoogleOAuthConfig();
  const redirectUri = getYouTubeChannelsRedirectUri();
  let callbackPath: string | null = null;

  try {
    callbackPath = new URL(redirectUri).pathname;
  } catch {
    callbackPath = null;
  }

  return {
    googleOAuthConfigured: oauth.configured,
    googleOAuthMissing: oauth.missing,
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrlConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    ),
    tokenEncryptionConfigured: Boolean(
      process.env.ANALYTICS_SYNC_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    redirectUri,
    callbackPath,
    dedicatedCallbackConfigured: Boolean(process.env.YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI),
    scopes: [...YOUTUBE_CHANNEL_CONNECTION_SCOPES],
  };
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth] youtube-channels status failed', error);
      return json(
        {
          ok: false,
          error: 'auth_backend_error',
          retryable: true,
          message:
            'Не удалось проверить сессию администратора из-за серверной ошибки. Повторите запрос.',
        },
        500
      );
    }

    return json(
      {
        ok: false,
        error: 'unauthorized',
        code: 'unauthorized',
        message:
          'Сессия администратора не подтверждена. Войдите заново; данные подключений не затронуты.',
      },
      401
    );
  }

  const auth = {
    method: user.authMethod ?? 'cookie',
    role: user.role,
  };

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
  const viewer = {
    id: user.id,
    email: user.email ?? null,
    role: user.role,
  };

  if (!schema.ready) {
    const missing = schema.missingTables.length
      ? ` Отсутствуют таблицы: ${schema.missingTables.join(', ')}.`
      : '';

    return json({
      ok: true,
      ownerOnly: true,
      schemaReady: false,
      schema,
      viewer,
      auth,
      project,
      projects: YOUTUBE_PROJECTS,
      connections: [],
      channels: [],
      bindings: [],
      activeByProject: {},
      suggestedBindings: [],
      config: {
        ...runtimeConfig(),
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
      viewer,
      auth,
      project,
      projects: YOUTUBE_PROJECTS,
      connections,
      channels,
      bindings,
      activeByProject,
      active: activeByProject[project] ?? null,
      suggestedBindings: suggestProjectBindings(channels, bindings),
      config: {
        ...runtimeConfig(),
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
      console.error('[admin-auth] youtube-channels action failed', error);
      return json(
        {
          ok: false,
          error: 'auth_backend_error',
          retryable: true,
          message:
            'Не удалось проверить сессию администратора из-за серверной ошибки. Повторите действие.',
        },
        500
      );
    }

    return json(
      {
        ok: false,
        error: 'unauthorized',
        code: 'unauthorized',
        message:
          'Сессия администратора не подтверждена. Войдите заново; действие не выполнено.',
      },
      401
    );
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
