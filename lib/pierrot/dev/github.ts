import { assertServerOnly } from '@/lib/serverOnly';
import {
  createOrUpdateFile,
  createPullRequest,
  getGitHubRepository,
  getGitHubToken,
  getRepoStructure,
  isGitHubWriteEnabled,
  readFileContent,
  GitHubError,
} from '@/lib/github';

assertServerOnly('lib/pierrot/dev/github');

function errorPayload(error: unknown): {
  error: string;
  code?: string;
  status?: number;
} {
  if (error instanceof GitHubError) {
    return {
      error: error.message,
      code: error.code,
      ...(error.status !== null ? { status: error.status } : {}),
    };
  }

  return {
    error: error instanceof Error ? error.message : 'GitHub request failed.',
  };
}

/**
 * LLM Tool wrapper around the shared server-side GitHub client.
 * The model never receives the token and cannot choose another repository.
 */
export function createGitHubTools() {
  if (!getGitHubToken()) {
    throw new Error('GITHUB_TOKEN is not configured.');
  }

  const repo = getGitHubRepository();

  return {
    status: {
      repo: repo.fullName,
      defaultBranch: repo.defaultBranch,
      writesEnabled: isGitHubWriteEnabled(),
    },
    execute: async (name: string, args: Record<string, unknown>) => {
      try {
        switch (name) {
          case 'get_repo_structure':
            return await getRepoStructure(args.path, undefined);
          case 'read_file_content':
            return await readFileContent(args.path, undefined);
          case 'create_or_update_file':
            return await createOrUpdateFile({
              path: args.path,
              content: args.content,
              message: args.message,
              branch: args.branch,
            });
          case 'create_pull_request':
            return await createPullRequest({
              title: args.title,
              head: args.head,
              base: args.base,
              body: args.body,
            });
          default:
            return { error: `Unknown GitHub tool: ${name}` };
        }
      } catch (error) {
        return errorPayload(error);
      }
    },
  };
}
