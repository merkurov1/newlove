import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { processNextBrainJob } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { createOpenRouterEmbeddingClientFromEnv } from '@/lib/knowledge/rag/embeddings';

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

  const { id } = await params;

  try {
    const result = await processNextBrainJob({
      runId: id,
      store,
      embeddingClient,
      workerId: `admin-${Date.now()}`,
    });

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
  }
}
