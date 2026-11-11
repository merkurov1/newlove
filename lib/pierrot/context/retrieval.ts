import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryEmbeddingClient } from '@/lib/pierrot/memory/embeddingTypes';
import {
  listMemoryRecords,
  listMemoryRecordsByIds,
  searchMemory,
} from '@/lib/pierrot/memory/store';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import { mapProject } from '@/lib/pierrot/projects/store';
import { matchUniqueProjectMention, projectMatchesRef } from '@/lib/pierrot/projects/matching';
import { listDecisionIdsForProject } from '@/lib/pierrot/projects/links';
import { listProjectConversationIds } from '@/lib/pierrot/projects/conversation';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { unifiedSearchTerms } from '@/lib/pierrot/search/unified';
import { listEntities, listEntityRelations } from '@/lib/pierrot/entities/store';
import { resolveEntityCandidates } from '@/lib/pierrot/entities/types';
import type { PierrotEntity } from '@/lib/pierrot/entities/types';
import { buildDailyDigest, sortTimeline } from './timeline';
import {
  artifactToTimeline,
  deriveProjectState,
  memoryToTimeline,
  messageToTimeline,
  projectEventToTimeline,
  type ProjectArtifactInput,
  type ProjectEventInput,
} from './state';
import type {
  ContextAmbiguity,
  ContextDocumentBlock,
  ContextHit,
  ContextPeriod,
  ContextQueryPlan,
  ContextQueryResult,
  EvidenceClass,
} from './types';

assertServerOnly('lib/pierrot/context/retrieval');

type ConversationRow = {
  id: string;
  title: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  ingestedAt: string | null;
  messageIndex: number;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function isMissingRelation(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|42703|PGRST204|PGRST205|does not exist|column .* does not exist|relation .*not found/i.test(
    value
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compact(value: string, max = 320): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function excerptAround(content: string, terms: string[], max = 320): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0];
  if (index === undefined) return compact(clean, max);
  const start = Math.max(0, index - Math.floor(max / 3));
  const slice = clean.slice(start, start + max);
  return `${start > 0 ? '…' : ''}${slice.trim()}${start + max < clean.length ? '…' : ''}`;
}

function quotedPhrase(value: string): string | null {
  const match = value.match(/"([^"]{3,120})"|«([^»]{3,120})»|“([^”]{3,120})”/);
  return match ? (match[1] || match[2] || match[3] || '').trim() : null;
}

function searchTerms(plan: ContextQueryPlan): string[] {
  // A daily/achievement query with no topic must retrieve the whole period,
  // not search for the words "what did we do today".
  const source =
    plan.query.trim() ||
    (plan.intent === 'DAILY_SUMMARY' || plan.intent === 'ACHIEVEMENT_LOG'
      ? ''
      : plan.originalQuery);
  return source ? unifiedSearchTerms(source) : [];
}

function messagePatterns(terms: string[]): string[] {
  const patterns = new Set<string>();
  for (const term of terms) {
    const root = term.length > 5 ? term.slice(0, Math.max(4, term.length - 2)) : term;
    patterns.add(`content.ilike.%${escapeLike(root)}%`);
  }
  return Array.from(patterns);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadOwnerProjects(
  store: SupabaseClient,
  ownerUserId: string
): Promise<PierrotProject[]> {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .limit(1000);

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapProject(row as Record<string, unknown>));
}

async function loadOwnerConversations(
  store: SupabaseClient,
  ownerUserId: string
): Promise<ConversationRow[]> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('id,title,started_at,updated_at,last_message_at,user_id,identity_type')
    .eq('user_id', ownerUserId)
    .limit(2000);

  if (error || !Array.isArray(data)) return [];

  return data
    .filter((row) => {
      const item = row as Record<string, unknown>;
      return (
        typeof item.id === 'string' &&
        item.identity_type !== 'visitor' &&
        item.identity_type !== 'unknown'
      );
    })
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id),
        title: text(item.title) || null,
        startedAt: iso(text(item.started_at)),
        updatedAt: iso(text(item.updated_at)),
        lastMessageAt: iso(text(item.last_message_at)),
      };
    });
}

async function loadProjectConversationMap(
  store: SupabaseClient,
  ownerUserId: string,
  conversationIds: string[],
  projects: PierrotProject[]
): Promise<Map<string, PierrotProject>> {
  const map = new Map<string, PierrotProject>();
  const projectById = new Map(projects.map((project) => [project.id, project]));

  for (const project of projects) {
    if (project.conversationId) map.set(project.conversationId, project);
  }

  if (conversationIds.length === 0) return map;

  for (const batch of chunk(conversationIds, 100)) {
    const { data, error } = await store
      .from('pierrot_project_conversations')
      .select('conversation_id,project_id')
      .eq('owner_user_id', ownerUserId)
      .in('conversation_id', batch);
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      const item = row as Record<string, unknown>;
      if (typeof item.conversation_id !== 'string' || typeof item.project_id !== 'string') continue;
      const project = projectById.get(item.project_id);
      if (project) map.set(item.conversation_id, project);
    }
  }

  return map;
}

