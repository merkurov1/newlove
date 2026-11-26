import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  getProjectVideo,
  resolveProjectAccessToken,
} from '@/lib/youtube/catalog';
import { isYouTubeProjectSlug } from '@/lib/youtube/channels';
import {
  analyzeVideoMetadata,
  buildMetadataDiff,
  sanitizeMetadataChanges,
  type MetadataEditableValues,
} from '@/lib/youtube/metadata';
import {
  createManagementConfirmation,
  verifyManagementConfirmation,
} from '@/lib/youtube/managementConfirmation';
import { recordYouTubeManagementAudit } from '@/lib/youtube/managementAudit';
import { updateEditableVideoMetadata } from '@/lib/youtube/management';
import { YouTubeError } from '@/lib/youtube/types';
import type { YouTubeVideoDetails } from '@/lib/youtube/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ videoId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function errorStatus(error: YouTubeError): number {
  switch (error.code) {
    case 'not_connected':
    case 'needs_reauthorization':
      return 409;
    case 'insufficient_permissions':
      return 403;
    case 'resource_not_found':
      return 404;
    case 'invalid_request':
      return 400;
    case 'not_configured':
      return 503;
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
    message: 'Не удалось выполнить действие с метаданными видео.',
    retryable: false,
    requiredScopes: [],
  };
}

/** Stable fingerprint of current editable + preserved snippet state. */
function metadataFingerprint(video: YouTubeVideoDetails): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        title: video.title,
        description: video.description,
        tags: video.tags,
        categoryId: video.categoryId,
        defaultLanguage: video.defaultLanguage,
        defaultAudioLanguage: video.defaultAudioLanguage,
        localized: video.localized,
        privacyStatus: video.privacyStatus,
      })
    )
    .digest('hex');
}

function validateChanges(value: unknown): Partial<MetadataEditableValues> {
  const changes = sanitizeMetadataChanges(value);
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  if (typeof raw.title === 'string' && raw.title.length > 100) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'Title cannot exceed 100 characters.',
      stage: 'metadata_validation',
    });
  }

  if (!changes.title?.trim() && changes.title !== undefined) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'Title cannot be empty.',
      stage: 'metadata_validation',
    });
  }

  if (typeof raw.description === 'string' && raw.description.length > 5_000) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'Description cannot exceed 5000 characters.',
      stage: 'metadata_validation',
    });
  }

  if (Array.isArray(raw.tags) && raw.tags.length > 50) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'A maximum of 50 tags is allowed.',
      stage: 'metadata_validation',
    });
  }

  return changes;
}

function projectFrom(requestUrl: string): string | null {
  const value = new URL(requestUrl).searchParams.get('project');
  return isYouTubeProjectSlug(value) ? value : null;
}

export async function GET(request: Request, context: Context) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const project = projectFrom(request.url);
  const { videoId } = await context.params;

  if (!project) {
    return json({ error: 'invalid_request', message: 'A valid project is required.' }, 400);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });

  try {
    const { video, channel } = await getProjectVideo({
      store,
      ownerId: user.id,
      projectSlug: project,
      videoId,
    });
    const analysis = analyzeVideoMetadata({ video, projectSlug: project });

    return json({
      ok: true,
      project,
      channel: { id: channel.channelId, title: channel.title, handle: channel.handle },
      video,
      fingerprint: metadataFingerprint(video),
      analysis,
    });
  } catch (error) {
    const safe = safeError(error);
    return json(safe, errorStatus(safe as YouTubeError));
  }
}

