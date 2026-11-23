'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  Clock,
  FileCheck2,
  GitBranch,
  LayoutList,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { DevTaskInput } from '@/lib/pierrot/dev/types';
import type {
  DevAttempt,
  DevCostAggregate,
  DevCostEstimate,
  DevCostLedger,
  DevReleaseOverview,
  DevReviewView,
  DevSetupReport,
  DevWorkbenchOverview,
  DevWorkbenchTask,
} from '@/lib/pierrot/dev/workbench/types';

export type DevTaskHandoff = {
  nonce: number;
  input: DevTaskInput;
};

type Props = {
  initialOverview: DevWorkbenchOverview;
  onOpenChat: () => void;
  taskHandoff?: DevTaskHandoff | null;
  onTaskHandoffConsumed?: () => void;
};

type Drawer = 'details' | 'diagnostics' | null;
type DetailsSection = 'tasks' | 'batches' | 'history' | 'ledger' | 'evidence';

type TaskFormState = {
  title: string;
  objective: string;
  context: string;
  repository: string;
  baseRef: string;
  acceptanceCriteria: string;
  tests: string;
  securityConstraints: string;
  affectedFiles: string;
};

const EMPTY_FORM: TaskFormState = {
  title: '',
  objective: '',
  context: '',
  repository: 'newlove',
  baseRef: 'main',
  acceptanceCriteria: '',
  tests: '',
  securityConstraints: '',
  affectedFiles: '',
};

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : '—';
}

function age(value: string | null): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const to = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((to - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 60);
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    detail?: { blockingReasons?: string[] };
  };
  const reasons = body.detail?.blockingReasons;
  return [body.error || `Request failed (${response.status})`, body.code, reasons?.join(' ')]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 900);
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`pw-wb-badge is-${status}`}>{status.replace(/_/g, ' ')}</span>;
}

type TaskStageKey =
  | 'draft'
  | 'ready'
  | 'queued'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'landed'
  | 'released'
  | 'finalizing'
  | 'cancelled'
  | 'archived';

const STAGE_LABELS: Record<TaskStageKey, string> = {
  draft: 'draft',
  ready: 'ready',
  queued: 'queued',
  running: 'running',
  blocked: 'blocked',
  failed: 'failed',
  landed: 'landed in main',
  released: 'released to production',
  finalizing: 'finalizing',
  cancelled: 'cancelled',
  archived: 'archived',
};

function taskStage(
  task: DevWorkbenchTask,
  productionSha: string | null,
  landedShas: Set<string> | null
): { key: TaskStageKey; label: string } {
  let key: TaskStageKey;
  switch (task.status) {
    case 'in_progress':
      key = 'running';
      break;
    case 'queued':
      key = 'queued';
      break;
    case 'blocked':
      key = 'blocked';
      break;
    case 'failed':
    case 'rejected':
      key = 'failed';
      break;
    case 'review':
      key = 'finalizing';
      break;
    case 'verified':
    case 'archived': {
      const commit = task.resultCommit?.toLowerCase() || null;
      const released =
        Boolean(commit) &&
        Boolean(productionSha) &&
        (commit === productionSha!.toLowerCase() ||
          (landedShas !== null && !landedShas.has(commit!)));
      key = released ? 'released' : task.status === 'archived' ? 'archived' : 'landed';
      break;
    }
    case 'cancelled':
      key = 'cancelled';
      break;
    case 'ready':
      key = 'ready';
      break;
    default:
      key = 'draft';
  }
  return { key, label: STAGE_LABELS[key] };
}

function StageChip({
  task,
  productionSha,
  landedShas,
}: {
  task: DevWorkbenchTask;
  productionSha: string | null;
  landedShas: Set<string> | null;
}) {
  const stage = taskStage(task, productionSha, landedShas);
  return <span className={`pw-exec-state is-${stage.key}`}>{stage.label}</span>;
}

/** Live elapsed timer; only this small node re-renders every second. */
function Elapsed({ startedAt }: { startedAt: string | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{duration(startedAt, null)}</>;
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(4)}`;
}

function moneyRange(estimate: DevCostEstimate | null | undefined): string {
  if (!estimate) return 'estimate unavailable';
  const { minUsd, expectedUsd, maxUsd } = estimate.total;
  if (minUsd === null || expectedUsd === null || maxUsd === null) {
    return `unknown${estimate.unknown.length ? ` (${estimate.unknown.join(', ')})` : ''}`;
  }
  return `${money(minUsd)}–${money(maxUsd)} · expected ${money(expectedUsd)} · ${estimate.confidence} confidence`;
}

function varianceText(aggregate: DevCostAggregate): string {
  const variance = aggregate.variance;
  if (variance.status === 'unknown') {
    return variance.actualUsd === null
      ? 'actual incomplete'
      : variance.expectedUsd === null
        ? 'estimate missing'
        : 'unknown';
  }
  const sign = variance.deltaUsd !== null && variance.deltaUsd > 0 ? '+' : '';
  return `${variance.status} · ${sign}${money(variance.deltaUsd)}${
    variance.deltaPct !== null ? ` (${sign}${variance.deltaPct.toFixed(1)}%)` : ''
  }`;
}

function lifecycleTone(status: string): string {
  if (status === 'ready' || status === 'executing_task') return 'ok';
  if (status === 'offline' || status === 'worker_offline') return 'idle';
  if (status === 'blocked' || status === 'worker_missing') return 'error';
  if (status === 'waiting_for_shutdown' || status === 'stopping_codespace') return 'warn';
  return 'busy';
}

type AttemptCostView = {
  modelUsd?: number | null;
  modelReportedUsd?: number | null;
  modelEstimatedUsd?: number | null;
  codespaceEstimatedUsd?: number | null;
  codespaceConfirmedUsd?: number | null;
  totalUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  unknown?: string[];
  machine?: string | null;
  runtimeMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  provider?: string | null;
  model?: string | null;
  modelCostKind?: string | null;
  codespaceCostKind?: string | null;
  modelPricingVersion?: string | null;
  codespacePricingVersion?: string | null;
};

function attemptCost(attempt: DevAttempt): AttemptCostView | null {
  const raw = attempt.verification?.cost;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cost = raw as {
    model?: Record<string, unknown>;
    codespace?: Record<string, unknown>;
    totalUsd?: unknown;
    unknown?: unknown;
  };
  const numberOrNull = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const stringOrNull = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value : null;
  const rateVersion = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? stringOrNull((value as { version?: unknown }).version)
      : null;
  return {
    modelUsd: numberOrNull(cost.model?.costUsd),
    modelReportedUsd: numberOrNull(cost.model?.reportedCostUsd),
    modelEstimatedUsd: numberOrNull(cost.model?.estimatedCostUsd),
    codespaceEstimatedUsd: numberOrNull(cost.codespace?.estimatedUsd),
    codespaceConfirmedUsd: numberOrNull(cost.codespace?.confirmedUsd),
    totalUsd: numberOrNull(cost.totalUsd),
    inputTokens: numberOrNull(cost.model?.inputTokens),
    outputTokens: numberOrNull(cost.model?.outputTokens),
    reasoningTokens: numberOrNull(cost.model?.reasoningTokens),
    cacheReadTokens: numberOrNull(cost.model?.cacheReadTokens),
    cacheWriteTokens: numberOrNull(cost.model?.cacheWriteTokens),
    unknown: Array.isArray(cost.unknown)
      ? cost.unknown.filter((item): item is string => typeof item === 'string')
      : [],
    machine: stringOrNull(cost.codespace?.machine),
    runtimeMs: numberOrNull(cost.codespace?.runtimeMs),
    startedAt: stringOrNull(cost.codespace?.startedAt),
    finishedAt: stringOrNull(cost.codespace?.finishedAt),
    provider: stringOrNull(cost.model?.provider),
    model: stringOrNull(cost.model?.model),
    modelCostKind: stringOrNull(cost.model?.costKind),
    codespaceCostKind: stringOrNull(cost.codespace?.costKind),
    modelPricingVersion: rateVersion(cost.model?.rate),
    codespacePricingVersion: rateVersion(cost.codespace?.rate),
  };
}

function CostAggregateFacts({ aggregate }: { aggregate: DevCostAggregate }) {
  return (
    <>
      <dl className="pw-wb-facts">
        <div>
          <dt>Estimate min / expected / max</dt>
          <dd>
            {money(aggregate.estimate.minUsd)} / {money(aggregate.estimate.expectedUsd)} /{' '}
            {money(aggregate.estimate.maxUsd)}
          </dd>
        </div>
        <div>
          <dt>Actual total</dt>
          <dd>
            {money(aggregate.actual.totalUsd)} · variance {varianceText(aggregate)}
          </dd>
        </div>
        <div>
          <dt>DeepSeek reported</dt>
          <dd>
            {money(aggregate.actual.model.reportedUsd)}
            {aggregate.actual.model.estimatedUsd !== null
              ? ` + est. ${money(aggregate.actual.model.estimatedUsd)}`
              : ''}
            {aggregate.actual.model.effectiveUsd !== null
              ? ` · effective ${money(aggregate.actual.model.effectiveUsd)}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Codespaces</dt>
          <dd>
            est. {money(aggregate.actual.codespaces.estimatedUsd)} · confirmed{' '}
            {money(aggregate.actual.codespaces.confirmedUsd)} · effective{' '}
            {money(aggregate.actual.codespaces.effectiveUsd)}
          </dd>
        </div>
        <div>
          <dt>Tokens in / out / reasoning</dt>
          <dd>
            {aggregate.actual.inputTokens ?? '—'} / {aggregate.actual.outputTokens ?? '—'} /{' '}
            {aggregate.actual.reasoningTokens ?? '—'}
          </dd>
        </div>
        <div>
          <dt>Runs / retries / checks</dt>
          <dd>
            {aggregate.actual.attempts.total} / {aggregate.actual.attempts.retries} /{' '}
            {aggregate.actual.commands.total}
            {aggregate.actual.commands.failed
              ? ` · failed checks ${aggregate.actual.commands.failed}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Average successful task</dt>
          <dd>
            {money(aggregate.averageSuccessfulTaskUsd)} · {aggregate.successfulTasksWithCost}/
            {aggregate.successfulTasks} successful task(s) with cost
          </dd>
        </div>
      </dl>
      {aggregate.incomplete.unknown.length > 0 ||
      aggregate.incomplete.missingEstimateTasks > 0 ||
      aggregate.incomplete.attemptsMissingCost > 0 ? (
        <p className="pw-wb-warning">
          <AlertTriangle size={14} /> Incomplete data: {aggregate.incomplete.missingEstimateTasks}{' '}
          task estimate(s) missing · {aggregate.incomplete.attemptsMissingCost} attempt(s) without
          complete cost
          {aggregate.incomplete.unknown.length
            ? ` · ${aggregate.incomplete.unknown.join(', ')}`
            : ''}
        </p>
      ) : null}
    </>
  );
}

function TaskMeta({ task }: { task: DevWorkbenchTask }) {
  return (
    <span className="pw-wb-meta">
      {task.repository} · {task.baseRef} · attempts {task.attemptCount}
      {task.queuePosition !== null ? ` · #${task.queuePosition + 1}` : ''}
      {task.priority ? ` · P${task.priority}` : ''}
    </span>
  );
}

/**
 * Operator-facing dispatch state. A queued task with a dispatch marker is
 * never labelled running: only a claimed/in_progress attempt is running.
 */
