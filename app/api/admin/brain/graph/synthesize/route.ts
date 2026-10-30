import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { synthesizeNext, type SynthesisStep } from '@/lib/knowledge/graph/synthesis';

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

const STEPS: SynthesisStep[] = ['documents', 'chapters', 'projects', 'themes'];

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  if (!isGraphLlmConfigured()) {
    return json({ error: 'DEEPSEEK_API_KEY is not configured.' }, 503);
  }

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const step = body.step as SynthesisStep;

  if (!STEPS.includes(step)) {
    return json({ error: 'step must be documents, chapters, projects or themes.' }, 400);
  }

  try {
    const result = await synthesizeNext({ store, step });
    return json({ status: 'ok', ...result });
  } catch (error) {
    console.error('[Brain graph synthesis]', {
      step,
      code: error instanceof Error ? error.message : 'synthesis_failed',
    });

    return json({ error: 'Could not generate thematic summaries.' }, 503);
  }
}