async function loadMessages(input: {
  store: SupabaseClient;
  conversationIds: string[];
  terms: string[];
  period: ContextPeriod | null;
  limit: number;
  gaps: string[];
}): Promise<MessageRow[]> {
  if (input.conversationIds.length === 0) return [];

  const patterns = messagePatterns(input.terms);
  const results: MessageRow[] = [];

  for (const batch of chunk(input.conversationIds, 80)) {
    for (const withIngested of [true, false]) {
      let query = input.store
        .from('pierrot_messages')
        .select(
          withIngested
            ? 'id,conversation_id,role,content,created_at,ingested_at,message_index'
            : 'id,conversation_id,role,content,created_at,message_index'
        )
        .in('conversation_id', batch);

      if (input.period) {
        query = query.gte('created_at', input.period.from).lt('created_at', input.period.to);
      }
      if (patterns.length > 0) query = query.or(patterns.join(','));

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(input.limit);

      if (error) {
        if (withIngested && isMissingRelation(error)) continue;
        break;
      }

      if (Array.isArray(data)) {
        for (const row of data as unknown[]) {
          const item = row as Record<string, unknown>;
          if (
            typeof item.id !== 'string' ||
            typeof item.conversation_id !== 'string' ||
            (item.role !== 'user' && item.role !== 'assistant') ||
            typeof item.content !== 'string'
          ) {
            continue;
          }
          results.push({
            id: item.id,
            conversationId: item.conversation_id,
            role: item.role,
            content: item.content,
            createdAt: iso(text(item.created_at)) || new Date(0).toISOString(),
            ingestedAt: iso(text(item.ingested_at)),
            messageIndex: Number(item.message_index || 0),
          });
        }
      }
      break;
    }
  }

  const seen = new Set<string>();
  return results
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.messageIndex - right.messageIndex;
    })
    .slice(-input.limit);
}

function scoreMessage(message: MessageRow, terms: string[], phrase: string | null): number {
  const content = message.content.toLowerCase();
  if (phrase && content.includes(phrase.toLowerCase())) return 0.95;

  if (terms.length === 0) return 0.8;

  const matched = terms.filter((term) => {
    const root = term.length > 5 ? term.slice(0, Math.max(4, term.length - 2)) : term;
    return content.includes(root.toLowerCase()) || content.includes(term.toLowerCase());
  }).length;

  if (matched === 0) return 0;
  return Number(
    Math.min(0.93, 0.45 + (matched / terms.length) * 0.4 + (message.role === 'user' ? 0.04 : 0)).toFixed(3)
  );
}

async function loadProjectEvents(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string | null,
  period: ContextPeriod | null,
  gaps: string[]
): Promise<ProjectEventInput[]> {
  const pageSize = 500;
  const maxRows = 2000;
  const rows: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = store
      .from('pierrot_project_events')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('occurred_at', { ascending: false })
      .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));

    if (projectId) query = query.eq('project_id', projectId);
    if (period) query = query.gte('occurred_at', period.from).lt('occurred_at', period.to);

    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error)) {
        gaps.push('Таблица событий проекта ещё не применена; таймлайн собран из сообщений, задач и материалов.');
      } else {
        gaps.push('События проекта временно недоступны; таймлайн может быть неполным.');
      }
      break;
    }

    const page = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  if (rows.length >= maxRows) {
    gaps.push(
      `События проекта ограничены ${maxRows} самыми новыми записями; более ранние события не показаны.`
    );
  }

  return rows
    .map((item): ProjectEventInput | null => {
      if (typeof item.id !== 'string' || typeof item.occurred_at !== 'string') return null;
      return {
        id: item.id,
        projectId: text(item.project_id) || null,
        eventType: text(item.event_type) || 'event',
        title: text(item.title) || text(item.event_type) || 'Событие проекта',
        description: text(item.description),
        occurredAt: iso(text(item.occurred_at)) || item.occurred_at,
        recordedAt: iso(text(item.recorded_at)) || iso(text(item.created_at)) || item.occurred_at,
        evidenceClass: text(item.evidence_class) || 'UNKNOWN',
        sourceType: text(item.source_type) || null,
        sourceId: text(item.source_id) || null,
        sourceConversationId: text(item.source_conversation_id) || null,
        sourceMessageId: text(item.source_message_id) || null,
        confidence: Number(item.confidence ?? 0.7),
        metadata: object(item.metadata),
      };
    })
    .filter((event): event is ProjectEventInput => Boolean(event));
}

