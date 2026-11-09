import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMemoryRecords } from '@/lib/pierrot/memory/store';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import { mapProject } from '@/lib/pierrot/projects/store';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { loadProjectHistoryMessages } from '@/lib/pierrot/projects/history';
import { listConversationSummaryCandidates, type ConversationSummaryCandidate } from './context';
import { listTaskExperiences } from '@/lib/pierrot/learning/store';
import type { TaskExperienceExample } from '@/lib/pierrot/learning/types';
import {
  extractGithubLink,
  reconcileGithubTasks,
  resolveTaskProjectContext,
  type GithubTaskReconciliation,
} from './github';
import { listDevTasks } from '../dev/tasks';
import { getDevRepositoryStatuses } from '../dev/repository';
import type { DevRepositoryStatus, DevTask } from '../dev/types';
import type { GroomingScope } from './types';

assertServerOnly('lib/pierrot/grooming/collect');

export type WorkspaceConversation = {
  id: string;
  title: string;
  summary: string | null;
  summaryGeneratedAt: string | null;
  updatedAt: string | null;
  messageCount: number | null;
  projectId: string | null;
  projectName: string | null;
};

export type WorkspaceMaterialCandidate = {
  projectId: string;
  projectName: string;
  url: string;
  title: string;
  artifactType: string;
  sourceMessageId: string | null;
  conversationId: string | null;
  createdAt: string | null;
};

export type WorkspaceSnapshotData = {
  projects: PierrotProject[];
  records: PierrotMemoryRecord[];
  tasks: PierrotMemoryRecord[];
  decisions: PierrotMemoryRecord[];
  memories: PierrotMemoryRecord[];
  linkedProjectIds: Map<string, string[]>;
  artifactsByProject: Map<string, number>;
  knowledgeByProject: Map<string, number>;
  existingMaterialUrls: Set<string>;
  materialCandidates: WorkspaceMaterialCandidate[];
  conversations: WorkspaceConversation[];
  summaryCandidates: ConversationSummaryCandidate[];
  devTasks: DevTask[];
  githubResults: GithubTaskReconciliation[];
  githubErrors: string[];
  repositoryStatuses: DevRepositoryStatus[];
  warnings: string[];
  learningExamples?: TaskExperienceExample[];
};

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist/i.test(value);
}

function projectLinkMap(rows: unknown[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.decision_id !== 'string' || typeof row.project_id !== 'string') continue;
    const list = map.get(row.decision_id) || [];
    list.push(row.project_id);
    map.set(row.decision_id, list);
  }
  return map;
}

async function loadExistingMaterialUrls(
  store: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('content,metadata')
    .eq('owner_user_id', userId)
    .limit(2_000);
  if (error) return new Set();
  const urls = new Set<string>();
  for (const raw of Array.isArray(data) ? data : []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const content = typeof row.content === 'string' ? row.content : '';
    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null;
    const url = typeof metadata?.url === 'string' ? metadata.url : extractFirstUrl(content);
    if (url) urls.add(url.toLowerCase());
  }
  return urls;
}

function extractFirstUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"')]+/iu);
  return match ? match[0].replace(/[.,;:!?]+$/g, '') : null;
}

function artifactType(url: string): string {
  if (/\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?|$)/i.test(url)) return 'image';
  if (/\.(?:mp4|mov|webm|avi)(?:\?|$)/i.test(url)) return 'video';
  if (/\.(?:pdf|docx?|xlsx?|pptx?)(?:\?|$)/i.test(url)) return 'document';
  if (/(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url)) return 'video';
  return 'link';
}

function materialTitle(value: string, url: string): string {
  const withoutUrl = value
    .replace(url, '')
    .replace(/\s+/g, ' ')
    .replace(/[:—–-]+$/g, '')
    .trim();
  if (withoutUrl.length >= 4) return withoutUrl.slice(0, 180);
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 180);
  }
}

