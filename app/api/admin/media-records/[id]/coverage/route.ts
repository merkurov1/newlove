import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  if (!isUuid(id)) return json({ error: 'Invalid media record id.' }, 400);

  try {
    const record = await store.getMediaRecord(id);

    if (!record) return json({ error: 'Media record not found.' }, 404);

    const [job, document] = await Promise.all([
      store.getLatestMediaJob(id),
      store.findMediaCoverageDocument({
        mediaRecordId: id,
        canonicalUrl: record.canonical_url,
      }),
    ]);

    return json({
      status: 'ok',
      record: {
        id: record.id,
        title: record.title,
        outlet: record.outlet,
        url: record.url,
        canonicalUrl: record.canonical_url,
        publishedDate: record.published_date,
        lang: record.lang,
        kind: record.kind,
        topic: record.topic,
        archiveStatus: record.status,
      },
      coverage: document
        ? {
            mediaRecordId: id,
            documentId: document.documentId,
            sourceType: document.sourceType,
            coverageStatus: document.coverageStatus,
            textQuality: document.textQuality,
            coverageMethod: document.coverageMethod,
            ingestionStatus: document.ingestionStatus,
            extractionStatus: document.extractionStatus,
            chunkCount: document.chunkCount,
            sourceCharCount: document.sourceCharCount,
            contentHash: document.contentHash,
            canonicalUrl: document.canonicalUrl,
            language: document.language,
            processedAt: document.processedAt,
            jobStatus: job?.status ?? null,
            jobErrorCode: job?.error_code ?? null,
            jobErrorDetail: job?.error_detail ?? null,
          }
        : null,
      latestJob: job
        ? {
            id: job.id,
            runId: job.run_id,
            status: job.status,
            attempts: job.attempts,
            documentId: job.document_id,
            errorCode: job.error_code,
            errorDetail: job.error_detail,
            processedAt: job.processed_at,
          }
        : null,
    });
  } catch {
    return json({ error: 'Could not read media coverage status.' }, 503);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  if (!isUuid(id)) return json({ error: 'Invalid media record id.' }, 400);

  const body = await readBody(request);

  try {
    const record = await store.getMediaRecord(id);

    if (!record) return json({ error: 'Media record not found.' }, 404);
    if (record.status === 'archived') {
      return json({ error: 'Archived media records cannot be indexed.' }, 409);
    }

    const inputUrl = record.url || record.canonical_url;
    let normalizedUrl: string;

    try {
      normalizedUrl = normalizeSourceUrl(inputUrl);
    } catch {
      return json({ error: 'The media record has no usable publication URL.' }, 400);
    }

    const active = await store.findActiveMediaJob(id);

    if (active) {
      return json(
        {
          status: 'already_queued',
          runId: active.run_id,
          jobId: active.id,
          jobStatus: active.status,
          nextUrl: `/api/admin/brain/runs/${active.run_id}/next`,
        },
        202
      );
    }

    const queued = await enqueueMediaCoverageJob({
      store,
      mediaRecordId: id,
      inputUrl,
      normalizedUrl,
      requestedBy: auth.actor,
      source: 'media_coverage_manual',
    });

    return json(
      {
        status: queued.status,
        runId: queued.runId,
        jobId: queued.job.id,
        jobStatus: queued.job.status,
        nextUrl: `/api/admin/brain/runs/${queued.runId}/next`,
      },
      202
    );
  } catch (error) {
    console.error('[Media coverage] enqueue failed', {
      code: error instanceof Error ? error.message : 'media_coverage_enqueue_failed',
    });

    return json({ error: 'Could not queue media coverage ingestion.' }, 503);
  }
}
