import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { lexicalSimilarity, normalizeForComparison } from '@/lib/pierrot/memory/similarity';
import { resolveDevProjectContext } from '../dev/repositories';
import type { DevProjectContext, DevRepositoryKey } from '../dev/types';

assertServerOnly('lib/pierrot/grooming/github');

export type GithubTaskLink = {
  id: string;
  decisionId: string;
  repository: DevRepositoryKey;
  issueNumber: number;
  issueUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  lastState: string | null;
  lastResult: GithubSyncResult | null;
  lastCheckedAt: string | null;
};

export type GithubSyncResult =
  | 'confirmed_done'
  | 'partially_implemented'
  | 'needs_verification'
  | 'still_open'
  | 'not_found'
  | 'sync_error';

export type GithubTaskReconciliation = {
  taskId: string;
  taskTitle: string;
  repository: DevRepositoryKey;
  repositoryFullName: string;
  issueNumber: number;
  issueUrl: string | null;
  issueState: string | null;
  stateReason: string | null;
  duplicateOf: number | null;
  pullRequests: Array<{
    number: number;
    url: string;
    state: string;
    merged: boolean;
    mergedAt: string | null;
    title: string;
  }>;
  result: GithubSyncResult;
  reason: string;
  titleSimilarity: number;
  alternativeIssue: { number: number; title: string; url: string; score: number } | null;
  errorCode: string | null;
};

/**
 * Pure status classification. It deliberately distinguishes "issue closed"
 * from "work completed" and "merged PR" from "whole task completed".
 */
export function classifyGithubReconciliation(input: {
  issueExists: boolean;
  errorStatus?: number | null;
  issueState?: string | null;
  stateReason?: string | null;
  duplicateOf?: number | null;
  mergedPullRequest?: boolean;
  titleSimilarity?: number;
  commitEvidence?: boolean;
}): { result: GithubSyncResult; reason: string } {
  if (input.errorStatus === 404 || !input.issueExists) {
    return {
      result: 'not_found',
      reason:
        'Issue не найдена или недоступна. Это не доказывает выполнение; проверь связь и права доступа.',
    };
  }
  if (input.errorStatus && input.errorStatus !== 404) {
    return {
      result: 'sync_error',
      reason: 'GitHub API недоступен; локальная задача не изменена.',
    };
  }
  if (input.duplicateOf || input.stateReason === 'duplicate') {
    return {
      result: 'needs_verification',
      reason: input.duplicateOf
        ? `Issue закрыта как дубликат #${input.duplicateOf}. Это не подтверждает выполнение.`
        : 'Issue закрыта как дубликат. Нужна проверка исходной задачи.',
    };
  }
  if (input.issueState === 'open') {
    return input.mergedPullRequest
      ? {
          result: 'partially_implemented',
          reason: 'Issue ещё открыта, но найден merged PR. Нужна проверка полноты задачи.',
        }
      : {
          result: 'still_open',
          reason: 'Issue открыта; задача остаётся актуальной.',
        };
  }
  if (input.stateReason === 'not_planned') {
    return {
      result: 'needs_verification',
      reason: 'Issue закрыта как not planned; это не выполнение задачи.',
    };
  }
  if (input.mergedPullRequest && (input.titleSimilarity || 0) >= 0.42) {
    return {
      result: 'confirmed_done',
      reason: 'Merged PR и закрытая Issue совпадают с локальной задачей по смыслу.',
    };
  }
  if (input.mergedPullRequest) {
    return {
      result: 'partially_implemented',
      reason:
        'Merged PR подтверждает реализацию, но формулировка задачи шире. Требуется человеческая проверка.',
    };
  }
  if (input.commitEvidence) {
    return {
      result: 'needs_verification',
      reason:
        'Коммит подтверждает изменение, но сам по себе не доказывает завершение всей задачи.',
    };
  }
  if (input.issueState === 'closed') {
    return {
      result: 'needs_verification',
      reason:
        'Issue закрыта без merged PR. Причина закрытия не доказывает выполнение локальной задачи.',
    };
  }
  return {
    result: 'needs_verification',
    reason: 'Состояние GitHub не позволяет достоверно подтвердить выполнение.',
  };
}


type LinkRow = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist/i.test(value);
}

function parseGithubUrl(url: string): {
  repository: string | null;
  issueNumber: number | null;
  pullRequestNumber: number | null;
} {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/i);
  if (!match) return { repository: null, issueNumber: null, pullRequestNumber: null };
  const kind = url.includes('/pull/') ? 'pr' : 'issue';
  return {
    repository: `${match[1]}/${match[2]}`,
    issueNumber: kind === 'issue' ? Number(match[3]) : null,
    pullRequestNumber: kind === 'pr' ? Number(match[3]) : null,
  };
}