async function loadMaterialCandidates(
  store: SupabaseClient,
  userId: string,
  projects: PierrotProject[],
  existing: Set<string>
): Promise<WorkspaceMaterialCandidate[]> {
  const candidates: WorkspaceMaterialCandidate[] = [];
  const seen = new Set(existing);

  for (const project of projects.slice(0, 20)) {
    const messages = await loadProjectHistoryMessages(store, userId, project.id, {
      limit: 500,
    }).catch(() => []);
    for (const message of messages) {
      const urls = Array.from(
        new Set(
          (message.content.match(/https?:\/\/[^\s<>"')]+/giu) || []).map((url) =>
            url.replace(/[.,;:!?]+$/g, '')
          )
        )
      );
      for (const url of urls) {
        const key = url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          projectId: project.id,
          projectName: project.name,
          url,
          title: materialTitle(message.content, url),
          artifactType: artifactType(url),
          sourceMessageId: message.id,
          conversationId: message.conversationId,
          createdAt: message.createdAt,
        });
        if (candidates.length >= 30) return candidates;
      }
    }
  }
  return candidates;
}

async function loadProjectLinks(
  store: SupabaseClient,
  userId: string
): Promise<Map<string, string[]>> {
  const { data, error } = await store
    .from('pierrot_project_decisions')
    .select('decision_id,project_id')
    .eq('owner_user_id', userId)
    .limit(2_000);
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  return projectLinkMap(Array.isArray(data) ? data : []);
}

async function countByProject(
  store: SupabaseClient,
  table: 'pierrot_project_artifacts' | 'pierrot_project_knowledge',
  userId: string
): Promise<Map<string, number>> {
  const { data, error } = await store
    .from(table)
    .select('project_id')
    .eq('owner_user_id', userId)
    .limit(5_000);
  if (error) return new Map();
  const counts = new Map<string, number>();
  for (const raw of Array.isArray(data) ? data : []) {
    if (!raw || typeof raw !== 'object') continue;
    const projectId = (raw as Record<string, unknown>).project_id;
    if (typeof projectId !== 'string') continue;
    counts.set(projectId, (counts.get(projectId) || 0) + 1);
  }
  return counts;
}

async function loadConversations(
  store: SupabaseClient,
  userId: string,
  projects: PierrotProject[]
): Promise<WorkspaceConversation[]> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select(
      'id,title,summary,summary_generated_at,updated_at,last_message_at,next_message_sequence'
    )
    .eq('user_id', userId)
    .eq('identity_type', 'owner')
    .eq('mode', 'site')
    .order('updated_at', { ascending: false })
    .limit(80);
  if (error) return [];

  const projectByConversation = new Map<string, PierrotProject>();
  for (const project of projects) {
    if (project.conversationId) projectByConversation.set(project.conversationId, project);
  }

  return (Array.isArray(data) ? data : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => {
      const conversationId = String(row.id);
      const project = projectByConversation.get(conversationId) || null;
      return {
        id: conversationId,
        title:
          typeof row.title === 'string' && row.title.trim() ? row.title : project?.name || 'Диалог',
        summary: typeof row.summary === 'string' && row.summary.trim() ? row.summary : null,
        summaryGeneratedAt:
          typeof row.summary_generated_at === 'string' ? row.summary_generated_at : null,
        updatedAt:
          typeof row.last_message_at === 'string'
            ? row.last_message_at
            : typeof row.updated_at === 'string'
              ? row.updated_at
              : null,
        messageCount:
          typeof row.next_message_sequence === 'number' ? Number(row.next_message_sequence) : null,
        projectId: project?.id || null,
        projectName: project?.name || null,
      };
    });
}

function shouldReconcile(task: PierrotMemoryRecord, projects: PierrotProject[]): boolean {
  if (extractGithubLink(task)) return true;
  const context = resolveTaskProjectContext(task, projects);
  if (!context) return false;
  const text = `${task.title} ${task.content} ${(task.tags || []).join(' ')}`;
  return /(?:github|issue|pull request|коммит|commit|код|код|api|route|component|компонент|страниц|интерфейс|pwa|expo|migration|миграц|тест|test|деплой|deploy)/iu.test(
    text
  );
}

/**
 * Bounded, read-only snapshot. The first audit pass never changes tasks,
 * memory, projects, GitHub or conversations.
 */
