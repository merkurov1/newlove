import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import {
  createMemoryRecord,
  getMemorySummary,
  listMemoryRecords,
} from '@/lib/pierrot/memory/store';
import type { PierrotMemoryKind, PierrotMemoryStatus } from '@/lib/pierrot/memory/types';

export const dynamic = 'force-dynamic';

const KINDS = new Set<PierrotMemoryKind>(['memory', 'saved', 'reminder']);
const STATUSES = new Set<PierrotMemoryStatus>([
  'current',
  'completed',
  'archived',
  'superseded',
  'rejected',
  'uncertain',
]);

function parseKind(value: unknown): PierrotMemoryKind | null {
  return typeof value === 'string' && KINDS.has(value as PierrotMemoryKind)
    ? (value as PierrotMemoryKind)
    : null;
}

function parseStatus(value: unknown): PierrotMemoryStatus | 'active' | null {
  if (value === 'active') return 'active';
  return typeof value === 'string' && STATUSES.has(value as PierrotMemoryStatus)
    ? (value as PierrotMemoryStatus)
    : null;
}

function parseDate(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

  const url = new URL(req.url);
  const view = url.searchParams.get('view');

  try {
    if (view === 'summary') {
      return NextResponse.json(await getMemorySummary(store, userId));
    }

    const kind = parseKind(url.searchParams.get('kind'));
    const status = parseStatus(url.searchParams.get('status'));
    const query = url.searchParams.get('q')?.trim() || null;
    const limit = Number(url.searchParams.get('limit') || 100);

    const records = await listMemoryRecords(store, {
      userId,
      ...(kind ? { kinds: [kind] } : {}),
      ...(status ? { status } : { status: 'active' }),
      query,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    return NextResponse.json({ available: true, records });
  } catch {
    return NextResponse.json(
      { error: 'Memory is temporarily unavailable.', code: 'memory_unavailable' },
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid memory payload.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const kind = parseKind(record.kind);
  const content = typeof record.content === 'string' ? record.content.trim() : '';

  if (!kind) {
    return NextResponse.json({ error: 'Invalid memory kind.' }, { status: 400 });
  }
  if (!content || content.length > 4_000) {
    return NextResponse.json({ error: 'Memory content is required.' }, { status: 400 });
  }

  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim().slice(0, 200)
      : undefined;
  const rationale =
    typeof record.rationale === 'string' ? record.rationale.trim().slice(0, 4_000) : null;
  const project = typeof record.project === 'string' ? record.project.trim().slice(0, 120) : null;
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const reviewAt = parseDate(record.reviewAt);
  const conversationId = typeof record.conversationId === 'string' ? record.conversationId : null;
  const messageId = typeof record.messageId === 'string' ? record.messageId : null;

  if (record.reviewAt && !reviewAt) {
    return NextResponse.json({ error: 'Invalid reminder date.' }, { status: 400 });
  }

  try {
    const created = await createMemoryRecord(store, userId, {
      kind,
      ...(title ? { title } : {}),
      content,
      rationale,
      project,
      tags,
      reviewAt,
      conversationId,
      messageId,
    });

    return NextResponse.json({ available: true, record: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Memory could not be saved.', code: 'memory_write_failed' },
      { status: 503 }
    );
  }
}
