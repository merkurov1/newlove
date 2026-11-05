import { NextResponse } from 'next/server';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { resolveMemoryOwner } from '@/lib/pierrot/memory/auth';
import {
  createMemoryRecord,
  getMemorySummary,
  listMemoryRecords,
  searchMemory,
  touchMemoryRecords,
} from '@/lib/pierrot/memory/store';
import { readMemoryIndexStatus } from '@/lib/pierrot/memory/indexing';
import { runMemorySteward } from '@/lib/pierrot/memory/steward';
import {
  isPierrotMemoryKind,
  isPierrotMemoryStatus,
  type PierrotMemoryKind,
  type PierrotMemoryStatus,
} from '@/lib/pierrot/memory/types';

export const dynamic = 'force-dynamic';

const KINDS = new Set<PierrotMemoryKind>([
  'memory',
  'saved',
  'reminder',
  'decision',
  'position',
  'preference',
  'constraint',
  'task',
  'rejected_recommendation',
]);
const STATUSES = new Set<PierrotMemoryStatus>([
  'current',
  'completed',
  'archived',
  'superseded',
  'rejected',
  'uncertain',
]);

function parseKind(value: unknown): PierrotMemoryKind | null {
  return isPierrotMemoryKind(value) && KINDS.has(value) ? value : null;
}

function parseStatus(value: unknown): PierrotMemoryStatus | 'active' | 'all' | 'archive' | null {
  if (value === 'active') return 'active';
  if (value === 'all') return 'all';
  if (value === 'archive') return 'archive';
  return isPierrotMemoryStatus(value) && STATUSES.has(value) ? value : null;
}

function parseDate(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseTags(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const tags = value
    .split(',')
    .map((tag) => tag.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);
  return tags.length > 0 ? tags : undefined;
}

function boolParam(value: string | null): boolean {
  return value === '1' || value === 'true';
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

    if (view === 'index') {
      return NextResponse.json(await readMemoryIndexStatus(store, userId));
    }

    if (view === 'steward') {
      const report = await runMemorySteward(store, userId, { apply: false });
      return NextResponse.json(report);
    }

    const kind = parseKind(url.searchParams.get('kind'));
    const status = parseStatus(url.searchParams.get('status'));
    const query = url.searchParams.get('q')?.trim() || '';
    const limit = Number(url.searchParams.get('limit') || 40);
    const includeArchive =
      boolParam(url.searchParams.get('archive')) ||
      status === 'archived' ||
      status === 'completed' ||
      status === 'all' ||
      status === 'archive';
    const historyOnly = boolParam(url.searchParams.get('history'));

    if (view === 'search' || query) {
      const result = await searchMemory(store, {
        userId,
        query,
        ...(kind ? { kinds: [kind] } : {}),
        ...(status === 'archive'
          ? {
              statuses: [
                'archived',
                'completed',
                'superseded',
                'rejected',
              ] as PierrotMemoryStatus[],
            }
          : status && status !== 'active' && status !== 'all'
            ? { statuses: [status] }
            : {}),
        project: url.searchParams.get('project'),
        tags: parseTags(url.searchParams.get('tags')),
        includeArchive,
        historyOnly,
        limit: Number.isFinite(limit) ? limit : 40,
        lexicalOnly: boolParam(url.searchParams.get('lexical')),
      });

      if (query && result.records.length > 0) {
        await touchMemoryRecords(
          store,
          userId,
          result.records.map((record) => record.id)
        );
      }

      return NextResponse.json({
        available: true,
        records: result.records,
        search: {
          semanticUsed: result.semanticUsed,
          archiveSearched: result.archiveSearched,
          lexicalFallback: result.lexicalFallback,
          ...(result.semanticUnavailableReason ? { reason: result.semanticUnavailableReason } : {}),
        },
      });
    }

    const records = await listMemoryRecords(store, {
      userId,
      ...(kind ? { kinds: [kind] } : {}),
      ...(status === 'archive'
        ? { statuses: ['archived', 'completed', 'superseded', 'rejected'] as PierrotMemoryStatus[] }
        : status && status !== 'all'
          ? { status }
          : status === 'all'
            ? {}
            : { status: 'active' }),
      ...(includeArchive ? { includeArchive: true } : {}),
      query: query || null,
      project: url.searchParams.get('project'),
      tags: parseTags(url.searchParams.get('tags')),
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
  const importance =
    typeof record.importance === 'number' && Number.isFinite(record.importance)
      ? record.importance
      : undefined;
  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? record.confidence
      : undefined;
  const status = typeof record.status === 'string' ? parseStatus(record.status) : null;

  if (record.reviewAt && !reviewAt) {
    return NextResponse.json({ error: 'Invalid reminder date.' }, { status: 400 });
  }

  if (
    record.status !== undefined &&
    (!status || status === 'active' || status === 'all' || status === 'archive')
  ) {
    return NextResponse.json({ error: 'Invalid memory status.' }, { status: 400 });
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
      ...(importance !== undefined ? { importance } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(status && status !== 'active' && status !== 'all' && status !== 'archive'
        ? { status }
        : {}),
      possibleConflict: record.possibleConflict === true,
    });

    return NextResponse.json({ available: true, record: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'memory_replacement_ambiguous') {
      return NextResponse.json(
        {
          error: 'Уточни, какую именно запись заменить. Ничего не изменено.',
          code: 'clarification_required',
        },
        { status: 409 }
      );
    }

    if (message === 'memory_status_unsupported') {
      return NextResponse.json(
        {
          error: 'Memory status migration is not applied.',
          code: 'memory_migration_required',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Memory could not be saved.', code: 'memory_write_failed' },
      { status: 503 }
    );
  }
}
