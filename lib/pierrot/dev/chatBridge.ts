import { assertServerOnly } from '@/lib/serverOnly';
import type { DevRepoResult } from './repository';
import {
  detectDevProjectContext,
  getDevProjectContext,
  getDevRepositoryConfigs,
  resolveDevRepository,
} from './repositories';
import type { DevProjectContext, DevProjectContextKey, DevRepositoryKey } from './types';
import type { PendingGitHubOperationKind } from './pendingOperations';

assertServerOnly('lib/pierrot/dev/chatBridge');

export type GitHubChatOperation =
  | 'status'
  | 'repo_overview'
  | 'search'
  | 'commits'
  | 'compare'
  | 'issues'
  | 'issue'
  | 'pull_requests'
  | 'pull_request'
  | 'workflows'
  | 'checks'
  | 'create_issue'
  | 'create_branch'
  | 'create_pull_request'
  | 'create_or_update_file'
  | 'update_issue_state'
  | 'add_issue_comment';

export type GitHubChatIntent = {
  operation: GitHubChatOperation;
  /** Repository explicitly named by the owner, if any. */
  repository: DevRepositoryKey | null;
  context: DevProjectContext | null;
  /** True for operations that must be confirmed before writing. */
  requiresConfirmation: boolean;
  number: number | null;
  query: string | null;
  branch: string | null;
  head: string | null;
  base: string | null;
  title: string | null;
  body: string | null;
  path: string | null;
  content: string | null;
  issueState: 'open' | 'closed' | null;
};

const WRITE_OPERATIONS = new Set<GitHubChatOperation>([
  'create_issue',
  'create_branch',
  'create_pull_request',
  'create_or_update_file',
  'update_issue_state',
  'add_issue_comment',
]);

const CONFIRM_PATTERN =
  /^(?:да[,!.\s]+)?(?:подтверждаю|подтверди|выполняй|выполни|создавай|создай|применяй|apply|confirm|yes|go ahead|do it|proceed|execute)[.!]?$/i;
const CANCEL_PATTERN =
  /^(?:нет[,!.\s]+)?(?:отмен(?:а|и|ите)|не надо|не выполняй|cancel|no|stop|abort)[.!]?$/i;

export function isGitHubConfirmation(message: string): boolean {
  return CONFIRM_PATTERN.test(message.trim());
}