async function loadArtifacts(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string | null,
  gaps: string[]
): Promise<ProjectArtifactInput[]> {
  let query = store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;

  if (error) {
    if (!isMissingRelation(error)) gaps.push('Материалы проекта временно недоступны.');
    return [];
  }

  return (Array.isArray(data) ? data : [])
    .map((row): ProjectArtifactInput | null => {
      const item = row as Record<string, unknown>;
      if (typeof item.id !== 'string') return null;
      return {
        id: item.id,
        title: text(item.title) || 'Материал проекта',
        artifactType: text(item.artifact_type) || 'document',
        updatedAt: iso(text(item.updated_at)) || iso(text(item.created_at)) || new Date(0).toISOString(),
        content: text(item.content),
        metadata: object(item.metadata),
      };
    })
    .filter((artifact): artifact is ProjectArtifactInput => Boolean(artifact));
}

async function loadMemories(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProject | null;
  plan: ContextQueryPlan;
  embeddingClient?: MemoryEmbeddingClient | null;
  gaps: string[];
}): Promise<PierrotMemoryRecord[]> {
  const historyMode =
    input.plan.intent === 'PROJECT_HISTORY' ||
    input.plan.intent === 'CONVERSATION_SEARCH' ||
    input.plan.intent === 'ACHIEVEMENT_LOG' ||
    input.plan.intent === 'ENTITY_DISTINCTION' ||
    input.plan.intent === 'DOCUMENT_SEARCH' ||
    input.plan.wantsOriginalSource;
  const byId = new Map<string, PierrotMemoryRecord>();

  let linkedIds: string[] = [];
  if (input.project) {
    try {
      linkedIds = await listDecisionIdsForProject(
        input.store,
        input.ownerUserId,
        input.project.id
      );
    } catch {
      input.gaps.push('Связи решений с проектом временно недоступны.');
    }
  }

  // Linked project IDs are provenance, not a status filter bypass. Every
  // record below still passes the current/history rule.
  if (linkedIds.length > 0) {
    const linked = await listMemoryRecordsByIds(
      input.store,
      input.ownerUserId,
      linkedIds.slice(0, 500)
    ).catch(() => []);
    for (const record of linked) byId.set(record.id, record);
  }

  const query = input.plan.query.trim();
  if (query && input.plan.intent !== 'DAILY_SUMMARY') {
    try {
      const result = await searchMemory(input.store, {
        userId: input.ownerUserId,
        query,
        includeArchive: historyMode,
        limit: 40,
        ...(historyMode ? { historyOnly: true } : {}),
        ...(input.embeddingClient !== undefined
          ? { embeddingClient: input.embeddingClient }
          : {}),
      });
      for (const record of result.records) byId.set(record.id, record);
    } catch {
      input.gaps.push('Семантический поиск по памяти недоступен; использованы сохранённые записи.');
    }
  }

  if (
    !query ||
    input.plan.intent === 'DAILY_SUMMARY' ||
    input.plan.intent === 'ACHIEVEMENT_LOG' ||
    input.plan.intent === 'PROJECT_STATUS'
  ) {
    try {
      const recent = await listMemoryRecords(input.store, {
        userId: input.ownerUserId,
        statuses: historyMode
          ? ['current', 'uncertain', 'completed', 'archived', 'superseded', 'rejected']
          : ['current', 'uncertain', 'completed'],
        includeArchive: historyMode,
        limit: 300,
      });
      for (const record of recent) byId.set(record.id, record);
    } catch {
      input.gaps.push('Память временно недоступна.');
    }
  }

  const now = Date.now();
  const currentRecord = (record: PierrotMemoryRecord): boolean => {
    if (historyMode) return true;
    if (['archived', 'superseded', 'rejected'].includes(record.status)) return false;
    if (record.validUntil) {
      const until = Date.parse(record.validUntil);
      if (Number.isFinite(until) && until <= now) return false;
    }
    if (record.validFrom) {
      const from = Date.parse(record.validFrom);
      if (Number.isFinite(from) && from > now) return false;
    }
    return true;
  };

  const records = Array.from(byId.values()).filter(currentRecord);
  if (!input.project) return records;

  const linked = new Set(linkedIds);
  return records.filter(
    (record) =>
      linked.has(record.id) ||
      (record.project &&
        (projectMatchesRef(input.project as PierrotProject, record.project) ||
          record.project === input.project?.name))
  );
}

