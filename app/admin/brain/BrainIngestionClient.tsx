'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AnalyzeStatus = 'new' | 'existing' | 'invalid' | 'duplicate_in_input';

type AnalyzeRow = {
  input: string;
  normalizedUrl: string | null;
  status: AnalyzeStatus;
  reason?: string;
  documentId?: string;
  title?: string;
};

type BrainJob = {
  id: string;
  input_url: string;
  normalized_url: string;
  canonical_url: string | null;
  status: 'queued' | 'processing' | 'completed' | 'duplicate' | 'partial' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  title: string | null;
  error_code: string | null;
  error_detail: string | null;
  extraction_status: string | null;
  extraction_metadata: Record<string, unknown> | null;
  document_id: string | null;
  updated_at?: string | null;
};

type BrainProgress = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  duplicate: number;
  partial: number;
  failed: number;
  cancelled: number;
  done: boolean;
};

type BrainRun = {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
};

type RecentRun = {
  run: BrainRun;
  progress: BrainProgress;
};

type NextResponse =
  | { state: 'processed'; job: BrainJob; progress: BrainProgress; runStatus: string }
  | { state: 'waiting'; progress: BrainProgress; runStatus: string; nextRetryAt: string | null }
  | { state: 'done'; progress: BrainProgress; runStatus: string }
  | { state: 'paused'; progress: BrainProgress; runStatus: string };

