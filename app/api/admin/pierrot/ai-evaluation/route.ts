import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { EVALUATION_CASES } from '@/lib/ai/evaluation/cases';
import { compareEvaluators } from '@/lib/ai/evaluation/compare';
import {
  createDeepSeekEvaluator,
  createGeminiEvaluator,
  evaluationAvailability,
} from '@/lib/ai/evaluation/providers';
import { buildProviderRoutingReport } from '@/lib/ai/providerRouting';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Owner-only Gemini vs DeepSeek evaluation.
 *
 * A live run spends provider credits, so it needs both an explicit admin
 * request and ALLOW_PAID_AI_EVALUATION=true. The route never stores or returns
 * generated answers; only deterministic scores and usage/cost metadata.
 */
export async function GET() {
  await requireAdmin();

  return NextResponse.json(
    {
      cases: EVALUATION_CASES.map((item) => ({
        id: item.id,
        language: item.language,
        purpose: item.purpose,
      })),
      availability: evaluationAvailability(),
      providerRouting: buildProviderRoutingReport(),
      instructions:
        'POST {"confirm":true} with ALLOW_PAID_AI_EVALUATION=true to run the identical case set against both providers.',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  await requireAdmin();

  const availability = evaluationAvailability();

  if (!availability.liveRunAllowed) {
    return NextResponse.json(
      {
        error:
          'Paid evaluation is disabled. Set ALLOW_PAID_AI_EVALUATION=true after owner approval.',
        code: 'evaluation_disabled',
      },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'Explicit confirmation is required.', code: 'confirmation_required' },
      { status: 400 }
    );
  }

  const evaluators = [];

  try {
    if (availability.gemini) evaluators.push(createGeminiEvaluator());
    if (availability.deepseek) evaluators.push(createDeepSeekEvaluator());
  } catch (error) {
    return NextResponse.json(
      {
        error: 'A provider is not configured correctly.',
        code: error instanceof Error ? error.message.slice(0, 80) : 'provider_config_failed',
      },
      { status: 503 }
    );
  }

  if (evaluators.length < 2) {
    return NextResponse.json(
      {
        error: 'Both GEMINI_API_KEY and DEEPSEEK_API_KEY are required for a comparison.',
        code: 'comparison_requires_two_providers',
      },
      { status: 503 }
    );
  }

  const report = await compareEvaluators({
    cases: EVALUATION_CASES,
    evaluators,
    maxOutputTokens: 400,
  });

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
