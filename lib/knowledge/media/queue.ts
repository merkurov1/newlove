import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import type {
  BrainJobRow,
  BrainRunRow,
  BrainStore,
} from '@/lib/knowledge/brain/store';

export type EnqueueMediaCoverageResult =
  | {
      status: 'queued';
      run: BrainRunRow | null;
      runId: string;
      job: BrainJobRow;
    }
  | {
      status: 'already_queued';
      run: null;
      runId: string;
      job: { id: string; status: string };
    };

/**
 * Adds a media coverage job to the existing Brain queue. `runId` lets bulk
 * imports share one run; a single save creates its own run.
 */
export async function enqueueMediaCoverageJob(input: {
  store: BrainStore;
  mediaRecordId: string;
  inputUrl: string;
  normalizedUrl?: string;
  requestedBy?: string | null;
  runId?: string | null;
  source?: string;
  sourceFormat?: 'url' | 'pdf' | 'txt' | 'text';
  storagePath?: string | null;
  sourceSha256?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  pageCount?: number | null;
  titleOverride?: string | null;
  authorOverride?: string | null;
  publishedAtOverride?: string | null;
  languageOverride?: string | null;
}): Promise<EnqueueMediaCoverageResult> {
  const active = await input.store.findActiveMediaJob(input.mediaRecordId);

  if (active) {
    await input.store
      .updateMediaRecord(input.mediaRecordId, {
        indexing_status: active.status === 'processing' ? 'processing' : 'pending',
        indexing_error: null,
      })
      .catch(() => undefined);

    return {
      status: 'already_queued',
      run: null,
      runId: active.run_id,
      job: { id: active.id, status: active.status },
    };
  }

  const normalizedUrl =
    input.normalizedUrl || normalizeSourceUrl(input.inputUrl);

  let run: BrainRunRow | null = null;
  let runId = input.runId || null;

  if (!runId) {
    run = await input.store.createRun({
      source: input.source || 'media_coverage',
      media_record_id: input.mediaRecordId,
      requested_by: input.requestedBy || null,
      requested_url: input.inputUrl.slice(0, 2048),
    });
    runId = run.id;
  }

  const jobs = await input.store.insertJobs(runId, [
    {
      inputUrl: input.inputUrl,
      normalizedUrl,
      sourceType: 'media_coverage',
      sourceFormat: input.sourceFormat || 'url',
      storagePath: input.storagePath || null,
      sourceSha256: input.sourceSha256 || null,
      originalFilename: input.originalFilename || null,
      mimeType: input.mimeType || null,
      byteSize: input.byteSize ?? null,
      pageCount: input.pageCount ?? null,
      titleOverride: input.titleOverride || null,
      authorOverride: input.authorOverride || null,
      publishedAtOverride: input.publishedAtOverride || null,
      languageOverride: input.languageOverride || null,
      mediaRecordId: input.mediaRecordId,
      requestedBy: input.requestedBy || null,
    },
  ]);

  const job = jobs[0];

  if (!job) throw new Error('media_coverage_job_create_failed');

  await input.store
    .updateMediaRecord(input.mediaRecordId, {
      indexing_status: 'pending',
      indexing_error: null,
    })
    .catch(() => undefined);

  return { status: 'queued', run, runId, job };
}
