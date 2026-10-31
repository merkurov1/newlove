export type WorkerScope = 'brain' | 'graph' | 'media' | 'newsletter' | 'retention';

export const WORKER_SCOPES: WorkerScope[] = [
  'brain',
  'graph',
  'media',
  'newsletter',
  'retention',
];

export type WorkerLimits = {
  maxJobs: number;
  maxDurationMs: number;
  maxEmbeddings: number;
  maxLlmCalls: number;
  maxExternalHttp: number;
  maxQueue: number;
  maxQueueAgeHours: number;
  maxJobsPerHour: number;
  maxJobsPerDay: number;
  maxRetries: number;
};

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || '').trim();
  const value = Number(raw);

  if (!Number.isFinite(value)) return fallback;

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();

  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;

  return fallback;
}

function legacyInt(primary: string, secondary: string, fallback: number, min: number, max: number) {
  const primaryValue = (process.env[primary] || '').trim();
  if (primaryValue) return readInt(primary, fallback, min, max);

  return readInt(secondary, fallback, min, max);
}

export function workersEnabledByEnv(): boolean {
  if (readBool('OPS_KILL_SWITCH', false)) return false;

  return readBool('OPS_WORKERS_ENABLED', true);
}

export function workerEnabledByEnv(scope: WorkerScope): boolean {
  return workersEnabledByEnv() && readBool(`OPS_${scope.toUpperCase()}_ENABLED`, true);
}

export function globalLimits() {
  return {
    lockTtlSeconds: readInt('OPS_WORKER_LOCK_TTL_SECONDS', 900, 60, 3600),
    lockHeartbeatMs: readInt('OPS_WORKER_LOCK_HEARTBEAT_MS', 60_000, 10_000, 300_000),
    maxEnqueuePerRequest: readInt('OPS_MAX_ENQUEUE_PER_REQUEST', 50, 1, 200),
    circuitFailureThreshold: readInt('OPS_CIRCUIT_FAILURE_THRESHOLD', 3, 1, 20),
    circuitCooldownSeconds: readInt('OPS_CIRCUIT_COOLDOWN_SECONDS', 300, 30, 3600),
    circuitMaxCooldownSeconds: readInt('OPS_CIRCUIT_MAX_COOLDOWN_SECONDS', 3600, 60, 86_400),
    pierrotLlmTimeoutMs: readInt('OPS_PIERROT_LLM_TIMEOUT_MS', 25_000, 1_000, 55_000),
    pierrotLlmMaxTokens: readInt('OPS_PIERROT_LLM_MAX_TOKENS', 700, 100, 4_000),
    flowLlmTimeoutMs: readInt('OPS_FLOW_LLM_TIMEOUT_MS', 20_000, 1_000, 55_000),
    flowLlmMaxTokens: readInt('OPS_FLOW_LLM_MAX_TOKENS', 600, 100, 4_000),
  };
}

