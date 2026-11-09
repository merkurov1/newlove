/** @jest-environment node */

jest.mock('../repository', () => ({
  getRepoInfo: jest.fn(),
  getRepoTree: jest.fn(),
  searchRepo: jest.fn(),
  listCommits: jest.fn(),
  getCommit: jest.fn(),
  compareRefs: jest.fn(),
  listPullRequests: jest.fn(),
  getPullRequest: jest.fn(),
  listIssues: jest.fn(),
  getIssue: jest.fn(),
  getWorkflowRuns: jest.fn(),
  getCheckRuns: jest.fn(),
}));

import {
  buildPendingDraft,
  detectGitHubChatIntent,
  formatGitHubWriteResult,
  formatPendingOperationPreview,
  isGitHubCancellation,
  isGitHubConfirmation,
  runGitHubReadIntent,
} from '../chatBridge';
import { getRepoInfo, listIssues } from '../repository';

const mockGetRepoInfo = getRepoInfo as unknown as jest.Mock;
const mockListIssues = listIssues as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GitHub chat intent detection', () => {
  it.each([
    ['Посмотри, что происходит в Heart & Angel', 'repo_overview', 'heart_angel', 'newlove'],
    ['Что нового в Art Engine?', 'repo_overview', 'art_engine', 'newlove'],
    ['Найди, где реализовано переключение языков', 'search', null, null],
    ['Сравни последние два коммита', 'compare', null, null],
    ['Покажи незакрытые Issues', 'issues', null, null],
    ['Проверь PR', 'pull_requests', null, null],
    ['Почему последний deployment завершился ошибкой?', 'workflows', null, null],
    ['Покажи Pierrot mobile', 'repo_overview', 'pierrot_mobile', 'pierrot'],
    ['Проведи аудит последних обновлений гитхаб и текущих задач', 'repo_overview', null, null],
    ['Синхронизируй задачи с гитхабом посмотри что сделано', 'repo_overview', null, null],
    ['Какие задачи по гитхабу', 'issues', null, null],
    ['Включи github', 'status', null, null],
    ['Подключи GitHub ко всему Пьеро', 'status', null, null],
    ['Найди задачу включить github', 'search', null, null],
  ])('%s', (message, operation, context, repository) => {
    const intent = detectGitHubChatIntent(message);
    expect(intent).not.toBeNull();
    expect(intent?.operation).toBe(operation);
    expect(intent?.context?.key ?? null).toBe(context);
    expect(intent?.repository).toBe(repository);
  });

  it('detects write intents but never executes them during detection', () => {
    const issue = detectGitHubChatIntent('Создай Issue с описанием этой ошибки');
    expect(issue).toMatchObject({
      operation: 'create_issue',
      requiresConfirmation: true,
    });

    const branch = detectGitHubChatIntent('Создай ветку pierrot/test-fix');
    expect(branch).toMatchObject({
      operation: 'create_branch',
      requiresConfirmation: true,
      branch: 'pierrot/test-fix',
    });

    const pr = detectGitHubChatIntent('Создай pull request из ветки feature/test');
    expect(pr).toMatchObject({
      operation: 'create_pull_request',
      requiresConfirmation: true,
      head: 'feature/test',
    });
  });

  it('returns null when GitHub is not mentioned', () => {
    expect(detectGitHubChatIntent('Съел яблоко')).toBeNull();
    expect(detectGitHubChatIntent('Расскажи о выставке')).toBeNull();
  });

  it('recognises exact confirmation and cancellation only', () => {
    expect(isGitHubConfirmation('подтверждаю')).toBe(true);
    expect(isGitHubConfirmation('да, подтверждаю')).toBe(true);
    expect(isGitHubConfirmation('подтверждаю, но сначала проверь')).toBe(false);
    expect(isGitHubCancellation('отмена')).toBe(true);
    expect(isGitHubCancellation('cancel')).toBe(true);
  });
});

