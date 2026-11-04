import { assertServerOnly } from '@/lib/serverOnly';
import type OpenAI from 'openai';
import {
  compareRefs,
  getCheckRuns,
  getCommit,
  getPullRequest,
  getRepoInfo,
  getRepoTree,
  getWorkflowRuns,
  listBranches,
  listCommits,
  listPullRequests,
  readFile,
  readFileRange,
  searchRepo,
  DevRepoError,
} from './repository';
import type { DevToolTraceEntry } from './types';

assertServerOnly('lib/pierrot/dev/tools');

export const DEV_TOOL_NAMES = [
  'get_repo_info',
  'get_repo_tree',
  'search_repo',
  'read_file',
  'read_file_range',
  'list_branches',
  'list_commits',
  'get_commit',
  'compare_refs',
  'list_pull_requests',
  'get_pull_request',
  'get_workflow_runs',
  'get_check_runs',
] as const;

export type DevToolName = (typeof DEV_TOOL_NAMES)[number];

const repositoryParam = {
  type: 'string',
  enum: ['newlove', 'pierrot'],
  description:
    'Repository to inspect. "newlove" is the Next.js platform; "pierrot" is the Expo mobile client. Never mix results.',
};

const refParam = {
  type: 'string',
  description: 'Branch name or commit SHA. Defaults to the configured work branch.',
};

function tool(
  name: DevToolName,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = ['repository']
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: {
          repository: repositoryParam,
          ...properties,
        },
        required,
        additionalProperties: false,
      },
    },
  };
}

export function devToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    tool('get_repo_info', 'Repository metadata, default branch and latest commit SHA.', {}),
    tool(
      'get_repo_tree',
      'List files and directories at a repository path. Use recursive only when a full tree is genuinely required.',
      {
        path: { type: 'string', description: 'Repository-relative directory. Empty means root.' },
        ref: refParam,
        recursive: { type: 'boolean', description: 'Use GitHub recursive tree (bounded).' },
      }
    ),
    tool(
      'search_repo',
      'Search repository code or filenames. GitHub code search is scoped to one repository.',
      {
        query: { type: 'string', description: 'Text to search for.' },
        mode: { type: 'string', enum: ['code', 'filename'], description: 'Search mode.' },
        path: { type: 'string', description: 'Optional path prefix filter.' },
        filename: { type: 'string', description: 'Optional filename filter.' },
        ref: refParam,
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
      ['repository', 'query']
    ),
    tool(
      'read_file',
      'Read one UTF-8 file. Large files are truncated with an explicit warning.',
      {
        path: { type: 'string', description: 'Repository-relative file path.' },
        ref: refParam,
      },
      ['repository', 'path']
    ),
    tool(
      'read_file_range',
      'Read an inclusive 1-based line range from one file. Maximum 400 lines.',
      {
        path: { type: 'string', description: 'Repository-relative file path.' },
        startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
        ref: refParam,
      },
      ['repository', 'path', 'startLine']
    ),
    tool('list_branches', 'List repository branches with their head commit SHA.', {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
    tool('list_commits', 'List recent commits on a branch, optionally filtered by path.', {
      ref: refParam,
      path: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }),
    tool('get_commit', 'Read one commit and its bounded file diff.', { ref: refParam }, [
      'repository',
      'ref',
    ]),
    tool(
      'compare_refs',
      'Compare two refs and return commits and a bounded diff. Use this to review changes.',
      {
        base: { type: 'string', description: 'Base branch or SHA.' },
        head: { type: 'string', description: 'Head branch or SHA.' },
      },
      ['repository', 'base', 'head']
    ),
    tool('list_pull_requests', 'List pull requests, optionally filtered by base or head.', {
      state: { type: 'string', enum: ['open', 'closed', 'all'] },
      base: { type: 'string' },
      head: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }),
    tool(
      'get_pull_request',
      'Read one pull request with a bounded file diff.',
      {
        number: { type: 'integer', minimum: 1 },
        includeFiles: { type: 'boolean' },
      },
      ['repository', 'number']
    ),
    tool('get_workflow_runs', 'Read recent GitHub Actions workflow runs.', {
      branch: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }),
    tool('get_check_runs', 'Read check runs and combined commit status for a ref.', {
      ref: refParam,
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }),
  ];
}

export type DevToolExecution = {
  name: string;
  ok: boolean;
  result: unknown;
  trace: DevToolTraceEntry;
};

function errorPayload(error: unknown): {
  error: string;
  code: string;
  status: number | null;
} {
  if (error instanceof DevRepoError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      error: String((error as { message?: unknown }).message || 'Tool failed.'),
      code: 'TOOL_ERROR',
      status: null,
    };
  }
  return { error: 'Tool failed.', code: 'TOOL_ERROR', status: null };
}

