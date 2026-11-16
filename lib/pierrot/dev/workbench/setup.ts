import { assertServerOnly } from '@/lib/serverOnly';
import { verifyGitHubAuth } from '@/lib/github';
import { getDevRepositoryConfigs } from '../repositories';
import {
  WORKER_TOKEN_ENV,
  isWorkerAuthConfigured,
} from './workerAuth';
import {
  WORKBENCH_MIGRATION_FILE,
  isWorkbenchSchemaReady,
  getIntegrationSuccessMap,
  isQueuePaused,
  listWorkers,
  recordIntegrationSuccess,
} from './store';
import {
  getGitHubRateLimit,
  getRepositoryPermission,
  getVercelIntegrationStatus,
  resolveCodespace,
} from './github';
import type { CodespaceInfo } from './github';
import { WORKER_OFFLINE_AFTER_SECONDS } from './state';
import type { DevSetupCheck, DevSetupReport } from './types';

assertServerOnly('lib/pierrot/dev/workbench/setup');

export const CODESPACE_NAME_ENV = 'PIERROT_DEV_CODESPACE_NAME';

export function getConfiguredCodespaceName(): string | null {
  const value = (process.env[CODESPACE_NAME_ENV] || '').trim();
  return value || null;
}

/**
 * Real health checks. Nothing is reported as configured unless it was actually
 * verified in this call. Secrets are never returned, only presence/scope.
 */