export async function collectWorkspaceSnapshot(input: {
  store: SupabaseClient;
  userId: string;
  scope: GroomingScope;
  projectId: string | null;
}): Promise<WorkspaceSnapshotData> {
  const warnings: string[] = [];

  const { data: projectRows, error: projectError } = await input.store
    .from('pierrot_projects')
    .select('*')
    .eq('owner_user_id', input.userId)
    .order('last_activity_at', { ascending: false })
    .limit(100);
  if (projectError) throw projectError;
  let projects = (Array.isArray(projectRows) ? projectRows : []).map((row) =>
    mapProject(row as Record<string, unknown>)
  );
  if (input.projectId) projects = projects.filter((project) => project.id === input.projectId);

  const records = await listMemoryRecords(input.store, {
    userId: input.userId,
    includeArchive: true,
    limit: 500,
  }).catch((error) => {
    warnings.push('Не удалось прочитать память и задачи.');
    if (isMissingTable(error)) return [];
    throw error;
  });

  const tasks = records.filter((record) => record.kind === 'task' || record.kind === 'reminder');
  const decisions = records.filter(
    (record) =>
      record.kind === 'decision' ||
      record.kind === 'position' ||
      record.kind === 'preference' ||
      record.kind === 'constraint'
  );
  const memories = records.filter(
    (record) =>
      record.kind === 'memory' ||
      record.kind === 'saved' ||
      record.kind === 'rejected_recommendation'
  );

  const [linkedProjectIds, artifactsByProject, knowledgeByProject] = await Promise.all([
    loadProjectLinks(input.store, input.userId),
    countByProject(input.store, 'pierrot_project_artifacts', input.userId),
    countByProject(input.store, 'pierrot_project_knowledge', input.userId),
  ]);
  const existingMaterialUrls = await loadExistingMaterialUrls(input.store, input.userId).catch(
    () => new Set<string>()
  );
  const materialCandidates = await loadMaterialCandidates(
    input.store,
    input.userId,
    projects,
    existingMaterialUrls
  ).catch(() => []);

  const [conversations, summaryCandidates, devTaskResult, learningExamples] = await Promise.all([
    loadConversations(input.store, input.userId, projects),
    listConversationSummaryCandidates(input.store, input.userId, 20).catch(() => []),
    listDevTasks(input.userId, 100).catch(() => ({ tasks: [], migrationRequired: false })),
    listTaskExperiences(input.store, { userId: input.userId, limit: 300 }).catch(() => []),
  ]);
  if (devTaskResult.migrationRequired)
    warnings.push('Dev-задачи недоступны: нужна миграция Dev Mode.');
  if (summaryCandidates.length > 0) {
    warnings.push(`Диалогов без актуального резюме: ${summaryCandidates.length}.`);
  }

  let githubResults: GithubTaskReconciliation[] = [];
  let githubErrors: string[] = [];
  let repositoryStatuses: DevRepositoryStatus[] = [];
  const wantsGithub = input.scope === 'all' || input.scope === 'github';
  if (wantsGithub) {
    const relevantTasks = tasks.filter(
      (task) =>
        task.status === 'current' || task.status === 'uncertain' || task.status === 'completed'
    );
    const reconcilable = relevantTasks.filter((task) => shouldReconcile(task, projects));
    if (reconcilable.length > 0) {
      const reconciled = await reconcileGithubTasks({
        store: input.store,
        userId: input.userId,
        tasks: reconcilable.slice(0, 40),
        projects,
      }).catch((error) => {
        githubErrors = [error instanceof Error ? error.message : 'GitHub reconciliation failed'];
        warnings.push('GitHub-сверка не завершилась; локальные задачи не изменены.');
        return { results: [], errors: githubErrors };
      });
      githubResults = reconciled.results;
      githubErrors = reconciled.errors;
    }
    repositoryStatuses = await getDevRepositoryStatuses().catch(() => []);
    const unavailable = repositoryStatuses.filter((status) => !status.accessible);
    if (unavailable.length > 0) {
      warnings.push(
        `GitHub read unavailable for: ${unavailable.map((item) => item.fullName).join(', ')}.`
      );
    }
  }

  return {
    projects,
    records,
    tasks,
    decisions,
    memories,
    linkedProjectIds,
    artifactsByProject,
    knowledgeByProject,
    existingMaterialUrls,
    materialCandidates,
    conversations,
    summaryCandidates,
    devTasks: devTaskResult.tasks,
    githubResults,
    githubErrors,
    repositoryStatuses,
    warnings,
    learningExamples,
  };
}