async function loadBrain(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProject | null;
  plan: ContextQueryPlan;
  terms: string[];
  gaps: string[];
}): Promise<{ hits: ContextHit[]; documents: ContextDocumentBlock[] }> {
  if (input.terms.length === 0) return { hits: [], documents: [] };

  const patterns = input.terms.slice(0, 8).map((term) => `title.ilike.%${escapeLike(term)}%`);
  let documents: Array<Record<string, unknown>> = [];

  const titleResult = await input.store
    .from('knowledge_documents')
    .select('*')
    .eq('access_class', 'owner')
    .or(patterns.join(','))
    .limit(24);

  if (titleResult.error) {
    if (!isMissingRelation(titleResult.error)) input.gaps.push('Brain временно недоступен.');
    return { hits: [], documents: [] };
  }
  documents = Array.isArray(titleResult.data)
    ? (titleResult.data as Array<Record<string, unknown>>)
    : [];

  // Content fallback: an indexed document may have an unrelated title.
  if (documents.length === 0) {
    const chunkPatterns = input.terms
      .slice(0, 8)
      .map((term) => `content.ilike.%${escapeLike(term)}%`);
    const chunkResult = await input.store
      .from('knowledge_chunks')
      .select('id,document_id,content,heading,section_path,section_index')
      .or(chunkPatterns.join(','))
      .limit(160);

    if (chunkResult.error) {
      if (!isMissingRelation(chunkResult.error)) input.gaps.push('Тексты Brain временно недоступны.');
      return { hits: [], documents: [] };
    }

    const rows = Array.isArray(chunkResult.data)
      ? (chunkResult.data as Array<Record<string, unknown>>)
      : [];
    const documentIds = Array.from(
      new Set(
        rows
          .map((row) => text(row.document_id))
          .filter(Boolean)
      )
    ).slice(0, 16);

    if (documentIds.length > 0) {
      const docResult = await input.store
        .from('knowledge_documents')
        .select('*')
        .in('id', documentIds);
      documents = Array.isArray(docResult.data)
        ? (docResult.data as Array<Record<string, unknown>>)
        : [];
    }
  }

  if (documents.length === 0) return { hits: [], documents: [] };

  const documentIds = documents.map((document) => text(document.id)).filter(Boolean);
  let linkedDocumentIds = new Set<string>();
  if (input.project && documentIds.length > 0) {
    const { data } = await input.store
      .from('pierrot_project_knowledge')
      .select('document_id')
      .eq('owner_user_id', input.ownerUserId)
      .eq('project_id', input.project.id)
      .in('document_id', documentIds);
    linkedDocumentIds = new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => text((row as Record<string, unknown>).document_id))
        .filter(Boolean)
    );

    // The entity layer can link a Brain document to a project even when the
    // legacy project-knowledge relation is empty (for example after a corpus
    // backfill). Treat that explicit entity relation as project association.
    const { data: projectEntities } = await input.store
      .from('pierrot_entities')
      .select('source_refs')
      .eq('owner_user_id', input.ownerUserId)
      .eq('project_id', input.project.id)
      .in('entity_type', ['BOOK', 'DOCUMENT'])
      .limit(500);
    for (const row of Array.isArray(projectEntities) ? projectEntities : []) {
      const refs = (row as Record<string, unknown>).source_refs;
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object') continue;
        const item = ref as Record<string, unknown>;
        if (item.type === 'knowledge_document' && typeof item.id === 'string') {
          linkedDocumentIds.add(item.id);
        }
      }
    }
  }

  const hits: ContextHit[] = [];
  const blocks: ContextDocumentBlock[] = [];

  for (const document of documents) {
    const documentId = text(document.id);
    if (!documentId) continue;
    if (
      input.project &&
      input.plan.intent !== 'DOCUMENT_SEARCH' &&
      !linkedDocumentIds.has(documentId)
    ) {
      continue;
    }

    const { data: chunks } = await input.store
      .from('knowledge_chunks')
      .select('id,document_id,content,heading,section_path,section_index')
      .eq('document_id', documentId)
      .order('section_index', { ascending: true })
      .limit(80);

    const chunkRows = Array.isArray(chunks)
      ? (chunks as Array<Record<string, unknown>>)
      : [];
    const title = text(document.title) || 'Документ Brain';
    const headings = Array.from(
      new Set(
        chunkRows
          .map((row) => text(row.heading))
          .filter((heading) => heading.length > 0)
      )
    ).slice(0, 40);

    blocks.push({
      documentId,
      title,
      sourceType: text(document.source_type) || 'document',
      sectionCount: Number(document.chunk_count || chunkRows.length || 0),
      headings,
      truncated: chunkRows.length >= 80,
    });

    for (const row of chunkRows.slice(0, 20)) {
      const content = text(row.content);
      if (!content) continue;
      const heading = text(row.heading);
      const matched = input.terms.some((term) => {
        const lower = `${heading} ${content}`.toLowerCase();
        return lower.includes(term.toLowerCase());
      });
      if (!matched && input.plan.intent !== 'DOCUMENT_SEARCH') continue;

      hits.push({
        id: text(row.id) || `${documentId}:${text(row.section_index)}`,
        sourceType: 'document_chunk',
        sourceId: documentId,
        conversationId: null,
        messageId: null,
        projectId: input.project?.id || null,
        projectName: input.project?.name || null,
        projectSlug: input.project?.slug || null,
        entityId: null,
        title: heading ? `${title} · ${heading}` : title,
        excerpt: compact(content, 420),
        eventAt: iso(text(document.updated_at)) || iso(text(document.created_at)),
        ingestedAt: iso(text(document.created_at)),
        retrievalMethod: 'keyword',
        confidence: matched ? 0.74 : 0.9,
        evidenceClass: 'DOCUMENTED',
        href: input.project
          ? `/admin/pierrot?project=${encodeURIComponent(input.project.slug)}`
          : '/admin/brain',
        metadata: {
          documentId,
          heading,
          sectionPath: Array.isArray(row.section_path) ? row.section_path : [],
          sectionIndex: Number(row.section_index || 0),
          linkedToProject: linkedDocumentIds.has(documentId),
        },
      });
    }
  }

  return { hits, documents: blocks };
}