export async function getSetupReport(): Promise<DevSetupReport> {
  const now = new Date().toISOString();
  const checks: DevSetupCheck[] = [];
  const blocking: string[] = [];
  const [schemaReady, auth, workers, paused] = await Promise.all([
    isWorkbenchSchemaReady(true),
    verifyGitHubAuth({ force: true }),
    listWorkers(),
    isQueuePaused(),
  ]);

  checks.push({
    key: 'supabase_schema',
    label: 'Supabase schema',
    status: schemaReady ? 'ok' : 'error',
    detail: schemaReady
      ? 'All workbench tables are reachable (batches, batch_items, attempts, events, workers, settings).'
      : `Migration ${WORKBENCH_MIGRATION_FILE} is not applied. Apply it manually; it is additive and is never applied automatically.`,
    requiredEnv: null,
    requiredScope: null,
    checkedAt: now,
    action: schemaReady ? null : 'apply_migration',
  });
  if (!schemaReady) blocking.push('Apply the additive workbench migration.');

  checks.push({
    key: 'worker_auth',
    label: 'Worker authentication',
    status: isWorkerAuthConfigured() ? 'ok' : 'error',
    detail: isWorkerAuthConfigured()
      ? `${WORKER_TOKEN_ENV} is set on the server. Only a hash-free constant-time comparison is used at runtime.`
      : `${WORKER_TOKEN_ENV} is missing or shorter than 32 characters.`,
    requiredEnv: WORKER_TOKEN_ENV,
    requiredScope: 'A random secret of at least 32 characters, shared with the Codespace only.',
    checkedAt: now,
    action: null,
  });
  if (!isWorkerAuthConfigured()) blocking.push('Configure the worker token.');

  checks.push({
    key: 'github_auth',
    label: 'GitHub connection',
    status: auth.authenticated ? (auth.configured ? 'ok' : 'warn') : auth.configured ? 'error' : 'missing',
    detail: auth.authenticated
      ? `Authenticated as @${auth.login || 'unknown'}.`
      : auth.configured
        ? `GitHub token exists but authentication failed: ${auth.error || 'unknown error'}.`
        : 'GITHUB_TOKEN is not configured.',
    requiredEnv: 'GITHUB_TOKEN',
    requiredScope: 'Repository read/write (contents, pull requests) and Codespaces read/write.',
    checkedAt: now,
    action: null,
  });
  if (!auth.authenticated) blocking.push('Restore GitHub authentication.');

  for (const config of getDevRepositoryConfigs()) {
    const permission = await getRepositoryPermission(config.key);
    const isPrimary = config.key === 'newlove';
    checks.push({
      key: `repo_${config.key}`,
      label: `${config.fullName}`,
      status: permission ? (permission.push ? 'ok' : 'warn') : isPrimary ? 'error' : 'warn',
      detail: permission
        ? `Access confirmed. push=${permission.push}, admin=${permission.admin}, default branch=${permission.defaultBranch}. Direct writes to the default branch are forbidden by policy.`
        : `The token cannot read this repository.${isPrimary ? '' : ' The second repository is optional, but its tasks cannot run without access.'}`,
      requiredEnv: 'GITHUB_TOKEN',
      requiredScope: 'Repository access (fine-grained: Contents read/write, Pull requests read/write, Metadata read).',
      checkedAt: now,
      action: null,
      data: permission ? { ...permission } : undefined,
    });
    if (!permission && isPrimary) blocking.push(`GitHub access to ${config.fullName} is missing.`);
  }

  const rate = await getGitHubRateLimit();
  checks.push({
    key: 'github_rate_limit',
    label: 'GitHub rate limit',
    status: !rate ? 'warn' : rate.remaining > 200 ? 'ok' : rate.remaining > 50 ? 'warn' : 'error',
    detail: rate
      ? `${rate.remaining}/${rate.limit} core requests remaining; resets ${rate.resetAt || 'unknown'}.`
      : 'Rate limit status is unavailable.',
    requiredEnv: null,
    requiredScope: null,
    checkedAt: now,
    action: null,
  });

  const codespaceName = getConfiguredCodespaceName();
  let codespace: CodespaceInfo | null = null;
  let codespaceError: string | null = null;

  try {
    codespace = await resolveCodespace(codespaceName);
  } catch (error) {
    codespaceError = error instanceof Error ? error.message : 'Codespaces API unavailable.';
  }

  if (!codespace) {
    if (codespaceError) {
      checks.push({
        key: 'codespace',
        label: 'Codespace',
        status: 'error',
        detail: codespaceError,
        requiredEnv: 'GITHUB_TOKEN',
        requiredScope: 'Codespaces read/write on the fine-grained token.',
        checkedAt: now,
        action: null,
      });
      blocking.push('Codespaces access is unavailable.');
    } else if (!codespaceName) {
      checks.push({
        key: 'codespace',
        label: 'Codespace',
        status: 'missing',
        detail: `No Codespace was found for this repository. Set ${CODESPACE_NAME_ENV} or create one from Admin.`,
        requiredEnv: CODESPACE_NAME_ENV,
        requiredScope: 'Codespaces read/write on the GitHub token to start and stop it from Admin.',
        checkedAt: now,
        action: 'create_codespace',
      });
      blocking.push('Configure or create the Codespace.');
    } else {
      checks.push({
        key: 'codespace',
        label: 'Codespace',
        status: 'error',
        detail: `Codespace "${codespaceName}" was not found and no Codespace for this repository could be discovered.`,
        requiredEnv: CODESPACE_NAME_ENV,
        requiredScope: 'Codespaces read/write.',
        checkedAt: now,
        action: 'create_codespace',
      });
      blocking.push('Create the Codespace.');
    }
  } else {
    const running = ['Available', 'Starting', 'Rebuilding'].includes(codespace.state);
    const stale = Boolean(codespaceName && codespaceName !== codespace.name);
    const discovered = !codespaceName;
    const note = discovered
      ? ` Auto-discovered from the repository; set ${CODESPACE_NAME_ENV}=${codespace.name}.`
      : stale
        ? ` The configured name "${codespaceName}" is stale; the repository Codespace is used instead. Set ${CODESPACE_NAME_ENV}=${codespace.name}.`
        : '';
    checks.push({
      key: 'codespace',
      label: 'Codespace',
      status: running ? 'ok' : 'warn',
      detail: `${codespace.name} · ${codespace.state}${codespace.repository ? ` · ${codespace.repository}` : ''}${codespace.machine ? ` · ${codespace.machine}` : ''}. Start/stop permissions are verified when the action is used.${note}`,
      requiredEnv: discovered || stale ? CODESPACE_NAME_ENV : null,
      requiredScope: 'Codespaces write permission is required to start or stop.',
      checkedAt: now,
      action: running ? null : 'start_codespace',
      data: {
        state: codespace.state,
        machine: codespace.machine,
        repository: codespace.repository,
        resolvedName: codespace.name,
        configuredName: codespaceName,
      },
    });
    if (!running) blocking.push('Start the Codespace.');
  }

  const codespaceState = codespace?.state || null;
  const codespaceRepository = codespace?.repository || null;
  const codespaceMachine = codespace?.machine || null;

  const worker =
    workers.find((item) => item.online) ||
    workers.sort((a, b) => (b.heartbeatAgeSeconds || 0) - (a.heartbeatAgeSeconds || 0))[0] ||
    null;
  checks.push({
    key: 'worker',
    label: 'Worker registration',
    status: worker?.online ? 'ok' : worker ? 'error' : 'missing',
    detail: worker
      ? worker.online
        ? `${worker.name} (${worker.id}) is online. Last heartbeat ${worker.heartbeatAgeSeconds ?? '?'}s ago; lease holder ${worker.currentAttemptId ? 'yes' : 'no'}.`
        : `${worker.name} is offline. Last heartbeat ${worker.heartbeatAgeSeconds ?? '?'}s ago (offline threshold ${WORKER_OFFLINE_AFTER_SECONDS}s). The Codespace may be stopped.`
      : 'No worker has registered yet. Start the Codespace; the worker starts automatically after the container is ready.',
    requiredEnv: WORKER_TOKEN_ENV,
    requiredScope: null,
    checkedAt: now,
    action: 'start_codespace',
  });
  if (!worker?.online) blocking.push('The Codespace worker is not online.');

  const capabilities = worker?.capabilities || {};
  const opencodeAvailable = capabilities.opencodeAvailable === true;
  const opencodeAuthenticated = capabilities.opencodeAuthenticated === true;
  const minimumOpencode = (process.env.PIERROT_DEV_OPENCODE_MIN_VERSION || '2.1.4').trim();
  const versionMatch = String(capabilities.opencodeVersion || '').match(/(\d+)\.(\d+)\.(\d+)/);
  const minimumMatch = minimumOpencode.match(/(\d+)\.(\d+)\.(\d+)/);
  const versionAtLeastMinimum = Boolean(
    versionMatch &&
      minimumMatch &&
      Number(versionMatch[1]) * 10000 + Number(versionMatch[2]) * 100 + Number(versionMatch[3]) >=
        Number(minimumMatch[1]) * 10000 + Number(minimumMatch[2]) * 100 + Number(minimumMatch[3])
  );
  const capabilitiesCheckedAt =
    typeof capabilities.lastCheckedAt === 'string'
      ? new Date(capabilities.lastCheckedAt).getTime()
      : 0;
  const capabilitiesFresh =
    Number.isFinite(capabilitiesCheckedAt) &&
    Date.now() - capabilitiesCheckedAt < 15 * 60 * 1000;
  const opencodeReady =
    opencodeAvailable && opencodeAuthenticated && versionAtLeastMinimum && capabilitiesFresh;
  checks.push({
    key: 'opencode',
    label: 'OpenCode CLI',
    status: opencodeReady ? 'ok' : worker ? 'error' : 'missing',
    detail: worker
      ? opencodeAvailable
        ? `OpenCode ${String(capabilities.opencodeVersion || 'unknown')} detected in the Codespace (minimum ${minimumOpencode}). Stored provider authentication: ${opencodeAuthenticated ? 'available' : 'missing'}. Model: ${String(capabilities.opencodeModel || 'default')}. Last probe: ${capabilitiesFresh ? 'fresh' : 'stale — restart the worker or wait for its 10-minute refresh'}.`
        : 'OpenCode CLI is missing or was not reported by the worker.'
      : 'Not checked yet: the worker has not registered.',
    requiredEnv: 'PIERROT_DEV_OPENCODE_MODEL',
    requiredScope:
      'Run `opencode auth login` once inside the Codespace so credentials are stored, not passed via the worker environment.',
    checkedAt: now,
    action: null,
    data: {
      version: capabilities.opencodeVersion || null,
      minimum: minimumOpencode,
      model: capabilities.opencodeModel || null,
      lastCheckedAt: capabilities.lastCheckedAt || null,
    },
  });
  if (!opencodeReady) {
    blocking.push(
      'OpenCode CLI (at least ' +
        minimumOpencode +
        ') with stored provider authentication must be available in the Codespace.'
    );
  }

  const vercel = await getVercelIntegrationStatus('newlove');
  checks.push({
    key: 'vercel',
    label: 'Vercel integration',
    status: vercel.tokenConfigured && vercel.projectResolved ? 'ok' : 'warn',
    detail: vercel.tokenConfigured
      ? vercel.projectResolved
        ? 'Vercel deployment status can be read after merge.'
        : vercel.error || 'Vercel project is not resolved.'
      : vercel.error || 'Vercel token is not configured.',
    requiredEnv: vercel.tokenConfigured ? null : 'VERCEL_TOKEN',
    requiredScope: 'Read-only access to the Vercel project deployments.',
    checkedAt: now,
    action: null,
  });

  checks.push({
    key: 'queue',
    label: 'Queue state',
    status: paused ? 'warn' : 'ok',
    detail: paused
      ? 'The queue is paused. New tasks stay queued until it is resumed.'
      : 'The queue is running. At most one task executes at a time.',
    requiredEnv: null,
    requiredScope: null,
    checkedAt: now,
    action: null,
  });

  // Persist only the fact and timestamp of a successful check, never an error
  // body or a secret. Previous successes remain visible while a check is down.
  const previousSuccess = await getIntegrationSuccessMap();
  await Promise.all(
    checks
      .filter((check) => check.status === 'ok')
      .map((check) => recordIntegrationSuccess(check.key))
  );
  for (const check of checks) {
    check.lastSuccessAt =
      check.status === 'ok' ? now : previousSuccess[check.key] || null;
  }

  return {
    ready: blocking.length === 0,
    checks,
    blocking,
    codespaces: {
      available: Boolean(codespace && codespaceState),
      name: codespace?.name || codespaceName,
      state: codespaceState,
      repository: codespaceRepository,
      machine: codespaceMachine,
      canStart: codespaceState ? null : null,
      error: codespaceError,
    },
  };
}
