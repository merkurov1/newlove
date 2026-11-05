import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { loadBrainStatus } from '@/lib/pierrot/memory/brainStatus';

export const dynamic = 'force-dynamic';

function detailed(req: Request): boolean {
  const value = new URL(req.url).searchParams.get('detail');
  return value === '1' || value === 'true' || value === 'full';
}

export async function GET(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();

  try {
    const snapshot = await loadBrainStatus(store, userId, {
      detailed: detailed(req),
    });
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      {
        state: 'degraded',
        label: 'Degraded',
        summary: 'Проверка состояния не выполнена: хранилище недоступно.',
        checkedAt: null,
        stale: true,
        storageAvailable: false,
        retrievalAvailable: false,
        embeddingProviderAvailable: false,
        metrics: {
          activeRecords: 0,
          archivedRecords: 0,
          uncertainRecords: 0,
          openTasks: 0,
          overdueTasks: 0,
          staleTemporary: 0,
          conflicts: 0,
          embeddingsReady: 0,
          embeddingsPending: 0,
          embeddingsFailed: 0,
          linkedSupersessions: 0,
        },
        issues: [
          {
            code: 'storage_unavailable',
            severity: 'error',
            message: 'The status check could not read memory storage.',
          },
        ],
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}

export async function POST(req: Request) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const store = createPierrotStore();

  try {
    // On-demand check. No model call, no embedding call, no scheduled repeat.
    const snapshot = await loadBrainStatus(store, userId, {
      force: true,
      detailed: true,
    });
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Brain status check failed.', code: 'status_unavailable' },
      { status: 503 }
    );
  }
}
