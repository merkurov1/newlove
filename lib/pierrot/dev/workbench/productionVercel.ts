import { assertServerOnly } from '@/lib/serverOnly';
import { getDevRepositoryConfig } from '../repositories';
import type { DevRepositoryKey } from '../types';

assertServerOnly('lib/pierrot/dev/workbench/productionVercel');

/**
 * Minimal Vercel client for the owner-triggered production release.
 *
 * The release never deploys from local files and never accepts a client SHA.
 * It builds/finds an immutable preview deployment for the pinned main SHA and
 * promotes that exact deployment to production with the supported Vercel
 * promote endpoint. Promote does not rebuild the artifact.
 */

const API = 'https://api.vercel.com';
const REQUEST_TIMEOUT_MS = 20_000;

export type VercelProject = {
  id: string;
  name: string;
  repoId: string | null;
  repo: string | null;
  org: string | null;
  productionBranch: string | null;
  teamId: string | null;
};

export type VercelReleaseConfig = {
  project: VercelProject;
  token: string;
  teamId: string | null;
};

export type VercelDeployment = {
  id: string;
  url: string | null;
  state: string;
  target: string | null;
  commitSha: string | null;
  createdAt: number | null;
  readyAt: number | null;
  errorMessage: string | null;
};

export class VercelReleaseError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'VercelReleaseError';
    this.code = code;
    this.status = status;
  }
}

function token(): string {
  return (process.env.VERCEL_TOKEN || '').trim();
}

function teamId(): string | null {
  return (process.env.VERCEL_TEAM_ID || '').trim() || null;
}

function withTeam(url: string): string {
  const id = teamId();
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(id)}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string } | string;
      message?: string;
    };
    const message =
      typeof body.error === 'string'
        ? body.error
        : body.error?.message || body.message || response.statusText;
    return String(message || 'Vercel request failed.').slice(0, 600);
  } catch {
    return `${response.status} ${response.statusText}`.trim().slice(0, 600);
  }
}

