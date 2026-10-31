'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BRAIN_SOURCE_KIND_LABEL,
  BRAIN_SOURCE_LIMITS,
  type BrainSourceDescriptor,
  type BrainSourceKind,
  type BrainSourcePreview,
} from '@/lib/knowledge/brain/sourceTypes';

type AnalyzeRow = {
  input: string;
  normalizedUrl: string | null;
  status: 'new' | 'existing' | 'invalid' | 'duplicate_in_input';
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
  source_type?: string | null;
  source_format?: string | null;
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

type WorkerCounts = {
  queued: number;
  processing: number;
  completed: number;
  duplicate?: number;
  partial?: number;
  failed: number;
  skipped?: number;
  cancelled: number;
  oldestQueuedAt: string | null;
};

type WorkerDashboard = {
  generatedAt: string;
  brain: WorkerCounts;
  graph: WorkerCounts;
  activeWorkers: Array<{
    workerId: string;
    scope: 'brain' | 'graph';
    processing: number;
    oldestLockedAt: string | null;
  }>;
  activeRuns: { brain: number; graph: number };
  lastSuccessful: {
    scope: string;
    status: string;
    finished_at: string | null;
    processed: number;
    failed: number;
  } | null;
  lastError: {
    scope: string;
    code: string | null;
    detail: string | null;
    at: string | null;
  } | null;
  recentRuns: Array<{
    id: string;
    scope: string;
    trigger: string;
    status: string;
    processed: number;
    failed: number;
    finished_at: string | null;
  }>;
};

function ageLabel(value: string | null): string {
  if (!value) return '—';

  const ms = Date.now() - new Date(value).getTime();

  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

type GraphResult =
  | { status: 'queued'; runId: string; jobs: number }
  | { status: 'existing'; runId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string };

type NextResponse =
  | {
      state: 'processed';
      job: BrainJob;
      progress: BrainProgress;
      runStatus: string;
    }
  | {
      state: 'waiting';
      progress: BrainProgress;
      runStatus: string;
      nextRetryAt: string | null;
    }
  | {
      state: 'done';
      progress: BrainProgress;
      runStatus: string;
      graph?: GraphResult;
    }
  | { state: 'paused'; progress: BrainProgress; runStatus: string };

type StagedSource = {
  descriptor: BrainSourceDescriptor;
  preview: BrainSourcePreview;
};

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
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : `Request failed (${response.status}).`
    );
  }

  return data as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function sourceLabel(job: BrainJob): string {
  const value = job.source_type || 'article';
  if (value === 'pdf') return 'PDF';
  if (value === 'txt') return 'TXT';
  if (value === 'text') return 'Text';
  if (value === 'media_coverage') return 'Media';
  return 'URL';
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
  if (job.status === 'duplicate' || job.status === 'completed') return 'done';
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

async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
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

function MetadataFields({
  value,
  onChange,
}: {
  value: { title: string; author: string; publishedAt: string; language: string };
  onChange: (value: { title: string; author: string; publishedAt: string; language: string }) => void;
}) {
  const inputClass =
    'mt-1 w-full border border-[#D9D3CD] bg-[#FDFCFA] px-3 py-2 text-sm text-[#211F1F] outline-none focus:border-[#990F3D]';

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-[#625D58]">
        Title
        <input
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
          maxLength={BRAIN_SOURCE_LIMITS.maxTitleChars}
          className={inputClass}
        />
      </label>
      <label className="text-xs text-[#625D58]">
        Author
        <input
          value={value.author}
          onChange={(event) => onChange({ ...value, author: event.target.value })}
          maxLength={BRAIN_SOURCE_LIMITS.maxAuthorChars}
          className={inputClass}
        />
      </label>
      <label className="text-xs text-[#625D58]">
        Publication date
        <input
          type="date"
          value={value.publishedAt.slice(0, 10)}
          onChange={(event) => onChange({ ...value, publishedAt: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="text-xs text-[#625D58]">
        Language
        <input
          value={value.language}
          onChange={(event) => onChange({ ...value, language: event.target.value })}
          maxLength={BRAIN_SOURCE_LIMITS.maxLanguageChars}
          placeholder="ru / en / und"
          className={inputClass}
        />
      </label>
    </div>
  );
}

function PreviewPanel({
  preview,
  metadata,
  onMetadata,
  onStage,
  onClear,
}: {
  preview: BrainSourcePreview;
  metadata: { title: string; author: string; publishedAt: string; language: string };
  onMetadata: (value: {
    title: string;
    author: string;
    publishedAt: string;
    language: string;
  }) => void;
  onStage: () => void;
  onClear: () => void;
}) {
  const duplicate = preview.duplicate;

  return (
    <div className="mt-5 border border-[#E5E1DC] bg-[#FDFCFA] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#990F3D]">
            {BRAIN_SOURCE_KIND_LABEL[preview.kind]} · {preview.sourceFormat}
          </p>
          <h3 className="mt-1 font-serif text-xl text-[#211F1F]">{preview.title}</h3>
          <p className="mt-1 text-xs text-[#89827B]">
            {preview.author || 'Unknown author'} · {preview.publishedAt?.slice(0, 10) || 'No date'} ·{' '}
            {preview.language}
          </p>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.12em] text-[#746D66]">
          <p>{preview.chunkCount} chunks</p>
          <p>{preview.wordCount} words</p>
          {preview.pageCount ? <p>{preview.pageCount} pages</p> : null}
        </div>
      </div>

      {duplicate && (
        <p className="mt-3 border border-[#E7D9BF] bg-[#FBF4E6] px-3 py-2 text-xs text-[#87652A]">
          {duplicate.status === 'existing_active'
            ? 'This source already has a queued or processing job.'
            : duplicate.status === 'duplicate_content'
              ? `Identical extracted text already exists as “${duplicate.title}”.`
              : `Already indexed as “${duplicate.title}”. Enable recheck to reprocess without creating a duplicate.`}
        </p>
      )}

      {preview.warnings.map((warning) => (
        <p
          key={warning}
          className="mt-2 border border-[#E7D9BF] bg-[#FBF4E6] px-3 py-2 text-xs text-[#87652A]"
        >
          {warning}
        </p>
      ))}

      <MetadataFields value={metadata} onChange={onMetadata} />

      {preview.headings.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
            Structure
          </p>
          <p className="mt-1 text-xs text-[#625D58]">{preview.headings.join(' · ')}</p>
        </div>
      )}

      <details className="mt-4 border-t border-[#EEE9E4] pt-3">
        <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Extracted text preview
        </summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap bg-white p-3 text-xs leading-relaxed text-[#37332D]">
          {preview.excerpt}
        </pre>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStage}
          className="inline-flex items-center bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D]"
        >
          Add to queue
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D]"
        >
          Discard preview
        </button>
      </div>
    </div>
  );
}

export default function BrainIngestionClient() {
  const [mode, setMode] = useState<BrainSourceKind>('url');
  const [urlsText, setUrlsText] = useState('');
  const [textValue, setTextValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BrainSourcePreview | null>(null);
  const [staged, setStaged] = useState<StagedSource[]>([]);
  const [metadata, setMetadata] = useState({
    title: '',
    author: '',
    publishedAt: '',
    language: '',
  });
  const [run, setRun] = useState<BrainRun | null>(null);
  const [jobs, setJobs] = useState<BrainJob[]>([]);
  const [progress, setProgress] = useState<BrainProgress | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [workerDashboard, setWorkerDashboard] = useState<WorkerDashboard | null>(null);
  const [workerBusy, setWorkerBusy] = useState<'brain' | 'graph' | 'all' | null>(null);
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    'preview' | 'stage' | 'start' | 'process' | 'pause' | 'resume' | 'retry' | 'cancel' | null
  >(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [recheckExisting, setRecheckExisting] = useState(false);
  const [autoGraph, setAutoGraph] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphMessage, setGraphMessage] = useState<string | null>(null);

  const stopRef = useRef(false);
  const loopRef = useRef(false);

  const refreshRecent = useCallback(async () => {
    try {
      const data = await api<{ runs: RecentRun[] }>('/api/admin/brain/runs');
      setRecent(data.runs || []);
    } catch {
      // Recent runs are informational.
    }
  }, []);

  const refreshWorkerStatus = useCallback(async () => {
    try {
      const data = await api<{ dashboard: WorkerDashboard }>(
        '/api/admin/brain/worker/status'
      );
      setWorkerDashboard(data.dashboard);
    } catch {
      // The dashboard is informational; queue actions still work.
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
    void refreshWorkerStatus();
    const timer = window.setInterval(() => {
      void refreshWorkerStatus();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshRecent, refreshWorkerStatus]);

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

  const handleRunWorker = async (scope: 'brain' | 'graph' | 'all') => {
    setWorkerBusy(scope);
    setWorkerMessage(null);
    setError(null);

    try {
      const data = await api<{
        results: Array<{
          scope: string;
          processed: number;
          failed: number;
          runsTouched: number;
          stoppedBy: string;
        }>;
      }>('/api/admin/brain/worker', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      });

      const summary = (data.results || [])
        .map(
          (result) =>
            `${result.scope}: ${result.processed} processed, ${result.failed} failed (${result.stoppedBy})`
        )
        .join(' · ');

      setWorkerMessage(summary || 'Worker finished.');
      await Promise.all([
        refreshWorkerStatus(),
        refreshRecent(),
        run ? refreshRun(run.id) : Promise.resolve(null),
      ]);
    } catch (workerError) {
      setWorkerMessage(`Worker run failed: ${errorCode(workerError)}`);
    } finally {
      setWorkerBusy(null);
    }
  };

  const processGraphLoop = useCallback(async (graphRunId: string) => {
    setGraphMessage('Graph extraction queued. Processing documents…');

    for (let iteration = 0; iteration < 2000; iteration += 1) {
      if (stopRef.current) return;

      try {
        const result = await api<{
          state: 'processed' | 'waiting' | 'done' | 'paused';
          progress?: { done?: boolean };
          runStatus?: string;
        }>(`/api/admin/brain/graph/runs/${graphRunId}/next`, { method: 'POST' });

        if (result.state === 'done') {
          setGraphMessage(
            result.runStatus === 'completed_with_errors'
              ? 'Graph extraction finished with errors. Review them on the Graph page.'
              : 'Graph extraction finished. Relationships remain unverified until reviewed.'
          );
          return;
        }

        if (result.state === 'paused') {
          setGraphMessage('Graph extraction paused. Resume it from the Graph page.');
          return;
        }

        await sleep(result.state === 'waiting' ? 1500 : 250);
      } catch (graphError) {
        setGraphMessage(
          `Ingestion succeeded, but graph extraction could not run: ${errorCode(graphError)}`
        );
        return;
      }
    }
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
            body: JSON.stringify({ autoGraph }),
          });

          setProgress(result.progress);
          await refreshRun(runId);

          if (result.state === 'done' || result.state === 'paused') {
            if (result.state === 'paused') {
              setMessage('Queue paused. Progress is saved.');
              break;
            }

            setMessage(
              result.runStatus === 'completed_with_errors'
                ? 'Queue finished with some errors. Review the failed rows and retry them.'
                : 'Queue finished. All available sources are indexed.'
            );

            if (autoGraph && result.graph?.status === 'queued') {
              await processGraphLoop(result.graph.runId);
            } else if (autoGraph && result.graph?.status === 'skipped') {
              setGraphMessage(`Graph extraction skipped: ${result.graph.reason}.`);
            } else if (result.graph?.status === 'error') {
              setGraphMessage(`Graph extraction could not be queued: ${result.graph.reason}.`);
            }

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
        void refreshWorkerStatus();
      }
    },
    [autoGraph, processGraphLoop, refreshRecent, refreshRun, refreshWorkerStatus]
  );

  const resetPreview = () => {
    setPreview(null);
    setMetadata({ title: '', author: '', publishedAt: '', language: '' });
  };

  const metadataFromPreview = (value: BrainSourcePreview) => ({
    title: value.title || '',
    author: value.author || '',
    publishedAt: value.publishedAt ? value.publishedAt.slice(0, 10) : '',
    language: value.language || '',
  });

  const previewUrl = async (url: string, overrides = {}) => {
    const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
      method: 'POST',
      body: JSON.stringify({ kind: 'url', url, overrides }),
    });

    return data.preview;
  };

  const handlePreview = async () => {
    setError(null);
    setMessage(null);
    setGraphMessage(null);
    resetPreview();

    try {
      setBusy('preview');

      if (mode === 'url') {
        const urls = urlsText
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 20);

        if (urls.length === 0) throw new Error('Enter at least one URL.');

        const previews: BrainSourcePreview[] = [];
        const failures: string[] = [];

        for (const url of urls) {
          try {
            previews.push(await previewUrl(url));
          } catch (requestError) {
            failures.push(`${url}: ${errorCode(requestError)}`);
          }
        }

        if (previews.length === 0) {
          throw new Error(failures.join(' · ') || 'Could not preview this URL.');
        }

        if (urls.length === 1) {
          setPreview(previews[0]);
          setMetadata(metadataFromPreview(previews[0]));
        } else {
          setStaged((current) => [
            ...current,
            ...previews.map((item) => ({
              preview: item,
              descriptor: descriptorFromPreview(item, metadataFromPreview(item)),
            })),
          ]);
          setMessage(
            `${previews.length} URL preview(s) staged.${
              failures.length > 0 ? ` ${failures.length} failed: ${failures.join(' · ')}` : ''
            }`
          );
        }
      } else if (mode === 'text') {
        const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
          method: 'POST',
          body: JSON.stringify({ kind: 'text', text: textValue }),
        });

        setPreview(data.preview);
        setMetadata(metadataFromPreview(data.preview));
      } else {
        if (!file) throw new Error(`Choose a ${mode.toUpperCase()} file first.`);

        const upload = await api<{
          bucket: string;
          path: string;
          token: string;
          signedUrl: string;
        }>('/api/admin/brain/uploads', {
          method: 'POST',
          body: JSON.stringify({
            kind: mode,
            size: file.size,
            mimeType: file.type,
          }),
        });

        const digest = await sha256File(file);
        const uploadResponse = await fetch(upload.signedUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || (mode === 'pdf' ? 'application/pdf' : 'text/plain'),
          },
        });

        if (!uploadResponse.ok) {
          throw new Error('The file could not be uploaded to private storage.');
        }

        const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
          method: 'POST',
          body: JSON.stringify({
            kind: mode,
            storagePath: upload.path,
            sourceSha256: digest,
            originalFilename: file.name,
            mimeType: file.type || (mode === 'pdf' ? 'application/pdf' : 'text/plain'),
            byteSize: file.size,
          }),
        });

        setPreview(data.preview);
        setMetadata(metadataFromPreview(data.preview));
      }
    } catch (requestError) {
      setError(errorCode(requestError));
    } finally {
      setBusy(null);
    }
  };

  const descriptorFromPreview = (
    value: BrainSourcePreview,
    valueMetadata: { title: string; author: string; publishedAt: string; language: string }
  ): BrainSourceDescriptor => ({
    kind: value.kind,
    ...(value.kind === 'url'
      ? { url: value.normalizedUrl }
      : {
          storagePath: value.storagePath || value.sourcePath,
          sourceSha256: value.sourceSha256,
          originalFilename: value.originalFilename,
          mimeType: value.mimeType,
          byteSize: value.byteSize,
          pageCount: value.pageCount,
        }),
    title: valueMetadata.title || null,
    author: valueMetadata.author || null,
    publishedAt: valueMetadata.publishedAt || null,
    language: valueMetadata.language || null,
  });

  const handleStage = () => {
    if (!preview) return;

    setStaged((current) => [
      ...current,
      { preview, descriptor: descriptorFromPreview(preview, metadata) },
    ]);
    resetPreview();
    setMessage('Source added to the queue. Preview another source or start processing.');
  };

  const handleRemoveStaged = (index: number) => {
    setStaged((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleStart = async () => {
    if (staged.length === 0) return;

    setError(null);
    setMessage(null);
    setGraphMessage(null);
    setBusy('start');

    try {
      const data = await api<{
        status: string;
        run: BrainRun | null;
        jobs: BrainJob[];
        progress: BrainProgress | null;
        rows: Array<{ status: string; reason?: string }>;
        skipped: Array<{ reason?: string }>;
        message?: string;
      }>('/api/admin/brain/sources', {
        method: 'POST',
        body: JSON.stringify({
          sources: staged.map((item) => item.descriptor),
          recheckExisting,
        }),
      });

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);

      if (!data.run) {
        setMessage(
          data.message ||
            `Nothing new to process. ${data.skipped.length} source(s) were skipped.`
        );
        return;
      }

      setStaged([]);
      setMessage(
        `Queued ${data.jobs.length} source${data.jobs.length === 1 ? '' : 's'}. Processing sequentially…`
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

  const handleCancel = async () => {
    if (!run) return;

    stopRef.current = true;
    setBusy('cancel');

    try {
      const data = await api<{ run: BrainRun; jobs: BrainJob[]; progress: BrainProgress }>(
        `/api/admin/brain/runs/${run.id}/cancel`,
        { method: 'POST' }
      );

      setRun(data.run);
      setJobs(data.jobs || []);
      setProgress(data.progress);
      setMessage('Run cancelled. Remaining queued jobs will not be processed.');
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
      setMessage('Failed and partial sources were requeued.');
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
    setStaged([]);
    resetPreview();
    setMessage(null);
    setError(null);
    setGraphMessage(null);
  };

  const isProcessing = busy === 'process';
  const canPreview =
    busy === null &&
    ((mode === 'url' && urlsText.trim().length > 0) ||
      (mode === 'text' && textValue.trim().length > 0) ||
      ((mode === 'pdf' || mode === 'txt') && Boolean(file)));

  return (
    <div className="space-y-10">
      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {(['url', 'pdf', 'txt', 'text'] as BrainSourceKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setMode(kind);
                setPreview(null);
                setError(null);
              }}
              className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                mode === kind
                  ? 'border-[#990F3D] bg-[#990F3D] text-white'
                  : 'border-[#D9D3CD] text-[#625D58] hover:border-[#990F3D] hover:text-[#990F3D]'
              }`}
            >
              {BRAIN_SOURCE_KIND_LABEL[kind]}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {mode === 'url' && (
            <>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                Article URLs — one per line (preview up to 20)
              </label>
              <textarea
                value={urlsText}
                onChange={(event) => setUrlsText(event.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={'https://novayagazeta.eu/articles/...\nhttps://example.com/column/...'}
                className="mt-3 w-full resize-y border border-[#D9D3CD] bg-[#FDFCFA] p-3 font-mono text-xs leading-relaxed text-[#211F1F] outline-none focus:border-[#990F3D]"
              />
            </>
          )}

          {mode === 'pdf' && (
            <>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                PDF file — server-side text extraction, max 25 MB
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-3 block w-full border border-[#D9D3CD] bg-[#FDFCFA] p-3 text-sm text-[#37332D]"
              />
              <p className="mt-2 text-xs text-[#89827B]">
                Scanned/image-only PDFs are reported as requiring OCR and are not indexed as a
                successful extraction.
              </p>
            </>
          )}

          {mode === 'txt' && (
            <>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                TXT file — UTF-8, max 5 MB
              </label>
              <input
                type="file"
                accept="text/plain,.txt"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-3 block w-full border border-[#D9D3CD] bg-[#FDFCFA] p-3 text-sm text-[#37332D]"
              />
            </>
          )}

          {mode === 'text' && (
            <>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
                Pasted text — the original is stored privately, max 2 MB
              </label>
              <textarea
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={'# Title\n\nAuthor: ...\n\nFirst paragraph…'}
                className="mt-3 w-full resize-y border border-[#D9D3CD] bg-[#FDFCFA] p-3 font-mono text-xs leading-relaxed text-[#211F1F] outline-none focus:border-[#990F3D]"
              />
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!canPreview || busy !== null}
            className="inline-flex items-center bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'preview' ? 'Previewing…' : 'Preview'}
          </button>
          <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#625D58]">
            <input
              type="checkbox"
              checked={recheckExisting}
              onChange={(event) => setRecheckExisting(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#990F3D]"
            />
            Reprocess existing sources
          </label>
          <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#625D58]">
            <input
              type="checkbox"
              checked={autoGraph}
              onChange={(event) => setAutoGraph(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#990F3D]"
            />
            Run graph extraction after indexing
          </label>
          {staged.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
              {staged.length} staged
            </span>
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

        {graphMessage && (
          <p className="mt-2 border border-[#C9D7E8] bg-[#EDF3FA] px-3 py-2 text-sm text-[#2E5A86]">
            {graphMessage}
          </p>
        )}

        {preview && (
          <PreviewPanel
            preview={preview}
            metadata={metadata}
            onMetadata={setMetadata}
            onStage={handleStage}
            onClear={resetPreview}
          />
        )}
      </section>

      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#D9D3CD] pb-3">
          <div>
            <h2 className="font-serif text-2xl text-[#211F1F]">Workers</h2>
            <p className="mt-1 text-xs text-[#89827B]">
              Server-side processing. Browser tabs do not need to stay open.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshWorkerStatus()}
              className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleRunWorker('brain')}
              disabled={workerBusy !== null || busy !== null}
              className="border border-[#211F1F] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#211F1F] transition hover:bg-[#211F1F] hover:text-white disabled:opacity-40"
            >
              {workerBusy === 'brain' ? 'Running…' : 'Run ingestion'}
            </button>
            <button
              type="button"
              onClick={() => void handleRunWorker('graph')}
              disabled={workerBusy !== null || busy !== null}
              className="border border-[#211F1F] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#211F1F] transition hover:bg-[#211F1F] hover:text-white disabled:opacity-40"
            >
              {workerBusy === 'graph' ? 'Running…' : 'Run graph'}
            </button>
            <button
              type="button"
              onClick={() => void handleRunWorker('all')}
              disabled={workerBusy !== null || busy !== null}
              className="border border-[#990F3D] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#990F3D] transition hover:bg-[#990F3D] hover:text-white disabled:opacity-40"
            >
              {workerBusy === 'all' ? 'Running…' : 'Run both'}
            </button>
          </div>
        </div>

        {workerDashboard ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border border-[#EEE9E4] bg-[#FDFCFA] p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                  Ingestion queue
                </p>
                <p className="mt-2 text-sm text-[#211F1F]">
                  {workerDashboard.brain.queued} queued · {workerDashboard.brain.processing}{' '}
                  processing
                </p>
                <p className="mt-1 text-xs text-[#89827B]">
                  {workerDashboard.brain.completed} completed · {workerDashboard.brain.failed}{' '}
                  failed · {workerDashboard.brain.partial || 0} partial
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#A29B94]">
                  oldest queued {ageLabel(workerDashboard.brain.oldestQueuedAt)}
                </p>
              </div>

              <div className="border border-[#EEE9E4] bg-[#FDFCFA] p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                  Graph queue
                </p>
                <p className="mt-2 text-sm text-[#211F1F]">
                  {workerDashboard.graph.queued} queued · {workerDashboard.graph.processing}{' '}
                  processing
                </p>
                <p className="mt-1 text-xs text-[#89827B]">
                  {workerDashboard.graph.completed} completed · {workerDashboard.graph.failed}{' '}
                  failed · {workerDashboard.graph.skipped || 0} skipped
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#A29B94]">
                  oldest queued {ageLabel(workerDashboard.graph.oldestQueuedAt)}
                </p>
              </div>

              <div className="border border-[#EEE9E4] bg-[#FDFCFA] p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                  Active workers
                </p>
                <p className="mt-2 text-sm text-[#211F1F]">
                  {workerDashboard.activeWorkers.length} active
                </p>
                <p className="mt-1 text-xs text-[#89827B]">
                  runs: {workerDashboard.activeRuns.brain} ingestion ·{' '}
                  {workerDashboard.activeRuns.graph} graph
                </p>
                {workerDashboard.activeWorkers.slice(0, 4).map((worker) => (
                  <p
                    key={`${worker.scope}-${worker.workerId}`}
                    className="mt-1 truncate font-mono text-[10px] text-[#A29B94]"
                    title={worker.workerId}
                  >
                    {worker.scope}: {worker.processing} job(s) · {ageLabel(worker.oldestLockedAt)}
                  </p>
                ))}
              </div>

              <div className="border border-[#EEE9E4] bg-[#FDFCFA] p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                  Last worker run
                </p>
                {workerDashboard.lastSuccessful ? (
                  <>
                    <p className="mt-2 text-sm text-[#211F1F]">
                      {workerDashboard.lastSuccessful.scope} ·{' '}
                      {workerDashboard.lastSuccessful.processed} processed
                    </p>
                    <p className="mt-1 text-xs text-[#89827B]">
                      {workerDashboard.lastSuccessful.failed} failed ·{' '}
                      {workerDashboard.lastSuccessful.finished_at
                        ? new Date(workerDashboard.lastSuccessful.finished_at).toLocaleString('en-GB')
                        : 'running'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[#89827B]">No completed worker run yet.</p>
                )}
                {workerDashboard.lastError && (
                  <p className="mt-2 border border-[#E7C9D2] bg-[#F8EAF0] px-2 py-1 text-[10px] text-[#8A1235]">
                    last error: {workerDashboard.lastError.code || 'worker_error'}
                    {workerDashboard.lastError.at
                      ? ` · ${ageLabel(workerDashboard.lastError.at)} ago`
                      : ''}
                  </p>
                )}
              </div>
            </div>

            {workerDashboard.lastError?.detail && (
              <p className="mt-3 border border-[#E7C9D2] bg-[#F8EAF0] px-3 py-2 text-xs text-[#8A1235]">
                {workerDashboard.lastError.detail}
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-[#89827B]">Worker status is loading…</p>
        )}

        {workerMessage && (
          <p className="mt-3 border border-[#C9D7E8] bg-[#EDF3FA] px-3 py-2 text-xs text-[#2E5A86]">
            {workerMessage}
          </p>
        )}
      </section>

      {staged.length > 0 && !run && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D9D3CD] pb-3">
            <h2 className="font-serif text-2xl text-[#211F1F]">Staged sources</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
              {staged.length} source{staged.length === 1 ? '' : 's'}
            </p>
          </div>

          <ul className="divide-y divide-[#EEE9E4]">
            {staged.map((item, index) => (
              <li
                key={`${item.descriptor.kind}-${item.descriptor.url || item.descriptor.sourceSha256}-${index}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-[#211F1F]">{item.preview.title}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                    {BRAIN_SOURCE_KIND_LABEL[item.descriptor.kind]} · {item.preview.chunkCount}{' '}
                    chunks
                    {item.preview.duplicate ? ' · already indexed' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveStaged(index)}
                  disabled={busy !== null}
                  className="self-start border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleStart}
            disabled={busy !== null}
            className="mt-4 inline-flex items-center bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'start'
              ? 'Starting…'
              : `Process ${staged.length} source${staged.length === 1 ? '' : 's'}`}
          </button>
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

          <div className="mt-4 flex flex-wrap gap-2">
            {isProcessing ? (
              <button
                type="button"
                onClick={handlePause}
                disabled={busy !== 'process'}
                className="border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResume}
                disabled={
                  busy !== null || (run.status !== 'paused' && run.status !== 'running')
                }
                className="border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
              >
                {run.status === 'running' ? 'Continue run' : 'Resume'}
              </button>
            )}

            <button
              type="button"
              onClick={handleRetry}
              disabled={busy !== null}
              className="border border-[#E7C9D2] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A1235] transition hover:bg-[#F8EAF0] disabled:opacity-40"
            >
              Retry failed
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={busy !== null || !['running', 'paused'].includes(run.status)}
              className="border border-[#D9D3CD] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#625D58] transition hover:border-[#8A1235] hover:text-[#8A1235] disabled:opacity-40"
            >
              Cancel run
            </button>

            <button
              type="button"
              onClick={handleNewBatch}
              disabled={isProcessing}
              className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B] transition hover:text-[#211F1F] disabled:opacity-40"
            >
              New batch
            </button>
          </div>

          <div className="mt-5 overflow-x-auto border border-[#E5E1DC]">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="bg-[#F6F3EF] font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
                  <th className="px-3 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">Type</th>
                  <th className="px-3 py-2 font-normal">Document</th>
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
                {jobs.map((job, index) => {
                  const chunks = jobChunkCount(job);
                  const duplicateReason = jobDuplicateReason(job);

                  return (
                    <tr key={job.id} className="border-t border-[#EEE9E4] align-top">
                      <td className="px-3 py-3 font-mono text-[10px] text-[#A29B94]">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#746D66]">
                        {sourceLabel(job)}
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
                    {entry.run.status.replace(/_/g, ' ')} · {entry.progress.total} sources
                    {typeof entry.run.metadata?.graph_run_id === 'string'
                      ? ' · graph queued'
                      : ''}
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
