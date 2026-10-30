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
}): Promise<EnqueueMediaCoverageResult> {
  const active = await input.store.findActiveMediaJob(input.mediaRecordId);

  if (active) {
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
      mediaRecordId: input.mediaRecordId,
      requestedBy: input.requestedBy || null,
    },
  ]);

  const job = jobs[0];

  if (!job) throw new Error('media_coverage_job_create_failed');

  return { status: 'queued', run, runId, job };
}
