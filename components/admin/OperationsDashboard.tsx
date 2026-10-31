'use client';

import { useCallback, useEffect, useState } from 'react';

type WorkerScope = 'brain' | 'graph' | 'media' | 'newsletter' | 'retention';

type QueueSnapshot = {
  scope: WorkerScope;
  queued: number;
  processing: number;
  failed: number;
  oldestQueuedAt: string | null;
  oldestAgeHours: number | null;
  maxQueue: number;
  maxQueueAgeHours: number;
  overLimit: boolean;
  stale: boolean;
};

type BudgetSnapshot = {
  scope: WorkerScope;
  usedHour: number;
  usedDay: number;
  maxHour: number;
  maxDay: number;
  exhausted: boolean;
};

type Snapshot = {
  generatedAt: string;
  control: {
    workersEnabled: boolean;
    scopes: Record<WorkerScope, boolean>;
    source: 'database' | 'environment';
  };
  queues: Record<WorkerScope, QueueSnapshot>;
  budgets: Record<WorkerScope, BudgetSnapshot>;
  locks: Array<{
    lock_key: string;
    owner_id: string;
    acquired_at: string;
    heartbeat_at: string;
    expires_at: string;
    stale: boolean;
  }>;
  circuits: Array<Record<string, unknown>>;
  recentRuns: Array<{
    id: string;
    scope: string;
    trigger: string;
    status: string;
    processed: number;
    failed: number;
    error_code: string | null;
    started_at: string;
    finished_at: string | null;
  }>;
  events: Array<Record<string, unknown>>;
  scheduler: Record<string, unknown> | null;
  calls: { embedding: number; llm: number; externalHttp: number };
  limits: {
    lockTtlSeconds: number;
    maxEnqueuePerRequest: number;
    circuitFailureThreshold: number;
    circuitCooldownSeconds: number;
  };
  alerts: Array<{ level: 'warning' | 'error'; code: string; message: string }>;
};

const SCOPES: WorkerScope[] = ['brain', 'graph', 'media', 'newsletter', 'retention'];

const button =
  'rounded border border-[#D9D3CD] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#211F1F] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40';

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-t border-[#E5E1DC] py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#89827B]">{label}</p>
      <p className="mt-1 text-lg text-[#211F1F]">{value}</p>
    </div>
  );
}