function dispatchView(task: DevWorkbenchTask): {
  label: string;
  detail: string | null;
  retryable: boolean;
  warning: boolean;
} {
  const marker = task.actionsDispatchRequestedAt || null;
  const status = task.actionsDispatchStatus || null;
  const reason = task.actionsDispatchReason || task.lastErrorMessage || null;
  const reasonCode = task.actionsDispatchReasonCode || task.lastErrorCode || null;
  const nextRetry = task.actionsDispatchNextRetryAt || null;
  const attempts = task.actionsDispatchAttempts || 0;
  const attemptLabel = attempts > 0 ? ` · attempt ${attempts}/5` : '';
  const retryLabel = nextRetry ? `retry ${age(nextRetry)} ago` : '';

  if (!marker) {
    return {
      label: 'dispatch: waiting for a free slot',
      detail: null,
      retryable: false,
      warning: false,
    };
  }
  switch (status) {
    case 'requested':
      return {
        label: `dispatch: requested${attemptLabel}`,
        detail: 'Waiting for GitHub Actions to start the workflow. This is not running yet.',
        retryable: false,
        warning: false,
      };
    case 'accepted':
      return {
        label: `dispatch: workflow accepted${attemptLabel}`,
        detail: 'GitHub accepted the event; no workflow claim has been recorded yet.',
        retryable: false,
        warning: false,
      };
    case 'claimable':
      return {
        label: `dispatch: workflow started${attemptLabel}`,
        detail: 'Waiting for the runner to claim the task.',
        retryable: false,
        warning: false,
      };
    case 'claimed':
      return {
        label: 'dispatch: claimed',
        detail: 'An attempt owns this task.',
        retryable: false,
        warning: false,
      };
    case 'retry_scheduled':
      return {
        label: `dispatch: retry scheduled${attemptLabel}`,
        detail: [
          reasonCode,
          reason,
          nextRetry ? `next ${new Date(nextRetry).toLocaleString()}` : retryLabel,
        ]
          .filter(Boolean)
          .join(' · '),
        retryable: true,
        warning: true,
      };
    case 'not_claimable':
    case 'ineligible':
      return {
        label: `dispatch: not claimable${attemptLabel}`,
        detail: [reasonCode, reason].filter(Boolean).join(' · '),
        retryable: task.status === 'queued',
        warning: true,
      };
    case 'failed':
      return {
        label: `dispatch: failed to claim${attemptLabel}`,
        detail: [reasonCode, reason].filter(Boolean).join(' · '),
        retryable: task.status === 'queued',
        warning: true,
      };
    default:
      return {
        label: 'dispatch: requested',
        detail: reason,
        retryable: false,
        warning: false,
      };
  }
}

function formFromInput(input: DevTaskInput): TaskFormState {
  return {
    title: input.title || '',
    objective: input.objective || '',
    context: input.context || '',
    repository: typeof input.repository === 'string' ? input.repository : 'newlove',
    baseRef: input.baseRef || 'main',
    acceptanceCriteria: (input.acceptanceCriteria || []).join('\n'),
    tests: (input.tests || []).join('\n'),
    securityConstraints: (input.securityConstraints || []).join('\n'),
    affectedFiles: (input.affectedFiles || []).join('\n'),
  };
}