export function extractGithubLink(record: PierrotMemoryRecord): {
  repository: string | null;
  issueNumber: number | null;
  issueUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
} | null {
  const refs = Array.isArray(record.sourceRefs) ? record.sourceRefs : [];
  for (const raw of refs) {
    if (!raw || typeof raw !== 'object') continue;
    const ref = raw as Record<string, unknown>;
    const url = text(ref.url) || text(ref.issueUrl) || text(ref.issue_url);
    const parsed = url ? parseGithubUrl(url) : null;
    const repository =
      text(ref.repository) ||
      text(ref.repo) ||
      text(ref.fullName) ||
      parsed?.repository ||
      null;
    const issueNumber =
      Number(ref.issueNumber ?? ref.issue_number ?? ref.number ?? parsed?.issueNumber) || null;
    const pullRequestNumber =
      Number(ref.pullRequestNumber ?? ref.pull_request_number ?? parsed?.pullRequestNumber) || null;
    if (!repository || (!issueNumber && !pullRequestNumber)) continue;
    return {
      repository,
      issueNumber,
      issueUrl: issueNumber
        ? url || `https://github.com/${repository}/issues/${issueNumber}`
        : null,
      pullRequestNumber,
      pullRequestUrl: pullRequestNumber
        ? url || `https://github.com/${repository}/pull/${pullRequestNumber}`
        : null,
    };
  }

  for (const tag of record.tags || []) {
    const match = tag.match(/^(?:github:)?([^/]+\/[^#]+)#(\d+)$/i);
    if (!match) continue;
    return {
      repository: match[1],
      issueNumber: Number(match[2]),
      issueUrl: `https://github.com/${match[1]}/issues/${match[2]}`,
      pullRequestNumber: null,
      pullRequestUrl: null,
    };
  }

  return null;
}

function repositoryKey(value: string): DevRepositoryKey | null {
  const normalized = value.toLowerCase();
  if (normalized === 'newlove' || normalized.endsWith('/newlove')) return 'newlove';
  if (normalized === 'pierrot' || normalized.endsWith('/pierrot')) return 'pierrot';
  return null;
}

export function resolveTaskProjectContext(
  record: PierrotMemoryRecord,
  projects: PierrotProject[]
): DevProjectContext | null {
  const project = record.project
    ? projects.find(
        (item) =>
          item.name.toLowerCase() === record.project?.toLowerCase() ||
          item.slug.toLowerCase() === record.project?.toLowerCase()
      )
    : null;
  if (!project) return null;
  for (const value of [project.name, project.slug]) {
    try {
      const context = resolveDevProjectContext(value);
      if (context) return context;
    } catch {
      // Unknown project names are expected; they simply have no GitHub context.
    }
  }
  return null;
}

export async function loadGithubTaskLinks(
  store: SupabaseClient,
  userId: string,
  decisionIds?: string[]
): Promise<Map<string, GithubTaskLink[]>> {
  let query = store
    .from('pierrot_github_task_links')
    .select('*')
    .eq('user_id', userId);
  if (decisionIds && decisionIds.length > 0) query = query.in('decision_id', decisionIds);
  const { data, error } = await query.limit(500);
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }

  const result = new Map<string, GithubTaskLink[]>();
  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as LinkRow;
    const decisionId = text(row.decision_id);
    const repository = repositoryKey(text(row.repository));
    const issueNumber = Number(row.issue_number || 0);
    if (!decisionId || !repository || issueNumber <= 0) continue;
    const link: GithubTaskLink = {
      id: text(row.id),
      decisionId,
      repository,
      issueNumber,
      issueUrl: text(row.issue_url) || null,
      pullRequestNumber: Number(row.pull_request_number || 0) || null,
      pullRequestUrl: text(row.pull_request_url) || null,
      lastState: text(row.last_state) || null,
      lastResult: (text(row.last_result) || null) as GithubSyncResult | null,
      lastCheckedAt: text(row.last_checked_at) || null,
    };
    const list = result.get(decisionId) || [];
    list.push(link);
    result.set(decisionId, list);
  }
  return result;
}

export async function upsertGithubTaskLink(
  store: SupabaseClient,
  input: {
    userId: string;
    decisionId: string;
    repository: DevRepositoryKey;
    issueNumber: number;
    issueUrl: string | null;
    pullRequestNumber?: number | null;
    pullRequestUrl?: string | null;
    lastState?: string | null;
    lastResult?: GithubSyncResult | null;
    metadata?: Record<string, unknown>;
  }
): Promise<GithubTaskLink> {
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_github_task_links')
    .upsert(
      {
        id: randomUUID(),
        user_id: input.userId,
        decision_id: input.decisionId,
        repository: input.repository,
        issue_number: input.issueNumber,
        issue_url: input.issueUrl,
        pull_request_number: input.pullRequestNumber ?? null,
        pull_request_url: input.pullRequestUrl ?? null,
        last_state: input.lastState ?? null,
        last_result: input.lastResult ?? null,
        last_checked_at: now,
        metadata: input.metadata ?? {},
        updated_at: now,
      },
      { onConflict: 'user_id,decision_id,repository,issue_number' }
    )
    .select('*')
    .single();
  if (error) throw error;
  const row = data as LinkRow;
  return {
    id: text(row.id),
    decisionId: text(row.decision_id),
    repository: repositoryKey(text(row.repository)) || input.repository,
    issueNumber: Number(row.issue_number || input.issueNumber),
    issueUrl: text(row.issue_url) || input.issueUrl,
    pullRequestNumber: Number(row.pull_request_number || 0) || null,
    pullRequestUrl: text(row.pull_request_url) || null,
    lastState: text(row.last_state) || null,
    lastResult: (text(row.last_result) || null) as GithubSyncResult | null,
    lastCheckedAt: text(row.last_checked_at) || null,
  };
}

function statusFromError(error: unknown): number | null {
  return error && typeof error === 'object' && 'status' in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

function duplicateReference(comments: Array<{ body: string }>, body: string): number | null {
  const textValue = [body, ...comments.map((comment) => comment.body)].join('\n');
  const match =
    textValue.match(/(?:duplicate\s+of|дубликат(?:ом)?\s+(?:issue\s+)?#?)(\d+)/i) ||
    textValue.match(/#(\d+)\s+(?:is\s+)?(?:the\s+)?duplicate/i);
  return match ? Number(match[1]) : null;
}

/**
 * Reconciles local tasks against the existing read-only GitHub client.
 * A closed issue is not proof of completion; merged PR and issue reason are
 * evaluated separately. Failures never archive or complete local tasks.
 */
export async function reconcileGithubTasks(input: {
  store: SupabaseClient;
  userId: string;
  tasks: PierrotMemoryRecord[];
  projects: PierrotProject[];
}): Promise<{ results: GithubTaskReconciliation[]; errors: string[] }> {
  const linked = await loadGithubTaskLinks(
    input.store,
    input.userId,
    input.tasks.map((task) => task.id)
  );
  const results: GithubTaskReconciliation[] = [];
  const errors: string[] = [];

  const {
    getIssue,
    listIssues,
    listPullRequests,
  } = await import('../dev/repository');

  const prCache = new Map<string, Awaited<ReturnType<typeof listPullRequests>>>();
  const issueListCache = new Map<string, Awaited<ReturnType<typeof listIssues>>>();

  for (const task of input.tasks) {
    const taskLinks = linked.get(task.id) || [];
    const context = resolveTaskProjectContext(task, input.projects);
    const sourceLink = extractGithubLink(task);
    const candidates: Array<{
      repository: DevRepositoryKey;
      issueNumber: number;
      issueUrl: string | null;
      pullRequestNumber: number | null;
      pullRequestUrl: string | null;
    }> = [];

    for (const link of taskLinks) {
      candidates.push({
        repository: link.repository,
        issueNumber: link.issueNumber,
        issueUrl: link.issueUrl,
        pullRequestNumber: link.pullRequestNumber,
        pullRequestUrl: link.pullRequestUrl,
      });
    }
    if (sourceLink?.issueNumber) {
      const repository = sourceLink.repository
        ? repositoryKey(sourceLink.repository) || context?.repository || 'newlove'
        : context?.repository;
      if (repository) {
        candidates.push({
          repository,
          issueNumber: sourceLink.issueNumber,
          issueUrl: sourceLink.issueUrl,
          pullRequestNumber: sourceLink.pullRequestNumber,
          pullRequestUrl: sourceLink.pullRequestUrl,
        });
      }
    }

    if (candidates.length === 0) continue;

    for (const candidate of Array.from(
      new Map(
        candidates.map((item) => [`${item.repository}:${item.issueNumber}`, item])
      ).values()
    )) {
      const repositoryFullName = getFullName(candidate.repository);
      try {
        if (!prCache.has(candidate.repository)) {
          prCache.set(
            candidate.repository,
            await listPullRequests({
              repository: candidate.repository,
              state: 'all',
              limit: 50,
            })
          );
        }
        const pullRequests = prCache.get(candidate.repository)?.pullRequests || [];

        const issue = await getIssue({
          repository: candidate.repository,
          number: candidate.issueNumber,
          includeComments: true,
        });
        const issueText = `${issue.title}\n${issue.body}`;
        const duplicateOf = duplicateReference(issue.comments, issue.body);
        const relatedPrs = pullRequests
          .filter((pull) => {
            const haystack = `${pull.title}\n${pull.head}`;
            return (
              new RegExp(`#\\s*${candidate.issueNumber}(?:\\D|$)`, 'i').test(haystack) ||
              new RegExp(`(?:issue|closes|fixes|resolves)\\s*#?${candidate.issueNumber}`, 'i').test(
                haystack
              ) ||
              (candidate.pullRequestNumber === pull.number)
            );
          })
          .map((pull) => ({
            number: pull.number,
            url: pull.url,
            state: pull.state,
            merged: pull.merged,
            mergedAt: pull.mergedAt,
            title: pull.title,
          }));
        const mergedPr = relatedPrs.find((pull) => pull.merged) || null;
        const candidatePull = candidate.pullRequestNumber
          ? pullRequests.find((pull) => pull.number === candidate.pullRequestNumber)
          : null;
        const effectiveMerged =
          mergedPr ||
          (candidatePull
            ? {
                number: candidatePull.number,
                url: candidatePull.url,
                state: candidatePull.state,
                merged: candidatePull.merged,
                mergedAt: candidatePull.mergedAt,
                title: candidatePull.title,
              }
            : null);

        const titleSimilarity = lexicalSimilarity(
          normalizeForComparison(`${task.title} ${task.content}`),
          normalizeForComparison(issueText)
        );
        const classification = classifyGithubReconciliation({
          issueExists: true,
          issueState: issue.state,
          stateReason: issue.stateReason,
          duplicateOf,
          mergedPullRequest: Boolean(effectiveMerged?.merged),
          titleSimilarity,
          commitEvidence: false,
        });
        const result = classification.result;
        const reason = classification.reason;

        const reconciliation: GithubTaskReconciliation = {
          taskId: task.id,
          taskTitle: task.title,
          repository: candidate.repository,
          repositoryFullName,
          issueNumber: candidate.issueNumber,
          issueUrl: issue.url || candidate.issueUrl,
          issueState: issue.state,
          stateReason: issue.stateReason,
          duplicateOf,
          pullRequests: relatedPrs.length
            ? relatedPrs
            : effectiveMerged
              ? [effectiveMerged]
              : [],
          result,
          reason,
          titleSimilarity,
          alternativeIssue: null,
          errorCode: null,
        };

        if (result === 'needs_verification') {
          if (!issueListCache.has(candidate.repository)) {
            issueListCache.set(
              candidate.repository,
              await listIssues({ repository: candidate.repository, state: 'all', limit: 50 })
            );
          }
          const alternatives = issueListCache
            .get(candidate.repository)
            ?.issues.filter((item) => item.number !== candidate.issueNumber)
            .map((item) => ({
              number: item.number,
              title: item.title,
              url: item.url,
              score: lexicalSimilarity(
                normalizeForComparison(`${task.title} ${task.content}`),
                normalizeForComparison(item.title)
              ),
            }))
            .filter((item) => item.score >= 0.55)
            .sort((left, right) => right.score - left.score);
          reconciliation.alternativeIssue = alternatives?.[0] || null;
        }

        results.push(reconciliation);
      } catch (error) {
        const status = statusFromError(error);
        const result: GithubSyncResult = status === 404 ? 'not_found' : 'sync_error';
        const reason =
          status === 404
            ? 'Issue не найдена по сохранённой связи. Проверь доступ и альтернативные совпадения.'
            : 'GitHub API временно недоступен; локальная задача не изменена.';
        results.push({
          taskId: task.id,
          taskTitle: task.title,
          repository: candidate.repository,
          repositoryFullName,
          issueNumber: candidate.issueNumber,
          issueUrl: candidate.issueUrl,
          issueState: null,
          stateReason: null,
          duplicateOf: null,
          pullRequests: [],
          result,
          reason,
          titleSimilarity: 0,
          alternativeIssue: null,
          errorCode:
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code?: unknown }).code)
              : 'GITHUB_SYNC_ERROR',
        });
        errors.push(`${repositoryFullName}#${candidate.issueNumber}: ${reason}`);
      }
    }
  }

  return { results, errors };
}

function getFullName(key: DevRepositoryKey): string {
  return key === 'pierrot' ? 'merkurov1/Pierrot' : 'merkurov1/newlove';
}
