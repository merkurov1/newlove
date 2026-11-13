import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  CONTAINER_EPISODE,
  SPECTRAL_TIGER_EPISODE,
  type UnframedEpisode,
} from '@/lib/unframed/episodes';
import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import {
  UNFRAMED_MANUSCRIPT_ID,
  loadManuscriptInventory,
  type ManuscriptInventory,
} from '@/lib/knowledge/rag/manuscript';
import { formatCoverage, manuscriptPartCount } from '@/lib/knowledge/rag/manuscriptStructure';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

assertServerOnly('lib/pierrot/editorial/project');

/**
 * UNFRAMED as an editorial project, not only a manuscript.
 *
 * All project relations are read from the existing project workspace tables
 * and the existing Brain documents. Nothing is invented: a document becomes a
 * project material only when it is explicitly linked or when its identity is
 * unambiguous (title/source path starts with UNFRAMED or contains /unframed).
 */

export const UNFRAMED_PROJECT_SLUG = 'unframed';

export type ProjectMaterial = {
  id: string;
  title: string;
  sourceType: string;
  sourcePath: string;
  chunkCount: number;
  sourceCharCount: number;
  ingestionStatus: string | null;
  extractionStatus: string | null;
  relation: 'linked' | 'verified_identity';
  role: 'manuscript' | 'episode' | 'blueprint' | 'research' | 'other';
};

export type ProjectDecisionView = {
  id: string;
  title: string;
  content: string;
  kind: string;
  status: string;
  decidedAt: string | null;
  projectName: string | null;
};

export type ProjectEpisodeView = {
  number: number;
  slug: string;
  title: string;
  year: string | null;
  seriesLabel: string;
  videoUrl: string;
  statement: string;
  chapterLabel: string | null;
  chapterNumber: number | null;
  bookUrl: string;
  source: 'repository_dataset';
  brainDocumentId: string | null;
};

export type ProjectConversationExcerpt = {
  conversationId: string;
  messageId: string;
  role: 'user' | 'assistant';
  createdAt: string | null;
  excerpt: string;
};

export type UnframedProjectState = {
  project: PierrotProject | null;
  projectUnavailable: string | null;
  materials: ProjectMaterial[];
  materialsUnavailable: string | null;
  blueprintSections: string[];
  blueprintExcerpt: string | null;
  episodes: ProjectEpisodeView[];
  decisions: ProjectDecisionView[];
  decisionsUnavailable: string | null;
  openTasks: ProjectDecisionView[];
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  artifacts: Array<{ id: string; title: string; type: string; updatedAt: string }>;
  manuscript: ManuscriptInventory | null;
  manuscriptUnavailable: string | null;
};