export function summarizeToolResult(name: string, result: unknown): string {
  if (!result || typeof result !== 'object') return 'ok';
  const record = result as Record<string, unknown>;
  const repository = typeof record.repository === 'string' ? record.repository : null;
  const prefix = repository ? `${repository} · ` : '';

  if (name === 'get_repo_info') {
    const info = record.info as { defaultBranch?: string } | undefined;
    const commit = (record.latestCommit as { sha?: string } | undefined)?.sha;
    return `${prefix}${info?.defaultBranch || 'repo'}${commit ? ` @ ${commit.slice(0, 7)}` : ''}`;
  }
  if (name === 'get_repo_tree') {
    const entries = Array.isArray(record.entries) ? record.entries.length : 0;
    return `${prefix}${entries} entries${record.truncated ? ' (truncated)' : ''}`;
  }
  if (name === 'search_repo') {
    const matches = Array.isArray(record.matches) ? record.matches.length : 0;
    return `${prefix}${matches} matches${record.incomplete ? ' (incomplete)' : ''}`;
  }
  if (name === 'read_file') {
    const path = typeof record.path === 'string' ? record.path : 'file';
    const lines = typeof record.lineCount === 'number' ? ` · ${record.lineCount} lines` : '';
    return `${prefix}${path}${lines}${record.truncated ? ' (truncated)' : ''}`;
  }
  if (name === 'read_file_range') {
    const path = typeof record.path === 'string' ? record.path : 'file';
    return `${prefix}${path}:${record.startLine}-${record.endLine}`;
  }
  if (name === 'list_branches') {
    const branches = Array.isArray(record.branches) ? record.branches.length : 0;
    return `${prefix}${branches} branches`;
  }
  if (name === 'list_commits') {
    const commits = Array.isArray(record.commits) ? record.commits.length : 0;
    return `${prefix}${commits} commits`;
  }
  if (name === 'get_commit') {
    const sha = typeof record.sha === 'string' ? record.sha.slice(0, 7) : 'commit';
    const files = Array.isArray(record.files) ? record.files.length : 0;
    return `${prefix}${sha} · ${files} files`;
  }
  if (name === 'compare_refs') {
    const files = Array.isArray(record.files) ? record.files.length : 0;
    const commits = typeof record.totalCommits === 'number' ? record.totalCommits : 0;
    return `${prefix}${commits} commits · ${files} files`;
  }
  if (name === 'list_pull_requests') {
    const pulls = Array.isArray(record.pullRequests) ? record.pullRequests.length : 0;
    return `${prefix}${pulls} pull requests`;
  }
  if (name === 'get_pull_request') {
    const number = typeof record.number === 'number' ? `#${record.number}` : 'PR';
    return `${prefix}${number} · ${Array.isArray(record.files) ? record.files.length : 0} files`;
  }
  if (name === 'get_workflow_runs') {
    return `${prefix}${Array.isArray(record.runs) ? record.runs.length : 0} workflow runs`;
  }
  if (name === 'get_check_runs') {
    return `${prefix}${Array.isArray(record.checks) ? record.checks.length : 0} checks`;
  }

  return prefix ? `${prefix}ok` : 'ok';
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function repoArg(value: unknown): unknown {
  return typeof value === 'string' ? value : undefined;
}

export function isDevWriteTool(name: string): boolean {
  // Dev Mode deliberately exposes no write tools. This stays as an explicit
  // guard for future write support.
  return name === 'create_or_update_file' || name === 'create_pull_request';
}

export async function executeDevTool(
  name: string,
  args: Record<string, unknown>
): Promise<DevToolExecution> {
  const startedAt = Date.now();

  try {
    if (isDevWriteTool(name)) {
      throw new DevRepoError(
        'GITHUB_AUTH_FAILED',
        'Write tools are not available in read-only Dev Mode.'
      );
    }

    let result: unknown;

    switch (name) {
      case 'get_repo_info':
        result = await getRepoInfo({
          repository: repoArg(args.repository),
          ref: args.ref,
        });
        break;
      case 'get_repo_tree':
        result = await getRepoTree({
          repository: repoArg(args.repository),
          path: args.path,
          ref: args.ref,
          recursive: args.recursive,
        });
        break;
      case 'search_repo':
        result = await searchRepo({
          repository: repoArg(args.repository),
          query: args.query,
          mode: args.mode,
          path: args.path,
          filename: args.filename,
          ref: args.ref,
          limit: numeric(args.limit),
        });
        break;
      case 'read_file':
        result = await readFile({
          repository: repoArg(args.repository),
          path: args.path,
          ref: args.ref,
        });
        break;
      case 'read_file_range':
        result = await readFileRange({
          repository: repoArg(args.repository),
          path: args.path,
          ref: args.ref,
          startLine: numeric(args.startLine),
          endLine: numeric(args.endLine),
        });
        break;
      case 'list_branches':
        result = await listBranches({
          repository: repoArg(args.repository),
          limit: numeric(args.limit),
        });
        break;
      case 'list_commits':
        result = await listCommits({
          repository: repoArg(args.repository),
          ref: args.ref,
          path: args.path,
          limit: numeric(args.limit),
        });
        break;
      case 'get_commit':
        result = await getCommit({
          repository: repoArg(args.repository),
          ref: args.ref,
        });
        break;
      case 'compare_refs':
        result = await compareRefs({
          repository: repoArg(args.repository),
          base: args.base,
          head: args.head,
        });
        break;
      case 'list_pull_requests':
        result = await listPullRequests({
          repository: repoArg(args.repository),
          state: args.state,
          base: args.base,
          head: args.head,
          limit: numeric(args.limit),
        });
        break;
      case 'get_pull_request':
        result = await getPullRequest({
          repository: repoArg(args.repository),
          number: args.number,
          includeFiles: args.includeFiles,
        });
        break;
      case 'get_workflow_runs':
        result = await getWorkflowRuns({
          repository: repoArg(args.repository),
          branch: args.branch,
          limit: numeric(args.limit),
        });
        break;
      case 'get_check_runs':
        result = await getCheckRuns({
          repository: repoArg(args.repository),
          ref: args.ref,
          limit: numeric(args.limit),
        });
        break;
      default:
        throw new DevRepoError(
          'GITHUB_API_ERROR',
          `Unknown Dev tool: ${name}.`
        );
    }

    const record = result as Record<string, unknown>;
    const meta = {
      repository: String(record.repository || ''),
      branch: String(record.branch || ''),
      commitSha:
        typeof record.commitSha === 'string' ? record.commitSha : null,
      complete: record.complete !== false,
      source: 'github' as const,
      ...(Array.isArray(record.warnings) && record.warnings.length > 0
        ? { warnings: record.warnings.map(String) }
        : {}),
    };

    return {
      name,
      ok: true,
      result,
      trace: {
        name,
        repository: meta.repository || null,
        ok: true,
        durationMs: Date.now() - startedAt,
        summary: summarizeToolResult(name, result),
        meta,
      },
    };
  } catch (error) {
    const payload = errorPayload(error);
    return {
      name,
      ok: false,
      result: {
        error: payload.error,
        code: payload.code,
        complete: false,
        source: 'github',
      },
      trace: {
        name,
        repository:
          typeof args.repository === 'string' ? args.repository : null,
        ok: false,
        durationMs: Date.now() - startedAt,
        summary: payload.error,
        meta: null,
        errorCode: payload.code,
      },
    };
  }
}
