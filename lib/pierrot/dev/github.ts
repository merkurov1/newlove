import { assertServerOnly } from '@/lib/serverOnly';
import { getGitHubToken, isGitHubWriteEnabled } from '@/lib/github';
import { getDevRepositoryConfigs } from './repositories';
import { executeDevTool } from './tools';

assertServerOnly('lib/pierrot/dev/github');

/**
 * Legacy-compatible read-only wrapper.
 *
 * The current LLM orchestration uses executeDevTool directly. This wrapper is
 * kept for older callers and deliberately exposes no write operation.
 */
export function createGitHubTools() {
  if (!getGitHubToken()) {
    throw new Error('GITHUB_TOKEN is not configured.');
  }

  return {
    status: {
      repositories: getDevRepositoryConfigs().map((repo) => ({
        key: repo.key,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        workBranch: repo.workBranch,
      })),
      writesEnabled: isGitHubWriteEnabled(),
      writeToolsAvailable: false,
    },
    execute: async (name: string, args: Record<string, unknown>) => {
      const execution = await executeDevTool(name, args);
      return execution.result;
    },
  };
}
