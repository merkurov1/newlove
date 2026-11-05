import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import {
  getLatestObservatoryRun,
  listObservatoryRuns,
  runDecisionObservatory,
} from '@/lib/pierrot/observatory/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Observatory storage is unavailable.', code: 'observatory_unavailable' },
      { status: 503 }
    );
  }

  try {
    const latest = await getLatestObservatoryRun(store, userId);
    const runs = await listObservatoryRuns(store, userId, 8);
    return NextResponse.json({ available: true, latest, runs });
  } catch {
    return NextResponse.json(
      { error: 'The observatory could not be read.', code: 'observatory_unavailable' },
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
      { error: 'Observatory storage is unavailable.', code: 'observatory_unavailable' },
      { status: 503 }
    );
  }

  try {
    // Manual, one-off pass. The page never calls this automatically.
    const run = await runDecisionObservatory(store, userId);
    return NextResponse.json({ available: true, run });
  } catch {
    return NextResponse.json(
      { error: 'The observatory run failed.', code: 'observatory_failed' },
      { status: 503 }
    );
  }
}
