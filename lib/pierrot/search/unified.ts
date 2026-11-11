import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMemoryRecordsByIds, searchMemory } from '@/lib/pierrot/memory/store';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import { mapProject } from '@/lib/pierrot/projects/store';
import { listDecisionIdsForProject } from '@/lib/pierrot/projects/links';
import { projectAliases } from '@/lib/pierrot/projects/matching';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import type { UnifiedSearchScope } from './intent';
import type { UnifiedSearchHit, UnifiedSearchResult } from './types';

assertServerOnly('lib/pierrot/search/unified');

const STOP_WORDS = new Set([
  'что',
  'где',
  'когда',
  'зачем',
  'почему',
  'это',
  'этот',
  'эта',
  'мы',
  'нам',
  'нас',
  'для',
  'про',
  'по',
  'об',
  'о',
  'в',
  'во',
  'на',
  'и',
  'или',
  'the',
  'and',
  'for',
  'about',
  'where',
  'what',
  'did',
  'we',
  'find',
  'show',
]);

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unifiedSearchTerms(query: string): string[] {
  const terms = (normalize(query).match(/[\p{L}\p{N}_-]{3,}/gu) || [])
    .map((term) => term.replace(/[-_]+$/g, ''))
    .filter((term) => !STOP_WORDS.has(term))
    .slice(0, 8);
  return Array.from(new Set(terms));
}

function compact(value: string, max = 240): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function projectKeys(project: Pick<PierrotProject, 'name' | 'slug'>): string[] {
  return projectAliases(project).map((alias) => alias.replace(/\s+/g, ' ').trim());
}

function projectAliasTerms(project: Pick<PierrotProject, 'name' | 'slug'>): Set<string> {
  const terms = new Set<string>();
  for (const alias of projectAliases(project)) {
    for (const token of alias.match(/[\p{L}\p{N}_-]{3,}/gu) || []) {
      terms.add(token);
    }
  }
  return terms;
}

async function loadProjects(
  store: SupabaseClient,
  ownerUserId: string
): Promise<PierrotProject[]> {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('*')
    .eq('owner_user_id', ownerUserId);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapProject(row as Record<string, unknown>));
}

function projectForText(
  projects: PierrotProject[],
  value: string | null | undefined
): PierrotProject | null {
  if (!value) return null;
  const normalized = normalize(value);
  const compactValue = normalized.replace(/[^\p{L}\p{N}]+/gu, '');
  return (
    projects.find((project) =>
      projectKeys(project).some((key) => {
        const compactKey = key.replace(/[^\p{L}\p{N}]+/gu, '');
        return key === normalized || compactKey === compactValue;
      })
    ) || null
  );
}

function escapePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