async function loadGraphHits(input: {
  store: SupabaseClient;
  terms: string[];
  gaps: string[];
}): Promise<ContextHit[]> {
  if (input.terms.length === 0) return [];
  const patterns = input.terms
    .slice(0, 5)
    .flatMap((term) => [
      `canonical_name.ilike.%${escapeLike(term)}%`,
      `normalized_name.ilike.%${escapeLike(term)}%`,
    ]);

  const { data: entities, error } = await input.store
    .from('brain_entities')
    .select('id,entity_type,canonical_name,description,aliases,confidence')
    .or(patterns.join(','))
    .limit(16);

  if (error) {
    if (!isMissingRelation(error)) {
      input.gaps.push('Граф знаний временно недоступен.');
    }
    return [];
  }

  const hits: ContextHit[] = [];
  for (const row of Array.isArray(entities) ? (entities as Array<Record<string, unknown>>) : []) {
    const entityId = text(row.id);
    const name = text(row.canonical_name);
    if (!entityId || !name) continue;

    const { data: mentions } = await input.store
      .from('brain_entity_mentions')
      .select('document_id,chunk_id,evidence,confidence,section_path')
      .eq('entity_id', entityId)
      .limit(8);

    const mentionRows = Array.isArray(mentions)
      ? (mentions as Array<Record<string, unknown>>)
      : [];
    if (mentionRows.length === 0) {
      hits.push({
        id: `graph:${entityId}`,
        sourceType: 'entity',
        sourceId: entityId,
        conversationId: null,
        messageId: null,
        projectId: null,
        projectName: null,
        projectSlug: null,
        entityId,
        title: name,
        excerpt: text(row.description) || `${text(row.entity_type)}: ${name}`,
        eventAt: null,
        ingestedAt: null,
        retrievalMethod: 'entity',
        confidence: Number(row.confidence ?? 0.6),
        evidenceClass: 'DOCUMENTED',
        href: '/admin/brain/graph',
        metadata: {
          entityType: text(row.entity_type),
          graphEntity: true,
        },
      });
      continue;
    }

    for (const mention of mentionRows.slice(0, 4)) {
      const documentId = text(mention.document_id);
      const chunkId = text(mention.chunk_id);
      if (!documentId) continue;
      hits.push({
        id: `graph:${entityId}:${chunkId || documentId}`,
        sourceType: 'document_chunk',
        sourceId: chunkId || documentId,
        conversationId: null,
        messageId: null,
        projectId: null,
        projectName: null,
        projectSlug: null,
        entityId,
        title: `Граф: ${name}`,
        excerpt: compact(text(mention.evidence) || text(row.description) || name, 360),
        eventAt: null,
        ingestedAt: null,
        retrievalMethod: 'entity',
        confidence: Math.min(0.95, Number(mention.confidence ?? row.confidence ?? 0.6)),
        evidenceClass: 'DOCUMENTED',
        href: '/admin/brain/graph',
        metadata: {
          entityType: text(row.entity_type),
          documentId,
          chunkId: chunkId || null,
          sectionPath: Array.isArray(mention.section_path) ? mention.section_path : [],
          graphEntity: true,
        },
      });
    }
  }

  return hits;
}

