import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { getProjectCatalogPage } from '@/lib/youtube/catalog';
import { isYouTubeProjectSlug } from '@/lib/youtube/channels';
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

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : null;

  if (!project) {
    return json({ error: 'invalid_request', message: 'A valid project is required.' }, 400);
  }

  const pageSizeRaw = Number(url.searchParams.get('pageSize') || 25);
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.max(10, Math.min(Math.floor(pageSizeRaw), 50))
    : 25;
  const pageToken = url.searchParams.get('pageToken');
  const store = getServerSupabaseClient({ useServiceRole: true });

  try {
    const page = await getProjectCatalogPage({
      store,
      ownerId: user.id,
      projectSlug: project,
      pageToken,
      pageSize,
    });

    return json({ ok: true, project, page });
  } catch (error) {
    if (error instanceof YouTubeError) {
      const status =
        error.code === 'not_connected' || error.code === 'needs_reauthorization'
          ? 409
          : error.code === 'resource_not_found'
            ? 404
            : error.code === 'invalid_request'
              ? 400
              : 502;

      return json({ error: error.code, message: error.message }, status);
    }

    return json(
      { error: 'request_failed', message: 'Не удалось получить каталог видео.' },
      502
    );
  }
}