export default function DevWorkbench({
  initialOverview,
  onOpenChat,
  taskHandoff,
  onTaskHandoffConsumed,
}: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [release, setRelease] = useState<DevReleaseOverview | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [detailsSection, setDetailsSection] = useState<DetailsSection>('tasks');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);
  const [handoffContext, setHandoffContext] = useState<DevTaskInput | null>(null);
  const [setup, setSetup] = useState<DevSetupReport | null>(null);
  const [ledger, setLedger] = useState<DevCostLedger | null>(null);
  const [ledgerDays, setLedgerDays] = useState(30);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    objective: '',
    acceptanceCriteria: '',
    tests: '',
    securityConstraints: '',
    affectedFiles: '',
  });
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [review, setReview] = useState<DevReviewView | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [codespaceList, setCodespaceList] = useState<
    Array<{ name: string; state: string; repository: string | null; machine: string | null }>
  >([]);
  const lastHandoffNonce = useRef(0);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/pierrot/dev/workbench', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { overview: DevWorkbenchOverview };
    setOverview(body.overview);
    return body.overview;
  }, []);

  const loadRelease = useCallback(async (showLoading = false, advance = false) => {
    if (showLoading) setReleaseLoading(true);
    try {
      const response = await fetch(
        `/api/admin/pierrot/dev/workbench/release${advance ? '?advance=1' : ''}`,
        {
          cache: 'no-store',
        }
      );
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { release: DevReleaseOverview };
      setRelease(body.release);
      setReleaseError(null);
    } catch (caught) {
      setReleaseError(caught instanceof Error ? caught.message : 'Release readiness failed.');
    } finally {
      setReleaseLoading(false);
    }
  }, []);

  const startRelease = useCallback(async () => {
    if (!release?.target || !release.canRelease || busy) return;
    const sha = release.target.sha;
    const confirmed = window.confirm(
      `Deploy ${sha} to production?\n\nAdmin will apply only safe pending migrations, promote an immutable preview for this exact SHA, wait for READY and run live smoke tests.`
    );
    if (!confirmed) return;
    setBusy('release');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/pierrot/dev/workbench/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', confirm: true, expectedSha: sha }),
      });
      const body = (await response.json().catch(() => null)) as {
        release?: DevReleaseOverview;
        error?: string;
        code?: string;
        detail?: string | null;
      } | null;
      if (!response.ok) {
        if (body?.code === 'RELEASE_SHA_MOVED') {
          setNotice(
            `main moved while you were reading it. Nothing was deployed. Refresh and release the new main SHA${
              body.detail ? ` (${body.detail.slice(0, 7)})` : ''
            }.`
          );
          await loadRelease(true);
          return;
        }
        throw new Error(body?.error || (await readError(response)));
      }
      if (body?.release) setRelease(body.release);
      else await loadRelease(true);
      setNotice(
        'Production release started for the pinned SHA. Admin will keep advancing it and report every step.'
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Production release failed.');
    } finally {
      setBusy(null);
    }
  }, [release, busy, loadRelease]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refresh(), loadRelease(true)]);
  }, [refresh, loadRelease]);

  const loadSetup = useCallback(async () => {
    setBusy('setup');
    try {
      const response = await fetch('/api/admin/pierrot/dev/workbench/setup', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { setup: DevSetupReport };
      setSetup(body.setup);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Setup check failed.');
    } finally {
      setBusy(null);
    }
  }, []);

  const loadLedger = useCallback(
    async (days = ledgerDays) => {
      setLedgerLoading(true);
      try {
        const response = await fetch(`/api/admin/pierrot/dev/workbench/ledger?days=${days}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(await readError(response));
        const body = (await response.json()) as { ledger: DevCostLedger };
        setLedger(body.ledger);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Cost ledger failed.');
      } finally {
        setLedgerLoading(false);
      }
    },
    [ledgerDays]
  );

  const runAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}, label?: string) => {
      setBusy(label || action);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch('/api/admin/pierrot/dev/workbench/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const body = (await response.json()) as {
          overview?: DevWorkbenchOverview;
          token?: string;
          dispatch?: {
            dispatched?: boolean;
            code?: string;
            reason?: string;
          } | null;
          codespaces?: Array<{
            name: string;
            state: string;
            repository: string | null;
            machine: string | null;
          }>;
        };
        if (body.token) setSetupToken(body.token);
        if (body.codespaces) setCodespaceList(body.codespaces);
        if (body.overview) setOverview(body.overview);
        if (action === 'queue' || action === 'enqueue' || action === 'retry') {
          const taskId = String(payload.taskId || '');
          const queued = body.overview?.queue.some(
            (item) => item.id === taskId && item.status === 'queued'
          );
          if (!queued) {
            setNotice(
              'Задание готово. Задачи batch запускаются через Start batch в Details → Batches.'
            );
          } else if (body.dispatch && body.dispatch.dispatched === false) {
            setNotice(
              `Задание в очереди, но dispatch не отправлен (${body.dispatch.code || 'не отправлен'}). ${
                body.dispatch.reason || 'Повторите dispatch из блока Next.'
              }`
            );
          } else {
            setNotice(
              'Задание поставлено в очередь. Dispatch в GitHub Actions запрошен; это ещё не значит, что задача выполняется.'
            );
          }
        }
        if (action === 'retry_dispatch') {
          setNotice('Safe dispatch retry requested. One new dispatch may be sent.');
        }
        if (action === 'cancel') setNotice('Задача отменена. Попытка и журнал сохранены.');
        if (action === 'retry') setNotice('Повтор поставлен в очередь; прошлые попытки сохранены.');
        if (action === 'dequeue') setNotice('Задача убрана из очереди.');
        if (action === 'block') setNotice('Задача заблокирована и останется в Details.');
        if (action === 'archive') setNotice('Задача архивирована.');
        if (action === 'pause_queue') setNotice('Очередь приостановлена.');
        if (action === 'resume_queue') setNotice('Очередь возобновлена.');
        if (action === 'finalize_queue') setNotice('Finalization pass requested.');
        if (action === 'reconcile_legacy') {
          const report = (
            body as {
              reconciliation?: {
                scanned?: number;
                landed?: number;
                stillReview?: number;
                changed?: number;
              };
            }
          ).reconciliation;
          setNotice(
            `Reconciliation: scanned ${report?.scanned ?? 0}, landed ${report?.landed ?? 0}, still in review ${report?.stillReview ?? 0}, changed ${report?.changed ?? 0}.`
          );
        }
        if (action === 'start_codespace' || action === 'create_codespace') {
          setNotice('Codespace start requested. The worker starts automatically after boot.');
        }
        if (
          [
            'queue',
            'enqueue',
            'retry',
            'cancel',
            'dequeue',
            'finalize_queue',
            'archive',
            'block',
          ].includes(action)
        ) {
          void loadRelease();
        }
        return body;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Action failed.');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [loadRelease]
  );

  const loadReview = useCallback(async (taskId: string) => {
    setReviewTaskId(taskId);
    setReviewLoading(true);
    setReview(null);
    setDetailsSection('evidence');
    setDrawer('details');
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/dev/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { attemptView: DevReviewView | null };
      setReview(body.attemptView);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review failed.');
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first read so it is an external subscription, not a synchronous
    // setState during mount. The panel already renders a loading state.
    const timer = setTimeout(() => {
      void loadRelease();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRelease]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy) {
        void refresh().catch(() => {});
      }
    }, 15000);
    const releaseTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy) {
        void loadRelease();
      }
    }, 60000);
    return () => {
      clearInterval(timer);
      clearInterval(releaseTimer);
    };
  }, [refresh, loadRelease, busy]);

  const activeReleaseId = release?.activeRelease?.id || null;

  useEffect(() => {
    // A production release is a server-side state machine. Polling advances one
    // bounded step at a time; the owner action happened once.
    if (!activeReleaseId || busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadRelease(false, true);
    }, 12000);
    return () => clearInterval(timer);
  }, [activeReleaseId, busy, loadRelease]);

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer]);

  useEffect(() => {
    if (!taskHandoff || taskHandoff.nonce === lastHandoffNonce.current) return;
    lastHandoffNonce.current = taskHandoff.nonce;
    setHandoffContext(taskHandoff.input);
    setForm(formFromInput(taskHandoff.input));
    setCreateOpen(true);
    setDrawer('details');
    setDetailsSection('tasks');
    setNotice('Черновик задания подготовлен из Dev-треда. Проверьте поля и сохраните.');
    onTaskHandoffConsumed?.();
  }, [taskHandoff, onTaskHandoffConsumed]);

  const counts = overview.counts;
  const active = overview.active;
  const worker = overview.workers.find((item) => item.online) || overview.workers[0] || null;
  const workerHealth = overview.workerHealth || {
    total: overview.workers.length,
    active: overview.workers.filter((item) => item.online).length,
    stale: 0,
    historical: 0,
    finished: 0,
    orphan: 0,
    pointerMismatch: 0,
    issues: [],
  };
  const productionSha = release?.production?.commitSha || null;
  const landedShas = useMemo(() => {
    if (!release || release.behindBy === null) return null;
    return new Set(release.commits.map((commit) => commit.sha.toLowerCase()));
  }, [release]);

  const allTasks = useMemo(() => {
    const map = new Map<string, DevWorkbenchTask>();
    for (const task of [
      ...overview.inbox,
      ...overview.queue,
      ...overview.review,
      ...overview.history.map((entry) => entry.task),
      ...(overview.active ? [overview.active.task] : []),
    ]) {
      map.set(task.id, task);
    }
    return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [overview]);

  const taskById = useMemo(() => {
    const map = new Map<string, DevWorkbenchTask>();
    for (const task of allTasks) map.set(task.id, task);
    return map;
  }, [allTasks]);

  const batchByTask = useMemo(() => {
    const map = new Map<
      string,
      { batchId: string; batchTitle: string; dependsOnTaskId: string | null }
    >();
    for (const batch of overview.batches) {
      for (const item of batch.items) {
        map.set(item.taskId, {
          batchId: batch.id,
          batchTitle: batch.title,
          dependsOnTaskId: item.dependsOnTaskId,
        });
      }
    }
    return map;
  }, [overview.batches]);

  const stageCounts = useMemo(() => {
    const map = new Map<TaskStageKey, number>();
    for (const task of allTasks) {
      const key = taskStage(task, productionSha, landedShas).key;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [allTasks, productionSha, landedShas]);

  const queuedTasks = useMemo(
    () =>
      overview.queue
        .filter((task) => task.status === 'queued')
        .sort(
          (a, b) =>
            (a.queuePosition ?? Number.MAX_SAFE_INTEGER) -
              (b.queuePosition ?? Number.MAX_SAFE_INTEGER) || b.priority - a.priority
        ),
    [overview.queue]
  );
  const readyTasks = useMemo(
    () => overview.queue.filter((task) => task.status === 'ready'),
    [overview.queue]
  );
  const attentionTasks = useMemo(
    () =>
      allTasks
        .filter((task) => ['blocked', 'failed', 'rejected', 'review'].includes(task.status))
        .slice(0, 8),
    [allTasks]
  );
  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) || null : null;

  const createTask = async () => {
    setBusy('create');
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/dev/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(handoffContext || {}),
          title: form.title,
          objective: form.objective,
          context: form.context,
          repository: form.repository,
          baseRef: form.baseRef,
          acceptanceCriteria: lines(form.acceptanceCriteria),
          tests: lines(form.tests),
          securityConstraints: lines(form.securityConstraints),
          affectedFiles: lines(form.affectedFiles),
          status: 'draft',
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json().catch(() => null)) as {
        task?: { id?: string };
      } | null;
      setForm(EMPTY_FORM);
      setHandoffContext(null);
      setCreateOpen(false);
      await refresh();
      if (payload?.task?.id) {
        setSelectedTaskId(payload.task.id);
      }
      setDetailsSection('tasks');
      setDrawer('details');
      setNotice('Draft created. Add criteria, then use “Queue task”.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the task.');
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (task: DevWorkbenchTask) => {
    setSelectedTaskId(task.id);
    setEditId(task.id);
    setEditForm({
      title: task.title,
      objective: task.objective,
      acceptanceCriteria: task.acceptanceCriteria.join('\n'),
      tests: '',
      securityConstraints: '',
      affectedFiles: '',
    });
    setDrawer('details');
    setDetailsSection('tasks');
  };

  const saveEdit = async (taskId: string) => {
    setBusy(`edit:${taskId}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pierrot/dev/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          objective: editForm.objective,
          acceptanceCriteria: lines(editForm.acceptanceCriteria),
          ...(editForm.tests.trim() ? { tests: lines(editForm.tests) } : {}),
          ...(editForm.securityConstraints.trim()
            ? { securityConstraints: lines(editForm.securityConstraints) }
            : {}),
          ...(editForm.affectedFiles.trim()
            ? { affectedFiles: lines(editForm.affectedFiles) }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setEditId(null);
      await refresh();
      setNotice('Task details updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update the task.');
    } finally {
      setBusy(null);
    }
  };

  const openDetails = (section: DetailsSection = 'tasks') => {
    setDetailsSection(section);
    setDrawer('details');
  };

  const openTask = (task: DevWorkbenchTask) => {
    setSelectedTaskId(task.id);
    setDrawer('details');
    setDetailsSection('tasks');
    setEditId(null);
  };

  const queueTask = (task: DevWorkbenchTask) => {
    if (task.status === 'ready') {
      void runAction('enqueue', { taskId: task.id });
    } else {
      void runAction('queue', { taskId: task.id });
    }
  };

  const renderAttempt = (attempt: DevAttempt) => {
    const cost = attemptCost(attempt);
    return (
      <div key={attempt.id} className="pw-wb-attempt">
        <button
          type="button"
          className="pw-wb-attempt-head"
          onClick={() => setExpandedAttempt(expandedAttempt === attempt.id ? null : attempt.id)}
        >
          <StatusBadge status={attempt.status} />
          <span>attempt {attempt.attemptNumber}</span>
          <code>{shortSha(attempt.headSha)}</code>
          <span>{age(attempt.startedAt)} ago</span>
          <ChevronDown size={14} />
        </button>
        {expandedAttempt === attempt.id && (
          <div className="pw-wb-attempt-body">
            <dl className="pw-wb-facts">
              <div>
                <dt>Branch</dt>
                <dd>
                  <code>{attempt.branch || '—'}</code>
                </dd>
              </div>
              <div>
                <dt>Exit code</dt>
                <dd>{attempt.exitCode ?? '—'}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{attempt.changedFiles.length}</dd>
              </div>
              <div>
                <dt>OpenCode session</dt>
                <dd>{attempt.opencodeSessionId || '—'}</dd>
              </div>
              <div>
                <dt>Provider / model</dt>
                <dd>{cost ? `${cost.provider || '—'} / ${cost.model || '—'}` : '—'}</dd>
              </div>
              <div>
                <dt>Model cost</dt>
                <dd>
                  {cost
                    ? `${money(cost.modelUsd)} · ${cost.modelCostKind || 'unknown'} · reported ${money(
                        cost.modelReportedUsd
                      )} · est. ${money(cost.modelEstimatedUsd)}${
                        cost.modelPricingVersion ? ` · ${cost.modelPricingVersion}` : ''
                      }`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Codespaces</dt>
                <dd>
                  {cost
                    ? `${money(cost.codespaceEstimatedUsd)} ${cost.codespaceCostKind || 'unknown'}${
                        cost.machine ? ` · ${cost.machine}` : ''
                      } · confirmed ${money(cost.codespaceConfirmedUsd)}${
                        cost.codespacePricingVersion ? ` · ${cost.codespacePricingVersion}` : ''
                      }`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{cost ? money(cost.totalUsd) : '—'}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>
                  {cost
                    ? `${cost.inputTokens ?? '—'} in / ${cost.outputTokens ?? '—'} out · cache read ${
                        cost.cacheReadTokens ?? '—'
                      } / write ${cost.cacheWriteTokens ?? '—'}`
                    : '—'}
                </dd>
              </div>
            </dl>
            {cost?.unknown?.length ? (
              <p className="pw-wb-meta">Cost unavailable for: {cost.unknown.join(', ')}.</p>
            ) : null}
            {attempt.errorCode && (
              <p className="pw-wb-warning">
                <AlertTriangle size={14} /> {attempt.errorCode}: {attempt.errorMessage}
              </p>
            )}
            {typeof attempt.verification?.mergedAt === 'string' && (
              <p className="pw-wb-meta">
                merged {String(attempt.verification.mergeSha || '')} · deployment{' '}
                {String(
                  (attempt.verification.deployment as { state?: string } | undefined)?.state ||
                    'unknown'
                )}
              </p>
            )}
            {attempt.commands.length > 0 && (
              <ul className="pw-wb-criteria">
                {attempt.commands.map((command, index) => (
                  <li key={`${command.name}-${index}`}>
                    <strong>{command.status}</strong> {command.name}
                    {command.detail ? ` — ${command.detail}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {attempt.resultSummary && <p className="pw-wb-card-body">{attempt.resultSummary}</p>}
            {attempt.changedFiles.length > 0 && (
              <details className="pw-wb-log">
                <summary>Changed files ({attempt.changedFiles.length})</summary>
                <ul className="pw-wb-criteria">
                  {attempt.changedFiles.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {attempt.warnings.length > 0 && (
              <p className="pw-wb-warning">
                <ShieldAlert size={14} /> {attempt.warnings.join(' · ')}
              </p>
            )}
            {attempt.logExcerpt && (
              <details className="pw-wb-log">
                <summary>Лог (обрезан)</summary>
                <pre>{attempt.logExcerpt}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderNow = () => {
    const lifecycle = overview.lifecycle;
    return (
      <section className="pw-exec-panel pw-exec-now" aria-label="Running now">
        <div className="pw-exec-panel-head">
          <div>
            <p className="pw-exec-kicker">1 · NOW</p>
            <h2>Что выполняется сейчас</h2>
          </div>
          <span className={`pw-exec-state is-${active ? 'running' : 'idle'}`}>
            {active ? 'running' : 'idle'}
          </span>
        </div>

        {active ? (
          <>
            <div className="pw-exec-now-task">
              <StageChip task={active.task} productionSha={productionSha} landedShas={landedShas} />
              <strong>{active.task.title}</strong>
              <span className="pw-wb-meta">
                {active.task.repository} · {active.task.baseRef} · attempt{' '}
                {active.attempt.attemptNumber}
              </span>
            </div>
            <dl className="pw-exec-metrics">
              <div>
                <dt>Stage</dt>
                <dd>{active.attempt.progressStage || active.attempt.status}</dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>
                  <Elapsed startedAt={active.attempt.startedAt} />
                </dd>
              </div>
              <div>
                <dt>Worker</dt>
                <dd>
                  {active.worker?.name || active.attempt.workerId || '—'}
                  <span className="pw-wb-meta">
                    {' '}
                    · heartbeat {age(active.attempt.heartbeatAt)} ago
                  </span>
                </dd>
              </div>
              <div>
                <dt>Lease</dt>
                <dd>
                  {active.attempt.leaseExpiresAt
                    ? `${age(active.attempt.leaseExpiresAt)} left`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Pipeline</dt>
                <dd>
                  queued {queuedTasks.length} · ready {readyTasks.length} · failed{' '}
                  {counts.failed || 0}
                </dd>
              </div>
              <div>
                <dt>Production</dt>
                <dd>
                  {release?.production?.shortSha
                    ? `${release.production.state} @ ${release.production.shortSha}`
                    : 'unknown'}
                </dd>
              </div>
            </dl>
            {overview.finalization && active && (
              <p className="pw-wb-meta">
                Queue finalization: {overview.finalization.stage} ·{' '}
                {overview.finalization.integrated}/{overview.finalization.pullRequests} PR
              </p>
            )}
            <div className="pw-exec-events">
              {active.events.slice(-4).map((event) => (
                <div key={event.id} className={`pw-wb-event is-${event.level}`}>
                  <time>{new Date(event.createdAt).toLocaleTimeString('ru-RU')}</time>
                  <span>{event.message}</span>
                </div>
              ))}
              {active.events.length === 0 && <p className="pw-wb-empty">Событий пока нет.</p>}
            </div>
            <div className="pw-wb-actions">
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => openTask(active.task)}
              >
                <LayoutList size={14} /> Open task
              </button>
              <button
                type="button"
                className="pw-wb-button is-danger"
                disabled={busy === 'cancel'}
                onClick={() => void runAction('cancel', { taskId: active.task.id })}
              >
                <X size={14} /> Cancel attempt
              </button>
            </div>
          </>
        ) : (
          <div className="pw-exec-idle">
            <Clock size={20} aria-hidden="true" />
            <div>
              <strong>Исполнитель свободен</strong>
              <p>
                {overview.queuePaused
                  ? 'Очередь приостановлена. Возобновите её в блоке Next.'
                  : queuedTasks[0]
                    ? `Следующее задание: ${queuedTasks[0].title}.`
                    : 'Очередь пуста. Готовые задания появятся в блоке Next.'}
              </p>
            </div>
          </div>
        )}

        <div className="pw-exec-worker-line">
          <span className={`pw-wb-chip ${worker?.online ? 'is-ok' : 'is-error'}`}>
            worker {worker?.online ? 'online' : 'offline'}
          </span>
          <span className={`pw-wb-chip is-${lifecycleTone(lifecycle.status)}`}>
            {lifecycle.label}
          </span>
          <span className="pw-wb-chip is-quiet">active {workerHealth.active}</span>
          <span className="pw-wb-chip is-warn">stale {workerHealth.stale}</span>
          <span
            className={`pw-wb-chip ${
              workerHealth.orphan || workerHealth.pointerMismatch ? 'is-error' : 'is-quiet'
            }`}
          >
            orphan {workerHealth.orphan} · mismatch {workerHealth.pointerMismatch}
          </span>
        </div>
        {lifecycle.lastError && (
          <p className="pw-wb-warning">
            <AlertTriangle size={14} />{' '}
            {lifecycle.lastErrorCode ? `${lifecycle.lastErrorCode}: ` : ''}
            {lifecycle.lastError}
          </p>
        )}
      </section>
    );
  };

  const renderNext = () => (
    <section className="pw-exec-panel pw-exec-next" aria-label="Next in queue">
      <div className="pw-exec-panel-head">
        <div>
          <p className="pw-exec-kicker">2 · NEXT</p>
          <h2>Что дальше</h2>
        </div>
        <div className="pw-wb-actions">
          <span className="pw-wb-chip is-quiet">{queuedTasks.length} queued</span>
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => void runAction(overview.queuePaused ? 'resume_queue' : 'pause_queue')}
          >
            {overview.queuePaused ? <Play size={14} /> : <Pause size={14} />}
            {overview.queuePaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {queuedTasks.length === 0 && readyTasks.length === 0 ? (
        <p className="pw-wb-empty">
          Очередь пуста. Создайте задание или отправьте готовый draft через Details → Tasks.
        </p>
      ) : (
        <ol className="pw-exec-queue">
          {queuedTasks.slice(0, 8).map((task, index) => {
            const dispatch = dispatchView(task);
            const batch = batchByTask.get(task.id);
            const dependsOn = batch?.dependsOnTaskId ? taskById.get(batch.dependsOnTaskId) : null;
            return (
              <li key={task.id} className="pw-exec-queue-item">
                <span className="pw-exec-position">{index + 1}</span>
                <div className="pw-exec-queue-body">
                  <button
                    type="button"
                    className="pw-exec-queue-title"
                    onClick={() => openTask(task)}
                  >
                    {task.title}
                  </button>
                  <span className="pw-wb-meta">
                    {task.repository} · {task.baseRef} · P{task.priority} · attempts{' '}
                    {task.attemptCount}
                  </span>
                  <span className={dispatch.warning ? 'pw-wb-warning' : 'pw-wb-meta'}>
                    {dispatch.warning ? <AlertTriangle size={13} /> : <GitBranch size={13} />}{' '}
                    {dispatch.label}
                    {dispatch.detail ? ` · ${dispatch.detail}` : ''}
                  </span>
                  {batch && (
                    <span className="pw-wb-meta">
                      batch {batch.batchTitle}
                      {dependsOn
                        ? ` · depends on ${dependsOn.title} (${dependsOn.status})`
                        : batch.dependsOnTaskId
                          ? ` · depends on ${shortSha(batch.dependsOnTaskId)}`
                          : ''}
                    </span>
                  )}
                  {task.lastErrorCode && (
                    <span className="pw-wb-warning">
                      <AlertTriangle size={13} /> {task.lastErrorCode}: {task.lastErrorMessage}
                    </span>
                  )}
                </div>
                <div className="pw-exec-queue-actions">
                  <button
                    type="button"
                    className="pw-wb-icon-button"
                    aria-label="Выше"
                    disabled={index === 0}
                    onClick={() =>
                      void runAction('reorder', { taskId: task.id, position: index - 1 })
                    }
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="pw-wb-icon-button"
                    aria-label="Ниже"
                    disabled={index === queuedTasks.length - 1}
                    onClick={() =>
                      void runAction('reorder', { taskId: task.id, position: index + 1 })
                    }
                  >
                    <ArrowDown size={14} />
                  </button>
                  {dispatch.retryable && (
                    <button
                      type="button"
                      className="pw-wb-button is-warn"
                      disabled={busy === `retry_dispatch:${task.id}`}
                      onClick={() => void runAction('retry_dispatch', { taskId: task.id })}
                    >
                      <RotateCcw size={14} /> Retry dispatch
                    </button>
                  )}
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => void runAction('dequeue', { taskId: task.id })}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {readyTasks.length > 0 && (
        <div className="pw-exec-ready">
          <p className="pw-exec-kicker">READY TO QUEUE</p>
          <ul>
            {readyTasks.slice(0, 5).map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <button
                  type="button"
                  className="pw-wb-button is-primary"
                  disabled={busy === `enqueue:${task.id}`}
                  onClick={() => void runAction('enqueue', { taskId: task.id })}
                >
                  <ArrowDown size={14} /> В очередь
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="pw-wb-button is-quiet" onClick={() => openDetails('tasks')}>
        <LayoutList size={14} /> Full queue & batches
      </button>
    </section>
  );

  const renderLanded = () => (
    <section className="pw-exec-panel pw-exec-landed" aria-label="Landed in main">
      <div className="pw-exec-panel-head">
        <div>
          <p className="pw-exec-kicker">3 · LANDED IN MAIN</p>
          <h2>Что попало в main после релиза</h2>
        </div>
        <span className="pw-wb-chip is-quiet">
          {release?.behindBy !== null && release?.behindBy !== undefined
            ? `${release.behindBy} commit(s)`
            : 'comparing…'}
        </span>
      </div>

      {releaseLoading && !release ? (
        <p className="pw-wb-empty">Читаю main и production deployments…</p>
      ) : releaseError && !release ? (
        <p className="pw-wb-warning">
          <AlertTriangle size={14} /> {releaseError}
        </p>
      ) : release ? (
        <>
          <dl className="pw-exec-facts">
            <div>
              <dt>Production last deployed</dt>
              <dd>
                {release.production?.commitSha ? (
                  release.production.url ? (
                    <a href={release.production.url} target="_blank" rel="noreferrer">
                      {release.production.shortSha} · {release.production.state}
                    </a>
                  ) : (
                    <span>
                      {release.production.shortSha} · {release.production.state}
                    </span>
                  )
                ) : (
                  <span className="pw-wb-meta">unknown</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Main head</dt>
              <dd>
                {release.main ? (
                  <a href={release.main.url} target="_blank" rel="noreferrer">
                    {release.main.shortSha}
                  </a>
                ) : (
                  'unknown'
                )}
              </dd>
            </div>
            <div>
              <dt>Comparison</dt>
              <dd>
                {release.behindBy === null
                  ? 'unavailable'
                  : release.behindBy === 0
                    ? 'main and production match'
                    : `${release.behindBy} commit(s) ahead of production`}
              </dd>
            </div>
          </dl>

          {release.commits.length === 0 ? (
            <p className="pw-wb-empty">
              {release.behindBy === 0
                ? 'Production already runs the main head commit.'
                : 'No commit can be listed yet. See the release checks for the exact reason.'}
            </p>
          ) : (
            <ul className="pw-exec-commits">
              {release.commits.slice(0, 10).map((commit) => (
                <li key={commit.sha}>
                  <a href={commit.url} target="_blank" rel="noreferrer" className="pw-exec-sha">
                    {commit.shortSha}
                  </a>
                  <span className="pw-exec-commit-message">{commit.message}</span>
                  <span className="pw-wb-meta">
                    {commit.author || 'unknown'} · {formatDate(commit.committedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {release.commits.length > 10 && (
            <p className="pw-wb-meta">
              Showing 10 of {release.commits.length}. The release preflight uses the full range.
            </p>
          )}
          {release.error && (
            <p className="pw-wb-warning">
              <AlertTriangle size={14} /> {release.error}
            </p>
          )}
        </>
      ) : null}
    </section>
  );

  const releaseDisabledReason = (() => {
    if (!release) return releaseError || 'Release readiness has not loaded yet.';
    if (!release.canRelease) {
      return release.blockers[0] || 'Preflight is not ready.';
    }
    if (!release.releaseAction.available) {
      return release.releaseAction.reason;
    }
    return release.releaseAction.reason;
  })();

  const renderRelease = () => (
    <section className="pw-exec-panel pw-exec-release" aria-label="Release readiness">
      <div className="pw-exec-panel-head">
        <div>
          <p className="pw-exec-kicker">4 · RELEASE</p>
          <h2>Готова ли production?</h2>
        </div>
        <span
          className={`pw-exec-state ${
            release?.canRelease ? 'is-ready' : release?.blockers.length ? 'is-blocked' : 'is-queued'
          }`}
        >
          {release?.canRelease ? 'ready' : release?.blockers.length ? 'blocked' : 'unknown'}
        </span>
      </div>

      <div className="pw-exec-target">
        <span className="pw-exec-kicker">DEPLOY WILL RELEASE · PINNED BY ADMIN</span>
        {release?.target ? (
          <a href={release.target.url} target="_blank" rel="noreferrer">
            main @ {release.target.sha}
          </a>
        ) : (
          <span>main SHA unavailable</span>
        )}
      </div>

      {release ? (
        <>
          <dl className="pw-exec-facts">
            <div>
              <dt>Production now</dt>
              <dd>
                {release.production?.commitSha ? (
                  release.production.url ? (
                    <a href={release.production.url} target="_blank" rel="noreferrer">
                      {release.production.shortSha} · {release.production.state}
                    </a>
                  ) : (
                    <span>
                      {release.production.shortSha} · {release.production.state}
                    </span>
                  )
                ) : (
                  <span className="pw-wb-meta">unknown</span>
                )}
              </dd>
            </div>
            <div>
              <dt>CI for main head</dt>
              <dd>{release.ci ? `${release.ci.status} · ${release.ci.detail}` : 'unavailable'}</dd>
            </div>
            <div>
              <dt>Since production</dt>
              <dd>
                {release.behindBy === null
                  ? 'unavailable'
                  : `${release.behindBy} commit(s) · ${release.files?.length || 0} file(s)`}
              </dd>
            </div>
            <div>
              <dt>Migrations</dt>
              <dd>
                {release.migrations?.available
                  ? `applied ${release.migrations.counts.applied} · pending safe ${release.migrations.pendingSafe.length} · unsafe ${release.migrations.counts.unsafe} · unknown ${release.migrations.counts.unknown}`
                  : 'production schema unavailable'}
              </dd>
            </div>
          </dl>

          {(release.files?.length || 0) > 0 && (
            <details className="pw-exec-release-details">
              <summary>Files since production ({release.files?.length || 0})</summary>
              <ul className="pw-exec-commits">
                {(release.files || []).slice(0, 20).map((file) => (
                  <li key={file.filename}>
                    <a href={file.url} target="_blank" rel="noreferrer" className="pw-exec-sha">
                      {file.status}
                    </a>
                    <span className="pw-exec-commit-message">{file.filename}</span>
                    <span className="pw-wb-meta">
                      +{file.additions} / −{file.deletions}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(release.migrations?.rows || []).some((row) => row.status !== 'applied') && (
            <details
              className="pw-exec-release-details"
              open={(release.migrations?.blockers.length || 0) > 0}
            >
              <summary>Migration preflight (non-applied)</summary>
              <ul className="pw-exec-checks">
                {(release.migrations?.rows || [])
                  .filter((row) => row.status !== 'applied')
                  .slice(0, 20)
                  .map((row) => (
                    <li
                      key={row.version}
                      className={`is-${row.status === 'pending' ? 'warn' : 'error'}`}
                    >
                      <span className="pw-exec-check-dot" aria-hidden="true" />
                      <div>
                        <strong>
                          {row.status} · {row.risk} · {row.version}
                        </strong>
                        <p>{row.evidence}</p>
                        {row.reasons.length > 0 && <p>{row.reasons.join(' ')}</p>}
                      </div>
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <ul className="pw-exec-checks">
            {release.checks.map((check) => (
              <li key={check.key} className={`is-${check.status}`}>
                <span className="pw-exec-check-dot" aria-hidden="true" />
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          {release.blockers.length > 0 && (
            <ul className="pw-exec-blockers">
              {release.blockers.map((blocker) => (
                <li key={blocker}>
                  <AlertTriangle size={14} /> {blocker}
                </li>
              ))}
            </ul>
          )}
          {release.productionRelease && (
            <div className="pw-exec-release-ledger">
              <p className="pw-exec-kicker">RELEASE LEDGER · LATEST</p>
              <p>
                <strong>{release.productionRelease.status}</strong> ·{' '}
                {release.productionRelease.phase} · {shortSha(release.productionRelease.pinnedSha)}
                {release.productionRelease.productionDeploymentId
                  ? ` · ${release.productionRelease.productionDeploymentId}`
                  : ''}
              </p>
              <p className="pw-wb-meta">
                requested {formatDate(release.productionRelease.requestedAt)}
                {release.productionRelease.finishedAt
                  ? ` · finished ${formatDate(release.productionRelease.finishedAt)}`
                  : ''}
                {' · smoke '}
                {release.productionRelease.smokeResults.length === 0
                  ? 'not run'
                  : release.productionRelease.smokeResults.every((result) => result.ok)
                    ? 'passed'
                    : 'failed'}
                {release.productionRelease.rolledBack ? ' · rolled back' : ''}
              </p>
              {(release.productionRelease.errorMessage ||
                release.productionRelease.rollbackError) && (
                <p className="pw-wb-warning">
                  <AlertTriangle size={14} />{' '}
                  {release.productionRelease.errorMessage ||
                    release.productionRelease.rollbackError}
                </p>
              )}
            </div>
          )}
          {releaseError && (
            <p className="pw-wb-warning">
              <AlertTriangle size={14} /> Latest release refresh failed: {releaseError}. Showing the
              last known state.
            </p>
          )}
        </>
      ) : (
        <p className="pw-wb-empty">{releaseLoading ? 'Checking preflight…' : releaseError}</p>
      )}

      <button
        type="button"
        className="pw-wb-button is-primary"
        onClick={() => void startRelease()}
        disabled={
          Boolean(busy) ||
          !release?.canRelease ||
          !release.releaseAction.available ||
          Boolean(release.activeRelease)
        }
        title={releaseDisabledReason}
        aria-describedby="pw-release-reason"
      >
        <Rocket size={14} />{' '}
        {release?.activeRelease
          ? `Release ${release.activeRelease.status}…`
          : `Release ${release?.target ? shortSha(release.target.sha) : ''}`}
      </button>
      <p id="pw-release-reason" className="pw-wb-warning pw-exec-release-reason">
        <ShieldAlert size={14} /> {releaseDisabledReason}
      </p>
      <p className="pw-wb-meta">
        Merge завершает задачу в main. Deploy публикует production. Каждый релиз привязан к
        показанному SHA и не принимает ветку или произвольный SHA от клиента.
      </p>
    </section>
  );

  const renderPipeline = () => (
    <section className="pw-exec-panel pw-exec-pipeline" aria-label="Task states">
      <div className="pw-exec-panel-head">
        <div>
          <p className="pw-exec-kicker">5 · TASK STATES</p>
          <h2>Очередь, выполнение и релиз</h2>
        </div>
        <span className="pw-wb-meta">{allTasks.length} task(s)</span>
      </div>
      <div className="pw-exec-stage-strip">
        {(
          [
            'draft',
            'ready',
            'queued',
            'running',
            'blocked',
            'failed',
            'landed',
            'released',
          ] as TaskStageKey[]
        ).map((key) => (
          <span key={key} className={`pw-exec-state is-${key}`}>
            {STAGE_LABELS[key]} {stageCounts.get(key) || 0}
          </span>
        ))}
      </div>

      {attentionTasks.length === 0 ? (
        <p className="pw-wb-empty">Нет задач, требующих решения.</p>
      ) : (
        <ul className="pw-exec-attention">
          {attentionTasks.map((task) => (
            <li key={task.id}>
              <div>
                <StageChip task={task} productionSha={productionSha} landedShas={landedShas} />
                <button type="button" onClick={() => openTask(task)}>
                  {task.title}
                </button>
                <span className="pw-wb-meta">
                  {task.status === 'review'
                    ? 'Awaiting automatic integration'
                    : task.blockedReason || task.lastErrorMessage || task.status}
                </span>
              </div>
              <div className="pw-wb-actions">
                {['failed', 'rejected'].includes(task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button is-primary"
                    disabled={busy === `retry:${task.id}`}
                    onClick={() => void runAction('retry', { taskId: task.id })}
                  >
                    <RotateCcw size={14} /> Retry
                  </button>
                )}
                {task.status === 'blocked' && (
                  <button
                    type="button"
                    className="pw-wb-button is-primary"
                    disabled={busy === `queue:${task.id}`}
                    onClick={() => queueTask(task)}
                  >
                    <ArrowDown size={14} /> Queue
                  </button>
                )}
                {task.status === 'review' && (
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => void loadReview(task.id)}
                  >
                    <FileCheck2 size={14} /> CI evidence
                  </button>
                )}
                <button
                  type="button"
                  className="pw-wb-button is-quiet"
                  onClick={() => openTask(task)}
                >
                  Details
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderTaskDetail = () => {
    if (!selectedTask) {
      return <p className="pw-wb-empty">Выберите задание ниже, чтобы открыть детали и действия.</p>;
    }
    const batch = batchByTask.get(selectedTask.id);
    const dependsOn = batch?.dependsOnTaskId ? taskById.get(batch.dependsOnTaskId) : null;
    return (
      <div className="pw-exec-task-detail">
        <div className="pw-exec-task-head">
          <StageChip task={selectedTask} productionSha={productionSha} landedShas={landedShas} />
          <strong>{selectedTask.title}</strong>
          <StatusBadge status={selectedTask.status} />
        </div>
        <TaskMeta task={selectedTask} />
        {selectedTask.objective && <p className="pw-wb-card-body">{selectedTask.objective}</p>}
        <dl className="pw-wb-facts">
          <div>
            <dt>Repository / base</dt>
            <dd>
              {selectedTask.repository} · {selectedTask.baseRef}
            </dd>
          </div>
          <div>
            <dt>Queue position</dt>
            <dd>{selectedTask.queuePosition !== null ? selectedTask.queuePosition + 1 : '—'}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{selectedTask.priority}</dd>
          </div>
          <div>
            <dt>Result commit</dt>
            <dd>
              {selectedTask.resultCommit ? shortSha(selectedTask.resultCommit) : '—'}
              {selectedTask.resultCommit && productionSha ? (
                <span className="pw-wb-meta">
                  {' '}
                  ·{' '}
                  {taskStage(selectedTask, productionSha, landedShas).key === 'released'
                    ? 'released to production'
                    : 'in main, not in production yet'}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{selectedTask.verificationStatus || '—'}</dd>
          </div>
          <div>
            <dt>Batch</dt>
            <dd>
              {batch ? batch.batchTitle : '—'}
              {dependsOn ? ` · after ${dependsOn.title}` : ''}
            </dd>
          </div>
        </dl>
        <p className="pw-wb-meta">Cost estimate: {moneyRange(selectedTask.costEstimate)}</p>
        {selectedTask.acceptanceCriteria.length > 0 && (
          <ul className="pw-wb-criteria">
            {selectedTask.acceptanceCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        )}
        {selectedTask.pullRequests.length > 0 && (
          <p className="pw-wb-meta">
            PR:{' '}
            {selectedTask.pullRequests.map((url, index) => (
              <span key={url}>
                {index > 0 ? ' · ' : ''}
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              </span>
            ))}
          </p>
        )}
        {selectedTask.blockedReason && (
          <p className="pw-wb-warning">
            <ShieldAlert size={14} /> {selectedTask.blockedReason}
          </p>
        )}
        {selectedTask.lastErrorCode && (
          <p className="pw-wb-warning">
            <AlertTriangle size={14} /> {selectedTask.lastErrorCode}:{' '}
            {selectedTask.lastErrorMessage}
          </p>
        )}

        <div className="pw-wb-actions">
          {['draft', 'ready', 'blocked'].includes(selectedTask.status) && (
            <button
              type="button"
              className="pw-wb-button is-primary"
              disabled={
                busy === `queue:${selectedTask.id}` || busy === `enqueue:${selectedTask.id}`
              }
              onClick={() => queueTask(selectedTask)}
            >
              <ArrowDown size={14} /> Queue task
            </button>
          )}
          {['failed', 'rejected', 'cancelled'].includes(selectedTask.status) && (
            <button
              type="button"
              className="pw-wb-button is-primary"
              disabled={busy === `retry:${selectedTask.id}`}
              onClick={() => void runAction('retry', { taskId: selectedTask.id })}
            >
              <RotateCcw size={14} /> Retry
            </button>
          )}
          {['draft', 'blocked', 'ready'].includes(selectedTask.status) && (
            <button
              type="button"
              className="pw-wb-button is-quiet"
              onClick={() => startEdit(selectedTask)}
            >
              Edit
            </button>
          )}
          {['failed', 'rejected', 'cancelled', 'verified', 'archived'].includes(
            selectedTask.status
          ) && (
            <button
              type="button"
              className="pw-wb-button is-quiet"
              onClick={() => void runAction('archive', { taskId: selectedTask.id })}
            >
              <Archive size={14} /> Archive
            </button>
          )}
          {['draft', 'ready', 'queued'].includes(selectedTask.status) && (
            <button
              type="button"
              className="pw-wb-button is-quiet"
              onClick={() => {
                const reason = window.prompt('Причина блокировки', 'Ждёт уточнения');
                if (reason !== null) void runAction('block', { taskId: selectedTask.id, reason });
              }}
            >
              Block
            </button>
          )}
          {!['verified', 'archived'].includes(selectedTask.status) && (
            <button
              type="button"
              className="pw-wb-button is-danger"
              disabled={busy === `cancel:${selectedTask.id}`}
              onClick={() => void runAction('cancel', { taskId: selectedTask.id })}
            >
              <Trash2 size={14} /> Cancel
            </button>
          )}
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => void loadReview(selectedTask.id)}
          >
            <FileCheck2 size={14} /> CI evidence
          </button>
        </div>

        {editId === selectedTask.id && (
          <div className="pw-wb-form is-inline">
            <label>
              Название
              <input
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
              />
            </label>
            <label>
              Цель
              <textarea
                rows={3}
                value={editForm.objective}
                onChange={(event) => setEditForm({ ...editForm, objective: event.target.value })}
              />
            </label>
            <label>
              Acceptance criteria — по одному на строку
              <textarea
                rows={4}
                value={editForm.acceptanceCriteria}
                onChange={(event) =>
                  setEditForm({ ...editForm, acceptanceCriteria: event.target.value })
                }
              />
            </label>
            <label>
              Проверки — по одной на строку
              <textarea
                rows={2}
                value={editForm.tests}
                onChange={(event) => setEditForm({ ...editForm, tests: event.target.value })}
              />
            </label>
            <label>
              Security constraints — по одной на строку
              <textarea
                rows={2}
                value={editForm.securityConstraints}
                onChange={(event) =>
                  setEditForm({ ...editForm, securityConstraints: event.target.value })
                }
              />
            </label>
            <label>
              Затрагиваемые файлы — по одному на строку
              <textarea
                rows={2}
                value={editForm.affectedFiles}
                onChange={(event) =>
                  setEditForm({ ...editForm, affectedFiles: event.target.value })
                }
              />
            </label>
            <div className="pw-wb-form-actions">
              <button
                type="button"
                className="pw-wb-button is-primary"
                disabled={busy === `edit:${selectedTask.id}`}
                onClick={() => void saveEdit(selectedTask.id)}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => setEditId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTasksSection = () => (
    <div className="pw-exec-details-section">
      <div className="pw-wb-actions">
        <button
          type="button"
          className="pw-wb-button is-primary"
          onClick={() => {
            setHandoffContext(null);
            setForm(EMPTY_FORM);
            setCreateOpen((value) => !value);
          }}
        >
          <Plus size={14} /> {createOpen ? 'Hide new task' : 'New task'}
        </button>
        <span className="pw-wb-meta">
          {allTasks.length} task(s) · one canonical lifecycle · merge ≠ deploy
        </span>
      </div>

      {createOpen && (
        <div className="pw-wb-form">
          <label>
            Название
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Короткое имя задания"
            />
          </label>
          <label>
            Цель
            <textarea
              rows={3}
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
              placeholder="Что должно измениться и зачем"
            />
          </label>
          <div className="pw-wb-form-row">
            <label>
              Репозиторий
              <select
                value={form.repository}
                onChange={(event) => setForm({ ...form, repository: event.target.value })}
              >
                <option value="newlove">merkurov1/newlove</option>
                <option value="pierrot">merkurov1/Pierrot</option>
              </select>
            </label>
            <label>
              Base ref
              <input
                value={form.baseRef}
                onChange={(event) => setForm({ ...form, baseRef: event.target.value })}
              />
            </label>
          </div>
          <label>
            Контекст
            <textarea
              rows={3}
              value={form.context}
              onChange={(event) => setForm({ ...form, context: event.target.value })}
              placeholder="Ссылки, диагностика, ограничения"
            />
          </label>
          <label>
            Acceptance criteria — по одному на строку
            <textarea
              rows={4}
              value={form.acceptanceCriteria}
              onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })}
            />
          </label>
          <label>
            Проверки — по одной на строку
            <textarea
              rows={3}
              value={form.tests}
              onChange={(event) => setForm({ ...form, tests: event.target.value })}
              placeholder={'pnpm typecheck\npnpm test --runInBand'}
            />
          </label>
          <label>
            Security constraints — по одной строке
            <textarea
              rows={2}
              value={form.securityConstraints}
              onChange={(event) => setForm({ ...form, securityConstraints: event.target.value })}
              placeholder="Не трогать .env и production credentials"
            />
          </label>
          <label>
            Затрагиваемые файлы / области — по одной строке
            <textarea
              rows={2}
              value={form.affectedFiles}
              onChange={(event) => setForm({ ...form, affectedFiles: event.target.value })}
            />
          </label>
          <div className="pw-wb-form-actions">
            <button
              type="button"
              className="pw-wb-button is-primary"
              disabled={busy === 'create' || (!form.title && !form.objective)}
              onClick={() => void createTask()}
            >
              <Send size={14} /> {busy === 'create' ? 'Создаю…' : 'Создать черновик'}
            </button>
          </div>
        </div>
      )}

      <ul className="pw-exec-task-list">
        {allTasks.length === 0 ? (
          <li className="pw-wb-empty">Заданий пока нет.</li>
        ) : (
          allTasks.map((task) => (
            <li key={task.id} className={selectedTaskId === task.id ? 'is-active' : ''}>
              <button type="button" className="pw-exec-task-row" onClick={() => openTask(task)}>
                <StageChip task={task} productionSha={productionSha} landedShas={landedShas} />
                <span className="pw-exec-task-row-title">{task.title}</span>
                <span className="pw-wb-meta">
                  {task.repository} · {task.status} · {formatDate(task.updatedAt)}
                </span>
              </button>
              {['draft', 'ready', 'blocked'].includes(task.status) && (
                <button
                  type="button"
                  className={`pw-wb-icon-button ${batchSelection.includes(task.id) ? 'is-selected' : ''}`}
                  aria-label={
                    batchSelection.includes(task.id) ? 'Убрать из batch' : 'Выбрать для batch'
                  }
                  onClick={() =>
                    setBatchSelection((current) =>
                      current.includes(task.id)
                        ? current.filter((id) => id !== task.id)
                        : [...current, task.id]
                    )
                  }
                >
                  <Circle size={12} />
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      {batchSelection.length > 0 && (
        <div className="pw-wb-batch-create">
          <span>{batchSelection.length} заданий выбрано</span>
          <button
            type="button"
            className="pw-wb-button"
            onClick={() => {
              const title = window.prompt('Название batch', 'Пакет заданий');
              if (!title) return;
              void runAction('create_batch', { title, taskIds: batchSelection }).then(() => {
                setBatchSelection([]);
              });
            }}
          >
            Создать batch
          </button>
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => setBatchSelection([])}
          >
            Сбросить
          </button>
        </div>
      )}

      {renderTaskDetail()}
    </div>
  );

  const renderBatchesSection = () => (
    <div className="pw-exec-details-section">
      {overview.batches.length === 0 ? (
        <p className="pw-wb-empty">Пакетов пока нет. Выберите задания в Tasks и создайте batch.</p>
      ) : (
        <ul className="pw-wb-list">
          {overview.batches.map((batch) => (
            <li key={batch.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <StatusBadge status={batch.status} />
                  <strong>{batch.title}</strong>
                </div>
                <span className="pw-wb-meta">{batch.items.length} заданий</span>
              </div>
              <ol className="pw-wb-criteria">
                {batch.items.map((item) => (
                  <li key={item.id} className="pw-wb-batch-item">
                    <span>
                      {item.position + 1}. {item.title} · {item.status}
                    </span>
                    <span className="pw-wb-actions">
                      <button
                        type="button"
                        className="pw-wb-icon-button"
                        aria-label="Выше"
                        disabled={item.position === 0}
                        onClick={() =>
                          void runAction('reorder_batch', {
                            batchId: batch.id,
                            taskId: item.taskId,
                            position: item.position - 1,
                          })
                        }
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        className="pw-wb-icon-button"
                        aria-label="Ниже"
                        disabled={item.position >= batch.items.length - 1}
                        onClick={() =>
                          void runAction('reorder_batch', {
                            batchId: batch.id,
                            taskId: item.taskId,
                            position: item.position + 1,
                          })
                        }
                      >
                        <ArrowDown size={12} />
                      </button>
                    </span>
                    <label className="pw-wb-batch-dep">
                      depends on
                      <select
                        value={item.dependsOnTaskId || ''}
                        onChange={(event) =>
                          void runAction('set_batch_dependency', {
                            batchId: batch.id,
                            taskId: item.taskId,
                            dependsOnTaskId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">none</option>
                        {batch.items
                          .filter((candidate) => candidate.taskId !== item.taskId)
                          .map((candidate) => (
                            <option key={candidate.taskId} value={candidate.taskId}>
                              {candidate.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ol>
              <div className="pw-wb-actions">
                {(batch.status === 'draft' || batch.status === 'paused') && (
                  <button
                    type="button"
                    className="pw-wb-button is-primary"
                    onClick={() => void runAction('start_batch', { batchId: batch.id })}
                  >
                    Start batch
                  </button>
                )}
                {batch.status === 'active' && (
                  <button
                    type="button"
                    className="pw-wb-button"
                    onClick={() =>
                      void runAction('update_batch', { batchId: batch.id, status: 'paused' })
                    }
                  >
                    Pause
                  </button>
                )}
                {(['completed', 'archived'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => void runAction('update_batch', { batchId: batch.id, status })}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderHistorySection = () => (
    <div className="pw-exec-details-section">
      {overview.history.length === 0 ? (
        <p className="pw-wb-empty">Истории пока нет.</p>
      ) : (
        <ul className="pw-wb-list">
          {overview.history.map((entry) => (
            <li key={entry.task.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <StageChip
                    task={entry.task}
                    productionSha={productionSha}
                    landedShas={landedShas}
                  />
                  <strong>{entry.task.title}</strong>
                </div>
                <TaskMeta task={entry.task} />
              </div>
              {entry.task.lastErrorCode && (
                <p className="pw-wb-warning">
                  <AlertTriangle size={14} /> {entry.task.lastErrorCode}:{' '}
                  {entry.task.lastErrorMessage}
                </p>
              )}
              {entry.attempts.map((attempt) => renderAttempt(attempt))}
              {entry.attempts.length === 0 && (
                <p className="pw-wb-empty">Попыток нет — задание было отменено до исполнения.</p>
              )}
              <div className="pw-wb-actions">
                {['failed', 'rejected', 'cancelled'].includes(entry.task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button is-primary"
                    onClick={() => void runAction('retry', { taskId: entry.task.id })}
                  >
                    <RotateCcw size={14} /> Retry as new attempt
                  </button>
                )}
                {['verified', 'rejected', 'failed', 'cancelled'].includes(entry.task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => void runAction('archive', { taskId: entry.task.id })}
                  >
                    <Archive size={14} /> Archive
                  </button>
                )}
                {entry.task.verificationStatus && (
                  <span className="pw-wb-meta">verification: {entry.task.verificationStatus}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderLedgerSection = () => (
    <div className="pw-exec-details-section">
      <div className="pw-wb-actions">
        {[7, 30, 90, 365].map((days) => (
          <button
            key={days}
            type="button"
            className={`pw-wb-button ${ledgerDays === days ? 'is-primary' : 'is-quiet'}`}
            onClick={() => {
              setLedgerDays(days);
              void loadLedger(days);
            }}
          >
            {days}d
          </button>
        ))}
        <button
          type="button"
          className="pw-wb-button"
          disabled={ledgerLoading}
          onClick={() => void loadLedger()}
        >
          <RefreshCw size={14} /> {ledgerLoading ? 'Считаю…' : 'Refresh'}
        </button>
      </div>

      {!ledger && <p className="pw-wb-empty">Загружаю сметы и фактические затраты…</p>}
      {ledger && (
        <>
          <div className="pw-wb-card">
            <div className="pw-wb-card-head">
              <div className="pw-wb-card-title">
                <strong>Всего и за период {ledger.periodDays} дней</strong>
              </div>
              <span className="pw-wb-meta">
                generated {new Date(ledger.generatedAt).toLocaleString('ru-RU')}
              </span>
            </div>
            <h3 className="pw-wb-subtitle">All time</h3>
            <CostAggregateFacts aggregate={ledger.totals} />
            <h3 className="pw-wb-subtitle">
              Period since {new Date(ledger.periodFrom).toLocaleDateString('ru-RU')}
            </h3>
            <CostAggregateFacts aggregate={ledger.period} />
          </div>

          <div className="pw-wb-card">
            <div className="pw-wb-card-head">
              <div className="pw-wb-card-title">
                <strong>Тарифы и подтверждённые данные</strong>
              </div>
              <span className="pw-wb-meta">
                estimates table {ledger.estimatesTableReady ? 'ready' : 'not applied'}
              </span>
            </div>
            <dl className="pw-wb-facts">
              <div>
                <dt>Model tariff</dt>
                <dd>
                  {ledger.pricing.model.version} · {ledger.pricing.model.currency} · effective{' '}
                  {new Date(ledger.pricing.model.effectiveAt).toLocaleDateString('ru-RU')} ·{' '}
                  <a href={ledger.pricing.model.source} target="_blank" rel="noreferrer">
                    source
                  </a>
                </dd>
              </div>
              <div>
                <dt>Codespaces tariff</dt>
                <dd>
                  {ledger.pricing.codespaces.version} · {ledger.pricing.codespaces.currency} ·
                  effective{' '}
                  {new Date(ledger.pricing.codespaces.effectiveAt).toLocaleDateString('ru-RU')} ·{' '}
                  <a href={ledger.pricing.codespaces.source} target="_blank" rel="noreferrer">
                    source
                  </a>
                </dd>
              </div>
              <div>
                <dt>GitHub billing API</dt>
                <dd>
                  {ledger.confirmedBilling.status} · checked{' '}
                  {new Date(ledger.confirmedBilling.checkedAt).toLocaleTimeString('ru-RU')}
                  {ledger.confirmedBilling.reason ? ` · ${ledger.confirmedBilling.reason}` : ''}
                </dd>
              </div>
              <div>
                <dt>Confirmed account minutes</dt>
                <dd>
                  used {ledger.confirmedBilling.totalMinutesUsed ?? '—'} · paid{' '}
                  {ledger.confirmedBilling.totalPaidMinutesUsed ?? '—'} · included{' '}
                  {ledger.confirmedBilling.includedMinutes ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Codespace sessions (period)</dt>
                <dd>
                  est. {money(ledger.codespaces.periodSessionEstimatedUsd)} · idle est.{' '}
                  {money(ledger.codespaces.periodIdleEstimatedUsd)}
                </dd>
              </div>
            </dl>
            <p className="pw-wb-meta">{ledger.codespaces.note}</p>
            {ledger.dataQuality.unknown.length > 0 && (
              <p className="pw-wb-warning">
                <AlertTriangle size={14} /> Partial data: {ledger.dataQuality.unknown.join(' · ')}
              </p>
            )}
          </div>

          <h3 className="pw-wb-subtitle">Batches</h3>
          {ledger.batches.length === 0 ? (
            <p className="pw-wb-empty">Пакетов нет.</p>
          ) : (
            <ul className="pw-wb-list">
              {ledger.batches.map((batch) => (
                <li key={batch.batchId} className="pw-wb-card">
                  <div className="pw-wb-card-head">
                    <div className="pw-wb-card-title">
                      <StatusBadge status={batch.status} />
                      <strong>{batch.title}</strong>
                    </div>
                    <span className="pw-wb-meta">{batch.taskCount} заданий</span>
                  </div>
                  <CostAggregateFacts aggregate={batch} />
                </li>
              ))}
            </ul>
          )}

          <h3 className="pw-wb-subtitle">Tasks</h3>
          {ledger.tasks.length === 0 ? (
            <p className="pw-wb-empty">Заданий пока нет.</p>
          ) : (
            <ul className="pw-wb-list">
              {ledger.tasks.map((task) => (
                <li key={task.taskId} className="pw-wb-card">
                  <div className="pw-wb-card-head">
                    <div className="pw-wb-card-title">
                      <StatusBadge status={task.status} />
                      <strong>{task.title}</strong>
                    </div>
                    <span className="pw-wb-meta">
                      {task.actual.attempts.total} attempt(s) · {task.actual.attempts.retries}{' '}
                      retry(ies)
                      {task.costEstimate?.persisted === false ? ' · estimate preview' : ''}
                    </span>
                  </div>
                  <CostAggregateFacts aggregate={task} />
                  {task.costEstimate ? (
                    <details className="pw-wb-log">
                      <summary>Estimate assumptions and tariff source</summary>
                      <p className="pw-wb-meta">
                        {task.costEstimate.confidence} confidence ·{' '}
                        {task.costEstimate.pricingVersion}
                      </p>
                      <ul className="pw-wb-criteria">
                        {task.costEstimate.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );

  const renderEvidenceSection = () => (
    <div className="pw-exec-details-section">
      <div className="pw-wb-actions">
        <span className="pw-wb-meta">
          Read-only verification. Owner accept/reject is removed; finalization integrates verified
          work automatically.
        </span>
        {reviewTaskId && (
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => void loadReview(reviewTaskId)}
          >
            <RefreshCw size={13} /> Re-check CI
          </button>
        )}
      </div>
      {reviewLoading && <p className="pw-wb-empty">Загружаю diff и checks…</p>}
      {!reviewLoading && !reviewTaskId && (
        <p className="pw-wb-empty">
          Выберите задание и нажмите “CI evidence”, чтобы открыть отчёт.
        </p>
      )}
      {!reviewLoading && reviewTaskId && !review && (
        <p className="pw-wb-empty">Для этого задания отчёт ещё не загружен.</p>
      )}
      {review && (
        <>
          <div className="pw-wb-review-head">
            <StatusBadge status={review.task.status} />
            <strong>{review.task.title}</strong>
            <span className="pw-wb-meta">
              verdict: {review.verdict || '—'} · attempt {review.attempt?.attemptNumber ?? '—'}
            </span>
          </div>
          {review.attempt?.prUrl && (
            <p className="pw-wb-meta">
              PR:{' '}
              <a href={review.attempt.prUrl} target="_blank" rel="noreferrer">
                {review.attempt.prUrl}
              </a>
            </p>
          )}
          <p className="pw-wb-card-body">{review.summary}</p>

          <h3 className="pw-wb-subtitle">Acceptance criteria</h3>
          <ul className="pw-wb-criteria">
            {review.criteria.map((criterion) => (
              <li key={criterion.criterion} className={`is-${criterion.status}`}>
                <strong>{criterion.status}</strong> <em>({criterion.source})</em>{' '}
                {criterion.criterion} — {criterion.evidence}
              </li>
            ))}
          </ul>

          <h3 className="pw-wb-subtitle">Changed files ({review.changedFiles.length})</h3>
          <ul className="pw-wb-files">
            {review.changedFiles.map((file) => (
              <li key={file.filename}>
                <details>
                  <summary>
                    <span>{file.filename}</span>
                    <small>
                      {file.status} +{file.additions}/−{file.deletions}
                    </small>
                  </summary>
                  {file.patch ? (
                    <pre>{file.patch}</pre>
                  ) : (
                    <p className="pw-wb-empty">Patch недоступен (слишком большой).</p>
                  )}
                </details>
              </li>
            ))}
            {review.changedFiles.length === 0 && <li className="pw-wb-empty">Diff не найден.</li>}
          </ul>

          <h3 className="pw-wb-subtitle">Checks</h3>
          <ul className="pw-wb-criteria">
            {review.checks.map((check, index) => (
              <li key={`${check.name}-${index}`}>
                <strong>{check.conclusion || check.status || 'unknown'}</strong> {check.name}
                {check.url ? (
                  <>
                    {' '}
                    <a href={check.url} target="_blank" rel="noreferrer">
                      log
                    </a>
                  </>
                ) : null}
              </li>
            ))}
            {review.checks.length === 0 && (
              <li className="pw-wb-warning">CI checks для head commit не найдены.</li>
            )}
          </ul>

          {review.findings.length > 0 && (
            <>
              <h3 className="pw-wb-subtitle">Findings</h3>
              <ul className="pw-wb-criteria">
                {review.findings.map((finding, index) => (
                  <li key={`${finding.file || 'general'}-${index}`} className="is-failed">
                    <strong>{finding.severity}</strong> {finding.file || 'general'} —{' '}
                    {finding.problem}
                  </li>
                ))}
              </ul>
            </>
          )}

          <details className="pw-wb-log">
            <summary>Ограничения проверки</summary>
            <ul className="pw-wb-criteria">
              {review.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );

  const renderDetailsDrawer = () => (
    <aside
      className="pw-exec-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Execution details"
    >
      <header className="pw-exec-drawer-head">
        <div>
          <p className="pw-exec-kicker">DETAILS</p>
          <h2>Tasks, batches, history, costs, evidence</h2>
        </div>
        <button
          type="button"
          className="pw-wb-icon-button"
          aria-label="Close details"
          onClick={() => setDrawer(null)}
        >
          <X size={16} />
        </button>
      </header>
      <nav className="pw-exec-drawer-tabs" aria-label="Details sections">
        {(
          [
            ['tasks', 'Tasks'],
            ['batches', 'Batches'],
            ['history', 'History'],
            ['ledger', 'Cost ledger'],
            ['evidence', 'CI evidence'],
          ] as Array<[DetailsSection, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={detailsSection === key ? 'is-active' : ''}
            onClick={() => {
              setDetailsSection(key);
              if (key === 'ledger') void loadLedger(ledgerDays);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="pw-exec-drawer-body">
        {detailsSection === 'tasks' && renderTasksSection()}
        {detailsSection === 'batches' && renderBatchesSection()}
        {detailsSection === 'history' && renderHistorySection()}
        {detailsSection === 'ledger' && renderLedgerSection()}
        {detailsSection === 'evidence' && renderEvidenceSection()}
      </div>
    </aside>
  );

  const renderDiagnosticsDrawer = () => {
    const lifecycle = overview.lifecycle;
    return (
      <aside
        className="pw-exec-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Execution diagnostics"
      >
        <header className="pw-exec-drawer-head">
          <div>
            <p className="pw-exec-kicker">DIAGNOSTICS</p>
            <h2>Worker, lifecycle, setup, events</h2>
          </div>
          <button
            type="button"
            className="pw-wb-icon-button"
            aria-label="Close diagnostics"
            onClick={() => setDrawer(null)}
          >
            <X size={16} />
          </button>
        </header>
        <div className="pw-exec-drawer-body">
          <section className="pw-exec-details-section">
            <div className="pw-wb-actions">
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => void runAction('start_codespace')}
                disabled={
                  busy === 'start_codespace' ||
                  ['starting_codespace', 'starting_worker', 'stopping_codespace'].includes(
                    lifecycle.status
                  )
                }
              >
                Start now (automatic)
              </button>
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => void runAction('reap')}
              >
                Проверить leases
              </button>
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => void runAction('stop_codespace')}
              >
                Stop Codespace
              </button>
            </div>
            <div className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <span className={`pw-wb-dot is-${lifecycleTone(lifecycle.status)}`} />
                  <strong>{lifecycle.label}</strong>
                </div>
                <span className="pw-wb-meta">
                  updated {new Date(lifecycle.updatedAt).toLocaleTimeString('ru-RU')}
                </span>
              </div>
              <p className="pw-wb-card-body">{lifecycle.detail}</p>
              {lifecycle.worker?.readiness?.reasons?.length ? (
                <p className="pw-wb-warning">
                  <ShieldAlert size={14} /> {lifecycle.worker.readiness.reasons.join(' · ')}
                </p>
              ) : null}
              <dl className="pw-wb-facts">
                <div>
                  <dt>Codespace</dt>
                  <dd>
                    {lifecycle.codespace
                      ? `${lifecycle.codespace.name} · ${lifecycle.codespace.state || 'unknown'}${
                          lifecycle.codespace.idleTimeoutMinutes
                            ? ` · idle ${lifecycle.codespace.idleTimeoutMinutes}m`
                            : ''
                        }`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Worker</dt>
                  <dd>
                    {lifecycle.worker
                      ? `${lifecycle.worker.online ? 'online' : 'offline'} · ${
                          lifecycle.worker.ready ? 'ready' : 'not ready'
                        } · heartbeat ${lifecycle.worker.heartbeatAgeSeconds ?? '—'}s`
                      : 'not registered'}
                  </dd>
                </div>
                <div>
                  <dt>Versions</dt>
                  <dd>
                    worker {lifecycle.worker?.version || '—'} · OpenCode{' '}
                    {lifecycle.worker?.opencodeVersion || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Readiness</dt>
                  <dd>
                    API {lifecycle.worker?.readiness?.apiOk ? 'ok' : 'not ready'} · Supabase{' '}
                    {lifecycle.worker?.readiness?.supabaseOk ? 'ok' : 'not ready'} · provider auth{' '}
                    {lifecycle.worker?.readiness?.authOk ? 'ok' : 'missing'} · checked{' '}
                    {lifecycle.worker?.readinessAgeSeconds ?? '—'}s ago
                    {lifecycle.worker?.readinessFresh === false ? ' · STALE' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Queue</dt>
                  <dd>
                    {lifecycle.queue.queued} queued · {lifecycle.queue.active} active
                    {lifecycle.queue.paused ? ' · paused' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Pending start</dt>
                  <dd>
                    {lifecycle.pendingStartInfo
                      ? `${lifecycle.pendingStartInfo.phase} · attempts ${lifecycle.pendingStartInfo.attempts}/${lifecycle.pendingStartInfo.maxAttempts} · age ${lifecycle.pendingStartInfo.ageSeconds ?? '—'}s · observed ${
                          lifecycle.pendingStartInfo.lastObservedState || 'unknown'
                        }`
                      : 'no'}
                  </dd>
                </div>
                <div>
                  <dt>Recovery</dt>
                  <dd>
                    {lifecycle.recovery
                      ? `failures ${lifecycle.recovery.failures}${
                          lifecycle.recovery.blocked ? ' · blocked' : ''
                        }${lifecycle.recovery.lastReason ? ` · ${lifecycle.recovery.lastReason}` : ''}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Idle / grace</dt>
                  <dd>
                    {lifecycle.idleSeconds !== null
                      ? `${lifecycle.idleSeconds}s / ${lifecycle.idleGraceSeconds}s`
                      : `— / ${lifecycle.idleGraceSeconds}s`}
                  </dd>
                </div>
                <div>
                  <dt>Keepalive</dt>
                  <dd>
                    {lifecycle.lastKeepaliveAt ? `${age(lifecycle.lastKeepaliveAt)} ago` : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Last shutdown</dt>
                  <dd>{lifecycle.lastStopAt ? `${age(lifecycle.lastStopAt)} ago` : '—'}</dd>
                </div>
                <div>
                  <dt>Model cost</dt>
                  <dd>{money(lifecycle.cost.modelUsd)}</dd>
                </div>
                <div>
                  <dt>Codespaces cost</dt>
                  <dd>est. {money(lifecycle.cost.codespaceEstimatedUsd)}</dd>
                </div>
                <div>
                  <dt>Tokens in / out</dt>
                  <dd>
                    {lifecycle.cost.inputTokens ?? '—'} / {lifecycle.cost.outputTokens ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="pw-exec-details-section">
            <h3 className="pw-wb-subtitle">Workers</h3>
            <div className="pw-wb-status-strip">
              <span className="pw-wb-chip is-ok">active {workerHealth.active}</span>
              <span className="pw-wb-chip is-warn">stale {workerHealth.stale}</span>
              <span className="pw-wb-chip is-quiet">
                historical {workerHealth.historical} · finished {workerHealth.finished}
              </span>
              <span
                className={`pw-wb-chip ${
                  workerHealth.orphan || workerHealth.pointerMismatch ? 'is-error' : 'is-quiet'
                }`}
              >
                orphan {workerHealth.orphan} · pointer mismatch {workerHealth.pointerMismatch}
              </span>
            </div>
            {workerHealth.issues.length > 0 && (
              <p className="pw-wb-warning">
                <AlertTriangle size={14} />{' '}
                {workerHealth.issues
                  .slice(0, 3)
                  .map((issue) => `${issue.workerId}: ${issue.message}`)
                  .join(' · ')}
              </p>
            )}
            {overview.workers.length === 0 ? (
              <p className="pw-wb-empty">Worker ещё не регистрировался.</p>
            ) : (
              <ul className="pw-wb-list">
                {overview.workers.map((item) => (
                  <li key={item.id} className="pw-wb-card">
                    <div className="pw-wb-card-head">
                      <div className="pw-wb-card-title">
                        <StatusBadge
                          status={
                            item.online
                              ? 'online'
                              : item.stale
                                ? 'stale'
                                : item.finished
                                  ? 'finished'
                                  : 'offline'
                          }
                        />
                        <strong>{item.name}</strong>
                      </div>
                      <span className="pw-wb-meta">
                        heartbeat {item.heartbeatAgeSeconds ?? '—'}s · OpenCode{' '}
                        {String(item.capabilities.opencodeVersion || 'unknown')}
                      </span>
                    </div>
                    <dl className="pw-wb-facts">
                      <div>
                        <dt>Codespace</dt>
                        <dd>{item.codespaceName || '—'}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{item.version || '—'}</dd>
                      </div>
                      <div>
                        <dt>OpenCode auth</dt>
                        <dd>{item.capabilities.opencodeAuthenticated ? 'available' : 'missing'}</dd>
                      </div>
                      <div>
                        <dt>Current attempt</dt>
                        <dd>{item.currentAttemptId ? shortSha(item.currentAttemptId) : 'none'}</dd>
                      </div>
                    </dl>
                    <div className="pw-wb-actions">
                      <button
                        type="button"
                        className="pw-wb-button is-danger"
                        onClick={() => void runAction('stop_worker', { workerId: item.id })}
                      >
                        Stop worker
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pw-exec-details-section">
            <h3 className="pw-wb-subtitle">Finalization</h3>
            {overview.finalization ? (
              <div className="pw-wb-card">
                <div className="pw-wb-card-head">
                  <div className="pw-wb-card-title">
                    <StatusBadge status={overview.finalization.stage} />
                    <strong>Queue finalization</strong>
                  </div>
                  <span className="pw-wb-meta">
                    {overview.finalization.integrated}/{overview.finalization.pullRequests} PR ·{' '}
                    {overview.finalization.durationMs !== null
                      ? duration(overview.finalization.startedAt, overview.finalization.completedAt)
                      : 'in progress'}
                  </span>
                </div>
                <dl className="pw-wb-facts">
                  <div>
                    <dt>CI</dt>
                    <dd>{overview.finalization.ciStatus}</dd>
                  </div>
                  <div>
                    <dt>Commit</dt>
                    <dd>
                      {overview.finalization.commitUrl ? (
                        <a href={overview.finalization.commitUrl} target="_blank" rel="noreferrer">
                          {shortSha(overview.finalization.commitSha)}
                        </a>
                      ) : (
                        'not recorded yet'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{money(overview.finalization.cost?.totalUsd ?? null)}</dd>
                  </div>
                </dl>
                {overview.finalization.blockedReason && (
                  <p className="pw-wb-warning">{overview.finalization.blockedReason}</p>
                )}
                <div className="pw-wb-actions">
                  <button
                    type="button"
                    className="pw-wb-button"
                    disabled={busy === 'finalize_queue'}
                    onClick={() => void runAction('finalize_queue')}
                  >
                    Finalize now
                  </button>
                  {['blocked', 'failed'].includes(overview.finalization.stage) && (
                    <button
                      type="button"
                      className="pw-wb-button is-quiet"
                      disabled={busy === 'finalize_queue'}
                      onClick={() => void runAction('finalize_queue', { retry: true })}
                    >
                      Retry finalization
                    </button>
                  )}
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    disabled={busy === 'reconcile_legacy'}
                    onClick={() => void runAction('reconcile_legacy', { confirm: true })}
                  >
                    Reconcile legacy review rows
                  </button>
                </div>
              </div>
            ) : (
              <div className="pw-wb-card">
                <p className="pw-wb-card-body">
                  Finalization has not run yet. It starts automatically whenever execution is idle,
                  even while dependent tasks wait in the queue. It never waits for the owner to
                  approve an individual task.
                </p>
                <button
                  type="button"
                  className="pw-wb-button is-quiet"
                  disabled={busy === 'finalize_queue'}
                  onClick={() => void runAction('finalize_queue')}
                >
                  Check queue and finalize
                </button>
              </div>
            )}
          </section>

          <section className="pw-exec-details-section">
            <div className="pw-wb-actions">
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => void runAction('list_codespaces')}
              >
                Find Codespaces
              </button>
              <button
                type="button"
                className="pw-wb-button is-quiet"
                onClick={() => void runAction('generate_worker_token')}
              >
                Generate worker token
              </button>
              <button
                type="button"
                className="pw-wb-button"
                disabled={busy === 'setup'}
                onClick={() => void loadSetup()}
              >
                <RefreshCw size={14} /> {busy === 'setup' ? 'Проверяю…' : 'Re-check setup'}
              </button>
            </div>
            {codespaceList.length > 0 && (
              <div className="pw-wb-card">
                <p className="pw-wb-meta">
                  Codespaces для этого аккаунта. Скопируйте имя в Vercel как{' '}
                  <code>PIERROT_DEV_CODESPACE_NAME</code>.
                </p>
                <ul className="pw-wb-criteria">
                  {codespaceList.map((codespace) => (
                    <li key={codespace.name}>
                      <code>{codespace.name}</code> · {codespace.state}
                      {codespace.repository ? ` · ${codespace.repository}` : ''}
                      {codespace.machine ? ` · ${codespace.machine}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {setupToken && (
              <div className="pw-wb-banner is-warn" role="status">
                <div>
                  <strong>Одноразовый worker token</strong>
                  <p className="pw-wb-meta">
                    Показывается один раз и не сохраняется. Добавьте его в Vercel как{' '}
                    <code>PIERROT_DEV_WORKER_TOKEN</code> и в Codespaces secrets, затем выполните
                    redeploy и Re-check.
                  </p>
                  <pre className="pw-wb-token">{setupToken}</pre>
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => {
                      void navigator.clipboard?.writeText(setupToken);
                      setSetupToken(null);
                    }}
                  >
                    Copy and hide
                  </button>
                </div>
              </div>
            )}
            {!setup && <p className="pw-wb-empty">Проверки ещё не запускались.</p>}
            {setup && (
              <>
                <div className={`pw-wb-ready ${setup.ready ? 'is-ok' : 'is-error'}`}>
                  <strong>
                    {setup.ready ? 'Все обязательные интеграции доступны' : 'Система не готова'}
                  </strong>
                  {!setup.ready && (
                    <ul>
                      {setup.blocking.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <ul className="pw-wb-list">
                  {setup.checks.map((check) => (
                    <li key={check.key} className="pw-wb-card">
                      <div className="pw-wb-card-head">
                        <div className="pw-wb-card-title">
                          <span className={`pw-wb-dot is-${check.status}`} />
                          <strong>{check.label}</strong>
                        </div>
                        <span className="pw-wb-meta">
                          checked {new Date(check.checkedAt).toLocaleTimeString('ru-RU')}
                          {check.lastSuccessAt
                            ? ` · last ok ${new Date(check.lastSuccessAt).toLocaleString('ru-RU')}`
                            : ' · never ok'}
                        </span>
                      </div>
                      <p className="pw-wb-card-body">{check.detail}</p>
                      {(check.requiredEnv || check.requiredScope) && (
                        <p className="pw-wb-meta">
                          {check.requiredEnv ? <code>{check.requiredEnv}</code> : null}
                          {check.requiredScope ? ` · ${check.requiredScope}` : ''}
                        </p>
                      )}
                      {check.action && (
                        <div className="pw-wb-actions">
                          {check.action === 'start_codespace' && (
                            <button
                              type="button"
                              className="pw-wb-button"
                              onClick={() => void runAction('start_codespace')}
                            >
                              Start Codespace
                            </button>
                          )}
                          {check.action === 'create_codespace' && (
                            <button
                              type="button"
                              className="pw-wb-button"
                              onClick={() => void runAction('create_codespace')}
                            >
                              Create Codespace
                            </button>
                          )}
                          {check.action === 'apply_migration' && (
                            <span className="pw-wb-meta">
                              Apply <code>migrations/{overview.migrationFile}</code> manually. It is
                              never applied automatically.
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="pw-exec-details-section">
            <h3 className="pw-wb-subtitle">Recent events</h3>
            <div className="pw-wb-events">
              {overview.recentEvents.map((event) => (
                <div key={event.id} className={`pw-wb-event is-${event.level}`}>
                  <time>{new Date(event.createdAt).toLocaleTimeString('ru-RU')}</time>
                  <span>
                    {event.type} — {event.message}
                  </span>
                </div>
              ))}
              {overview.recentEvents.length === 0 && (
                <p className="pw-wb-empty">Событий пока нет.</p>
              )}
            </div>
          </section>
        </div>
      </aside>
    );
  };

  return (
    <div className="pw-wb pw-exec">
      <header className="pw-wb-head pw-exec-head">
        <div>
          <p className="pw-wb-kicker">PIERROT · EXECUTION</p>
          <h1>Execution</h1>
          <p className="pw-wb-meta">
            Running now · next · landed in main · release readiness. Details and diagnostics are
            secondary.
          </p>
        </div>
        <div className="pw-wb-head-actions">
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => void refreshAll()}
            disabled={busy !== null}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="pw-wb-button" onClick={() => openDetails('tasks')}>
            <LayoutList size={14} /> Details
          </button>
          <button type="button" className="pw-wb-button" onClick={() => setDrawer('diagnostics')}>
            <Settings2 size={14} /> Diagnostics
          </button>
          <button type="button" className="pw-wb-button is-quiet" onClick={onOpenChat}>
            <Terminal size={14} /> Dev chat
          </button>
        </div>
      </header>

      <div className="pw-wb-status-strip">
        <span className={`pw-wb-chip ${overview.schemaReady ? 'is-ok' : 'is-error'}`}>
          schema {overview.schemaReady ? 'ready' : 'missing'}
        </span>
        <span className={`pw-wb-chip ${overview.queuePaused ? 'is-warn' : 'is-ok'}`}>
          queue {overview.queuePaused ? 'paused' : 'running'}
        </span>
        <span className={`pw-wb-chip is-${lifecycleTone(overview.lifecycle.status)}`}>
          {overview.lifecycle.label}
        </span>
        <span className={`pw-wb-chip ${worker?.online ? 'is-ok' : 'is-error'}`}>
          worker {worker?.online ? 'online' : 'offline'}
        </span>
        <span className={`pw-wb-chip ${active ? 'is-busy' : 'is-idle'}`}>
          {active
            ? `running ${active.attempt.progressStage || active.attempt.status}`
            : 'executor idle'}
        </span>
        <span className="pw-wb-chip is-quiet">
          landed {stageCounts.get('landed') || 0} · released {stageCounts.get('released') || 0}
        </span>
        <span className="pw-wb-chip is-quiet">
          updated {new Date(overview.updatedAt).toLocaleTimeString('ru-RU')}
        </span>
      </div>

      {!overview.schemaReady && (
        <div className="pw-wb-banner" role="alert">
          Нужна additive migration <code>{overview.migrationFile}</code>. Очередь, попытки и журнал
          событий недоступны до её применения. Миграция не применяется автоматически.
        </div>
      )}

      {error && (
        <div className="pw-wb-banner is-error" role="alert">
          <AlertTriangle size={15} /> {error}
          <button type="button" className="pw-wb-icon-button" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {notice && (
        <div className="pw-wb-banner is-ok" role="status">
          <Check size={15} /> {notice}
          <button type="button" className="pw-wb-icon-button" onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="pw-wb-body pw-exec-body">
        <div className="pw-exec-grid">
          {renderNow()}
          {renderNext()}
          {renderLanded()}
          {renderRelease()}
          {renderPipeline()}
        </div>
      </div>

      {drawer && (
        <>
          <button
            type="button"
            className="pw-exec-scrim"
            aria-label="Close secondary panel"
            onClick={() => setDrawer(null)}
          />
          {drawer === 'details' ? renderDetailsDrawer() : renderDiagnosticsDrawer()}
        </>
      )}

      <footer className="pw-wb-foot">
        <span>Last update {new Date(overview.updatedAt).toLocaleTimeString('ru-RU')}</span>
        <span>
          {readyTasks.length} ready · {queuedTasks.length} queued · {counts.verified || 0} verified
        </span>
      </footer>
    </div>
  );
}
