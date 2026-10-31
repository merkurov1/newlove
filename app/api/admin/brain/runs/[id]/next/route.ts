import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { queueGraphForIngestionRun } from '@/lib/knowledge/brain/graphQueue';
import { processNextBrainJob } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { createOpenRouterEmbeddingClientFromEnv } from '@/lib/knowledge/rag/embeddings';
import { beginWorkerInvocation } from '@/lib/operations/guard';

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

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const autoGraph = !(body && typeof body === 'object' && body.autoGraph === false);
  const workerId = `admin-brain-next-${Date.now()}`;
  const guard = await beginWorkerInvocation({
    scope: 'brain',
    trigger: 'admin',
    workerId,
    maxDurationMs: 240_000,
  });

  if (!guard.ok) {
    return json({ status: 'skipped', reason: guard.reason }, 200);
  }

  try {
    let embeddingClient;

    try {
      embeddingClient = createOpenRouterEmbeddingClientFromEnv(process.env);
    } catch {
      return json(
        {
          error:
            'Embedding is not configured. Set UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 and OPENROUTER_API_KEY.',
        },
        503
      );
    }

    const result = await processNextBrainJob({
      runId: id,
      store,
      embeddingClient,
      workerId,
    });

    if (result.state === 'done') {
      const graph = await queueGraphForIngestionRun({ store, runId: id, enabled: autoGraph });
      return json({ ...result, graph });
    }

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    console.error('[Brain ingestion next]', {
      code: message.startsWith('brain_') ? message : 'unexpected',
    });

    return json(
      {
        error:
          message === 'brain_run_not_found'
            ? 'Run not found.'
            : 'The ingestion worker could not process the next article.',
      },
      message === 'brain_run_not_found' ? 404 : 500
    );
  } finally {
    await guard.finish({ status: 'completed' });
  }
}
