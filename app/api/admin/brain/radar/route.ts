import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import type { BrainRadarSuggestion } from '@/lib/knowledge/graph/types';

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
  const status = url.searchParams.get('status');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);

  try {
    let query = store.client
      .from('brain_editorial_suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status === 'pending' || status === 'approved' || status === 'dismissed') {
      query = query.eq('status', status);
    }

    const [suggestionsResult, runsResult] = await Promise.all([
      query,
      store.client
        .from('brain_radar_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (suggestionsResult.error) throw new Error('radar_suggestions_query_failed');

    return json({
      status: 'ok',
      suggestions: (Array.isArray(suggestionsResult.data)
        ? suggestionsResult.data
        : []) as unknown as BrainRadarSuggestion[],
      runs: Array.isArray(runsResult.data) ? runsResult.data : [],
    });
  } catch {
    return json({ error: 'Could not read the editorial radar.' }, 503);
  }
}