function findEntityAmbiguities(
  entities: PierrotEntity[],
  plan: ContextQueryPlan,
  project: PierrotProject | null
): ContextAmbiguity[] {
  const text = `${plan.originalQuery} ${plan.query}`.toLowerCase();
  const matching = entities.filter((entity) => {
    const names = [entity.name, entity.canonicalName, ...entity.aliases]
      .map((value) => value.toLowerCase().trim())
      .filter((value) => value.length >= 3);
    return names.some((name) => text.includes(name));
  });

  const groups = new Map<string, PierrotEntity[]>();
  for (const entity of matching) {
    const key = entity.canonicalName;
    const list = groups.get(key) || [];
    list.push(entity);
    groups.set(key, list);
  }

  const ambiguities: ContextAmbiguity[] = [];
  for (const [name, list] of groups) {
    if (list.length <= 1) continue;
    const resolution = resolveEntityCandidates({
      entities: list,
      query: name,
      typeHint: plan.entityTypeHint,
      projectId: project?.id || null,
    });
    if (!resolution.ambiguous && plan.intent !== 'ENTITY_DISTINCTION') continue;
    ambiguities.push({
      name,
      reason: resolution.reason === 'MULTIPLE_TYPES' ? 'MULTIPLE_TYPES' : 'MULTIPLE_ENTITIES',
      candidates: resolution.candidates.map((candidate) => ({
        id: candidate.entity.id,
        entityType: candidate.entity.entityType,
        name: candidate.entity.name,
        description: candidate.entity.description,
        projectId: candidate.entity.projectId,
        status: candidate.entity.status,
        score: candidate.score,
        aliases: candidate.entity.aliases,
      })),
      hint: plan.entityTypeHint,
    });
  }

  return ambiguities;
}

function hitHref(
  project: PierrotProject | null,
  message: MessageRow | null,
  conversationId: string
): string {
  if (project) return `/admin/pierrot?project=${encodeURIComponent(project.slug)}`;
  return `/admin/pierrot?conversation=${encodeURIComponent(conversationId)}`;
}