const STATUS_LABEL: Record<BrainJob['status'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Indexed',
  duplicate: 'Duplicate',
  partial: 'Partial',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<BrainJob['status'], string> = {
  queued: 'border-[#D9D3CD] bg-[#F6F3EF] text-[#625D58]',
  processing: 'border-[#C9D7E8] bg-[#EDF3FA] text-[#2E5A86]',
  completed: 'border-[#C7D8C4] bg-[#EEF5EC] text-[#3F6B39]',
  duplicate: 'border-[#E7D9BF] bg-[#FBF4E6] text-[#87652A]',
  partial: 'border-[#EBCFCF] bg-[#FBEFEF] text-[#8E3C3C]',
  failed: 'border-[#E7C9D2] bg-[#F8EAF0] text-[#8A1235]',
  cancelled: 'border-[#D9D3CD] bg-[#F6F3EF] text-[#89827B]',
};

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`
    );
  }

  return data as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function ProgressBar({ progress }: { progress: BrainProgress | null }) {
  if (!progress) return null;

  const processed =
    progress.completed +
    progress.duplicate +
    progress.partial +
    progress.failed +
    progress.cancelled;
  const percentage = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
          {processed} / {progress.total} processed
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
          {progress.completed} indexed · {progress.duplicate} duplicate ·{' '}
          {progress.failed + progress.partial} errors
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden bg-[#EEE9E4]">
        <div
          className="h-full bg-[#990F3D] transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BrainJob['status'] }) {
  return (
    <span
      className={`inline-flex border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function extractionLabel(value: string | null): string {
  if (!value) return '—';
  if (value === 'complete' || value === 'ok') return 'Complete';
  if (value === 'needs_review') return 'Needs review';
  if (value === 'partial') return 'Partial';
  if (value === 'failed') return 'Failed';
  return value;
}

function stageLabel(job: BrainJob): string {
  const raw =
    job.extraction_metadata && typeof job.extraction_metadata.stage === 'string'
      ? String(job.extraction_metadata.stage)
      : '';

  if (raw) return raw.replace(/_/g, ' ');
  if (job.status === 'queued') return 'queued';
  if (job.status === 'processing') return 'processing';
  if (job.status === 'duplicate') return 'done';
  if (job.status === 'completed') return 'done';
  return job.status.replace(/_/g, ' ');
}

function jobChunkCount(job: BrainJob): number | null {
  const value =
    job.extraction_metadata && typeof job.extraction_metadata.chunks === 'number'
      ? job.extraction_metadata.chunks
      : null;

  return value;
}

function jobDuplicateReason(job: BrainJob): string | null {
  if (job.status !== 'duplicate') return null;

  const value =
    job.extraction_metadata && typeof job.extraction_metadata.duplicate_reason === 'string'
      ? job.extraction_metadata.duplicate_reason
      : null;

  return value;
}

function canRetryJob(job: BrainJob): boolean {
  return ['failed', 'partial', 'duplicate'].includes(job.status);
}

function queuePosition(jobs: BrainJob[], jobId: string): string {
  const active = jobs.filter((job) => job.status === 'queued' || job.status === 'processing');
  const index = active.findIndex((job) => job.id === jobId);

  return index >= 0 ? `#${index + 1}` : '—';
}

export default function BrainIngestionClient() {
  const [urlsText, setUrlsText] = useState('');
  const [analyzed, setAnalyzed] = useState<AnalyzeRow[]>([]);
  const [run, setRun] = useState<BrainRun | null>(null);
  const [jobs, setJobs] = useState<BrainJob[]>([]);
  const [progress, setProgress] = useState<BrainProgress | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [busy, setBusy] = useState<
    'analyze' | 'start' | 'process' | 'pause' | 'resume' | 'retry' | null
  >(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [recheckExisting, setRecheckExisting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopRef = useRef(false);
  const loopRef = useRef(false);

  const refreshRecent = useCallback(async () => {
    try {
      const data = await api<{ runs: RecentRun[] }>('/api/admin/brain/runs');
      setRecent(data.runs || []);
    } catch {
      // Recent runs are informational; the main workflow still works.
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    return () => {
      stopRef.current = true;
    };
  }, []);

  const refreshRun = useCallback(async (runId: string) => {
    const data = await api<{ run: BrainRun; jobs: BrainJob[]; progress: BrainProgress }>(
      `/api/admin/brain/runs/${runId}`
    );

    setRun(data.run);
    setJobs(data.jobs || []);
    setProgress(data.progress);

    return data;
  }, []);

  const processLoop = useCallback(
    async (runId: string) => {
      if (loopRef.current) return;

      loopRef.current = true;
      stopRef.current = false;
      setBusy('process');

      try {
        for (let iteration = 0; iteration < 2000; iteration += 1) {
          if (stopRef.current) break;

          const result = await api<NextResponse>(`/api/admin/brain/runs/${runId}/next`, {
            method: 'POST',
          });

          setProgress(result.progress);
          await refreshRun(runId);

          if (result.state === 'done' || result.state === 'paused') {
            setMessage(
              result.state === 'done'
                ? result.runStatus === 'completed_with_errors'
                  ? 'Queue finished with some errors. Review the failed rows and retry them.'
                  : 'Queue finished. All available articles are indexed.'
                : 'Queue paused. Progress is saved.'
            );
            break;
          }

          if (result.state === 'waiting') {
            const waitMs = result.nextRetryAt
              ? Math.max(2000, Math.min(15000, new Date(result.nextRetryAt).getTime() - Date.now()))
              : 3000;

            await sleep(waitMs);
          }
        }
      } catch (requestError) {
        setError(errorCode(requestError));
      } finally {
        loopRef.current = false;
        setBusy(null);
        void refreshRecent();
      }
    },
    [refreshRecent, refreshRun]
  );

  const handleAnalyze = async () => {
    setError(null);
    setMessage(null);
    setBusy('analyze');

    try {
      const data = await api<{ rows: AnalyzeRow[]; summary: Record<string, number> }>(
        '/api/admin/brain/analyze',
        {
          method: 'POST',
          body: JSON.stringify({ urls: urlsText }),
        }
      );

      setAnalyzed(data.rows || []);
      setMessage(
        `${data.summary.new || 0} new · ${data.summary.existing || 0} already indexed · ${
          data.summary.invalid || 0
        } invalid · ${data.summary.duplicate_in_input || 0} repeated`
      );
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const handleStart = async () => {
    setError(null);
    setMessage(null);
    setBusy('start');

    try {
      const selected = analyzed.filter(
        (row) =>
          row.normalizedUrl &&
          (row.status === 'new' || (recheckExisting && row.status === 'existing'))
      );

      const urls = selected.length > 0 ? selected.map((row) => row.input) : urlsText;

      const data = await api<{
        status: string;
        run: BrainRun | null;
        jobs: BrainJob[];
        progress: BrainProgress | null;
        skipped: Array<{ reason: string }>;
        message?: string;
      }>('/api/admin/brain/runs', {
        method: 'POST',
        body: JSON.stringify({ urls, recheckExisting }),
      });

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);

      if (!data.run) {
        setMessage(data.message || 'Nothing new to process.');
        return;
      }

      setMessage(
        `Queued ${data.jobs.length} article${data.jobs.length === 1 ? '' : 's'}. Processing sequentially…`
      );

      await processLoop(data.run.id);
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const handlePause = async () => {
    if (!run) return;

    stopRef.current = true;
    setBusy('pause');

    try {
      const data = await api<{ run: BrainRun; jobs: BrainJob[]; progress: BrainProgress }>(
        `/api/admin/brain/runs/${run.id}/pause`,
        { method: 'POST' }
      );

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);
      setMessage('Queue paused. You can resume it later from this page.');
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async () => {
    if (!run) return;

    setError(null);
    setBusy('resume');

    try {
      const data = await api<{ run: BrainRun; jobs: BrainJob[]; progress: BrainProgress }>(
        `/api/admin/brain/runs/${run.id}/resume`,
        { method: 'POST' }
      );

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);
      setMessage('Resuming the queue…');
      await processLoop(run.id);
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const handleRetry = async () => {
    if (!run) return;

    setError(null);
    setBusy('retry');

    try {
      const data = await api<{ run: BrainRun; jobs: BrainJob[]; progress: BrainProgress }>(
        `/api/admin/brain/runs/${run.id}/retry`,
        { method: 'POST' }
      );

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);
      setMessage('Failed and partial articles were requeued.');
      await processLoop(run.id);
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const handleRetryJob = async (job: BrainJob) => {
    if (!run || !canRetryJob(job)) return;

    setError(null);
    setMessage(null);
    setRetryingJobId(job.id);

    try {
      const data = await api<{ runId: string; jobs: BrainJob[]; progress: BrainProgress }>(
        `/api/admin/brain/jobs/${job.id}/retry`,
        { method: 'POST' }
      );

      setJobs(data.jobs || []);
      setProgress(data.progress);
      setMessage(`Job requeued. Continuing run ${shortId(data.runId)}…`);
      await refreshRun(data.runId);
      setRetryingJobId(null);
      await processLoop(data.runId);
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleOpenRecent = async (runId: string) => {
    setError(null);
    setMessage(null);

    try {
      const data = await refreshRun(runId);

      if (data.run.status === 'running') {
        setMessage('Continuing the interrupted queue…');
        await processLoop(runId);
      } else {
        setMessage(`Opened run ${shortId(runId)}.`);
      }
    } catch (requestError) {
      setError(errorCode(requestError));
    }
  };

  const handleNewBatch = () => {
    stopRef.current = true;
    setRun(null);
    setJobs([]);
    setProgress(null);
    setAnalyzed([]);
    setMessage(null);
    setError(null);
    setRecheckExisting(false);
  };

  const isProcessing = busy === 'process';
  const newCount = analyzed.filter((row) => row.status === 'new').length;
  const existingCount = analyzed.filter((row) => row.status === 'existing').length;
  const selectedCount = newCount + (recheckExisting ? existingCount : 0);
  const canStart =
    !run &&
    !isProcessing &&
    (selectedCount > 0 || urlsText.trim().split(/\r?\n/).filter(Boolean).length > 0);

  return (
    <div className="space-y-10">
      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <label
          htmlFor="brain-urls"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]"
        >
          Article URLs — one per line (up to 200)
        </label>
        <textarea
          id="brain-urls"
          value={urlsText}
          onChange={(event) => setUrlsText(event.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={'https://novayagazeta.eu/articles/...\nhttps://example.com/column/...'}
          className="mt-3 w-full resize-y border border-[#D9D3CD] bg-[#FDFCFA] p-3 font-mono text-xs leading-relaxed text-[#211F1F] outline-none focus:border-[#990F3D]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#625D58]">
            <input
              type="checkbox"
              checked={recheckExisting}
              onChange={(event) => setRecheckExisting(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#990F3D]"
            />
            Recheck existing URLs for changed content
          </label>
          <span className="font-mono text-[10px] text-[#A29B94]">
            {newCount} new{existingCount > 0 ? ` · ${existingCount} existing` : ''}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={busy !== null || !urlsText.trim()}
            className="inline-flex items-center bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'analyze' ? 'Analyzing…' : 'Analyze URLs'}
          </button>

          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="inline-flex items-center border border-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#211F1F] transition hover:bg-[#211F1F] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'start'
              ? 'Starting…'
              : selectedCount > 0
                ? `Process ${selectedCount}`
                : 'Start queue'}
          </button>

          {run && (
            <>
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={busy !== 'process'}
                  className="inline-flex items-center border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={busy !== null || (run.status !== 'paused' && run.status !== 'running')}
                  className="inline-flex items-center border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
                >
                  {run.status === 'running' ? 'Continue run' : 'Resume'}
                </button>
              )}

              <button
                type="button"
                onClick={handleRetry}
                disabled={busy !== null}
                className="inline-flex items-center border border-[#E7C9D2] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A1235] transition hover:bg-[#F8EAF0] disabled:opacity-40"
              >
                Retry failed
              </button>

              <button
                type="button"
                onClick={handleNewBatch}
                disabled={isProcessing}
                className="inline-flex items-center px-2 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B] transition hover:text-[#211F1F] disabled:opacity-40"
              >
                New batch
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="mt-4 border border-[#E7C9D2] bg-[#F8EAF0] px-3 py-2 text-sm text-[#8A1235]">
            {error}
          </p>
        )}

        {message && !error && (
          <p className="mt-4 border border-[#E5E1DC] bg-[#F8F6F2] px-3 py-2 text-sm text-[#625D58]">
            {message}
          </p>
        )}
      </section>

      {analyzed.length > 0 && !run && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D9D3CD] pb-3">
            <h2 className="font-serif text-2xl text-[#211F1F]">Analysis</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
              {analyzed.length} URL{analyzed.length === 1 ? '' : 's'}
            </p>
          </div>

          <ul className="divide-y divide-[#EEE9E4]">
            {analyzed.map((row, index) => (
              <li
                key={`${row.normalizedUrl || row.input}-${index}`}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-[#37332D]" title={row.input}>
                    {row.input}
                  </p>
                  <p className="mt-1 text-xs text-[#89827B]">
                    {row.title || row.reason || row.normalizedUrl || 'Invalid URL'}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] ${
                    row.status === 'new'
                      ? 'text-[#2F6B45]'
                      : row.status === 'existing'
                        ? 'text-[#87652A]'
                        : 'text-[#8A1235]'
                  }`}
                >
                  {row.status === 'duplicate_in_input' ? 'Repeated' : row.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {run && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D9D3CD] pb-3">
            <h2 className="font-serif text-2xl text-[#211F1F]">
              Queue <span className="font-mono text-sm text-[#89827B]">{shortId(run.id)}</span>
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
              {run.status.replace(/_/g, ' ')}
            </p>
          </div>

          <div className="mt-4">
            <ProgressBar progress={progress} />
          </div>

          <div className="mt-5 overflow-x-auto border border-[#E5E1DC]">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="bg-[#F6F3EF] font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
                  <th className="px-3 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">Article</th>
                  <th className="px-3 py-2 font-normal">Stage</th>
                  <th className="px-3 py-2 font-normal">Extraction</th>
                  <th className="px-3 py-2 font-normal">Chunks</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Attempts</th>
                  <th className="px-3 py-2 font-normal">Detail</th>
                  <th className="px-3 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const chunks = jobChunkCount(job);
                  const duplicateReason = jobDuplicateReason(job);

                  return (
                    <tr key={job.id} className="border-t border-[#EEE9E4] align-top">
                      <td className="px-3 py-3 font-mono text-[10px] text-[#A29B94]">
                        {queuePosition(jobs, job.id)}
                      </td>
                      <td className="max-w-[320px] px-3 py-3">
                        <p
                          className="truncate text-sm text-[#211F1F]"
                          title={job.title || job.input_url}
                        >
                          {job.title || job.input_url}
                        </p>
                        <p
                          className="mt-1 truncate font-mono text-[10px] text-[#A29B94]"
                          title={job.normalized_url}
                        >
                          {job.normalized_url}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#746D66]">
                        {stageLabel(job)}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={
                            job.extraction_status === 'complete'
                              ? 'text-[#2F6B45]'
                              : job.extraction_status === 'needs_review'
                                ? 'text-[#87652A]'
                                : job.extraction_status
                                  ? 'text-[#8A1235]'
                                  : 'text-[#A29B94]'
                          }
                        >
                          {extractionLabel(job.extraction_status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-[#746D66]">
                        {chunks === null ? '—' : chunks}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-[#746D66]">
                        {job.attempts}/{job.max_attempts}
                      </td>
                      <td className="max-w-[260px] px-3 py-3 text-xs text-[#89827B]">
                        {job.error_detail ||
                          (duplicateReason
                            ? `Duplicate: ${duplicateReason.replace(/_/g, ' ')}`
                            : job.document_id
                              ? `Document ${shortId(job.document_id)}`
                              : '—')}
                      </td>
                      <td className="px-3 py-3">
                        {canRetryJob(job) && (
                          <button
                            type="button"
                            onClick={() => void handleRetryJob(job)}
                            disabled={busy !== null || retryingJobId !== null}
                            className="border border-[#D9D3CD] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
                          >
                            {retryingJobId === job.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {jobs.length === 0 && <p className="mt-4 text-sm text-[#89827B]">No jobs in this run.</p>}
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <div className="border-b border-[#D9D3CD] pb-3">
            <h2 className="font-serif text-2xl text-[#211F1F]">Recent runs</h2>
          </div>
          <ul className="divide-y divide-[#EEE9E4]">
            {recent.map((entry) => (
              <li
                key={entry.run.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-[11px] text-[#37332D]">{shortId(entry.run.id)}</p>
                  <p className="mt-1 text-xs text-[#89827B]">
                    {new Date(entry.run.created_at).toLocaleString('en-GB')} ·{' '}
                    {entry.run.status.replace(/_/g, ' ')} · {entry.progress.total} URLs
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenRecent(entry.run.id)}
                  disabled={busy !== null}
                  className="self-start border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
