import { NextResponse } from 'next/server';

import { clearMediaIntelligenceCache } from '@/lib/analytics/mediaIntelligence';
import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { rebuildMediaRelations } from '@/lib/knowledge/media/relationRebuild';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  try {
    const result = await rebuildMediaRelations({
      limit: Number(value.limit) || 1000,
      dryRun: value.dryRun === true,
    });

    clearMediaIntelligenceCache();

    return json({ status: 'ok', result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'media_relations_rebuild_failed';

    console.error('[Media relations rebuild]', { code });

    return json({ error: 'Could not rebuild media relations.' }, 503);
  }
}