async function searchConversationMessages(input: {
  store: SupabaseClient;
  ownerUserId: string;
  terms: string[];
  projects: PierrotProject[];
  project: PierrotProject | null;
  limit: number;
}): Promise<UnifiedSearchHit[]> {
  if (input.terms.length === 0 && !input.project) return [];

  let messageQuery = input.store
    .from('pierrot_messages')
    .select('id,conversation_id,role,content,created_at,message_index,history_id,session_id');

  if (input.terms.length > 0) {
    const pattern = input.terms
      .map((term) => `content.ilike.%${escapePattern(term)}%`)
      .join(',');
    messageQuery = messageQuery.or(pattern);
  } else if (input.project) {
    const projectConversationIds = new Set<string>();
    if (input.project.conversationId) {
      projectConversationIds.add(input.project.conversationId);
    }
    const { data: projectLinks } = await input.store
      .from('pierrot_project_conversations')
      .select('conversation_id')
      .eq('owner_user_id', input.ownerUserId)
      .eq('project_id', input.project.id)
      .limit(500);
    for (const row of Array.isArray(projectLinks) ? projectLinks : []) {
      if (row && typeof row.conversation_id === 'string') {
        projectConversationIds.add(row.conversation_id);
      }
    }
    if (projectConversationIds.size === 0) return [];
    messageQuery = messageQuery.in('conversation_id', Array.from(projectConversationIds));
  }

  const { data: messages, error } = await messageQuery
    .order('created_at', { ascending: false })
    .limit(input.limit * 6);

  if (error || !Array.isArray(messages)) return [];

  const conversationIds = Array.from(
    new Set(
      messages
        .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
        .filter(Boolean)
    )
  );
  if (conversationIds.length === 0) return [];

  const [{ data: conversations }, { data: links }] = await Promise.all([
    input.store
      .from('pierrot_conversations')
      .select('id,title,started_at,updated_at,last_message_at,user_id,identity_type')
      .in('id', conversationIds)
      .eq('user_id', input.ownerUserId)
      .eq('identity_type', 'owner'),
    input.store
      .from('pierrot_project_conversations')
      .select('conversation_id,project_id')
      .eq('owner_user_id', input.ownerUserId)
      .in('conversation_id', conversationIds),
  ]);

  const ownerConversations = new Map(
    (Array.isArray(conversations) ? conversations : [])
      .filter((row) => row && typeof row.id === 'string')
      .map((row) => [String(row.id), row])
  );
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const projectByConversation = new Map<string, PierrotProject>();
  for (const row of Array.isArray(links) ? links : []) {
    if (!row || typeof row.conversation_id !== 'string' || typeof row.project_id !== 'string') {
      continue;
    }
    const project = projectById.get(row.project_id);
    if (project) projectByConversation.set(row.conversation_id, project);
  }
  for (const project of input.projects) {
    if (project.conversationId) projectByConversation.set(project.conversationId, project);
  }

  const seen = new Set<string>();
  const hits: UnifiedSearchHit[] = [];
  for (const row of messages) {
    if (!row || typeof row.conversation_id !== 'string' || typeof row.content !== 'string') continue;
    const conversation = ownerConversations.get(row.conversation_id);
    if (!conversation) continue;
    const project = projectByConversation.get(row.conversation_id) || null;
    if (input.project && (!project || project.id !== input.project.id)) continue;
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);

    const title =
      (typeof conversation.title === 'string' && conversation.title.trim()) ||
      compact(row.content, 80) ||
      'Диалог';
    const href = project
      ? `/admin/pierrot?project=${encodeURIComponent(project.slug)}`
      : typeof row.history_id === 'string' && row.history_id
        ? `/admin/pierrot?history=${encodeURIComponent(row.history_id)}${
            typeof row.session_id === 'string' && row.session_id
              ? `&session=${encodeURIComponent(row.session_id)}`
              : ''
          }`
        : `/admin/pierrot?conversation=${encodeURIComponent(row.conversation_id)}`;

    hits.push({
      source: 'conversation',
      id: row.conversation_id,
      title,
      snippet: `${row.role === 'assistant' ? 'Pierrot' : 'Owner'}: ${compact(row.content)}`,
      projectId: project?.id || null,
      projectName: project?.name || null,
      projectSlug: project?.slug || null,
      href,
      status: null,
      updatedAt:
        typeof conversation.last_message_at === 'string'
          ? conversation.last_message_at
          : typeof conversation.updated_at === 'string'
            ? conversation.updated_at
            : typeof row.created_at === 'string'
              ? row.created_at
              : null,
      messageId: typeof row.id === 'string' ? row.id : null,
      conversationId: row.conversation_id,
      eventAt: typeof row.created_at === 'string' ? row.created_at : null,
      ingestedAt: typeof row.created_at === 'string' ? row.created_at : null,
      retrievalMethod: 'keyword',
      confidence: 0.75,
      evidenceClass: 'DIRECTLY_OBSERVED',
    });
    if (hits.length >= input.limit) break;
  }

  return hits;
}