async function collect(input: {
  store: SupabaseClient;
  ownerUserId: string;
  plan: ContextQueryPlan;
  project: PierrotProject | null;
  embeddingClient?: MemoryEmbeddingClient | null;
}): Promise<ContextQueryResult> {
  const { store, ownerUserId, plan, project } = input;
  const gaps: string[] = [];
  const notes: string[] = [];
  const projects = await loadOwnerProjects(store, ownerUserId);

  let conversations = await loadOwnerConversations(store, ownerUserId);
  let conversationIds = conversations.map((conversation) => conversation.id);

  if (project) {
    const linked = await listProjectConversationIds(store, ownerUserId, project.id).catch(
      () => []
    );
    const projectConversationIds = new Set(
      [project.conversationId, ...linked].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
    );
    conversationIds = Array.from(projectConversationIds);
    conversations = conversations.filter((conversation) =>
      projectConversationIds.has(conversation.id)
    );
  }

  const terms = searchTerms(plan);
  const phrase = quotedPhrase(plan.originalQuery);
  const messageLimit =
    plan.intent === 'DAILY_SUMMARY'
      ? 500
      : plan.intent === 'PROJECT_HISTORY'
        ? 240
        : 80;

  const messages =
    conversationIds.length > 0
      ? await loadMessages({
          store,
          conversationIds,
          terms: phrase ? [...terms, phrase] : terms,
          period: plan.period,
          limit: messageLimit,
          gaps,
        })
      : [];

  const projectByConversation = await loadProjectConversationMap(
    store,
    ownerUserId,
    conversations.map((conversation) => conversation.id),
    projects
  );
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  const messageHits: ContextHit[] = messages
    .map((message): ContextHit | null => {
      const score = scoreMessage(message, terms, phrase);
      if (terms.length > 0 && score <= 0) return null;
      const conversation = conversationById.get(message.conversationId);
      const messageProject =
        project || projectByConversation.get(message.conversationId) || null;
      const method =
        phrase && message.content.toLowerCase().includes(phrase.toLowerCase())
          ? 'exact_phrase'
          : terms.length === 0
            ? 'chronological'
            : 'keyword';

      return {
        id: `message:${message.id}`,
        sourceType: 'message',
        sourceId: message.id,
        conversationId: message.conversationId,
        messageId: message.id,
        projectId: messageProject?.id || null,
        projectName: messageProject?.name || null,
        projectSlug: messageProject?.slug || null,
        entityId: null,
        title: `${conversation?.title || 'Диалог'} · ${message.createdAt.slice(0, 10)}`,
        excerpt: `${message.role === 'assistant' ? 'Pierrot' : 'Owner'}: ${excerptAround(
          message.content,
          terms,
          360
        )}`,
        eventAt: message.createdAt,
        ingestedAt: message.ingestedAt,
        retrievalMethod: method,
        confidence: score,
        evidenceClass: 'DIRECTLY_OBSERVED' as EvidenceClass,
        href: hitHref(messageProject, message, message.conversationId),
        metadata: {
          role: message.role,
          conversationTitle: conversation?.title || null,
          messageIndex: message.messageIndex,
        },
      } satisfies ContextHit;
    })
    .filter((hit): hit is ContextHit => hit !== null);

  const memoryRecords = await loadMemories({
    store,
    ownerUserId,
    project,
    plan,
    embeddingClient: input.embeddingClient,
    gaps,
  });

  const memoryHits: ContextHit[] = memoryRecords.map((record) => {
    const sourceType =
      record.kind === 'task' || record.kind === 'reminder'
        ? 'task'
        : record.kind === 'decision' ||
            record.kind === 'position' ||
            record.kind === 'constraint' ||
            record.kind === 'preference'
          ? 'decision'
          : record.kind === 'saved'
            ? 'deliverable'
            : 'decision';
    return {
      id: `memory:${record.id}`,
      sourceType,
      sourceId: record.id,
      conversationId: record.conversationId,
      messageId: record.messageId,
      projectId: project?.id || null,
      projectName: project?.name || record.project || null,
      projectSlug: project?.slug || null,
      entityId: null,
      title: record.title,
      excerpt: compact(record.content, 320),
      eventAt: record.decidedAt || record.updatedAt || record.createdAt,
      ingestedAt: record.createdAt,
      retrievalMethod: 'hybrid',
      confidence: Math.max(record.confidence || 0.6, record.importance || 0.5),
      evidenceClass: record.confidence >= 0.6 ? 'USER_CONFIRMED' : 'INFERRED',
      href: project
        ? `/admin/pierrot?project=${encodeURIComponent(project.slug)}`
        : null,
      metadata: {
        kind: record.kind,
        status: record.status,
        importance: record.importance,
        confidence: record.confidence,
        projectName: project?.name || record.project || null,
      },
    } satisfies ContextHit;
  });

  const projectEventInputs = await loadProjectEvents(
    store,
    ownerUserId,
    project?.id || null,
    plan.intent === 'DAILY_SUMMARY' || plan.intent === 'ACHIEVEMENT_LOG' ? plan.period : null,
    gaps
  );

  const artifacts = await loadArtifacts(store, ownerUserId, project?.id || null, gaps);

  const brain = await loadBrain({
    store,
    ownerUserId,
    project,
    plan,
    terms,
    gaps,
  });

  const graphHits = await loadGraphHits({ store, terms, gaps });

  const entities = await listEntities(store, ownerUserId, { limit: 1000 });
  const ambiguities = findEntityAmbiguities(entities, plan, project);
  const relations = project
    ? await listEntityRelations(store, ownerUserId, { projectId: project.id, limit: 500 })
    : [];

  const timeline = sortTimeline([
    ...messages.map((message) =>
      messageToTimeline(
        {
          id: message.id,
          conversationId: message.conversationId,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          ingestedAt: message.ingestedAt,
          conversationTitle: conversationById.get(message.conversationId)?.title || null,
          projectId: project?.id || projectByConversation.get(message.conversationId)?.id || null,
          projectName: project?.name || projectByConversation.get(message.conversationId)?.name || null,
          projectSlug: project?.slug || projectByConversation.get(message.conversationId)?.slug || null,
        },
        project || projectByConversation.get(message.conversationId) || null
      )
    ),
    ...memoryRecords.map((record) => memoryToTimeline(record, project)),
    ...artifacts.map((artifact) => artifactToTimeline(artifact, project)),
    ...projectEventInputs.map((event) => projectEventToTimeline(event, project)),
  ]);

  const daily =
    plan.intent === 'DAILY_SUMMARY' ||
    plan.intent === 'ACHIEVEMENT_LOG' ||
    (plan.intent === 'PROJECT_STATUS' && !project)
      ? buildDailyDigest({ events: timeline, timezone: plan.timezone, period: plan.period, gaps })
      : null;

  const projectState = project
    ? deriveProjectState({
        project,
        events: timeline,
        entities,
        relations,
        gaps,
      })
    : null;

  const hits = [...messageHits, ...memoryHits, ...brain.hits, ...graphHits];
  const deduped = new Map<string, ContextHit>();
  for (const hit of hits) {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    const existing = deduped.get(key);
    if (!existing || existing.confidence < hit.confidence) deduped.set(key, hit);
  }

  const chronological =
    plan.intent === 'PROJECT_HISTORY' ||
    plan.intent === 'DAILY_SUMMARY' ||
    plan.intent === 'ACHIEVEMENT_LOG' ||
    plan.intent === 'PROJECT_STATUS';

  const ordered = Array.from(deduped.values()).sort((left, right) => {
    if (chronological) {
      const leftTime = left.eventAt ? Date.parse(left.eventAt) : 0;
      const rightTime = right.eventAt ? Date.parse(right.eventAt) : 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
    }
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    const leftTime = left.eventAt ? Date.parse(left.eventAt) : 0;
    const rightTime = right.eventAt ? Date.parse(right.eventAt) : 0;
    return rightTime - leftTime;
  });

  const maxHits =
    plan.intent === 'DAILY_SUMMARY'
      ? 500
      : plan.intent === 'PROJECT_HISTORY'
        ? 160
        : 60;

  if (!plan.timezoneKnown) {
    gaps.push(
      'Часовой пояс владельца не настроен; границы дня рассчитаны в UTC и могут быть приблизительными.'
    );
  }
  if (conversations.length === 0) {
    gaps.push('Сохранённых диалогов владельца не найдено.');
  }
  if (plan.period && messages.length === 0) {
    gaps.push('За выбранный период сообщений не найдено. Это не означает отсутствия работы.');
  }
  if (messages.length >= messageLimit) {
    gaps.push(
      `История ограничена последними ${messageLimit} сообщениями; более ранние события не показаны.`
    );
  }
  if (terms.length === 0 && plan.intent !== 'DAILY_SUMMARY' && plan.intent !== 'ACHIEVEMENT_LOG') {
    notes.push('Запрос без предметных слов: показана хронология, а не произвольная выборка.');
  }

  return {
    plan,
    hits: ordered.slice(0, Math.max(1, maxHits)),
    documents: brain.documents,
    timeline,
    daily,
    projectState,
    ambiguities,
    notes,
    gaps: Array.from(new Set([...gaps, ...(daily?.gaps || [])])),
    counts: {
      messages: messages.length,
      conversations: new Set(messages.map((message) => message.conversationId)).size,
      projects: projects.length,
      tasks: memoryRecords.filter(
        (record) => record.kind === 'task' || record.kind === 'reminder'
      ).length,
      decisions: memoryRecords.filter(
        (record) =>
          record.kind === 'decision' ||
          record.kind === 'position' ||
          record.kind === 'constraint' ||
          record.kind === 'preference'
      ).length,
      documents: brain.documents.length,
      projectEvents: projectEventInputs.length,
      entities: entities.length,
    },
    widenedFromProject: false,
  };
}

