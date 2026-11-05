import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { indexMemoryBatch, readMemoryIndexStatus } from '@/lib/pierrot/memory/indexing';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json(await readMemoryIndexStatus(store, userId));
  } catch {
    return NextResponse.json(
      { error: 'Index status is unavailable.', code: 'index_unavailable' },
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

  const body = await req.json().catch(() => null);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const rawLimit = typeof record.limit === 'number' ? record.limit : 10;

  try {
    const result = await indexMemoryBatch(store, userId, {
      limit: rawLimit,
      force: record.force === true,
    });
    return NextResponse.json(result, { status: result.available ? 200 : 503 });
  } catch {
    return NextResponse.json(
      { error: 'Indexing could not be started.', code: 'index_failed' },
      { status: 503 }
    );
  }
}
