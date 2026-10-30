import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { getGraphModel, isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { processNextGraphJob } from '@/lib/knowledge/graph/pipeline';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  if (!isGraphLlmConfigured()) {
    return json({ error: 'DEEPSEEK_API_KEY is not configured.' }, 503);
  }

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  try {
    const result = await processNextGraphJob({
      runId: id,
      store,
      model: getGraphModel(),
      workerId: `admin-graph-${Date.now()}`,
    });

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    console.error('[Brain graph next]', {
      code: message.startsWith('brain_graph') ? message : 'unexpected',
    });

    return json(
      {
        error:
          message === 'brain_graph_run_not_found'
            ? 'Run not found.'
            : 'The graph worker could not process the next document.',
      },
      message === 'brain_graph_run_not_found' ? 404 : 500
    );
  }
}
