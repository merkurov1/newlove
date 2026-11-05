import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import {
  getLatestSkillAnalysis,
  isSkillAnalysisStoreAvailable,
  listRecentSkillAnalyses,
} from '@/lib/pierrot/skills/analysis/store';
import { runOwnerSkillAnalysis } from '@/lib/pierrot/skills/analysis/run';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const inFlight = new Set<string>();

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { available: false, analysis: null, reason: 'storage_unavailable' },
      { status: 503 }
    );
  }

  try {
    const storeAvailable = await isSkillAnalysisStoreAvailable(store);
    if (!storeAvailable) {
      return NextResponse.json({
        available: false,
        analysis: null,
        reason: 'migration_required',
      });
    }

    const [latest, recent] = await Promise.all([
      getLatestSkillAnalysis(store, userId),
      listRecentSkillAnalyses(store, userId, 6),
    ]);

    return NextResponse.json({
      available: true,
      analysis: latest,
      recent,
    });
  } catch {
    return NextResponse.json(
      { available: false, analysis: null, reason: 'analysis_unavailable' },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { available: false, analysis: null, reason: 'storage_unavailable' },
      { status: 503 }
    );
  }

  if (inFlight.has(userId)) {
    return NextResponse.json(
      { error: 'An analysis is already running.', code: 'analysis_in_progress' },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const days = Math.min(
    180,
    Math.max(7, typeof record.days === 'number' ? Math.trunc(record.days) : 30)
  );

  inFlight.add(userId);

  try {
    const result = await runOwnerSkillAnalysis({
      store,
      userId,
      days,
    });

    return NextResponse.json({
      available: true,
      analysis: {
        id: result.analysis.id,
        status: result.status,
        report: result.analysis,
        createdAt: result.analysis.generatedAt,
      },
      persisted: result.persisted,
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        available: false,
        analysis: null,
        reason: 'analysis_failed',
      },
      { status: 503 }
    );
  } finally {
    inFlight.delete(userId);
  }
}