describe('pending write drafts', () => {
  it('builds an issue payload from a quoted title', () => {
    const intent = detectGitHubChatIntent('Создай Issue «Починить меню»');
    expect(intent).not.toBeNull();
    const draft = buildPendingDraft({
      intent: intent!,
      message: 'Создай Issue «Починить меню»',
    });
    expect(draft.missing).toEqual([]);
    expect(draft.payload).toMatchObject({ title: 'Починить меню' });
  });

  it('reports missing fields instead of inventing an issue title', () => {
    const intent = detectGitHubChatIntent('Создай Issue');
    const draft = buildPendingDraft({ intent: intent!, message: 'Создай Issue' });
    expect(draft.payload).toBeNull();
    expect(draft.missing).toContain('title');
  });

  it('generates a visible non-default branch name when none is supplied', () => {
    const intent = detectGitHubChatIntent('Создай ветку для правки');
    const draft = buildPendingDraft({
      intent: intent!,
      message: 'Создай ветку для правки',
      now: new Date('2026-11-09T12:34:00Z'),
    });
    expect(draft.payload?.branch).toMatch(/^pierrot\/owner-/);
  });

  it('requires a head branch for a pull request', () => {
    const intent = detectGitHubChatIntent('Создай pull request «Fix menu»');
    const draft = buildPendingDraft({ intent: intent!, message: 'Создай pull request «Fix menu»' });
    expect(draft.payload).toBeNull();
    expect(draft.missing).toContain('head branch');
  });

  it('formats the exact confirmation preview', () => {
    const text = formatPendingOperationPreview({
      operation: 'create_issue',
      repository: 'merkurov1/newlove',
      payload: { title: 'Fix menu', body: 'Details' },
      language: 'ru',
    });
    expect(text).toContain('merkurov1/newlove');
    expect(text).toContain('Ничего ещё не изменено');
    expect(text).toContain('подтверждаю');
  });

  it('formats a write result with links and status', () => {
    const text = formatGitHubWriteResult({
      operation: 'create_issue',
      result: {
        repository: 'merkurov1/newlove',
        number: 42,
        url: 'https://github.com/merkurov1/newlove/issues/42',
      },
      language: 'ru',
    });
    expect(text).toContain('GitHub: операция выполнена');
    expect(text).toContain('issues/42');
    expect(text).toContain('подтверждено сервером GitHub');
  });
});

describe('deterministic read execution', () => {
  it('formats open issues with repository and links', async () => {
    mockListIssues.mockResolvedValue({
      repository: 'merkurov1/newlove',
      repositoryKey: 'newlove',
      branch: 'main',
      commitSha: 'a'.repeat(40),
      complete: true,
      warnings: [],
      source: 'github',
      issues: [
        {
          number: 7,
          title: 'Fix menu',
          state: 'open',
          author: 'anton',
          labels: [],
          comments: 0,
          url: 'https://github.com/merkurov1/newlove/issues/7',
          createdAt: null,
          updatedAt: null,
        },
      ],
      truncated: false,
    });

    const intent = detectGitHubChatIntent('Покажи незакрытые Issues')!;
    const result = await runGitHubReadIntent(intent);
    expect(result?.text).toContain('merkurov1/newlove');
    expect(result?.text).toContain('#7 Fix menu');
    expect(result?.links).toContain('https://github.com/merkurov1/newlove/issues/7');
  });

  it('reports GitHub read access without asking for a token', async () => {
    mockGetRepoInfo.mockResolvedValue({
      repository: 'merkurov1/newlove',
      repositoryKey: 'newlove',
      branch: 'main',
      commitSha: 'a'.repeat(40),
      complete: true,
      warnings: [],
      source: 'github',
      info: {
        fullName: 'merkurov1/newlove',
        description: 'The platform',
        defaultBranch: 'main',
        private: false,
        language: 'TypeScript',
        pushedAt: null,
        htmlUrl: 'https://github.com/merkurov1/newlove',
        permissions: null,
      },
      latestCommit: {
        sha: 'a'.repeat(40),
        message: 'Latest commit',
        author: 'Anton',
        date: null,
        url: 'https://github.com/merkurov1/newlove/commit/' + 'a'.repeat(40),
      },
      requestedRef: 'main',
    });

    const intent = detectGitHubChatIntent('Включи GitHub')!;
    const result = await runGitHubReadIntent(intent);

    expect(result?.operation).toBe('status');
    expect(result?.text).toContain('GitHub read access активен');
    expect(result?.text).toContain('read-only');
    expect(result?.text).not.toContain('provide');
    expect(result?.text).not.toContain('GITHUB_TOKEN');
  });
});
