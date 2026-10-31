import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';
import { runMediaAnalysis } from '@/lib/knowledge/media/analyze';
import { assertWorkerBudget } from '@/lib/operations/budgets';
import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';
import { assertWorkerEnabled } from '@/lib/operations/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) return json({ error: 'Invalid media record id.' }, 400);

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body && typeof body === 'object' && body.force === true);

  try {
    await assertWorkerEnabled('media');
    await assertWorkerBudget('media');
    await assertCircuitClosed('llm');

    const store = createMediaAnalysisStore();

    if (!store) return json({ error: 'Media analysis database is not configured.' }, 503);

    const active = await store.findActiveRun(id).catch(() => null);

    if (active && active.status === 'processing') {
      return json(
        {
          error: 'Analysis is already running for this publication.',
          runId: active.id,
          status: active.status,
        },
        409
      );
    }

    if (active && active.status === 'pending') {
      return json(
        {
          error: 'Analysis is already queued for this publication.',
          runId: active.id,
          status: active.status,
        },
        409
      );
    }

    const result = await runMediaAnalysis({
      mediaRecordId: id,
      force,
    });

    await recordCircuitSuccess('llm');

    const analysis = await store.getCurrentAnalysis(id);

    return json({
      status: 'ok',
      result,
      analysis,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'media_analysis_failed';

    if (code.startsWith('circuit_open')) {
      await recordCircuitFailure({ dependency: 'llm', errorCode: code });
      return json({ error: 'The LLM circuit is open. Try again after cooldown.' }, 503);
    }

    if (code === 'worker_kill_switch_enabled' || code.startsWith('worker_disabled')) {
      return json({ error: code }, 423);
    }

    if (code.startsWith('worker_budget_exhausted')) {
      return json({ error: code }, 429);
    }

    if (code === 'media_analysis_not_configured') {
      return json(
        {
          error:
            'Media analysis model is not configured. Set DEEPSEEK_API_KEY before running analysis.',
        },
        503
      );
    }

    if (code === 'media_analysis_record_not_found') {
      return json({ error: 'Media record or knowledge document not found.' }, 404);
    }

    if (code === 'media_analysis_no_chunks') {
      return json(
        {
          error:
            'This publication has no indexed text chunks. Complete Media coverage ingestion first.',
        },
        409
      );
    }

    console.error('[Media analysis]', { code });

    return json({ error: 'Could not analyze this publication.' }, 503);
  }
}