function memoryHits(
  records: PierrotMemoryRecord[],
  projects: PierrotProject[],
  scope: UnifiedSearchScope,
  project: PierrotProject | null,
  linkedIds: Set<string>,
  limit: number
): UnifiedSearchHit[] {
  const hits: UnifiedSearchHit[] = [];
  for (const record of records) {
    const sourceProject = projectForText(projects, record.project);
    if (project) {
      const belongsToProject = sourceProject?.id === project.id || linkedIds.has(record.id);
      if (!belongsToProject) continue;
    }

    const source: UnifiedSearchHit['source'] =
      record.kind === 'task' || record.kind === 'reminder'
        ? 'task'
        : record.kind === 'decision' || record.kind === 'position' || record.kind === 'constraint'
          ? 'decision'
          : 'memory';

    if (scope === 'tasks' && source !== 'task') continue;
    if (scope === 'decisions' && source !== 'decision') continue;
    if (scope === 'documents' || scope === 'issues') continue;

    hits.push({
      source,
      id: record.id,
      title: record.title,
      snippet: compact(record.content),
      projectId: sourceProject?.id || null,
      projectName: sourceProject?.name || null,
      projectSlug: sourceProject?.slug || null,
      href: sourceProject ? `/admin/pierrot?project=${encodeURIComponent(sourceProject.slug)}` : null,
      status: record.status,
      updatedAt: record.updatedAt || null,
      messageId: record.messageId,
      conversationId: record.conversationId,
      eventAt: record.decidedAt || record.updatedAt || record.createdAt,
      ingestedAt: record.createdAt,
      retrievalMethod: 'hybrid',
      confidence: Math.max(record.confidence || 0.6, record.importance || 0.5),
      evidenceClass: record.confidence >= 0.6 ? 'USER_CONFIRMED' : 'INFERRED',
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

async function searchProjectMaterials(input: {
  store: SupabaseClient;
  ownerUserId: string;
  terms: string[];
  projects: PierrotProject[];
  project: PierrotProject | null;
  limit: number;
}): Promise<UnifiedSearchHit[]> {
  const terms = input.terms;
  if (terms.length === 0) return [];
  const has = (value: string) => terms.some((term) => normalize(value).includes(term));
  const projectById = new Map(input.projects.map((project) => [project.id, project]));

  const [artifactsResult, knowledgeResult] = await Promise.all([
    input.store
      .from('pierrot_project_artifacts')
      .select('id,project_id,title,content,artifact_type,updated_at')
      .eq('owner_user_id', input.ownerUserId)
      .limit(300),
    input.store
      .from('pierrot_project_knowledge')
      .select('project_id,document:knowledge_documents(id,title,status)')
      .eq('owner_user_id', input.ownerUserId)
      .limit(500),
  ]);

  const hits: UnifiedSearchHit[] = [];
  for (const row of Array.isArray(artifactsResult.data) ? artifactsResult.data : []) {
    if (!row || typeof row.id !== 'string') continue;
    const projectId = typeof row.project_id === 'string' ? row.project_id : null;
    if (input.project && projectId !== input.project.id) continue;
    const title = typeof row.title === 'string' ? row.title : '';
    const content = typeof row.content === 'string' ? row.content : '';
    if (!has(`${title} ${content}`)) continue;
    const project = projectId ? projectById.get(projectId) || null : null;
    hits.push({
      source: 'artifact',
      id: row.id,
      title: title || 'Материал проекта',
      snippet: compact(content),
      projectId: project?.id || null,
      projectName: project?.name || null,
      projectSlug: project?.slug || null,
      href: project ? `/admin/pierrot?project=${encodeURIComponent(project.slug)}` : null,
      status: typeof row.artifact_type === 'string' ? row.artifact_type : null,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    });
    if (hits.length >= input.limit) break;
  }

  for (const row of Array.isArray(knowledgeResult.data) ? knowledgeResult.data : []) {
    if (!row || typeof row.project_id !== 'string') continue;
    if (input.project && row.project_id !== input.project.id) continue;
    const document = row.document as unknown as Record<string, unknown> | null;
    if (!document || typeof document.title !== 'string' || !has(document.title)) continue;
    const project = projectById.get(row.project_id) || null;
    hits.push({
      source: 'document',
      id: typeof document.id === 'string' ? document.id : String(document.title),
      title: document.title,
      snippet: 'Документ проекта в Brain.',
      projectId: project?.id || null,
      projectName: project?.name || null,
      projectSlug: project?.slug || null,
      href: project ? `/admin/pierrot?project=${encodeURIComponent(project.slug)}` : null,
      status: typeof document.status === 'string' ? document.status : null,
      updatedAt: null,
    });
    if (hits.length >= input.limit) break;
  }

  return hits;
}

async function searchBrainDocuments(input: {
  store: SupabaseClient;
  ownerUserId: string;
  terms: string[];
  projects: PierrotProject[];
  project: PierrotProject | null;
  limit: number;
}): Promise<UnifiedSearchHit[]> {
  if (input.terms.length === 0) return [];
  const pattern = input.terms
    .map((term) => `content.ilike.%${escapePattern(term)}%`)
    .join(',');

  const { data: chunks, error } = await input.store
    .from('knowledge_chunks')
    .select('id,document_id,content,heading')
    .or(pattern)
    .limit(input.limit * 4);
  if (error || !Array.isArray(chunks) || chunks.length === 0) return [];

  const chunkByDocument = new Map<string, Record<string, unknown>>();
  for (const chunk of chunks) {
    if (!chunk || typeof chunk.document_id !== 'string') continue;
    if (!chunkByDocument.has(chunk.document_id)) {
      chunkByDocument.set(chunk.document_id, chunk);
    }
  }
  const documentIds = Array.from(chunkByDocument.keys());
  if (documentIds.length === 0) return [];

  const { data: documents } = await input.store
    .from('knowledge_documents')
    .select('id,title,access_class')
    .in('id', documentIds);
  const documentById = new Map(
    (Array.isArray(documents) ? documents : [])
      .filter((row) => row && typeof row.id === 'string')
      .map((row) => [String(row.id), row])
  );

  const { data: knowledgeLinks } = await input.store
    .from('pierrot_project_knowledge')
    .select('project_id,document_id')
    .eq('owner_user_id', input.ownerUserId)
    .in('document_id', documentIds);
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const projectByDocument = new Map<string, PierrotProject>();
  for (const row of Array.isArray(knowledgeLinks) ? knowledgeLinks : []) {
    if (!row || typeof row.project_id !== 'string' || typeof row.document_id !== 'string') continue;
    const project = projectById.get(row.project_id);
    if (project) projectByDocument.set(row.document_id, project);
  }

  const hits: UnifiedSearchHit[] = [];
  for (const documentId of documentIds) {
    const document = documentById.get(documentId);
    const chunk = chunkByDocument.get(documentId);
    if (!document || !chunk) continue;
    const project = projectByDocument.get(documentId) || null;
    if (input.project && project?.id !== input.project.id) continue;
    hits.push({
      source: 'document',
      id: documentId,
      title: typeof document.title === 'string' ? document.title : 'Документ Brain',
      snippet: compact(String(chunk.content || chunk.heading || '')),
      projectId: project?.id || null,
      projectName: project?.name || null,
      projectSlug: project?.slug || null,
      href: project ? `/admin/pierrot?project=${encodeURIComponent(project.slug)}` : null,
      status: typeof document.access_class === 'string' ? document.access_class : null,
      updatedAt: null,
    });
    if (hits.length >= input.limit) break;
  }
  return hits;
}

async function searchGitHubIssues(input: {
  query: string;
  terms: string[];
  project: PierrotProject | null;
  limit: number;
}): Promise<UnifiedSearchHit[]> {
  const repository =
    input.project && /pierrot/i.test(`${input.project.name} ${input.project.slug}`)
      ? 'pierrot'
      : 'newlove';
  // Load the GitHub adapter lazily: it pulls an ESM Octokit build and must not
  // be part of the ordinary conversation-search import path.
  const { executeDevTool } = await import('@/lib/pierrot/dev/tools');
  const execution = await executeDevTool('list_issues', {
    repository,
    state: 'open',
    limit: 50,
  });
  if (!execution.ok) return [];
  const result = execution.result as Record<string, unknown>;
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const terms = input.terms;

  return issues
    .filter((issue) => issue && typeof issue === 'object')
    .map((issue) => issue as Record<string, unknown>)
    .filter((issue) => {
      if (typeof issue.title !== 'string') return false;
      if (terms.length === 0) return true;
      const text = normalize(issue.title);
      return terms.some((term) => text.includes(term));
    })
    .slice(0, input.limit)
    .map((issue) => ({
      source: 'issue' as const,
      id: `${result.repository || repository}#${String(issue.number || '')}`,
      title: String(issue.title || 'GitHub issue'),
      snippet: Array.isArray(issue.labels) ? issue.labels.join(', ') : '',
      projectId: input.project?.id || null,
      projectName: input.project?.name || null,
      projectSlug: input.project?.slug || null,
      href: typeof issue.url === 'string' ? issue.url : null,
      status: typeof issue.state === 'string' ? issue.state : null,
      updatedAt: typeof issue.updatedAt === 'string' ? issue.updatedAt : null,
    }));
}

export async function searchUnifiedOwnerContext(input: {
  store: SupabaseClient;
  ownerUserId: string;
  query: string;
  scope: UnifiedSearchScope;
  project: PierrotProject | null;
  limit?: number;
}): Promise<UnifiedSearchResult> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);
  const aliasTerms = input.project ? projectAliasTerms(input.project) : new Set<string>();
  const terms = unifiedSearchTerms(input.query).filter((term) => !aliasTerms.has(term));
  const notes: string[] = [];
  const projects = await loadProjects(input.store, input.ownerUserId);

  const hits: UnifiedSearchHit[] = [];

  if (input.scope === 'all' || input.scope === 'conversations') {
    hits.push(
      ...(await searchConversationMessages({
        store: input.store,
        ownerUserId: input.ownerUserId,
        terms,
        projects,
        project: input.project,
        limit,
      }).catch(() => []))
    );
  }

  if (['all', 'tasks', 'decisions'].includes(input.scope)) {
    try {
      const linkedIds = new Set(
        input.project
          ? await listDecisionIdsForProject(input.store, input.ownerUserId, input.project.id)
          : []
      );
      const memory = await searchMemory(input.store, {
        userId: input.ownerUserId,
        query: input.query,
        includeArchive: true,
        limit: 40,
      });

      // A project question must include every linked artifact even when its
      // title does not contain the project name.
      const linkedRecords =
        input.project && linkedIds.size > 0
          ? await listMemoryRecordsByIds(
              input.store,
              input.ownerUserId,
              Array.from(linkedIds).slice(0, 500)
            ).catch(() => [])
          : [];
      const byId = new Map<string, PierrotMemoryRecord>();
      for (const record of [...linkedRecords, ...memory.records]) {
        byId.set(record.id, record);
      }

      hits.push(
        ...memoryHits(
          Array.from(byId.values()),
          projects,
          input.scope,
          input.project,
          linkedIds,
          limit
        )
      );
    } catch {
      notes.push('Память сейчас недоступна; результаты по задачам и решениям могут быть неполными.');
    }
  }

  if (input.scope === 'all' || input.scope === 'documents') {
    const [materials, brainDocuments] = await Promise.all([
      searchProjectMaterials({
        store: input.store,
        ownerUserId: input.ownerUserId,
        terms,
        projects,
        project: input.project,
        limit,
      }).catch(() => []),
      searchBrainDocuments({
        store: input.store,
        ownerUserId: input.ownerUserId,
        terms,
        projects,
        project: input.project,
        limit,
      }).catch(() => []),
    ]);
    hits.push(...materials, ...brainDocuments);
  }

  if (
    input.scope === 'issues' ||
    (input.scope === 'all' && /(?:github|issue|issues)/iu.test(input.query))
  ) {
    const issues = await searchGitHubIssues({
      query: input.query,
      terms,
      project: input.project,
      limit,
    }).catch(() => []);
    if (issues.length === 0) notes.push('GitHub Issues не найдены или GitHub недоступен.');
    hits.push(...issues);
  }

  const seen = new Set<string>();
  const unique = hits.filter((hit) => {
    const key = `${hit.source}:${hit.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    query: input.query,
    project: input.project
      ? { id: input.project.id, name: input.project.name, slug: input.project.slug }
      : null,
    hits: unique.slice(0, limit),
    notes,
  };
}