export function isGitHubCancellation(message: string): boolean {
  return CANCEL_PATTERN.test(message.trim());
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function extractNumber(text: string): number | null {
  const match =
    text.match(/#\s*(\d+)/) ||
    text.match(/(?:issue|ишью|проблем[аы]?|pr|pull request|пул.?реквест)\s*[№#:]?\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractQuoted(text: string): string | null {
  const match = text.match(/[«"“']([^»"”']{3,240})[»"”']/) || text.match(/`([^`]{3,240})`/);
  return match ? match[1].trim() : null;
}

function stripCommand(text: string): string {
  return text
    .replace(
      /^(?:пожалуйста[,\s]*)?(?:создай|создать|открой|заведи|добавь|оставь|закрой|обнови|измени|найди|покажи|посмотри|проверь|сравни|create|open|add|leave|close|update|find|show|check|compare)\s+/i,
      ''
    )
    .replace(
      /^(?:мне\s+)?(?:issue|ишью|задачу|pull request|pr|ветку|branch|комментарий|comment)\s*/i,
      ''
    )
    .trim();
}

function extractBranchName(text: string): string | null {
  const explicit =
    text.match(/(?:ветк[ауи]\s+|branch\s+)([A-Za-z0-9._/-]{2,120})/i) ||
    text.match(/`([A-Za-z0-9._/-]{2,120})`/);
  return explicit ? explicit[1] : null;
}

function extractPath(text: string): string | null {
  const match =
    text.match(/(?:файл|file)\s+`?([A-Za-z0-9._/-]{2,240})`?/i) ||
    text.match(/`([A-Za-z0-9._/-]+\.[A-Za-z0-9]+)`/);
  return match ? match[1] : null;
}

/**
 * Pure, deterministic intent detection. It never calls GitHub and never
 * executes a write. Ambiguous write requests are still reported as writes and
 * the caller must ask for the missing fields.
 */
export function detectGitHubChatIntent(message: string): GitHubChatIntent | null {
  const text = message.trim();
  const normalized = normalize(text);
  if (!normalized) return null;

  const context = detectDevProjectContext(text);
  const repository = context?.repository ?? null;
  const number = extractNumber(text);
  const quoted = extractQuoted(text);
  const branch = extractBranchName(text);
  const path = extractPath(text);

  const codeResearchHint =
    /(?:реализован|переключен|компонент|функци|файл|код|api|маршрут|route|языков|локализац|deployment|ошибк)/i.test(
      normalized
    );
  const mentionsGitHub =
    /\b(?:github|repo|repository|commit|issues?|pull request|pr|workflow|ci|deploy(?:ment)?|branch)\b/i.test(
      text
    ) ||
    /(?:ветк|репозитор|коммит|ишью|пул.?реквест|деплой|гитхаб)/i.test(normalized) ||
    (codeResearchHint && /(?:найди|где|почему|как|why|where|how)/i.test(normalized));
  if (!mentionsGitHub && !context) return null;

  const readIntent = (operation: GitHubChatOperation): GitHubChatIntent => ({
    operation,
    repository,
    context,
    requiresConfirmation: false,
    number: null,
    query: null,
    branch: null,
    head: null,
    base: null,
    title: null,
    body: null,
    path: null,
    content: null,
    issueState: null,
  });

  // Write intents take precedence over read intents.
  if (
    /(?:созда(?:й|ть)|открой|заведи|create|open|file)\s+(?:нов(?:ый|ую)\s+)?(?:issue|ишью)/i.test(
      normalized
    ) ||
    /(?:issue|ишью)\s+(?:с|about|про)\b/i.test(normalized)
  ) {
    const titleSource = text
      .replace(/^.*?(?:issue|ишью)\s*(?:с\s+(?:описанием|названием)|about|про|:)?\s*/i, '')
      .trim();
    return {
      operation: 'create_issue',
      repository,
      context,
      requiresConfirmation: true,
      number: null,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: quoted || titleSource || null,
      body: text,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (
    /(?:созда(?:й|ть)|открой|create|open)\s+.*(?:pull request|pr\b|пул.?реквест)/i.test(normalized)
  ) {
    return {
      operation: 'create_pull_request',
      repository,
      context,
      requiresConfirmation: true,
      number: null,
      query: null,
      branch: null,
      head: branch,
      base: null,
      title: quoted || stripCommand(text) || null,
      body: text,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (
    /(?:созда(?:й|ть)|create)\s+.*(?:ветк|branch)|(?:ветк|branch)\s+.*(?:созда|create)/i.test(
      normalized
    )
  ) {
    return {
      operation: 'create_branch',
      repository,
      context,
      requiresConfirmation: true,
      number: null,
      query: null,
      branch,
      head: null,
      base: null,
      title: null,
      body: text,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/(?:обнови|измени|создай)\s+(?:файл|file)|(?:update|create|write)\s+file/i.test(normalized)) {
    return {
      operation: 'create_or_update_file',
      repository,
      context,
      requiresConfirmation: true,
      number: null,
      query: null,
      branch,
      head: null,
      base: null,
      title: null,
      body: text,
      path,
      content: null,
      issueState: null,
    };
  }

  if (
    /(?:добавь|оставь|add|leave)\s+.*(?:комментар|comment).*(?:issue|ишью|#\d+)/i.test(normalized)
  ) {
    return {
      operation: 'add_issue_comment',
      repository,
      context,
      requiresConfirmation: true,
      number,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: quoted || stripCommand(text) || null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/(?:закрой|close)\s+.*(?:issue|ишью|#\d+)/i.test(normalized)) {
    return {
      operation: 'update_issue_state',
      repository,
      context,
      requiresConfirmation: true,
      number,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: 'closed',
    };
  }

  // Natural audit/sync language ("аудит обновлений", "синхронизируй задачи",
  // "посмотри, что сделано") must reach GitHub reads, not memory completion or
  // a generic model refusal.
  if (
    /(?:аудит|audit|обновлен|update|синхрониз|sync|что\s+сделано|what.*done|посмотри|review)/i.test(
      normalized
    )
  ) {
    return readIntent('repo_overview');
  }

  const githubTaskRequest =
    mentionsGitHub &&
    /(?:задач[аиу]?|tasks?)/i.test(normalized) &&
    !/(?:найди|поиск|search|find|locate|где\s)/i.test(normalized);

  if (/\bissues?\b|ишью|проблем[аы]/i.test(normalized) || githubTaskRequest) {
    return {
      operation: number ? 'issue' : 'issues',
      repository,
      context,
      requiresConfirmation: false,
      number,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/\bpull request|\bpr\b|пул.?реквест/i.test(normalized)) {
    return {
      operation: number ? 'pull_request' : 'pull_requests',
      repository,
      context,
      requiresConfirmation: false,
      number,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/deploy(?:ment)?|деплой|workflow|github actions|пайплайн/i.test(normalized)) {
    return {
      operation: 'workflows',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/\bchecks?\b|статус.*(?:ci|провер)|(?:ci|провер).*статус/i.test(normalized)) {
    return {
      operation: 'checks',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (
    /(?:сравн|compare|diff|разниц)/i.test(normalized) &&
    /commit|коммит|ветк|branch/i.test(normalized)
  ) {
    return {
      operation: 'compare',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (/commit|коммит/i.test(normalized)) {
    return {
      operation: 'commits',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  if (
    /(?:найди|где\s+(?:реализован|находит|лежит|использует)|поиск|search|find|locate|why|почему)/i.test(
      normalized
    )
  ) {
    const query = quoted || stripCommand(text);
    return {
      operation: 'search',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query,
      branch,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  // "Включи/подключи GitHub", "доступ к GitHub", "статус GitHub" are
  // connection-status questions, not write requests. Keep this after search so
  // "найди задачу включить github" remains a code search.
  if (
    /(?:подключ|connect|включ|enable|настро|setup|доступ|access|статус|status)/i.test(normalized)
  ) {
    return readIntent('status');
  }

  if (
    /что происходит|что нового|статус|состояни|покажи\s+(?:структур|дерево|обзор)|what.*happening|overview|structure/i.test(
      normalized
    )
  ) {
    return {
      operation: 'repo_overview',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  // A repository or project was named but no explicit operation was
  // understood: treat it as an overview, never as a write.
  if (context) {
    return {
      operation: 'repo_overview',
      repository,
      context,
      requiresConfirmation: false,
      number: null,
      query: null,
      branch: null,
      head: null,
      base: null,
      title: null,
      body: null,
      path: null,
      content: null,
      issueState: null,
    };
  }

  return null;
}

export function githubContextFor(key: DevProjectContextKey): DevProjectContext {
  return getDevProjectContext(key);
}

export function resolveGitHubRepository(intent: GitHubChatIntent): DevRepositoryKey {
  return resolveDevRepository(intent.repository || intent.context?.repository || 'newlove').key;
}

function shortSha(value: string | null | undefined): string {
  return typeof value === 'string' && value ? value.slice(0, 7) : '—';
}

function repositoryHeader(result: {
  repository: string;
  branch?: string;
  commitSha?: string | null;
}): string {
  return `${result.repository} · ${result.branch || '—'} · ${shortSha(result.commitSha)}`;
}

function link(label: string, url: string | null | undefined): string {
  return url ? `[${label}](${url})` : label;
}

export type GitHubChatResult = {
  text: string;
  operation: GitHubChatOperation;
  repository: string;
  branch: string | null;
  commitSha: string | null;
  links: string[];
};

function resultFrom<T>(
  operation: GitHubChatOperation,
  data: DevRepoResult<T>,
  text: string,
  links: string[] = []
): GitHubChatResult {
  return {
    text: `${repositoryHeader(data)}\n\n${text}`,
    operation,
    repository: data.repository,
    branch: data.branch,
    commitSha: data.commitSha,
    links,
  };
}

/**
 * Executes the deterministic read operations. Returns null when the request
 * requires language reasoning (for example a Russian code-search question) and
 * should be handed to the existing read-only Dev model.
 */
export async function runGitHubReadIntent(
  intent: GitHubChatIntent,
  options: { repository?: DevRepositoryKey } = {}
): Promise<GitHubChatResult | null> {
  const repository = options.repository || resolveGitHubRepository(intent);
  const context = intent.context;
  // Keep the Octokit dependency out of modules that only detect or format
  // intent. It is loaded only when a real GitHub read is executed.
  const {
    compareRefs,
    getCheckRuns,
    getIssue,
    getPullRequest,
    getRepoInfo,
    getRepoTree,
    getWorkflowRuns,
    listCommits,
    listIssues,
    listPullRequests,
    searchRepo,
  } = await import('./repository');

  if (intent.operation === 'status') {
    const info = await getRepoInfo({ repository });
    const configs = getDevRepositoryConfigs();
    const text = [
      'GitHub read access активен.',
      `Доступные репозитории: ${configs
        .map((repo) => `${repo.fullName}${repo.configured ? '' : ' (токен не настроен)'}`)
        .join(', ')}`,
      'Режим: read-only. Запись в GitHub не выполняется автоматически и требует отдельного подтверждения.',
    ].join('\n');
    return resultFrom('status', info, text, [info.info.htmlUrl]);
  }

  if (intent.operation === 'repo_overview') {
    const info = await getRepoInfo({ repository });
    const paths = context?.paths.length ? context.paths : [''];
    const trees = await Promise.all(
      paths
        .slice(0, 3)
        .map((path) =>
          getRepoTree({ repository, path: path.replace(/\/$/, ''), ref: info.branch }).catch(
            () => null
          )
        )
    );
    const commits = await listCommits({ repository, ref: info.branch, limit: 5 });
    const treeLines = trees
      .filter(Boolean)
      .map((tree) => {
        const rows = (
          tree as DevRepoResult<{ entries: Array<{ path: string; type: string }> }>
        ).entries
          .slice(0, 10)
          .map((entry) => `  · ${entry.path}${entry.type === 'tree' ? '/' : ''}`)
          .join('\n');
        return rows;
      })
      .filter(Boolean)
      .join('\n');
    const commitLines = commits.commits
      .map(
        (commit) =>
          `- ${shortSha(commit.sha)} ${commit.message}${commit.url ? ` — ${link('commit', commit.url)}` : ''}`
      )
      .join('\n');
    const text = [
      `Проект: ${context?.label || info.info.fullName}`,
      info.info.description ? `Описание: ${info.info.description}` : null,
      `Последний commit: ${shortSha(info.latestCommit?.sha)} ${info.latestCommit?.message || ''}`,
      treeLines ? `Структура:\n${treeLines}` : null,
      commitLines ? `Последние коммиты:\n${commitLines}` : null,
      'Данные получены из GitHub read-only.',
    ]
      .filter(Boolean)
      .join('\n');
    return resultFrom('repo_overview', info, text, [info.info.htmlUrl]);
  }

  if (intent.operation === 'issues') {
    const data = await listIssues({ repository, state: 'open', limit: 20 });
    const text =
      data.issues.length === 0
        ? 'Открытых Issues нет.'
        : data.issues
            .map(
              (issue) =>
                `- #${issue.number} ${issue.title} · ${issue.author || 'unknown'} · ${link('открыть', issue.url)}`
            )
            .join('\n');
    return resultFrom(
      'issues',
      data,
      `Открытые Issues:\n${text}`,
      data.issues.map((issue) => issue.url)
    );
  }

  if (intent.operation === 'issue' && intent.number) {
    const data = await getIssue({ repository, number: intent.number });
    const comments = data.comments
      .slice(0, 5)
      .map((comment) => `- ${comment.author || 'unknown'}: ${comment.body.slice(0, 300)}`)
      .join('\n');
    const text = [
      `Issue #${data.number}: ${data.title} [${data.state}]`,
      data.body ? data.body.slice(0, 1_500) : null,
      data.author ? `Автор: ${data.author}` : null,
      link('Открыть Issue', data.url),
      comments ? `Обсуждение:\n${comments}` : 'Комментариев нет.',
    ]
      .filter(Boolean)
      .join('\n');
    return resultFrom('issue', data, text, [data.url]);
  }

  if (intent.operation === 'commits') {
    const data = await listCommits({ repository, ref: intent.branch || undefined, limit: 10 });
    const text =
      data.commits.length === 0
        ? 'Коммитов не найдено.'
        : data.commits
            .map(
              (commit) =>
                `- ${shortSha(commit.sha)} ${commit.message} · ${commit.author || 'unknown'} · ${commit.date || '—'}${commit.url ? ` — ${link('commit', commit.url)}` : ''}`
            )
            .join('\n');
    return resultFrom(
      'commits',
      data,
      `Последние коммиты:\n${text}`,
      data.commits.map((commit) => commit.url).filter(Boolean) as string[]
    );
  }

  if (intent.operation === 'compare') {
    const list = await listCommits({ repository, ref: intent.branch || undefined, limit: 2 });
    if (list.commits.length < 2) {
      return resultFrom('compare', list, 'Недостаточно коммитов для сравнения.');
    }
    const [headCommit, baseCommit] = list.commits;
    const data = await compareRefs({
      repository,
      base: baseCommit.sha,
      head: headCommit.sha,
    });
    const files = data.files
      .slice(0, 15)
      .map((file) => `- ${file.filename} (${file.status}) +${file.additions}/-${file.deletions}`)
      .join('\n');
    const text = [
      `Сравнение ${shortSha(baseCommit.sha)} → ${shortSha(headCommit.sha)}`,
      `${data.totalCommits} commits · ${data.files.length} files${data.truncated ? ' (diff ограничен)' : ''}`,
      files,
    ]
      .filter(Boolean)
      .join('\n');
    return resultFrom('compare', data, text);
  }

  if (intent.operation === 'pull_requests') {
    const data = await listPullRequests({ repository, state: 'open', limit: 20 });
    const text =
      data.pullRequests.length === 0
        ? 'Открытых pull requests нет.'
        : data.pullRequests
            .map(
              (pull) =>
                `- #${pull.number} ${pull.title} · ${pull.head} → ${pull.base} · ${link('открыть', pull.url)}`
            )
            .join('\n');
    return resultFrom(
      'pull_requests',
      data,
      `Открытые pull requests:\n${text}`,
      data.pullRequests.map((pull) => pull.url)
    );
  }

  if (intent.operation === 'pull_request' && intent.number) {
    const data = await getPullRequest({ repository, number: intent.number });
    const files = data.files
      .slice(0, 12)
      .map((file) => `- ${file.filename} (${file.status}) +${file.additions}/-${file.deletions}`)
      .join('\n');
    const text = [
      `PR #${data.number}: ${data.title} [${data.state}${data.draft ? ', draft' : ''}]`,
      `${data.head} → ${data.base} · ${data.author || 'unknown'}`,
      link('Открыть PR', data.url),
      files ? `Файлы:\n${files}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return resultFrom('pull_request', data, text, [data.url]);
  }

  if (intent.operation === 'workflows') {
    const data = await getWorkflowRuns({ repository, limit: 10 });
    const text =
      data.runs.length === 0
        ? 'GitHub Actions runs не найдены.'
        : data.runs
            .map(
              (run) =>
                `- ${run.name} · ${run.status || 'unknown'} / ${run.conclusion || '—'} · ${run.branch || '—'} · ${shortSha(run.sha)} · ${link('run', run.url)}`
            )
            .join('\n');
    const failed = data.runs.filter((run) => run.conclusion === 'failure');
    const note =
      failed.length > 0
        ? `\n\nПоследний неуспешный run: ${failed[0].name} (${shortSha(failed[0].sha)}). Открой ${link('лог', failed[0].url)} для причины.`
        : '';
    return resultFrom(
      'workflows',
      data,
      `GitHub Actions:\n${text}${note}`,
      data.runs.map((run) => run.url)
    );
  }

  if (intent.operation === 'checks') {
    const data = await getCheckRuns({ repository, ref: intent.branch || undefined });
    const text =
      data.checks.length === 0
        ? data.note
        : data.checks
            .map(
              (check) =>
                `- ${check.name} · ${check.status || 'unknown'} / ${check.conclusion || '—'}${check.url ? ` · ${link('details', check.url)}` : ''}`
            )
            .join('\n');
    const status = data.combinedStatus
      ? `Combined status: ${data.combinedStatus.state} (${data.combinedStatus.totalCount})`
      : 'Combined status недоступен.';
    return resultFrom(
      'checks',
      data,
      `${text}\n${status}`,
      data.checks.map((check) => check.url).filter(Boolean) as string[]
    );
  }

  if (intent.operation === 'search') {
    const query = intent.query || '';
    // GitHub code search is most reliable for Latin identifiers. A Russian
    // natural-language question needs the model to translate and choose terms.
    if (!query || /[\u0400-\u04FF]/.test(query)) return null;
    const data = await searchRepo({ repository, query, mode: 'code', limit: 10 });
    const text =
      data.matches.length === 0
        ? `По запросу «${query}» совпадений нет.`
        : data.matches
            .map(
              (match) =>
                `- ${match.path}${match.url ? ` — ${link('открыть', match.url)}` : ''}${match.fragments[0] ? `\n  ${match.fragments[0].slice(0, 180)}` : ''}`
            )
            .join('\n');
    return resultFrom(
      'search',
      data,
      `Поиск «${query}»:\n${text}${data.incomplete ? '\nGitHub вернул неполные результаты.' : ''}`,
      data.matches.map((match) => match.url).filter(Boolean) as string[]
    );
  }

  return null;
}

export type PendingDraft = {
  payload: Record<string, unknown> | null;
  missing: string[];
};

/**
 * Converts a detected write intent into the exact payload shown to the owner.
 * Missing values are reported instead of invented. Branch names are the only
 * generated value and are clearly visible in the confirmation preview.
 */
export function buildPendingDraft(input: {
  intent: GitHubChatIntent;
  message: string;
  previousAssistant?: string | null;
  now?: Date;
}): PendingDraft {
  const { intent } = input;
  const text = input.message.trim();
  const missing: string[] = [];

  if (intent.operation === 'create_issue') {
    const quoted = extractQuoted(text);
    const previousFirstLine = (input.previousAssistant || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 8 && !line.startsWith('<'));
    const title = (quoted || intent.title || previousFirstLine || '')
      .replace(/^[-*\s#]+/, '')
      .replace(/[.。]+$/, '')
      .slice(0, 120);
    if (!title || /^(?:созда|create|issue|ишью)/i.test(title)) {
      missing.push('title');
    }
    return {
      payload: missing.length
        ? null
        : {
            title,
            body: [
              text,
              input.previousAssistant
                ? `\n\n---\nContext from the preceding Pierrot answer:\n${input.previousAssistant.slice(0, 4_000)}`
                : '',
            ]
              .join('')
              .slice(0, 20_000),
          },
      missing,
    };
  }

  if (intent.operation === 'create_branch') {
    const stamp = (input.now || new Date())
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')
      .replace('T', '-')
      .slice(0, 15);
    const branch = intent.branch || `pierrot/owner-${stamp}`;
    return { payload: { branch, fromRef: 'main' }, missing };
  }

  if (intent.operation === 'create_pull_request') {
    const head = intent.head;
    const title = (intent.title || '').trim();
    if (!head) missing.push('head branch');
    if (!title || /^(?:созда|create|pull request|pr|пул)/i.test(title)) missing.push('title');
    return {
      payload: missing.length
        ? null
        : {
            title: title.slice(0, 240),
            head,
            base: intent.base || 'main',
            body: text.slice(0, 20_000),
          },
      missing,
    };
  }

  if (intent.operation === 'create_or_update_file') {
    const contentMatch = text.match(/(?:содержимое|content)\s*[:—-]\s*([\s\S]+)$/i);
    const content = contentMatch ? contentMatch[1] : intent.content;
    if (!intent.path) missing.push('path');
    if (!content) missing.push('content');
    if (!intent.branch) missing.push('working branch');
    return {
      payload: missing.length
        ? null
        : {
            path: intent.path,
            content,
            branch: intent.branch,
            message: `Pierrot: update ${intent.path}`,
          },
      missing,
    };
  }

  if (intent.operation === 'add_issue_comment') {
    if (!intent.number) missing.push('issue number');
    const body = (intent.body || '').trim();
    if (!body || body === text) missing.push('comment text');
    return {
      payload: missing.length ? null : { number: intent.number, body: body.slice(0, 10_000) },
      missing,
    };
  }

  if (intent.operation === 'update_issue_state') {
    if (!intent.number) missing.push('issue number');
    return {
      payload: missing.length
        ? null
        : { number: intent.number, state: intent.issueState || 'closed' },
      missing,
    };
  }

  return { payload: null, missing: ['operation'] };
}

export function formatPendingOperationPreview(input: {
  operation: PendingGitHubOperationKind;
  repository: string;
  payload: Record<string, unknown>;
  language: 'ru' | 'en';
}): string {
  const ru = input.language === 'ru';
  const lines: string[] = [];
  lines.push(ru ? 'Предлагаю выполнить операцию GitHub:' : 'Proposed GitHub operation:');
  lines.push(`- ${ru ? 'Репозиторий' : 'Repository'}: ${input.repository}`);
  lines.push(`- ${ru ? 'Операция' : 'Operation'}: ${input.operation}`);

  for (const [key, value] of Object.entries(input.payload)) {
    if (value === null || value === undefined || value === '') continue;
    const clean =
      typeof value === 'string'
        ? value.length > 160
          ? `${value.slice(0, 157)}…`
          : value
        : JSON.stringify(value);
    lines.push(`- ${key}: ${clean}`);
  }

  lines.push('');
  lines.push(
    ru
      ? 'Ничего ещё не изменено. Напиши «подтверждаю», чтобы выполнить, или «отмена».'
      : 'Nothing has changed yet. Reply “confirm” to execute, or “cancel”.'
  );
  return lines.join('\n');
}

export function formatGitHubWriteResult(input: {
  operation: PendingGitHubOperationKind;
  result: Record<string, unknown>;
  language: 'ru' | 'en';
}): string {
  const ru = input.language === 'ru';
  const repository = typeof input.result.repository === 'string' ? input.result.repository : '—';
  const url = typeof input.result.url === 'string' ? input.result.url : null;
  const branch = typeof input.result.branch === 'string' ? input.result.branch : null;
  const commitUrl = typeof input.result.commitUrl === 'string' ? input.result.commitUrl : null;
  const commentUrl = typeof input.result.commentUrl === 'string' ? input.result.commentUrl : null;

  return [
    ru ? 'GitHub: операция выполнена.' : 'GitHub: operation completed.',
    `${ru ? 'Репозиторий' : 'Repository'}: ${repository}`,
    branch ? `${ru ? 'Ветка' : 'Branch'}: ${branch}` : null,
    url ? `${ru ? 'Ссылка' : 'Link'}: ${url}` : null,
    commitUrl ? `Commit: ${commitUrl}` : null,
    commentUrl ? `Comment: ${commentUrl}` : null,
    ru ? 'Статус: подтверждено сервером GitHub.' : 'Status: confirmed by the GitHub API.',
  ]
    .filter(Boolean)
    .join('\n');
}
