import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import { deleteMemoryRecord, updateMemoryRecord } from '@/lib/pierrot/memory/store';
import type { PierrotMemoryStatus } from '@/lib/pierrot/memory/types';
import { isPierrotUserId } from '@/lib/pierrot/identity';

export const dynamic = 'force-dynamic';

const STATUSES = new Set<PierrotMemoryStatus>([
  'current',
  'completed',
  'archived',
  'superseded',
  'rejected',
  'uncertain',
]);

function parseDate(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isPierrotUserId(id)) {
    return NextResponse.json({ error: 'Invalid memory id.' }, { status: 400 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Memory storage is unavailable.', code: 'memory_unavailable' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid memory payload.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const status =
    typeof record.status === 'string' && STATUSES.has(record.status as PierrotMemoryStatus)
      ? (record.status as PierrotMemoryStatus)
      : undefined;

  if (record.status !== undefined && !status) {
    return NextResponse.json({ error: 'Invalid memory status.' }, { status: 400 });
  }

  const reviewAt = record.reviewAt !== undefined ? parseDate(record.reviewAt) : undefined;

  if (record.reviewAt !== undefined && record.reviewAt !== null && !reviewAt) {
    return NextResponse.json({ error: 'Invalid reminder date.' }, { status: 400 });
  }

  try {
    const updated = await updateMemoryRecord(store, userId, id, {
      ...(typeof record.title === 'string' ? { title: record.title } : {}),
      ...(typeof record.content === 'string' ? { content: record.content } : {}),
      ...(record.rationale === null || typeof record.rationale === 'string'
        ? { rationale: record.rationale as string | null }
        : {}),
      ...(record.project === null || typeof record.project === 'string'
        ? { project: record.project as string | null }
        : {}),
      ...(Array.isArray(record.tags)
        ? { tags: record.tags.filter((tag): tag is string => typeof tag === 'string') }
        : {}),
      ...(reviewAt !== undefined ? { reviewAt } : {}),
      ...(status ? { status } : {}),
    });

    return NextResponse.json({ available: true, record: updated });
  } catch {
    return NextResponse.json(
      { error: 'Memory could not be updated.', code: 'memory_update_failed' },
      { status: 503 }
    );
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await resolveMemoryOwner(req);
  if (!userId) {
    return NextResponse.json({ error: 'Owner only.', code: 'owner_only' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isPierrotUserId(id)) {
    return NextResponse.json({ error: 'Invalid memory id.' }, { status: 400 });
  }

  const store = createPierrotStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Memory storage is unavailable.', code: 'memory_unavailable' },
      { status: 503 }
    );
  }

  try {
    const deleted = await deleteMemoryRecord(store, userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Memory not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: 'Memory could not be deleted.', code: 'memory_delete_failed' },
      { status: 503 }
    );
  }
}
