import { assertServerOnly } from '@/lib/serverOnly';
import {
  getGitHubRepository,
  getGitHubToken,
  isGitHubWriteEnabled,
  verifyGitHubAuth,
} from '@/lib/github';

assertServerOnly('lib/pierrot/dev/config');

export type DevRepoConfig = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  token: string | null;
  writesEnabled: boolean;
};

export function getDevRepoConfig(): DevRepoConfig {
  const repo = getGitHubRepository();

  return {
    ...repo,
    token: getGitHubToken(),
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
    writesEnabled: boolean;
  };
  vercel: {
    detected: boolean;
    tokenConfigured: boolean;
  };
};

export async function getDevIntegrationStatus(): Promise<DevIntegrationStatus> {
  const repo = getDevRepoConfig();
  const auth = await verifyGitHubAuth();

  return {
    github: {
      configured: Boolean(repo.token),
      authenticated: auth.authenticated,
      login: auth.login,
      authError: auth.error,
      repo: repo.fullName,
      defaultBranch: repo.defaultBranch,
      writesEnabled: repo.writesEnabled,
    },
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