export default function OperationsDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<WorkerScope>('brain');
  const [jobId, setJobId] = useState('');
  const [mediaRecordId, setMediaRecordId] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/operations', { cache: 'no-store' });
      const data = (await response.json()) as { snapshot?: Snapshot; error?: string };
      if (!response.ok || !data.snapshot) throw new Error(data.error || 'Could not load status.');
      setSnapshot(data.snapshot);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load status.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setMessage('');

    try {
      const response = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || 'Action failed.'));
      setMessage(`${label}: ok`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-[#89827B]">
          Loading operations status…
        </p>
        {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="border-b border-[#D9D3CD] pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
          Resource safety
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[#211F1F]">Operations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6F6861]">
          Worker locks, queues, budgets, circuit breakers and manual controls. No schedule can be
          enabled from this page.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[#89827B]">
          Updated {formatDate(snapshot.generatedAt)} · control source {snapshot.control.source}
        </p>
      </header>

      {message && (
        <p className="border border-[#E5E1DC] bg-white p-3 text-sm text-[#211F1F]">{message}</p>
      )}

      {snapshot.alerts.length > 0 && (
        <section className="space-y-2">
          {snapshot.alerts.map((alert) => (
            <p
              key={`${alert.code}:${alert.message}`}
              className={`border p-3 text-sm ${
                alert.level === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider">{alert.code}</span>
              {' · '}
              {alert.message}
            </p>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Global kill switch</h2>
          <p className="mt-1 text-sm text-[#6F6861]">
            {snapshot.control.workersEnabled
              ? 'Workers are enabled. Manual runs obey locks and budgets.'
              : 'Workers are stopped. Queues and the public site keep working.'}
          </p>
          <button
            type="button"
            className={`${button} mt-4`}
            disabled={busy !== ''}
            onClick={() =>
              void action(
                { action: 'set_kill_switch', enabled: !snapshot.control.workersEnabled },
                snapshot.control.workersEnabled ? 'Enable kill switch' : 'Disable kill switch'
              )
            }
          >
            {snapshot.control.workersEnabled ? 'Stop all workers' : 'Enable workers'}
          </button>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Calls in the last 24h</h2>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Embedding" value={snapshot.calls.embedding} />
            <Metric label="LLM" value={snapshot.calls.llm} />
            <Metric label="HTTP" value={snapshot.calls.externalHttp} />
          </div>
          <p className="text-xs text-[#6F6861]">
            Counters are derived from worker telemetry; failures are never retried past the job
            attempt limit.
          </p>
        </div>
      </section>

      <section className="border border-[#D9D3CD] bg-white">
        <div className="border-b border-[#E5E1DC] p-5">
          <h2 className="font-serif text-2xl">Workers</h2>
        </div>
        <div className="divide-y divide-[#E5E1DC]">
          {SCOPES.map((scopeName) => {
            const queue = snapshot.queues[scopeName];
            const budget = snapshot.budgets[scopeName];
            const enabled = snapshot.control.scopes[scopeName];
            const last = snapshot.recentRuns.find((run) => run.scope === scopeName) || null;

            return (
              <div key={scopeName} className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[#990F3D]">
                    {scopeName}
                  </p>
                  <p className="mt-1 text-sm text-[#6F6861]">
                    {enabled ? 'enabled' : 'disabled'} · {queue.queued} queued · {queue.processing}{' '}
                    processing · {queue.failed} failed
                  </p>
                  <p className="mt-1 text-xs text-[#89827B]">
                    oldest {formatDate(queue.oldestQueuedAt)} · limit {queue.maxQueue} /{' '}
                    {queue.maxQueueAgeHours}h
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6F6861]">
                    budget {budget.usedHour}/{budget.maxHour}h · {budget.usedDay}/{budget.maxDay}d
                  </p>
                  <p className="mt-1 text-xs text-[#89827B]">
                    last run {last ? `${last.status} · ${last.processed} processed` : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap content-start gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={busy !== ''}
                    onClick={() =>
                      void action(
                        { action: 'set_worker', scope: scopeName, enabled: !enabled },
                        `${enabled ? 'Disable' : 'Enable'} ${scopeName}`
                      )
                    }
                  >
                    {enabled ? 'Disable' : 'Enable'}
                  </button>
                  {['brain', 'graph', 'media'].includes(scopeName) && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy !== '' || !enabled || !snapshot.control.workersEnabled}
                      onClick={() => {
                        const limit = Math.min(
                          snapshot.queues[scopeName].queued || 1,
                          scopeName === 'brain' ? 5 : scopeName === 'graph' ? 5 : 3
                        );
                        if (
                          !window.confirm(
                            `Run one bounded ${scopeName} batch (max ${limit} jobs) now?`
                          )
                        ) {
                          return;
                        }
                        void action(
                          { action: 'run_batch', scope: scopeName, maxJobs: limit, confirm: true },
                          `Run ${scopeName} batch`
                        );
                      }}
                    >
                      Run batch
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Locks</h2>
          {snapshot.locks.length === 0 ? (
            <p className="mt-3 text-sm text-[#6F6861]">No active locks.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {snapshot.locks.map((lock) => (
                <li key={lock.lock_key} className="border-t border-[#E5E1DC] pt-2">
                  <p className="font-mono">{lock.lock_key}</p>
                  <p className="text-[#6F6861]">
                    {lock.owner_id} · expires {formatDate(lock.expires_at)}
                    {lock.stale ? ' · STALE' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Circuit breakers</h2>
          {snapshot.circuits.length === 0 ? (
            <p className="mt-3 text-sm text-[#6F6861]">No circuit state recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {snapshot.circuits.map((circuit) => (
                <li
                  key={String(circuit.dependency)}
                  className="flex items-center justify-between border-t border-[#E5E1DC] pt-2"
                >
                  <span className="font-mono">{String(circuit.dependency)}</span>
                  <span>{String(circuit.state)}</span>
                  <span className="text-[#89827B]">
                    {String(circuit.consecutive_failures || 0)} failures
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border border-[#D9D3CD] bg-white p-5">
        <h2 className="font-serif text-2xl">Single job recovery</h2>
        <p className="mt-1 text-sm text-[#6F6861]">
          Requeues one failed job. It does not start a batch and does not bypass the kill switch.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_1fr_auto]">
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as WorkerScope)}
            className="border border-[#D9D3CD] bg-white px-3 py-2 text-sm"
          >
            {SCOPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            placeholder="job id"
            className="border border-[#D9D3CD] bg-white px-3 py-2 text-sm"
          />
          <input
            value={mediaRecordId}
            onChange={(event) => setMediaRecordId(event.target.value)}
            placeholder="media record id (media only)"
            className="border border-[#D9D3CD] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            className={button}
            disabled={busy !== ''}
            onClick={() =>
              void action(
                {
                  action: 'recover_dead_letter',
                  scope,
                  jobId: jobId.trim() || undefined,
                  mediaRecordId: mediaRecordId.trim() || undefined,
                },
                'Recover job'
              )
            }
          >
            Recover
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Recent worker runs</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {snapshot.recentRuns.slice(0, 12).map((run) => (
              <li key={run.id} className="border-t border-[#E5E1DC] pt-2">
                <p className="font-mono">
                  {run.scope} · {run.status} · {run.trigger}
                </p>
                <p className="text-[#6F6861]">
                  {formatDate(run.started_at)} · {run.processed} processed · {run.failed} failed
                  {run.error_code ? ` · ${run.error_code}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-2xl">Scheduler state</h2>
          {snapshot.scheduler ? (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words bg-[#F7F5F3] p-3 text-[10px] leading-5 text-[#211F1F]">
              {JSON.stringify(snapshot.scheduler, null, 2)}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-[#6F6861]">
              Scheduler status is unavailable until the resource-safety migration is applied.
            </p>
          )}
          <p className="mt-3 text-xs text-[#89827B]">
            Repo cron declarations are removed. This page cannot create or enable a schedule.
          </p>
        </div>
      </section>
    </div>
  );
}