export async function POST(request: Request, context: Context) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const project = projectFrom(request.url);
  const { videoId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!project || !body || typeof body.action !== 'string') {
    return json(
      { error: 'invalid_request', message: 'A valid project and action are required.' },
      400
    );
  }

  const action =
    body.action === 'analyze' || body.action === 'preview' || body.action === 'update'
      ? body.action
      : null;

  if (!action) {
    return json({ error: 'invalid_request', message: 'Unknown action.' }, 400);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const confirmationToken =
    typeof body.confirmationToken === 'string' ? body.confirmationToken : null;

  try {
    const { video, channel } = await getProjectVideo({
      store,
      ownerId: user.id,
      projectSlug: project,
      videoId,
    });
    const fingerprint = metadataFingerprint(video);

    if (action === 'analyze') {
      return json({
        ok: true,
        project,
        videoId,
        fingerprint,
        analysis: analyzeVideoMetadata({ video, projectSlug: project }),
      });
    }

    const changes = validateChanges(body.changes);
    const current: MetadataEditableValues = {
      title: video.title,
      description: video.description,
      tags: video.tags,
    };
    const diff = buildMetadataDiff(current, changes);

    if (!diff.some((row) => row.changed)) {
      return json(
        {
          error: 'invalid_request',
          message: 'Предложенные метаданные совпадают с текущими.',
          diff,
        },
        400
      );
    }

    const params = {
      channelId: channel.channelId,
      videoId,
      changes,
      baseFingerprint: fingerprint,
    };

    if (action === 'preview') {
      return json({
        ok: true,
        project,
        videoId,
        channelId: channel.channelId,
        baseFingerprint: fingerprint,
        diff,
        preview: {
          changedFields: diff.filter((row) => row.changed).map((row) => row.field),
          summary: 'Ничего не записано. Проверьте diff перед подтверждением.',
        },
      });
    }

    if (!confirmationToken) {
      const confirmation = createManagementConfirmation({
        userId: user.id,
        action: 'video.metadata.update',
        params,
        project,
      });
      const changedFields = diff.filter((row) => row.changed).map((row) => row.field);

      await recordYouTubeManagementAudit(store, {
        userId: user.id,
        project,
        action: 'video.metadata.update',
        status: 'confirmation_required',
        channelId: channel.channelId,
        targetId: videoId,
        changedFields,
        resultSummary: `preview: ${changedFields.join(', ')}`,
      });

      return json(
        {
          ok: false,
          confirmationRequired: true,
          confirmationToken: confirmation.token,
          expiresAt: confirmation.expiresAt,
          project,
          videoId,
          channelId: channel.channelId,
          baseFingerprint: fingerprint,
          diff,
          destructive: false,
          externallyVisible: true,
          message:
            'Проверьте diff «было / станет». Изменение уйдёт на YouTube только после явного подтверждения.',
        },
        409
      );
    }

    // Refuse to apply against metadata that changed after the preview.
    if (body.baseFingerprint !== fingerprint) {
      return json(
        {
          error: 'stale_metadata',
          message:
            'Метаданные видео изменились после предпросмотра. Проверьте diff заново и подтвердите ещё раз.',
          baseFingerprint: fingerprint,
          diff: buildMetadataDiff(current, changes),
        },
        409
      );
    }

    verifyManagementConfirmation({
      token: confirmationToken,
      userId: user.id,
      action: 'video.metadata.update',
      params,
      project,
    });

    const access = await resolveProjectAccessToken({
      store,
      ownerId: user.id,
      projectSlug: project,
    });

    if (access.channel.channelId !== channel.channelId) {
      throw new YouTubeError({
        code: 'resource_not_found',
        message: 'Проект был перепривязан к другому каналу. Повторите анализ.',
        stage: 'metadata_binding',
      });
    }

    const result = await updateEditableVideoMetadata(
      { accessToken: access.accessToken },
      {
        videoId,
        title: changes.title,
        description: changes.description,
        tags: changes.tags,
      }
    );

    await recordYouTubeManagementAudit(store, {
      userId: user.id,
      project,
      action: 'video.metadata.update',
      status: 'completed',
      channelId: channel.channelId,
      targetId: videoId,
      changedFields: result.changedFields,
      resultSummary: `updated ${result.changedFields.length} field(s); preserved ${result.preservedFields.length}`,
    });

    return json({
      ok: true,
      project,
      videoId,
      channelId: channel.channelId,
      changedFields: result.changedFields,
      preservedFields: result.preservedFields,
      before: result.before,
      after: result.after,
      privacyStatus: result.privacyStatus,
      defaultLanguage: result.defaultLanguage,
      categoryId: result.categoryId,
    });
  } catch (error) {
    const safe = safeError(error);

    await recordYouTubeManagementAudit(store, {
      userId: user.id,
      project,
      action: 'video.metadata.update',
      status: 'failed',
      errorCode: safe.code,
      targetId: videoId,
    });

    return json(safe, errorStatus(safe as YouTubeError));
  }
}
