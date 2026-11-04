import { assertServerOnly } from '@/lib/serverOnly';
import { isGitHubWriteEnabled, verifyGitHubAuth } from '@/lib/github';
import {
  getDevRepositoryConfig,
  getDevRepositoryConfigs,
} from './repositories';
import { getDevRepositoryStatuses } from './repository';
import type { DevRepositoryStatus } from './types';

assertServerOnly('lib/pierrot/dev/config');

export type DevRepoConfig = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  token: string | null;
  writesEnabled: boolean;
};

/**
 * Backwards-compatible single-repository view. New code must use
 * getDevRepositoryConfigs() and pass an explicit repository.
 */
export function getDevRepoConfig(): DevRepoConfig {
  const repo = getDevRepositoryConfig('newlove');

  return {
    owner: repo.owner,
    repo: repo.repo,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    token: null,
    writesEnabled: isGitHubWriteEnabled(),
  };
}

export type DevIntegrationStatus = {
  github: {
    configured: boolean;
    authenticated: boolean;
    login: string | null;
    authError: string | null;
    repo: string;
    defaultBranch: string;
    /** Read-only policy: true only when explicitly enabled server-side. */
    writesEnabled: boolean;
    /** Dev Mode never exposes write tools to the model. */
    writeToolsAvailable: boolean;
  };
  repositories: DevRepositoryStatus[];
  vercel: {
    detected: boolean;
    tokenConfigured: boolean;
  };
};

export async function getDevIntegrationStatus(): Promise<DevIntegrationStatus> {
  const [auth, repositories] = await Promise.all([
    verifyGitHubAuth(),
    getDevRepositoryStatuses(),
  ]);
  const primary = repositories[0];

  return {
    github: {
      configured: getDevRepositoryConfigs().some((repo) => repo.configured),
      authenticated: auth.authenticated,
      login: auth.login,
      authError: auth.error,
      repo: primary?.fullName || 'merkurov1/newlove',
      defaultBranch: primary?.defaultBranch || 'main',
      writesEnabled: isGitHubWriteEnabled(),
      writeToolsAvailable: false,
    },
    repositories,
    vercel: {
      detected: Boolean(
        (process.env.VERCEL || '').trim() ||
          (process.env.VERCEL_URL || '').trim() ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim()
      ),
      tokenConfigured: Boolean((process.env.VERCEL_TOKEN || '').trim()),
    },
  };
}