async function vercelFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const authToken = token();
  if (!authToken) {
    throw new VercelReleaseError(
      'VERCEL_TOKEN_MISSING',
      'VERCEL_TOKEN is not configured, so the release cannot create or promote a deployment.'
    );
  }
  try {
    return await fetch(withTeam(`${API}${pathname}`), {
      ...init,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    throw new VercelReleaseError(
      'VERCEL_UNREACHABLE',
      error instanceof Error
        ? `Vercel request failed: ${error.message.slice(0, 400)}`
        : 'Vercel request failed.'
    );
  }
}

function mapProject(body: Record<string, unknown>): VercelProject {
  const link = (
    body.link && typeof body.link === 'object' ? (body.link as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  return {
    id: String(body.id || ''),
    name: String(body.name || ''),
    repoId: link.repoId ? String(link.repoId) : null,
    repo: link.repo ? String(link.repo) : null,
    org: link.org ? String(link.org) : null,
    productionBranch: link.productionBranch ? String(link.productionBranch) : null,
    teamId: body.teamId ? String(body.teamId) : teamId(),
  };
}

async function fetchProject(idOrName: string): Promise<VercelProject> {
  const response = await vercelFetch(
    `/v9/projects/${encodeURIComponent(idOrName)}?rollbackInfo=true`
  );
  if (!response.ok) {
    throw new VercelReleaseError(
      response.status === 404 ? 'VERCEL_PROJECT_NOT_FOUND' : 'VERCEL_PROJECT_READ_FAILED',
      await readError(response),
      response.status
    );
  }
  return mapProject((await response.json()) as Record<string, unknown>);
}

/**
 * Resolve the linked Vercel project and verify it belongs to this repository.
 * A mismatched project is a hard blocker: promoting the wrong project would be
 * worse than not releasing.
 */
export async function resolveVercelReleaseProject(
  repository: DevRepositoryKey = 'newlove'
): Promise<
  { ok: true; config: VercelReleaseConfig } | { ok: false; blocker: string; code: string }
> {
  if (!token()) {
    return {
      ok: false,
      code: 'VERCEL_TOKEN_MISSING',
      blocker:
        'VERCEL_TOKEN is not configured. Production release needs a Vercel token that can read deployments and promote preview deployments.',
    };
  }
  const repo = getDevRepositoryConfig(repository);
  const configuredProject = (process.env.VERCEL_PROJECT_ID || '').trim();
  try {
    let project: VercelProject | null = null;
    if (configuredProject) {
      project = await fetchProject(configuredProject);
    } else {
      const response = await vercelFetch('/v9/projects?limit=100');
      if (!response.ok) {
        return {
          ok: false,
          code: 'VERCEL_PROJECT_LIST_FAILED',
          blocker: `Vercel project list failed: ${await readError(response)} Set VERCEL_PROJECT_ID to skip discovery.`,
        };
      }
      const body = (await response.json()) as { projects?: Array<Record<string, unknown>> };
      const candidate = (body.projects || []).find((item) => {
        const link = (
          item.link && typeof item.link === 'object' ? (item.link as Record<string, unknown>) : {}
        ) as Record<string, unknown>;
        return (
          String(link.repo || '').toLowerCase() === repo.repo.toLowerCase() &&
          String(item.name || '').toLowerCase() === repo.repo.toLowerCase()
        );
      });
      if (!candidate) {
        return {
          ok: false,
          code: 'VERCEL_PROJECT_NOT_FOUND',
          blocker: `No Vercel project matched ${repo.fullName}. Set VERCEL_PROJECT_ID explicitly.`,
        };
      }
      project = mapProject(candidate);
    }

    if (!project.id) {
      return {
        ok: false,
        code: 'VERCEL_PROJECT_NOT_FOUND',
        blocker: 'Vercel returned no project id. Check VERCEL_PROJECT_ID and VERCEL_TOKEN.',
      };
    }
    if (project.repo && project.repo.toLowerCase() !== repo.repo.toLowerCase()) {
      return {
        ok: false,
        code: 'VERCEL_PROJECT_MISMATCH',
        blocker: `Vercel project ${project.name || project.id} is linked to ${project.org || '?'}/${project.repo}, not ${repo.fullName}. Refusing to release.`,
      };
    }
    if (!project.repoId) {
      return {
        ok: false,
        code: 'VERCEL_REPO_ID_MISSING',
        blocker:
          'The Vercel project has no linked Git repository id, so an immutable deployment for the pinned SHA cannot be requested.',
      };
    }
    return {
      ok: true,
      config: { project, token: token(), teamId: project.teamId || teamId() },
    };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof VercelReleaseError ? error.code : 'VERCEL_PROJECT_READ_FAILED',
      blocker: error instanceof Error ? error.message.slice(0, 600) : 'Vercel project read failed.',
    };
  }
}

function mapDeployment(body: Record<string, unknown>): VercelDeployment {
  const meta = (
    body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  const rawUrl = body.url ? String(body.url) : null;
  return {
    id: String(body.id || body.uid || ''),
    url: rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : null,
    state: String(body.readyState || body.state || 'UNKNOWN').toUpperCase(),
    target: body.target ? String(body.target) : null,
    commitSha: meta.githubCommitSha ? String(meta.githubCommitSha) : null,
    createdAt:
      typeof body.createdAt === 'number'
        ? body.createdAt
        : typeof body.createdAt === 'string'
          ? Number(body.createdAt) || null
          : null,
    readyAt:
      typeof body.readyAt === 'number'
        ? body.readyAt
        : typeof body.readyAt === 'string'
          ? Number(body.readyAt) || null
          : null,
    errorMessage: body.errorMessage ? String(body.errorMessage) : null,
  };
}

export async function getVercelDeployment(
  config: VercelReleaseConfig,
  deploymentId: string
): Promise<VercelDeployment> {
  const response = await vercelFetch(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
  if (!response.ok) {
    throw new VercelReleaseError(
      'VERCEL_DEPLOYMENT_READ_FAILED',
      await readError(response),
      response.status
    );
  }
  return mapDeployment((await response.json()) as Record<string, unknown>);
}

export async function findReadyPreviewDeployment(
  config: VercelReleaseConfig,
  sha: string
): Promise<VercelDeployment | null> {
  const response = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(config.project.id)}&limit=100`
  );
  if (!response.ok) {
    throw new VercelReleaseError(
      'VERCEL_DEPLOYMENT_LIST_FAILED',
      await readError(response),
      response.status
    );
  }
  const body = (await response.json()) as { deployments?: Array<Record<string, unknown>> };
  const matches = (body.deployments || [])
    .map(mapDeployment)
    .filter(
      (deployment) =>
        deployment.commitSha?.toLowerCase() === sha.toLowerCase() &&
        deployment.target !== 'production'
    );
  return matches.find((deployment) => deployment.state === 'READY') || matches[0] || null;
}

export async function createPreviewDeployment(
  config: VercelReleaseConfig,
  sha: string
): Promise<VercelDeployment> {
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new VercelReleaseError('VERCEL_INVALID_SHA', 'A full 40-character SHA is required.');
  }
  const response = await vercelFetch(
    '/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1',
    {
      method: 'POST',
      body: JSON.stringify({
        name: config.project.name,
        project: config.project.id,
        gitSource: {
          type: 'github',
          ref: sha,
          sha,
          repoId: config.project.repoId,
        },
        meta: {
          pierrotReleasePinnedSha: sha,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new VercelReleaseError(
      'VERCEL_PREVIEW_CREATE_FAILED',
      await readError(response),
      response.status
    );
  }
  return mapDeployment((await response.json()) as Record<string, unknown>);
}

export async function promoteDeployment(
  config: VercelReleaseConfig,
  deploymentId: string
): Promise<void> {
  const response = await vercelFetch(
    `/v10/projects/${encodeURIComponent(config.project.id)}/promote/${encodeURIComponent(
      deploymentId
    )}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new VercelReleaseError(
      'VERCEL_PROMOTE_FAILED',
      await readError(response),
      response.status
    );
  }
}

export async function rollbackProduction(
  config: VercelReleaseConfig,
  deploymentId: string
): Promise<void> {
  const response = await vercelFetch(
    `/v1/projects/${encodeURIComponent(config.project.id)}/rollback/${encodeURIComponent(
      deploymentId
    )}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new VercelReleaseError(
      'VERCEL_ROLLBACK_FAILED',
      await readError(response),
      response.status
    );
  }
}