const PROJECT_COLUMNS =
  'id,owner_user_id,slug,name,description,objective,status,priority,project_brief,brief_revision,conversation_id,last_activity_at,created_at,updated_at';

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mapProject(row: Record<string, unknown>): PierrotProject {
  return {
    id: text(row.id),
    ownerUserId: text(row.owner_user_id),
    slug: text(row.slug),
    name: text(row.name),
    description: text(row.description),
    objective: text(row.objective),
    status: (['active', 'paused', 'archived'].includes(text(row.status))
      ? text(row.status)
      : 'active') as PierrotProject['status'],
    priority: Number(row.priority || 0),
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: text(row.conversation_id) || null,
    projectBrief: text(row.project_brief),
    briefRevision: Number(row.brief_revision || 1),
    lastActivityAt: text(row.last_activity_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function loadUnframedProject(input: {
  ownerUserId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  includeManuscript?: boolean;
}): Promise<UnframedProjectState> {
  const env = input.env ?? process.env;
  const store =
    input.store ??
    (input.env
      ? createServiceClient(input.env)
      : getServerSupabaseClient({ useServiceRole: true }));

  const state: UnframedProjectState = {
    project: null,
    projectUnavailable: null,
    materials: [],
    materialsUnavailable: null,
    blueprintSections: [],
    blueprintExcerpt: null,
    episodes: [],
    decisions: [],
    decisionsUnavailable: null,
    openTasks: [],
    conversations: [],
    artifacts: [],
    manuscript: null,
    manuscriptUnavailable: null,
  };

  if (!store) {
    state.projectUnavailable = 'project_store_unavailable';
    state.materialsUnavailable = 'project_store_unavailable';
    state.decisionsUnavailable = 'project_store_unavailable';
    return state;
  }

  const projectResult = await store
    .from('pierrot_projects')
    .select(PROJECT_COLUMNS)
    .eq('owner_user_id', input.ownerUserId)
    .eq('slug', UNFRAMED_PROJECT_SLUG)
    .maybeSingle();

  if (projectResult.error) {
    state.projectUnavailable = projectResult.error.message;
    state.materialsUnavailable = projectResult.error.message;
    state.decisionsUnavailable = projectResult.error.message;
    return state;
  }
  state.project = projectResult.data
    ? mapProject(projectResult.data as Record<string, unknown>)
    : null;

  if (state.project) {
    await Promise.all([
      loadMaterials(store, input.ownerUserId, state.project.id, state),
      loadDecisions(store, input.ownerUserId, state.project.id, state),
      loadConversationsAndArtifacts(store, input.ownerUserId, state.project.id, state),
    ]);
    await loadBlueprintContext(store, state);
  }

  state.episodes = buildEpisodeIndex(state.materials);

  if (input.includeManuscript !== false) {
    try {
      state.manuscript = await loadManuscriptInventory({
        store: input.store ?? null,
        env,
        useCache: true,
      });
    } catch (error) {
      state.manuscriptUnavailable =
        error instanceof Error ? `${error.name}:${error.message}` : 'manuscript_unavailable';
    }
  }

  return state;
}

async function loadMaterials(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  state: UnframedProjectState
): Promise<void> {
  const links = await store
    .from('pierrot_project_knowledge')
    .select('document_id')
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .limit(500);

  if (links.error) {
    state.materialsUnavailable = links.error.message;
    return;
  }

  const linkedIds = new Set(
    (Array.isArray(links.data) ? links.data : [])
      .map((row) => (row && typeof row.document_id === 'string' ? row.document_id : ''))
      .filter(Boolean)
  );

  const documents: Array<Record<string, unknown>> = [];

  if (linkedIds.size > 0) {
    const linked = await store
      .from('knowledge_documents')
      .select(
        'id,title,source_type,source_path,chunk_count,source_char_count,ingestion_status,extraction_status'
      )
      .in('id', Array.from(linkedIds));
    if (linked.error) {
      state.materialsUnavailable = linked.error.message;
      return;
    }
    for (const row of linked.data || []) documents.push(row as Record<string, unknown>);
  }

  // Unambiguous identity fallback. This does not create a relation; it lets the
  // project overview name verified material that exists in Brain even before
  // the relation backfill is applied.
  const identified = await store
    .from('knowledge_documents')
    .select(
      'id,title,source_type,source_path,chunk_count,source_char_count,ingestion_status,extraction_status'
    )
    .or(
      `title.ilike.UNFRAMED%,title.ilike.%Episode%unframed%,source_path.ilike.%/unframed%,source_path.ilike.%unframed%`
    )
    .limit(100);

  if (!identified.error) {
    for (const row of identified.data || []) {
      if (!documents.some((item) => item.id === (row as Record<string, unknown>).id)) {
        documents.push(row as Record<string, unknown>);
      }
    }
  } else if (linkedIds.size === 0) {
    state.materialsUnavailable = identified.error.message;
  }

  state.materials = documents
    .map((row): ProjectMaterial | null => {
      const id = text(row.id);
      const title = text(row.title);
      if (!id || !title) return null;
      const sourcePath = text(row.source_path);
      const role = materialRole({ id, title, sourceType: text(row.source_type), sourcePath });
      return {
        id,
        title,
        sourceType: text(row.source_type),
        sourcePath,
        chunkCount: Number(row.chunk_count || 0),
        sourceCharCount: Number(row.source_char_count || 0),
        ingestionStatus: text(row.ingestion_status) || null,
        extractionStatus: text(row.extraction_status) || null,
        relation: linkedIds.has(id) ? 'linked' : 'verified_identity',
        role,
      };
    })
    .filter((item): item is ProjectMaterial => item !== null)
    .sort((left, right) => {
      if (left.role === 'manuscript' && right.role !== 'manuscript') return -1;
      if (right.role === 'manuscript' && left.role !== 'manuscript') return 1;
      return left.title.localeCompare(right.title);
    });
}

function materialRole(input: {
  id: string;
  title: string;
  sourceType: string;
  sourcePath: string;
}): ProjectMaterial['role'] {
  if (input.id === UNFRAMED_MANUSCRIPT_ID || input.sourceType === 'manuscript') return 'manuscript';
  if (/episode|выпуск/i.test(input.title) || /\/unframed\/(container|spectral-tiger)/i.test(input.sourcePath)) {
    return 'episode';
  }
  if (/blueprint|master\s+project/i.test(input.title)) return 'blueprint';
  if (input.sourceType === 'research') return 'research';
  return 'other';
}

async function loadBlueprintContext(
  store: SupabaseClient,
  state: UnframedProjectState
): Promise<void> {
  const blueprint = state.materials.find((material) => material.role === 'blueprint');
  if (!blueprint) return;

  const { data, error } = await store
    .from('knowledge_chunks')
    .select('chunk_index,heading,content')
    .eq('document_id', blueprint.id)
    .eq('access_class', 'owner')
    .order('chunk_index', { ascending: true })
    .limit(12);

  if (error || !Array.isArray(data)) return;

  state.blueprintSections = data
    .map((row) => {
      const item = row as Record<string, unknown>;
      return text(item.heading);
    })
    .filter(Boolean)
    .slice(0, 12);

  const opening = data
    .map((row) => text((row as Record<string, unknown>).content))
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim();
  state.blueprintExcerpt = opening ? opening.slice(0, 1_400) : null;
}

async function loadDecisions(  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  state: UnframedProjectState
): Promise<void> {
  const links = await store
    .from('pierrot_project_decisions')
    .select('decision_id')
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .limit(500);

  if (links.error) {
    state.decisionsUnavailable = links.error.message;
    return;
  }

  const ids = (Array.isArray(links.data) ? links.data : [])
    .map((row) => (row && typeof row.decision_id === 'string' ? row.decision_id : ''))
    .filter(Boolean);
  if (ids.length === 0) return;

  const decisions = await store
    .from('pierrot_decisions')
    .select('id,title,content,kind,status,decided_at,created_at,project')
    .in('id', ids)
    .limit(500);

  if (decisions.error) {
    state.decisionsUnavailable = decisions.error.message;
    return;
  }

  const all = (Array.isArray(decisions.data) ? decisions.data : [])
    .map((row): ProjectDecisionView | null => {
      const item = row as Record<string, unknown>;
      const id = text(item.id);
      if (!id) return null;
      return {
        id,
        title: text(item.title),
        content: text(item.content),
        kind: text(item.kind) || 'memory',
        status: text(item.status) || 'current',
        decidedAt: text(item.decided_at) || text(item.created_at) || null,
        projectName: text(item.project) || null,
      };
    })
    .filter((item): item is ProjectDecisionView => item !== null)
    .sort((left, right) => (right.decidedAt || '').localeCompare(left.decidedAt || ''));

  state.decisions = all.filter((item) => item.status !== 'archived');
  state.openTasks = all.filter(
    (item) =>
      (item.kind === 'task' || item.kind === 'reminder') &&
      ['current', 'uncertain', 'active', 'open', 'in_progress'].includes(item.status)
  );
}

async function loadConversationsAndArtifacts(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  state: UnframedProjectState
): Promise<void> {
  const [links, artifacts] = await Promise.all([
    store
      .from('pierrot_project_conversations')
      .select('conversation_id')
      .eq('owner_user_id', ownerUserId)
      .eq('project_id', projectId)
      .limit(100),
    store
      .from('pierrot_project_artifacts')
      .select('id,title,artifact_type,updated_at')
      .eq('owner_user_id', ownerUserId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  if (Array.isArray(artifacts.data)) {
    state.artifacts = artifacts.data.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: text(item.id),
        title: text(item.title),
        type: text(item.artifact_type),
        updatedAt: text(item.updated_at),
      };
    });
  }

  const ids = (Array.isArray(links.data) ? links.data : [])
    .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
    .filter(Boolean);
  const conversationIds = Array.from(
    new Set([...(state.project?.conversationId ? [state.project.conversationId] : []), ...ids])
  );
  if (conversationIds.length === 0) return;

  const conversations = await store
    .from('pierrot_conversations')
    .select('id,title,last_message_at,updated_at,started_at')
    .in('id', conversationIds)
    .limit(100);
  if (!conversations.error && Array.isArray(conversations.data)) {
    state.conversations = conversations.data
      .map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: text(item.id),
          title: text(item.title) || 'UNFRAMED project chat',
          updatedAt:
            text(item.last_message_at) || text(item.updated_at) || text(item.started_at),
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}

export function buildEpisodeIndex(materials: ProjectMaterial[]): ProjectEpisodeView[] {
  const brainEpisodeDocs = materials.filter((material) => material.role === 'episode');
  const staticEpisodes: UnframedEpisode[] = [CONTAINER_EPISODE, SPECTRAL_TIGER_EPISODE];

  return staticEpisodes
    .map((episode): ProjectEpisodeView => {
      const chapterMatch = episode.chapter.label.match(/^(\d{1,3})/);
      const doc =
        brainEpisodeDocs.find((material) =>
          material.title.toLowerCase().includes(`episode ${episode.number}`.toLowerCase())
        ) ||
        brainEpisodeDocs.find((material) =>
          material.title.toLowerCase().includes(episode.title.toLowerCase())
        ) ||
        null;

      return {
        number: episode.number,
        slug: episode.slug,
        title: episode.title,
        year: episode.year || null,
        seriesLabel: episode.seriesLabel,
        videoUrl: episode.video.url,
        statement: episode.statement,
        chapterLabel: episode.chapter.label,
        chapterNumber: chapterMatch ? Number(chapterMatch[1]) : null,
        bookUrl: episode.book.url,
        source: 'repository_dataset',
        brainDocumentId: doc?.id || null,
      };
    })
    .sort((left, right) => left.number - right.number);
}

/**
 * Verified project materials that should be linked to the project. Identity is
 * restricted to the manuscript, the two episode pages and the blueprint.
 */
export function verifiedProjectMaterialIds(materials: ProjectMaterial[]): string[] {
  return materials
    .filter((material) => material.role !== 'other')
    .map((material) => material.id);
}

export type ProjectBriefDraft = {
  markdown: string;
  revision: number;
  sourceCount: number;
  generatedAt: string;
  unverifiedClaims: string[];
};

export function composeProjectBrief(state: UnframedProjectState): ProjectBriefDraft {
  const project = state.project;
  if (!project) {
    return {
      markdown: 'Проект UNFRAMED не найден в рабочем пространстве Pierrot. Бриф не создан.',
      revision: 0,
      sourceCount: 0,
      generatedAt: new Date().toISOString(),
      unverifiedClaims: ['project_missing'],
    };
  }

  const manuscript = state.materials.find((material) => material.role === 'manuscript') || null;
  const blueprint = state.materials.find((material) => material.role === 'blueprint') || null;
  const episodes = state.episodes;
  const currentTasks = state.openTasks;
  const decisions = state.decisions.filter((item) => item.kind !== 'task' && item.kind !== 'reminder');
  const notes: string[] = [];
  const unverifiedClaims: string[] = [];

  if (!manuscript) notes.push('Рукопись ещё не связана с проектом.');
  if (!blueprint) notes.push('Blueprint проекта найден не был; editorial direction ограничен проверяемыми материалами.');
  if (episodes.length === 0) notes.push('Выпуски не найдены.');
  if (state.materialsUnavailable) notes.push(`Материалы проекта недоступны: ${state.materialsUnavailable}`);
  if (state.decisionsUnavailable) notes.push(`Решения проекта недоступны: ${state.decisionsUnavailable}`);
  if (state.manuscriptUnavailable) notes.push(`Рукопись недоступна: ${state.manuscriptUnavailable}`);

  const lines: string[] = [
    `# UNFRAMED — project brief (verified draft)`,
    '',
    `Generated: ${new Date().toISOString().slice(0, 10)}. Sources: project record, linked/identified Brain documents, repository episode dataset, project decisions and open tasks. No invented history.`,
    '',
    '## What UNFRAMED is',
    `- Project record: “${project.name}” (${project.slug}), status ${project.status}.`,
    project.description ? `- Description on record: ${project.description}` : '- The project record has no description.',
    project.objective ? `- Objective on record: ${project.objective}` : '- The project record has no objective.',
    manuscript
      ? `- Manuscript: “${manuscript.title}” — ${manuscript.chunkCount} indexed chunks, ${manuscript.sourceCharCount.toLocaleString('en-US')} source characters.`
      : '- Manuscript relation: not established.',
    blueprint ? `- Project blueprint in Brain: “${blueprint.title}” (${blueprint.chunkCount} sections).` : null,
    '',
    '## Editorial direction (only recorded material)',
    ...(blueprint
      ? [
          `- Blueprint document: ${blueprint.title}. Its section headings define the current production concept; the document itself is the authority.`,
        ]
      : []),
    ...(state.blueprintSections.length > 0
      ? [
          `- Blueprint sections: ${state.blueprintSections
            .map((section) => section.replace(/^PART\s+\d+\s*[:.\-—]?\s*/i, ''))
            .filter(Boolean)
            .join(' · ')}.`,
        ]
      : []),
    ...(state.blueprintExcerpt
      ? [`- Blueprint opening (verbatim, ${blueprint?.id || 'source'}): “${state.blueprintExcerpt}”`]
      : []),
    ...episodes.map(
      (episode) =>
        `- Episode ${episode.number} “${episode.title}”${episode.year ? ` (${episode.year})` : ''}: ${episode.statement}`
    ),
    ...decisions.slice(0, 8).map((decision) => `- Decision / note: “${decision.title}” (${decision.kind}, ${decision.status}).`),
    '',
    '## Episodes and manuscript links',
    ...(episodes.length > 0
      ? episodes.map(
          (episode) =>
            `- Episode ${episode.number}: ${episode.chapterLabel || 'chapter not recorded'} → manuscript chapter ${episode.chapterNumber ?? 'unknown'}; video ${episode.videoUrl}.`
        )
      : ['- No episodes are recorded.']),
    '',
    '## Current production state',
    ...(currentTasks.length > 0
      ? currentTasks.map(
          (task) => `- Open ${task.kind}: “${task.title}” (${task.status}, ${task.decidedAt?.slice(0, 10) || 'date unknown'}).`
        )
      : ['- No open project tasks are recorded in Pierrot.']),
    '',
    '## Established decisions',
    ...(decisions.length > 0
      ? decisions.map(
          (decision) =>
            `- “${decision.title}” — ${decision.kind}, ${decision.status}, ${decision.decidedAt?.slice(0, 10) || 'date unknown'}.`
        )
      : ['- No panel decisions are recorded outside tasks and reminders.']),
    '',
    '## Unresolved editorial questions',
    ...(currentTasks.length > 0
      ? currentTasks.map((task) => `- ${task.title}`)
      : ['- Not recorded. This is a gap, not a conclusion that none exist.']),
    '',
    '## Sources and provenance',
    `- Project record: ${project.id}.`,
    ...state.materials.map(
      (material) =>
        `- ${material.role}: ${material.title} (${material.id}; ${material.relation}; ${material.ingestionStatus || 'status not recorded'}).`
    ),
    ...state.conversations.slice(0, 6).map(
      (conversation) => `- Project conversation: ${conversation.id} (${conversation.updatedAt || 'date unknown'}).`
    ),
    ...notes.map((note) => `- LIMITATION: ${note}`),
    '',
    '## Rights and editing rule',
    '- The manuscript source is immutable by default. Editorial changes are proposals until explicitly approved, and approved revisions are stored separately from the source.',
  ].filter((line): line is string => line !== null);

  return {
    markdown: lines.join('\n'),
    revision: project.briefRevision,
    sourceCount:
      state.materials.length +
      state.episodes.length +
      state.decisions.length +
      state.conversations.length +
      1,
    generatedAt: new Date().toISOString(),
    unverifiedClaims,
  };
}

export type ProjectHistoryHit = {
  source: 'message' | 'decision' | 'artifact';
  id: string;
  title: string;
  excerpt: string;
  createdAt: string | null;
  projectId: string;
  evidenceClass: 'USER_CONFIRMED' | 'DOCUMENTED' | 'INFERRED';
};

/**
 * Search project history with an explicit failure mode. An unavailable query is
 * never returned as "no discussions happened".
 */
export async function searchUnframedProjectHistory(input: {
  ownerUserId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  project: PierrotProject;
  query: string;
  limit?: number;
}): Promise<{ hits: ProjectHistoryHit[]; error: string | null }> {
  const store =
    input.store ?? (input.env ? createServiceClient(input.env) : getServerSupabaseClient({ useServiceRole: true }));
  if (!store) return { hits: [], error: 'project_store_unavailable' };

  const terms = (input.query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(
      (term) =>
        !new Set([
          'что',
          'какие',
          'идеи',
          'для',
          'следующих',
          'выпусков',
          'уже',
          'обсуждали',
          'project',
          'ideas',
          'next',
          'episodes',
        ]).has(term)
    )
    .slice(0, 8);

  if (terms.length === 0) {
    // An "ideas for next episodes" question has no distinctive noun after stop
    // words. Search the actual editorial vocabulary rather than returning an
    // empty archive.
    if (/(?:идеи|сюжет|выпуск|эпизод|ролик|episode|video|scene|idea)/i.test(input.query)) {
      terms.push('выпуск', 'ролик', 'сюжет', 'идея', 'эпизод', 'video', 'episode', 'scene');
    }
  }

  if (terms.length === 0) {
    return { hits: [], error: null };
  }

  const conversationLinks = await store
    .from('pierrot_project_conversations')
    .select('conversation_id')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.project.id)
    .limit(100);

  if (conversationLinks.error) {
    return { hits: [], error: conversationLinks.error.message };
  }

  const conversationIds = Array.from(
    new Set([
      ...(input.project.conversationId ? [input.project.conversationId] : []),
      ...(Array.isArray(conversationLinks.data)
        ? conversationLinks.data
            .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
            .filter(Boolean)
        : []),
    ])
  );

  const hits: ProjectHistoryHit[] = [];
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 40);

  if (conversationIds.length > 0) {
    const patterns = terms
      .map((term) => {
        const root = term.length > 6 ? term.slice(0, Math.max(4, term.length - 2)) : term;
        return `content.ilike.%${root.replace(/[%_\\]/g, '\\$&')}%`;
      })
      .join(',');

    const messages = await store
      .from('pierrot_messages')
      .select('id,conversation_id,role,content,created_at,message_index')
      .in('conversation_id', conversationIds)
      .or(patterns)
      .order('created_at', { ascending: false })
      .limit(limit * 2);

    if (messages.error) return { hits: [], error: messages.error.message };

    for (const row of messages.data || []) {
      const item = row as Record<string, unknown>;
      const content = text(item.content).replace(/\s+/g, ' ').trim();
      if (!content) continue;
      const role = item.role === 'assistant' ? 'assistant' : 'user';
      hits.push({
        source: 'message',
        id: text(item.id),
        title: role === 'user' ? 'Сообщение владельца' : 'Ответ Pierrot',
        excerpt: content.length > 360 ? `${content.slice(0, 359)}…` : content,
        createdAt: text(item.created_at) || null,
        projectId: input.project.id,
        evidenceClass: role === 'user' ? 'USER_CONFIRMED' : 'DOCUMENTED',
      });
      if (hits.length >= limit) break;
    }
  }

  if (hits.length < limit) {
    const decisionIds = await store
      .from('pierrot_project_decisions')
      .select('decision_id')
      .eq('owner_user_id', input.ownerUserId)
      .eq('project_id', input.project.id)
      .limit(300);

    if (decisionIds.error) return { hits, error: decisionIds.error.message };
    const ids = (decisionIds.data || [])
      .map((row) => (row && typeof row.decision_id === 'string' ? row.decision_id : ''))
      .filter(Boolean);

    if (ids.length > 0) {
      const decisions = await store
        .from('pierrot_decisions')
        .select('id,title,content,kind,status,decided_at')
        .in('id', ids)
        .limit(300);
      if (decisions.error) return { hits, error: decisions.error.message };

      for (const row of decisions.data || []) {
        const item = row as Record<string, unknown>;
        const haystack = `${text(item.title)} ${text(item.content)}`.toLowerCase();
        if (!terms.some((term) => haystack.includes(term.slice(0, Math.max(4, term.length - 2))))) {
          continue;
        }
        hits.push({
          source: 'decision',
          id: text(item.id),
          title: text(item.title),
          excerpt: text(item.content).slice(0, 360),
          createdAt: text(item.decided_at) || null,
          projectId: input.project.id,
          evidenceClass: 'USER_CONFIRMED',
        });
        if (hits.length >= limit) break;
      }
    }
  }

  if (hits.length < limit) {
    // Owner messages are primary evidence of an idea; assistant messages are
    // supporting context. Keep both but put the owner's words first.
    hits.sort((left, right) => {
      const leftUser = left.source === 'message' && left.title === 'Сообщение владельца' ? 0 : 1;
      const rightUser = right.source === 'message' && right.title === 'Сообщение владельца' ? 0 : 1;
      if (leftUser !== rightUser) return leftUser - rightUser;
      return (right.createdAt || '').localeCompare(left.createdAt || '');
    });
  }

  return { hits, error: null };
}

export function formatProjectState(state: UnframedProjectState): string {
  if (!state.project) {
    return state.projectUnavailable
      ? `Проект UNFRAMED недоступен: ${state.projectUnavailable}. Это ошибка чтения, а не пустой проект.`
      : 'Проект UNFRAMED не найден в рабочем пространстве. Это не означает, что материалов нет в Brain.';
  }

  const project = state.project;
  const manuscript = state.materials.find((material) => material.role === 'manuscript');
  const linkedEpisodes = state.episodes;
  const openTasks = state.openTasks;

  return [
    `## UNFRAMED — состояние проекта`,
    '',
    `**Проект:** ${project.name} · ${project.status} · бриф r${project.briefRevision}${
      project.projectBrief.trim() ? ' · заполнен' : ' · пуст'
    }.`,
    `**Рукопись:** ${
      manuscript
        ? `«${manuscript.title}», ${manuscript.chunkCount} фрагментов, ${manuscript.sourceCharCount.toLocaleString('ru-RU')} символов; ${
            manuscript.relation === 'linked' ? 'связана с проектом' : 'идентифицирована, но ещё не связана'
          }.`
        : state.materialsUnavailable
          ? `не удалось прочитать связи проекта: ${state.materialsUnavailable}.`
          : 'связь с проектом не найдена.'
    }`,
    state.manuscript
      ? `**Индекс:** ${formatCoverage(state.manuscript.coverage)}; главы: ${state.manuscript.structure.chapters.length}; части: ${manuscriptPartCount(state.manuscript.structure)}.`
      : state.manuscriptUnavailable
        ? `**Индекс:** недоступен (${state.manuscriptUnavailable}).`
        : null,
    '',
    '### Выпуски',
    ...(linkedEpisodes.length > 0
      ? linkedEpisodes.map(
          (episode) =>
            `- **Episode ${episode.number}** «${episode.title}»${episode.year ? `, ${episode.year}` : ''} · ${
              episode.chapterLabel ? `глава: ${episode.chapterLabel}` : 'глава не зафиксирована'
            } · ${episode.videoUrl}`
        )
      : ['- В проверяемых материалах выпусков нет.']),
    '',
    '### Решения и открытые задачи',
    ...(state.decisionsUnavailable
      ? [`- Решения недоступны: ${state.decisionsUnavailable}`]
      : openTasks.length > 0
        ? openTasks.map(
            (task) => `- [${task.kind}] ${task.title} — ${task.status}, ${task.decidedAt?.slice(0, 10) || 'дата неизвестна'}`
          )
        : ['- Открытых задач в Pierrot не записано.']),
    '',
    '### Материалы проекта',
    ...(state.materialsUnavailable
      ? [`- Материалы недоступны: ${state.materialsUnavailable}`]
      : state.materials.length > 0
        ? state.materials
            .slice(0, 12)
            .map(
              (material) =>
                `- ${material.role}: «${material.title}» · ${material.relation === 'linked' ? 'связан' : 'идентифицирован'}`
            )
        : ['- Связанных или однозначно идентифицированных материалов нет.']),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
