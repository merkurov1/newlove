import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { runId } = await params;

  try {
    const run = await store.getRun(runId);

    if (!run) return json({ error: 'Run not found.' }, 404);

    const jobs = await store.getJobs(runId);
    const mediaIds = Array.from(
      new Set(
        jobs
          .map((job) => job.media_record_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const [records, documents] = await Promise.all([
      store.getMediaRecordsByIds(mediaIds),
      store.listMediaCoverageDocuments(mediaIds),
    ]);

    const recordById = new Map(records.map((record) => [record.id, record]));
    const documentByRecord = new Map(
      documents.map((document) => [document.mediaRecordId, document])
    );

    return json({
      status: 'ok',
      run,
      progress: computeBrainProgress(jobs),
      rows: jobs.map((job) => {
        const record = job.media_record_id ? recordById.get(job.media_record_id) || null : null;
        const document = job.media_record_id
          ? documentByRecord.get(job.media_record_id) || null
          : null;

        return {
          jobId: job.id,
          inputUrl: job.input_url,
          normalizedUrl: job.normalized_url,
          jobStatus: job.status,
          attempts: job.attempts,
          errorCode: job.error_code,
          errorDetail: job.error_detail,
          processedAt: job.processed_at,
          mediaRecordId: job.media_record_id,
          title: record?.title || job.title || null,
          outlet: record?.outlet || null,
          publishedDate: record?.published_date || null,
          lang: record?.lang || job.language || null,
          detectedLanguage: document?.language || null,
          kind: record?.kind || null,
          topic: record?.topic || null,
          archiveStatus: record?.status || null,
          coverageStatus: document?.coverageStatus || null,
          textQuality: document?.textQuality || null,
          extractionStatus: document?.extractionStatus || null,
          ingestionStatus: document?.ingestionStatus || null,
          charCount: document?.sourceCharCount ?? 0,
          chunkCount: document?.chunkCount ?? 0,
          documentId: document?.documentId || null,
          coverageErrorCode: job.error_code,
        };
      }),
    });
  } catch {
    return json({ error: 'Could not read the bulk import run.' }, 503);
  }
}