/**
 * Runs the owner-wide context query. The caller supplies the already-resolved
 * project (if any). Ambiguous entity names are reported, never silently
 * collapsed into one project.
 */
export async function runContextQuery(input: {
  store: SupabaseClient;
  ownerUserId: string;
  plan: ContextQueryPlan;
  project?: PierrotProject | null;
  embeddingClient?: MemoryEmbeddingClient | null;
  /** Project-chat searches widen to all conversations when nothing is found. */
  widenIfEmpty?: boolean;
}): Promise<ContextQueryResult> {
  const project = input.project || null;
  const result = await collect({
    store: input.store,
    ownerUserId: input.ownerUserId,
    plan: input.plan,
    project,
    embeddingClient: input.embeddingClient,
  });

  if (
    project &&
    input.widenIfEmpty !== false &&
    result.hits.length === 0 &&
    (input.plan.intent === 'CONVERSATION_SEARCH' || input.plan.intent === 'PROJECT_HISTORY')
  ) {
    const widened = await collect({
      store: input.store,
      ownerUserId: input.ownerUserId,
      plan: input.plan,
      project: null,
      embeddingClient: input.embeddingClient,
    });
    return {
      ...widened,
      notes: [
        ...widened.notes,
        `В проекте «${project.name}» совпадений не найдено; поиск расширен на все диалоги владельца.`,
      ],
      gaps: [...widened.gaps, ...result.gaps],
      widenedFromProject: true,
    };
  }

  return result;
}

/** Resolves a project mentioned in a context query without creating one. */
export async function resolveContextProject(
  store: SupabaseClient,
  ownerUserId: string,
  plan: ContextQueryPlan
): Promise<PierrotProject | null> {
  const projects = await loadOwnerProjects(store, ownerUserId);
  if (plan.projectHint) {
    const matches = projects.filter((project) => projectMatchesRef(project, plan.projectHint || ''));
    if (matches.length === 1) return matches[0];
  }
  return matchUniqueProjectMention(projects, plan.originalQuery);
}
