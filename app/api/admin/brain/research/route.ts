import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { answerBrainResearchQuestion } from '@/lib/knowledge/graph/research';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  if (!isGraphLlmConfigured()) {
    return json({ error: 'DEEPSEEK_API_KEY is not configured.' }, 503);
  }

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === 'string' ? body.question.trim() : '';

  if (!question || question.length > 2000) {
    return json({ error: 'Provide a question between 1 and 2000 characters.' }, 400);
  }

  try {
    const result = await answerBrainResearchQuestion({ question, store });
    return json({ status: 'ok', ...result });
  } catch (error) {
    console.error('[Brain research]', {
      code: error instanceof Error ? error.message : 'research_failed',
    });

    return json({ error: 'Could not answer the research question.' }, 503);
  }
}
