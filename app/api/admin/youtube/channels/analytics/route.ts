import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { getProjectChannelAnalytics } from '@/lib/youtube/channelAnalytics';
import { isYouTubeProjectSlug } from '@/lib/youtube/channels';
import { youtubeAdminUnauthorizedJson } from '@/lib/youtube/adminHttp';
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultPeriod(): { start: string; end: string } {
  // YouTube Analytics finalises data with a delay. Default to yesterday - 2
  // days so the first screen is useful without pretending today is complete.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: isoDate(start), end: isoDate(end) };
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

    return youtubeAdminUnauthorizedJson(request);
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : null;

  if (!project) {
    return json({ error: 'invalid_request', message: 'A valid project is required.' }, 400);
  }

  const defaults = defaultPeriod();
  const start = url.searchParams.get('start') || defaults.start;
  const end = url.searchParams.get('end') || defaults.end;
  const fresh = url.searchParams.get('fresh') === '1';
  const store = getServerSupabaseClient({ useServiceRole: true });

  try {
    const report = await getProjectChannelAnalytics({
      store,
      ownerId: user.id,
      projectSlug: project,
      start,
      end,
      fresh,
    });

    return json({ ok: true, project, report });
  } catch (error) {
    if (error instanceof YouTubeError) {
      const status =
        error.code === 'not_connected' || error.code === 'needs_reauthorization'
          ? 409
          : error.code === 'invalid_request'
            ? 400
            : error.code === 'not_configured'
              ? 503
              : 502;

      return json(
        {
          error: error.code,
          message: error.message,
          requiredScopes: error.requiredScopes,
        },
        status
      );
    }

    return json(
      { error: 'request_failed', message: 'Не удалось получить аналитику канала.' },
      502
    );
  }
}
