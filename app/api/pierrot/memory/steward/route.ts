import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { runMemorySteward } from '@/lib/pierrot/memory/steward';

export const dynamic = 'force-dynamic';

function limitFrom(req: Request): number {
  const raw = new URL(req.url).searchParams.get('limit');
  const value = Number(raw || 40);
  return Number.isFinite(value) ? value : 40;
}

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Memory storage is unavailable.', code: 'memory_unavailable' },
      { status: 503 }
    );
  }

  try {
    const report = await runMemorySteward(store, userId, {
      apply: false,
      limitCandidates: limitFrom(req),
    });
    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: 'Memory steward is temporarily unavailable.', code: 'steward_unavailable' },
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
      { error: 'Memory storage is unavailable.', code: 'memory_unavailable' },
      { status: 503 }
    );
  }

  try {
    // Only safe, non-destructive actions are applied: expired temporary notes
    // are archived, never deleted. Everything ambiguous is returned for review.
    const report = await runMemorySteward(store, userId, {
      apply: true,
      limitCandidates: limitFrom(req),
    });
    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: 'Memory steward is temporarily unavailable.', code: 'steward_unavailable' },
      { status: 503 }
    );
  }
}
