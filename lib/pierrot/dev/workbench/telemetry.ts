/**
 * Lightweight stage telemetry for the Dev Workbench.
 *
 * The Admin overview used to run reap -> dispatch -> finalization -> overview
 * sequentially inside one GET. That made a slow GitHub call indistinguishable
 * from a slow database query. Every stage now records its own duration so the
 * bottleneck is visible in structured logs, in the response payload and in the
 * `Server-Timing` header.
 *
 * This module is intentionally dependency-free: it never touches the store and
 * never throws. A telemetry failure must not break an owner-facing request.
 */

export type WorkbenchStageStatus = 'ok' | 'error' | 'skipped' | 'timed_out';

export type WorkbenchStageMeasurement = {
  stage: string;
  status: WorkbenchStageStatus;
  durationMs: number;
  startedAt: string;
  code: string | null;
};

export type WorkbenchTelemetrySummary = {
  label: string;
  source: string | null;
  totalMs: number;
  stages: WorkbenchStageMeasurement[];
};

export type WorkbenchStageTimerOptions = {
  label: string;
  source?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = (error as { code?: unknown }).code;
    if (typeof value === 'string' && value) return value.slice(0, 80);
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name && name !== 'Error') return name.slice(0, 80);
  }
  return error instanceof Error ? 'Error' : 'UNKNOWN';
}

function roundMs(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function timingToken(stage: string): string {
  const token = stage.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return token || 'stage';
}

/**
 * Collect bounded per-stage durations for one request or recovery pass.
 * `measure` records both success and failure, then rethrows so existing error
 * handling stays unchanged.
 */
export class WorkbenchStageTimer {
  private readonly startedAt = nowIso();
  private readonly startedMs = Date.now();
  private readonly measurements: WorkbenchStageMeasurement[] = [];
  private readonly label: string;
  private readonly source: string | null;

  constructor(options: WorkbenchStageTimerOptions) {
    this.label = options.label;
    this.source = options.source ?? null;
  }

  async measure<T>(stage: string, operation: () => Promise<T> | T): Promise<T> {
    const startedAt = nowIso();
    const started = Date.now();
    try {
      const value = await operation();
      this.push(stage, startedAt, Date.now() - started, 'ok', null);
      return value;
    } catch (error) {
      this.push(stage, startedAt, Date.now() - started, 'error', safeCode(error));
      throw error;
    }
  }

  record(
    stage: string,
    durationMs: number,
    status: WorkbenchStageStatus,
    options: { code?: string | null; startedAt?: string } = {}
  ): void {
    this.push(stage, options.startedAt ?? nowIso(), durationMs, status, options.code ?? null);
  }

  get stages(): WorkbenchStageMeasurement[] {
    return [...this.measurements];
  }

  summary(): WorkbenchTelemetrySummary {
    return {
      label: this.label,
      source: this.source,
      totalMs: roundMs(Date.now() - this.startedMs),
      stages: this.stages,
    };
  }

  /** Standard `Server-Timing` value, safe for an HTTP header. */
  serverTiming(): string {
    const stages = this.measurements
      .map((entry) => `${timingToken(entry.stage)};dur=${entry.durationMs}`)
      .join(', ');
    const total = `total;dur=${roundMs(Date.now() - this.startedMs)}`;
    return stages ? `${total}, ${stages}` : total;
  }

  /**
   * Emit one structured line. Telemetry is best effort: logging must never turn
   * a successful overview into a failed request.
   */
  log(): void {
    try {
      console.info(
        `[Pierrot Dev Workbench][telemetry] ${JSON.stringify({
          ...this.summary(),
          startedAt: this.startedAt,
        })}`
      );
    } catch {
      // Never let telemetry break the caller.
    }
  }

  private push(
    stage: string,
    startedAt: string,
    durationMs: number,
    status: WorkbenchStageStatus,
    code: string | null
  ): void {
    this.measurements.push({
      stage,
      startedAt,
      durationMs: roundMs(durationMs),
      status,
      code,
    });
  }
}