export function workerLimits(scope: WorkerScope): WorkerLimits {
  switch (scope) {
    case 'brain':
      return {
        maxJobs: legacyInt('OPS_BRAIN_MAX_JOBS', 'BRAIN_WORKER_MAX_JOBS', 5, 1, 20),
        maxDurationMs: legacyInt(
          'OPS_BRAIN_MAX_DURATION_MS',
          'BRAIN_WORKER_MAX_DURATION_MS',
          240_000,
          30_000,
          270_000
        ),
        maxEmbeddings: readInt('OPS_BRAIN_MAX_EMBEDDINGS', 30, 1, 100),
        maxLlmCalls: readInt('OPS_BRAIN_MAX_LLM_CALLS', 0, 0, 50),
        maxExternalHttp: readInt('OPS_BRAIN_MAX_EXTERNAL_HTTP', 60, 1, 200),
        maxQueue: readInt('OPS_BRAIN_MAX_QUEUE', 500, 1, 5_000),
        maxQueueAgeHours: readInt('OPS_BRAIN_MAX_QUEUE_AGE_HOURS', 168, 1, 720),
        maxJobsPerHour: readInt('OPS_BRAIN_MAX_JOBS_PER_HOUR', 60, 1, 1_000),
        maxJobsPerDay: readInt('OPS_BRAIN_MAX_JOBS_PER_DAY', 300, 1, 5_000),
        maxRetries: readInt('OPS_BRAIN_MAX_RETRIES', 3, 1, 10),
      };
    case 'graph':
      return {
        maxJobs: legacyInt('OPS_GRAPH_MAX_JOBS', 'BRAIN_GRAPH_WORKER_MAX_JOBS', 5, 1, 10),
        maxDurationMs: legacyInt(
          'OPS_GRAPH_MAX_DURATION_MS',
          'BRAIN_GRAPH_WORKER_MAX_DURATION_MS',
          240_000,
          30_000,
          270_000
        ),
        maxEmbeddings: 0,
        maxLlmCalls: readInt('OPS_GRAPH_MAX_LLM_CALLS', 10, 1, 50),
        maxExternalHttp: readInt('OPS_GRAPH_MAX_EXTERNAL_HTTP', 20, 1, 100),
        maxQueue: readInt('OPS_GRAPH_MAX_QUEUE', 500, 1, 5_000),
        maxQueueAgeHours: readInt('OPS_GRAPH_MAX_QUEUE_AGE_HOURS', 168, 1, 720),
        maxJobsPerHour: readInt('OPS_GRAPH_MAX_JOBS_PER_HOUR', 60, 1, 1_000),
        maxJobsPerDay: readInt('OPS_GRAPH_MAX_JOBS_PER_DAY', 300, 1, 5_000),
        maxRetries: readInt('OPS_GRAPH_MAX_RETRIES', 3, 1, 10),
      };
    case 'media':
      return {
        maxJobs: readInt('OPS_MEDIA_MAX_JOBS', 3, 1, 10),
        maxDurationMs: readInt('OPS_MEDIA_MAX_DURATION_MS', 180_000, 10_000, 270_000),
        maxEmbeddings: 0,
        maxLlmCalls: readInt('OPS_MEDIA_MAX_LLM_CALLS', 6, 1, 20),
        maxExternalHttp: readInt('OPS_MEDIA_MAX_EXTERNAL_HTTP', 10, 1, 50),
        maxQueue: readInt('OPS_MEDIA_MAX_QUEUE', 100, 1, 1_000),
        maxQueueAgeHours: readInt('OPS_MEDIA_MAX_QUEUE_AGE_HOURS', 168, 1, 720),
        maxJobsPerHour: readInt('OPS_MEDIA_MAX_JOBS_PER_HOUR', 30, 1, 500),
        maxJobsPerDay: readInt('OPS_MEDIA_MAX_JOBS_PER_DAY', 120, 1, 2_000),
        maxRetries: readInt('OPS_MEDIA_MAX_RETRIES', 3, 1, 10),
      };
    case 'newsletter':
      return {
        maxJobs: 1,
        maxDurationMs: readInt('OPS_NEWSLETTER_MAX_DURATION_MS', 45_000, 10_000, 55_000),
        maxEmbeddings: 0,
        maxLlmCalls: 0,
        maxExternalHttp: readInt('OPS_NEWSLETTER_MAX_EMAILS', 25, 1, 200),
        maxQueue: readInt('OPS_NEWSLETTER_MAX_QUEUE', 20, 1, 200),
        maxQueueAgeHours: readInt('OPS_NEWSLETTER_MAX_QUEUE_AGE_HOURS', 24, 1, 168),
        maxJobsPerHour: readInt('OPS_NEWSLETTER_MAX_JOBS_PER_HOUR', 10, 1, 100),
        maxJobsPerDay: readInt('OPS_NEWSLETTER_MAX_EMAILS_PER_DAY', 1000, 1, 100_000),
        maxRetries: 1,
      };
    case 'retention':
      return {
        maxJobs: 1,
        maxDurationMs: 55_000,
        maxEmbeddings: 0,
        maxLlmCalls: 0,
        maxExternalHttp: 1,
        maxQueue: 5,
        maxQueueAgeHours: 24,
        maxJobsPerHour: 4,
        maxJobsPerDay: 24,
        maxRetries: 1,
      };
  }
}

export function maxEnqueuePerRequest(): number {
  return globalLimits().maxEnqueuePerRequest;
}
