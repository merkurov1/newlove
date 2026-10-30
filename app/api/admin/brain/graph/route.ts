import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { loadBrainGraph, parseGraphTypes } from '@/lib/knowledge/graph/visualization';

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
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const types = parseGraphTypes(url.searchParams.get('types'));
  const limit = Number(url.searchParams.get('limit') || 250);

  try {
    const payload = await loadBrainGraph(store, { q, types, limit });

    return json({ status: 'ok', ...payload });
  } catch (error) {
    console.error('[Brain graph]', {
      code: error instanceof Error ? error.message : 'graph_query_failed',
    });

    return json({ error: 'Could not load the knowledge graph.' }, 503);
  }
}
