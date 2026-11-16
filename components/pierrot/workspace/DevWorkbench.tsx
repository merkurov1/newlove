'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  GitBranch,
  GitMerge,
  History,
  Inbox,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DevAttempt,
  DevDeploymentStatus,
  DevReviewView,
  DevSetupReport,
  DevWorkbenchOverview,
  DevWorkbenchTask,
} from '@/lib/pierrot/dev/workbench/types';

type Tab = 'inbox' | 'queue' | 'execution' | 'history' | 'review' | 'setup';

type Props = {
  initialOverview: DevWorkbenchOverview;
  onOpenChat: () => void;
};

const TABS: Array<{ key: Tab; label: string; icon: typeof Inbox }> = [
  { key: 'inbox', label: 'INBOX', icon: Inbox },
  { key: 'queue', label: 'QUEUE', icon: GitBranch },
  { key: 'execution', label: 'EXECUTION', icon: Terminal },
  { key: 'history', label: 'HISTORY', icon: History },
  { key: 'review', label: 'REVIEW', icon: Check },
  { key: 'setup', label: 'SETUP', icon: Settings2 },
];

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
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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

function money(value: number | null | undefined): string {
  // Unknown is never rendered as $0.
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(4)}`;
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
  codespaceEstimatedUsd?: number | null;
  totalUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  unknown?: string[];
  machine?: string | null;
  runtimeMs?: number | null;
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
  return {
    modelUsd: numberOrNull(cost.model?.costUsd),
    codespaceEstimatedUsd: numberOrNull(cost.codespace?.estimatedUsd),
    totalUsd: numberOrNull(cost.totalUsd),
    inputTokens: numberOrNull(cost.model?.inputTokens),
    outputTokens: numberOrNull(cost.model?.outputTokens),
    reasoningTokens: numberOrNull(cost.model?.reasoningTokens),
    unknown: Array.isArray(cost.unknown)
      ? cost.unknown.filter((item): item is string => typeof item === 'string')
      : [],
    machine: typeof cost.codespace?.machine === 'string' ? cost.codespace.machine : null,
    runtimeMs: numberOrNull(cost.codespace?.runtimeMs),
  };
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

export default function DevWorkbench({ initialOverview, onOpenChat }: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<Tab>('inbox');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [setup, setSetup] = useState<DevSetupReport | null>(null);
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [review, setReview] = useState<DevReviewView | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [mergeDeployment, setMergeDeployment] = useState<DevDeploymentStatus | null>(null);
  const [manualAll, setManualAll] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    objective: '',
    acceptanceCriteria: '',
    tests: '',
    securityConstraints: '',
    affectedFiles: '',
  });
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [codespaceList, setCodespaceList] = useState<
    Array<{ name: string; state: string; repository: string | null; machine: string | null }>
  >([]);
  const [form, setForm] = useState({
    title: '',
    objective: '',
    repository: 'newlove',
    acceptanceCriteria: '',
    tests: '',
    securityConstraints: '',
    affectedFiles: '',
  });

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/pierrot/dev/workbench', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { overview: DevWorkbenchOverview };
    setOverview(body.overview);
    return body.overview;
  }, []);

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
          merge?: { deployment: DevDeploymentStatus | null; mergeSha: string | null };
          token?: string;
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
        if (body.merge) {
          setMergeDeployment(body.merge.deployment || null);
          setNotice(`Merged ${body.merge.mergeSha ? shortSha(body.merge.mergeSha) : ''}`.trim());
        }
        if (action === 'start_codespace' || action === 'create_codespace') {
          setNotice('Codespace start requested. The worker starts automatically after boot.');
        }
        if (action === 'approve') {
          const queued = body.overview?.queue.some(
            (item) => item.id === String(payload.taskId || '')
          );
          setNotice(
            queued
              ? 'Задание утверждено и поставлено в очередь. Codespace запустится автоматически.'
              : 'Задание утверждено. Задачи batch запускаются через Start batch.'
          );
        }
        if (action === 'accept') {
          setNotice('Accepted. Select the verified task in REVIEW again to merge it explicitly.');
        }
        if (['accept', 'reject', 'retry', 'merge', 'enqueue'].includes(action)) {
          setReviewTaskId(null);
          setReview(null);
        }
        return body;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Action failed.');
        return null;
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const loadReview = useCallback(async (taskId: string) => {
    setReviewTaskId(taskId);
    setReviewLoading(true);
    setReview(null);
    setMergeDeployment(null);
    setManualAll(false);
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
      if (body.attemptView?.deployment) setMergeDeployment(body.attemptView.deployment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review failed.');
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy) {
        void refresh().catch(() => {});
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh, busy]);

  const counts = overview.counts;
  const active = overview.active;
  const worker = overview.workers.find((item) => item.online) || overview.workers[0] || null;
  const readyTasks = overview.inbox.filter((task) => task.status === 'ready');

  const createTask = async () => {
    setBusy('create');
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/dev/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          objective: form.objective,
          repository: form.repository,
          baseRef: 'main',
          acceptanceCriteria: lines(form.acceptanceCriteria),
          tests: lines(form.tests),
          securityConstraints: lines(form.securityConstraints),
          affectedFiles: lines(form.affectedFiles),
          status: 'draft',
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setForm({
        title: '',
        objective: '',
        repository: 'newlove',
        acceptanceCriteria: '',
        tests: '',
        securityConstraints: '',
        affectedFiles: '',
      });
      setCreateOpen(false);
      await refresh();
      setTab('inbox');
      setNotice('Draft created. Add acceptance criteria, then approve it.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the task.');
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (task: DevWorkbenchTask) => {
    setEditId(task.id);
    setEditForm({
      title: task.title,
      objective: task.objective,
      acceptanceCriteria: task.acceptanceCriteria.join('\n'),
      tests: '',
      securityConstraints: '',
      affectedFiles: '',
    });
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
      setNotice('Draft updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update the task.');
    } finally {
      setBusy(null);
    }
  };

  const topStrip = useMemo(
    () => (
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
            ? `attempt ${active.attempt.attemptNumber} · ${active.attempt.progressStage || active.attempt.status}`
            : 'executor idle'}
        </span>
        <span className="pw-wb-chip is-quiet">
          queued {counts.queued || 0} · review {counts.review || 0} · failed {counts.failed || 0}
        </span>
      </div>
    ),
    [
      overview.schemaReady,
      overview.queuePaused,
      overview.lifecycle.status,
      overview.lifecycle.label,
      worker,
      active,
      counts,
    ]
  );

  const renderInbox = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">INBOX</p>
          <h2>Задания и утверждение</h2>
        </div>
        <button
          type="button"
          className="pw-wb-button is-primary"
          onClick={() => setCreateOpen((value) => !value)}
        >
          <Plus size={14} /> {createOpen ? 'Скрыть' : 'Новое задание'}
        </button>
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
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
              rows={3}
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
          </div>
          <label>
            Acceptance criteria — по одному на строку
            <textarea
              value={form.acceptanceCriteria}
              onChange={(event) =>
                setForm({ ...form, acceptanceCriteria: event.target.value })
              }
              rows={4}
              placeholder={'Очередь сохраняется в Supabase\nЗадание получает только один worker'}
            />
          </label>
          <label>
            Проверки — по одной на строку
            <textarea
              value={form.tests}
              onChange={(event) => setForm({ ...form, tests: event.target.value })}
              rows={3}
              placeholder={'pnpm typecheck\npnpm test --runInBand'}
            />
          </label>
          <label>
            Security constraints — по одной на строку
            <textarea
              value={form.securityConstraints}
              onChange={(event) =>
                setForm({ ...form, securityConstraints: event.target.value })
              }
              rows={2}
              placeholder="Не трогать .env и production credentials"
            />
          </label>
          <label>
            Затрагиваемые файлы / области — по одной на строку
            <textarea
              value={form.affectedFiles}
              onChange={(event) => setForm({ ...form, affectedFiles: event.target.value })}
              rows={2}
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

      {overview.inbox.length === 0 ? (
        <p className="pw-wb-empty">Нет черновиков и готовых заданий.</p>
      ) : (
        <ul className="pw-wb-list">
          {overview.inbox.map((task) => (
            <li key={task.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <StatusBadge status={task.status} />
                  <strong>{task.title}</strong>
                </div>
                <TaskMeta task={task} />
              </div>
              {task.objective && <p className="pw-wb-card-body">{task.objective}</p>}
              {task.acceptanceCriteria.length > 0 && (
                <ul className="pw-wb-criteria">
                  {task.acceptanceCriteria.slice(0, 6).map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              )}
              {task.blockedReason && (
                <p className="pw-wb-warning">
                  <ShieldAlert size={14} /> {task.blockedReason}
                </p>
              )}
              {task.lastErrorCode && (
                <p className="pw-wb-warning">
                  <AlertTriangle size={14} /> {task.lastErrorCode}: {task.lastErrorMessage}
                </p>
              )}
              <div className="pw-wb-actions">
                {['draft', 'blocked'].includes(task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button"
                    disabled={busy === `approve:${task.id}`}
                    onClick={() => void runAction('approve', { taskId: task.id })}
                  >
                    <Check size={14} /> Approve
                  </button>
                )}
                {['draft', 'blocked'].includes(task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => startEdit(task)}
                  >
                    Edit
                  </button>
                )}
                {task.status === 'ready' && (
                  <button
                    type="button"
                    className="pw-wb-button is-primary"
                    disabled={busy === `enqueue:${task.id}`}
                    onClick={() => void runAction('enqueue', { taskId: task.id })}
                  >
                    <ArrowDown size={14} /> В очередь
                  </button>
                )}
                {['draft', 'ready', 'blocked'].includes(task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button"
                    onClick={() => {
                      setBatchSelection((current) =>
                        current.includes(task.id)
                          ? current.filter((id) => id !== task.id)
                          : [...current, task.id]
                      );
                    }}
                  >
                    <Circle size={12} />
                    {batchSelection.includes(task.id) ? 'В batch' : 'Выбрать для batch'}
                  </button>
                )}
                {['draft', 'ready'].includes(task.status) && (
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => {
                      const reason = window.prompt('Причина блокировки', 'Ждёт уточнения');
                      if (reason !== null) {
                        void runAction('block', { taskId: task.id, reason });
                      }
                    }}
                  >
                    Block
                  </button>
                )}
                <button
                  type="button"
                  className="pw-wb-button is-danger"
                  onClick={() => void runAction('cancel', { taskId: task.id })}
                >
                  <Trash2 size={14} /> Отменить
                </button>
              </div>
              {editId === task.id && (
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
                      onChange={(event) =>
                        setEditForm({ ...editForm, objective: event.target.value })
                      }
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
                  <div className="pw-wb-form-actions">
                    <button
                      type="button"
                      className="pw-wb-button is-primary"
                      disabled={busy === `edit:${task.id}`}
                      onClick={() => void saveEdit(task.id)}
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
            </li>
          ))}
        </ul>
      )}

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
    </div>
  );

  const renderQueue = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">QUEUE</p>
          <h2>Очередь и пакеты</h2>
        </div>
        <div className="pw-wb-actions">
          <button
            type="button"
            className="pw-wb-button"
            onClick={() =>
              void runAction(overview.queuePaused ? 'resume_queue' : 'pause_queue')
            }
          >
            {overview.queuePaused ? <Play size={14} /> : <Pause size={14} />}
            {overview.queuePaused ? 'Resume queue' : 'Pause queue'}
          </button>
          <button
            type="button"
            className="pw-wb-button is-quiet"
            onClick={() => void runAction('reap')}
          >
            Проверить leases
          </button>
        </div>
      </div>

      {overview.queue.length === 0 ? (
        <p className="pw-wb-empty">Очередь пуста. Утвердите задание во INBOX и поставьте его в очередь.</p>
      ) : (
        <ol className="pw-wb-queue">
          {overview.queue.map((task, index) => (
            <li key={task.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <span className="pw-wb-position">{index + 1}</span>
                  <StatusBadge status={task.status} />
                  <strong>{task.title}</strong>
                </div>
                <TaskMeta task={task} />
              </div>
              {task.lastErrorCode && (
                <p className="pw-wb-warning">
                  <AlertTriangle size={14} /> {task.lastErrorCode}: {task.lastErrorMessage}
                </p>
              )}
              <div className="pw-wb-actions">
                <button
                  type="button"
                  className="pw-wb-icon-button"
                  aria-label="Выше"
                  disabled={index === 0}
                  onClick={() => void runAction('reorder', { taskId: task.id, position: index - 1 })}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="pw-wb-icon-button"
                  aria-label="Ниже"
                  disabled={index === overview.queue.length - 1}
                  onClick={() => void runAction('reorder', { taskId: task.id, position: index + 1 })}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="pw-wb-button is-quiet"
                  onClick={() => void runAction('set_priority', { taskId: task.id, priority: task.priority + 1 })}
                >
                  P+1
                </button>
                <button
                  type="button"
                  className="pw-wb-button is-quiet"
                  onClick={() => void runAction('set_priority', { taskId: task.id, priority: task.priority - 1 })}
                >
                  P−1
                </button>
                <button
                  type="button"
                  className="pw-wb-button"
                  onClick={() => void runAction('dequeue', { taskId: task.id })}
                >
                  Убрать из очереди
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="pw-wb-subhead">
        <p className="pw-wb-kicker">BATCHES</p>
      </div>
      {overview.batches.length === 0 ? (
        <p className="pw-wb-empty">Пакетов пока нет. Выберите задания во INBOX и создайте batch.</p>
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
                    onClick={() =>
                      void runAction('update_batch', { batchId: batch.id, status })
                    }
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

  const renderExecution = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">EXECUTION</p>
          <h2>Один Codespace, одно задание</h2>
        </div>
        <div className="pw-wb-actions">
          <button
            type="button"
            className="pw-wb-button is-quiet"
            disabled={
              busy === 'start_codespace' ||
              ['starting_codespace', 'starting_worker', 'stopping_codespace'].includes(
                overview.lifecycle.status
              )
            }
            onClick={() => void runAction('start_codespace')}
          >
            Start now (automatic)
          </button>
          <button
            type="button"
            className="pw-wb-button is-danger"
            disabled={!active}
            onClick={() => active && void runAction('cancel', { taskId: active.task.id })}
          >
            Cancel attempt
          </button>
        </div>
      </div>

      <div className="pw-wb-card">
        <div className="pw-wb-card-head">
          <div className="pw-wb-card-title">
            <span className={`pw-wb-dot is-${lifecycleTone(overview.lifecycle.status)}`} />
            <strong>{overview.lifecycle.label}</strong>
          </div>
          <span className="pw-wb-meta">
            updated {new Date(overview.lifecycle.updatedAt).toLocaleTimeString('ru-RU')}
          </span>
        </div>
        <p className="pw-wb-card-body">{overview.lifecycle.detail}</p>
        {overview.lifecycle.lastError && (
          <p className="pw-wb-warning">
            <AlertTriangle size={14} />{' '}
            {overview.lifecycle.lastErrorCode
              ? `${overview.lifecycle.lastErrorCode}: `
              : ''}
            {overview.lifecycle.lastError}
          </p>
        )}
        {overview.lifecycle.worker?.readiness?.reasons?.length ? (
          <p className="pw-wb-warning">
            <ShieldAlert size={14} /> {overview.lifecycle.worker.readiness.reasons.join(' · ')}
          </p>
        ) : null}
        {overview.lifecycle.lastBoot ? (
          <p className="pw-wb-meta">
            boot {overview.lifecycle.lastBoot.phase} · {age(overview.lifecycle.lastBoot.at)} ago
            {overview.lifecycle.lastBoot.message ? ` · ${overview.lifecycle.lastBoot.message}` : ''}
          </p>
        ) : null}
        <dl className="pw-wb-facts">
          <div>
            <dt>Codespace</dt>
            <dd>
              {overview.lifecycle.codespace
                ? `${overview.lifecycle.codespace.name} · ${overview.lifecycle.codespace.state || 'unknown'}${
                    overview.lifecycle.codespace.idleTimeoutMinutes
                      ? ` · idle ${overview.lifecycle.codespace.idleTimeoutMinutes}m`
                      : ''
                  }`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>
              {overview.lifecycle.queue.queued} queued · {overview.lifecycle.queue.active} active
              {overview.lifecycle.queue.paused ? ' · paused' : ''}
            </dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>
              {overview.lifecycle.worker
                ? `${overview.lifecycle.worker.online ? 'online' : 'offline'} · ${
                    overview.lifecycle.worker.ready ? 'ready' : 'not ready'
                  } · heartbeat ${overview.lifecycle.worker.heartbeatAgeSeconds ?? '—'}s${
                    overview.lifecycle.worker.currentAttemptId
                      ? ` · task ${overview.lifecycle.worker.currentTaskId || '—'}`
                      : ''
                  }`
                : 'not registered'}
            </dd>
          </div>
          <div>
            <dt>Versions</dt>
            <dd>
              worker {overview.lifecycle.worker?.version || '—'} · OpenCode{' '}
              {overview.lifecycle.worker?.opencodeVersion || '—'}
            </dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd>
              API {overview.lifecycle.worker?.readiness?.apiOk ? 'ok' : 'not ready'} · Supabase{' '}
              {overview.lifecycle.worker?.readiness?.supabaseOk ? 'ok' : 'not ready'} · provider
              auth {overview.lifecycle.worker?.readiness?.authOk ? 'ok' : 'missing'} · checked{' '}
              {overview.lifecycle.worker?.readinessAgeSeconds ?? '—'}s ago
              {overview.lifecycle.worker?.readinessFresh === false ? ' · STALE' : ''}
            </dd>
          </div>
          <div>
            <dt>Pending start</dt>
            <dd>
              {overview.lifecycle.pendingStartInfo
                ? `${overview.lifecycle.pendingStartInfo.phase} · attempts ${overview.lifecycle.pendingStartInfo.attempts}/${overview.lifecycle.pendingStartInfo.maxAttempts} · age ${overview.lifecycle.pendingStartInfo.ageSeconds ?? '—'}s · observed ${
                    overview.lifecycle.pendingStartInfo.lastObservedState || 'unknown'
                  } · HTTP ${overview.lifecycle.pendingStartInfo.lastHttpStatus ?? '—'}${
                    overview.lifecycle.pendingStartInfo.lastError
                      ? ` · ${overview.lifecycle.pendingStartInfo.lastError}`
                      : ''
                  }`
                : 'no'}
            </dd>
          </div>
          {overview.lifecycle.recovery ? (
            <div>
              <dt>Recovery</dt>
              <dd>
                failures {overview.lifecycle.recovery.failures}
                {overview.lifecycle.recovery.blocked ? ' · blocked' : ''}
                {overview.lifecycle.recovery.lastReason
                  ? ` · ${overview.lifecycle.recovery.lastReason}`
                  : ''}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Idle / grace</dt>
            <dd>
              {overview.lifecycle.idleSeconds !== null
                ? `${overview.lifecycle.idleSeconds}s / ${overview.lifecycle.idleGraceSeconds}s`
                : `— / ${overview.lifecycle.idleGraceSeconds}s`}
            </dd>
          </div>
          <div>
            <dt>Keepalive</dt>
            <dd>
              {overview.lifecycle.lastKeepaliveAt
                ? `${age(overview.lifecycle.lastKeepaliveAt)} ago`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Startup</dt>
            <dd>
              {overview.lifecycle.lastStartAt
                ? `${age(overview.lifecycle.lastStartAt)} ago · requested ${
                    overview.lifecycle.lastStartState || 'unknown'
                  } · observed ${overview.lifecycle.lastStartObservedState || 'unknown'} · HTTP ${
                    overview.lifecycle.lastStartHttpStatus ?? '—'
                  }${
                    overview.lifecycle.lastReadyAt
                      ? ` · ready ${age(overview.lifecycle.lastReadyAt)} ago`
                      : ''
                  }`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Last shutdown</dt>
            <dd>
              {overview.lifecycle.lastStopAt
                ? `${age(overview.lifecycle.lastStopAt)} ago${
                    overview.lifecycle.lastStop?.idleSeconds != null
                      ? ` · idle ${overview.lifecycle.lastStop.idleSeconds}s`
                      : ''
                  }${
                    overview.lifecycle.lastStop?.startupMs != null
                      ? ` · startup ${Math.round(overview.lifecycle.lastStop.startupMs / 1000)}s`
                      : ''
                  }${
                    overview.lifecycle.lastStop?.measuredRuntimeMs != null
                      ? ` · runtime ${Math.round(
                          overview.lifecycle.lastStop.measuredRuntimeMs / 60000
                        )}m`
                      : ''
                  }`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Cost ledger</dt>
            <dd>
              actual model {money(overview.lifecycle.cost.modelUsd)} · Codespaces est.{' '}
              {money(overview.lifecycle.cost.codespaceEstimatedUsd)} · total{' '}
              {money(overview.lifecycle.cost.totalUsd)}
            </dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>
              in {overview.lifecycle.cost.inputTokens ?? '—'} · out{' '}
              {overview.lifecycle.cost.outputTokens ?? '—'} · reasoning{' '}
              {overview.lifecycle.cost.reasoningTokens ?? '—'}
            </dd>
          </div>
        </dl>
        <p className="pw-wb-meta">
          {overview.lifecycle.cost.attemptsWithCost} attempt(s) with cost ·{' '}
          {overview.lifecycle.cost.attemptsMissingCost} without ·{' '}
          {overview.lifecycle.cost.provenance}
          {overview.lifecycle.cost.unknown.length
            ? ` · unknown: ${overview.lifecycle.cost.unknown.join(', ')}`
            : ''}
        </p>
      </div>

      {active ? (
        <div className="pw-wb-active">
          <div className="pw-wb-active-head">
            <StatusBadge status={active.attempt.status} />
            <strong>{active.task.title}</strong>
            <span className="pw-wb-meta">
              attempt {active.attempt.attemptNumber} · {active.task.repository}
            </span>
          </div>
          <dl className="pw-wb-facts">
            <div>
              <dt>Worker</dt>
              <dd>{active.worker?.name || active.attempt.workerId || '—'}</dd>
            </div>
            <div>
              <dt>Heartbeat</dt>
              <dd>{age(active.attempt.heartbeatAt)} ago</dd>
            </div>
            <div>
              <dt>Lease</dt>
              <dd>{active.attempt.leaseExpiresAt ? `${age(active.attempt.leaseExpiresAt)} left` : '—'}</dd>
            </div>
            <div>
              <dt>Running</dt>
              <dd>{duration(active.attempt.startedAt, null)}</dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{active.attempt.progressStage || '—'}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd><code>{active.attempt.branch}</code></dd>
            </div>
          </dl>
          <div className="pw-wb-events">
            {active.events.map((event) => (
              <div key={event.id} className={`pw-wb-event is-${event.level}`}>
                <time>{new Date(event.createdAt).toLocaleTimeString('ru-RU')}</time>
                <span>{event.message}</span>
              </div>
            ))}
            {active.events.length === 0 && <p className="pw-wb-empty">Событий пока нет.</p>}
          </div>
        </div>
      ) : (
        <div className="pw-wb-idle">
          <Terminal size={20} />
          <div>
            <strong>Исполнитель свободен</strong>
            <p>Очередь обрабатывается автоматически. Следующее задание будет получено в течение ~20 секунд.</p>
          </div>
        </div>
      )}

      <div className="pw-wb-card">
        <div className="pw-wb-card-head">
          <div className="pw-wb-card-title">
            <span
              className={`pw-wb-dot is-${
                setup?.codespaces.state &&
                ['Available', 'Starting', 'Rebuilding'].includes(setup.codespaces.state)
                  ? 'ok'
                  : 'warn'
              }`}
            />
            <strong>Codespace</strong>
          </div>
          <button
            type="button"
            className="pw-wb-button is-quiet"
            disabled={busy === 'setup'}
            onClick={() => void loadSetup()}
          >
            Проверить
          </button>
        </div>
        <p className="pw-wb-card-body">
          {setup?.codespaces.name
            ? `${setup.codespaces.name} · ${setup.codespaces.state || 'unknown'}${
                setup.codespaces.machine ? ` · ${setup.codespaces.machine}` : ''
              }`
            : 'Состояние Codespace ещё не проверялось. Нажмите «Проверить».'}
        </p>
      </div>

      <div className="pw-wb-subhead">
        <p className="pw-wb-kicker">WORKERS</p>
      </div>
      {overview.workers.length === 0 ? (
        <p className="pw-wb-empty">Worker ещё не регистрировался.</p>
      ) : (
        <ul className="pw-wb-list">
          {overview.workers.map((item) => (
            <li key={item.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <StatusBadge status={item.online ? 'online' : item.status} />
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
                <button
                  type="button"
                  className="pw-wb-button is-quiet"
                  onClick={() => void runAction('stop_codespace')}
                >
                  Stop Codespace
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pw-wb-subhead">
        <p className="pw-wb-kicker">RECENT EVENTS</p>
      </div>
      <div className="pw-wb-events">
        {overview.recentEvents.map((event) => (
          <div key={event.id} className={`pw-wb-event is-${event.level}`}>
            <time>{new Date(event.createdAt).toLocaleTimeString('ru-RU')}</time>
            <span>
              {event.type} — {event.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

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
              <dd><code>{attempt.branch || '—'}</code></dd>
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
              <dt>Model cost</dt>
              <dd>{cost ? money(cost.modelUsd) : '—'}</dd>
            </div>
            <div>
              <dt>Codespaces est.</dt>
              <dd>
                {cost ? `${money(cost.codespaceEstimatedUsd)}${cost.machine ? ` · ${cost.machine}` : ''}` : '—'}
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
                  ? `${cost.inputTokens ?? '—'} in / ${cost.outputTokens ?? '—'} out`
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

  const renderHistory = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">HISTORY</p>
          <h2>Завершённые и неудачные задания</h2>
        </div>
        <button type="button" className="pw-wb-button is-quiet" onClick={() => void refresh()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {overview.history.length === 0 ? (
        <p className="pw-wb-empty">Истории пока нет.</p>
      ) : (
        <ul className="pw-wb-list">
          {overview.history.map((entry) => (
            <li key={entry.task.id} className="pw-wb-card">
              <div className="pw-wb-card-head">
                <div className="pw-wb-card-title">
                  <StatusBadge status={entry.task.status} />
                  <strong>{entry.task.title}</strong>
                </div>
                <TaskMeta task={entry.task} />
              </div>
              {entry.task.lastErrorCode && (
                <p className="pw-wb-warning">
                  <AlertTriangle size={14} /> {entry.task.lastErrorCode}: {entry.task.lastErrorMessage}
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

  const renderReview = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">REVIEW</p>
          <h2>Результат и проверка</h2>
        </div>
      </div>

      {overview.review.length === 0 ? (
        <p className="pw-wb-empty">Нет заданий на проверке.</p>
      ) : (
        <div className="pw-wb-review-grid">
          <ul className="pw-wb-list">
            {overview.review.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={`pw-wb-review-pick ${reviewTaskId === task.id ? 'is-active' : ''}`}
                  onClick={() => void loadReview(task.id)}
                >
                  <StatusBadge status={task.status} />
                  <span>{task.title}</span>
                  <small>{task.repository}</small>
                </button>
              </li>
            ))}
          </ul>

          <div className="pw-wb-review-detail">
            {reviewLoading && <p className="pw-wb-empty">Загружаю diff и checks…</p>}
            {!reviewLoading && !reviewTaskId && (
              <p className="pw-wb-empty">Выберите задание слева.</p>
            )}
            {review && (
              <>
                <div className="pw-wb-review-head">
                  <StatusBadge status={review.task.status} />
                  <strong>{review.task.title}</strong>
                  <span className="pw-wb-meta">
                    verdict: {review.verdict || '—'} · attempt {review.attempt?.attemptNumber ?? '—'}
                  </span>
                  <button
                    type="button"
                    className="pw-wb-button is-quiet"
                    onClick={() => void loadReview(review.task.id)}
                  >
                    <RefreshCw size={13} /> Re-check CI
                  </button>
                </div>
                {review.attempt?.prUrl && (
                  <p className="pw-wb-meta">
                    PR: <a href={review.attempt.prUrl} target="_blank" rel="noreferrer">{review.attempt.prUrl}</a>
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

                <h3 className="pw-wb-subtitle">
                  Changed files ({review.changedFiles.length})
                </h3>
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
                  {review.changedFiles.length === 0 && (
                    <li className="pw-wb-empty">Diff не найден.</li>
                  )}
                </ul>

                <h3 className="pw-wb-subtitle">Checks</h3>
                <ul className="pw-wb-criteria">
                  {review.checks.map((check, index) => (
                    <li key={`${check.name}-${index}`}>
                      <strong>{check.conclusion || check.status || 'unknown'}</strong> {check.name}
                      {check.url ? (
                        <>
                          {' '}
                          <a href={check.url} target="_blank" rel="noreferrer">log</a>
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

                {review.task.status === 'review' && (
                  <>
                    <label className="pw-wb-check">
                      <input
                        type="checkbox"
                        checked={manualAll}
                        onChange={(event) => setManualAll(event.target.checked)}
                      />
                      Я вручную проверил каждое acceptance criterion
                    </label>

                    <textarea
                      className="pw-wb-reject"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={2}
                      placeholder="Причина отклонения (для reject)"
                    />
                  </>
                )}

                <div className="pw-wb-actions">
                  {review.task.status === 'review' && (
                    <>
                      <button
                        type="button"
                        className="pw-wb-button is-primary"
                        onClick={() =>
                          void runAction('accept', {
                            taskId: review.task.id,
                            manualCriteria: manualAll ? ['*'] : [],
                          })
                        }
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        type="button"
                        className="pw-wb-button is-danger"
                        onClick={() =>
                          void runAction('reject', {
                            taskId: review.task.id,
                            reason: rejectReason,
                          })
                        }
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        className="pw-wb-button"
                        onClick={() => void runAction('retry', { taskId: review.task.id })}
                      >
                        <RotateCcw size={14} /> Retry
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="pw-wb-button is-merge"
                    disabled={!review.mergeable || review.task.status !== 'verified'}
                    onClick={() => {
                      if (!window.confirm('Merge this pull request? This is an explicit owner action.')) {
                        return;
                      }
                      void runAction('merge', { taskId: review.task.id, confirm: true });
                    }}
                  >
                    <GitMerge size={14} /> Merge (only after accept)
                  </button>
                </div>

                {mergeDeployment && (
                  <div className={`pw-wb-deploy is-${mergeDeployment.state}`}>
                    <strong>Vercel: {mergeDeployment.state}</strong>
                    <span>{mergeDeployment.url || mergeDeployment.reason || ''}</span>
                  </div>
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
        </div>
      )}
    </div>
  );

  const renderSetup = () => (
    <div className="pw-wb-section">
      <div className="pw-wb-section-head">
        <div>
          <p className="pw-wb-kicker">SETUP</p>
          <h2>Интеграции и настройка</h2>
        </div>
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
            <RefreshCw size={14} /> {busy === 'setup' ? 'Проверяю…' : 'Re-check'}
          </button>
        </div>
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
              <code>PIERROT_DEV_WORKER_TOKEN</code> и в Codespaces secrets с тем же именем,
              затем выполните redeploy и Re-check.
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
            <strong>{setup.ready ? 'Все обязательные интеграции доступны' : 'Система не готова'}</strong>
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
                        Apply <code>migrations/{overview.migrationFile}</code> manually. It is never applied automatically.
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <div className="pw-wb">
      <header className="pw-wb-head">
        <div>
          <p className="pw-wb-kicker">PIERROT · ENGINEERING WORKBENCH</p>
          <h1>Управление разработкой</h1>
        </div>
        <div className="pw-wb-head-actions">
          <button type="button" className="pw-wb-button is-quiet" onClick={() => void refresh()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="pw-wb-button" onClick={onOpenChat}>
            <Terminal size={14} /> Dev chat
          </button>
        </div>
      </header>

      {topStrip}

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

      <nav className="pw-wb-tabs" aria-label="Engineering sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'is-active' : ''}
            onClick={() => {
              setTab(key);
              if (key === 'setup' && !setup) void loadSetup();
            }}
          >
            <Icon size={14} />
            {label}
            {key === 'queue' && counts.queued ? <span>{counts.queued}</span> : null}
            {key === 'review' && counts.review ? <span>{counts.review}</span> : null}
          </button>
        ))}
      </nav>

      <div className="pw-wb-body">
        {tab === 'inbox' && renderInbox()}
        {tab === 'queue' && renderQueue()}
        {tab === 'execution' && renderExecution()}
        {tab === 'history' && renderHistory()}
        {tab === 'review' && renderReview()}
        {tab === 'setup' && renderSetup()}
      </div>

      <footer className="pw-wb-foot">
        <span>Last update {new Date(overview.updatedAt).toLocaleTimeString('ru-RU')}</span>
        <span>
          {readyTasks.length} ready · {counts.queued || 0} queued · {counts.verified || 0} verified
        </span>
      </footer>
    </div>
  );
}
