import { graphChatJson, getGraphModel } from './deepseek';
import {
  BRAIN_GRAPH_EXTRACTOR_VERSION,
  summarizeChaptersBatch,
  summarizeDocumentsBatch,
  summarizeThemesBatch,
  type ChapterSummaryInput,
  type DocumentSummaryInput,
  type ThemeSummaryInput,
} from './extractor';
import type { BrainGraphStore } from './store';
import type { BrainDocumentForGraph } from './types';

type ChatJson = (system: string, user: string) => Promise<unknown>;

export type SynthesisStep = 'documents' | 'chapters' | 'projects' | 'themes';

export type SynthesisResult = {
  step: SynthesisStep;
  done: boolean;
  processed: number;
  remaining: number;
};

function projectKeyForDocument(document: BrainDocumentForGraph): string | null {
  if (document.source_type === 'manuscript') return 'unframed';

  const haystack = `${document.canonical_url || ''} ${document.source_url || ''} ${document.source_path || ''}`.toLowerCase();

  if (haystack.includes('novayagazeta')) return 'novaya_gazeta';

  if ((document.author || '').toLowerCase().includes('anton merkurov')) {
    return 'personal_columns';
  }

  return null;
}

function projectTitle(key: string): string {
  switch (key) {
    case 'unframed':
      return 'UNFRAMED';
    case 'novaya_gazeta':
      return 'Novaya Gazeta columns';
    case 'personal_columns':
      return 'Personal columns';
    case 'heart_and_angel':
      return 'Heart & Angel';
    default:
      return key;
  }
}

async function documentEntityIds(store: BrainGraphStore, documentId: string, limit = 30) {
  const { data, error } = await store.client
    .from('brain_document_topics')
    .select('entity_id,weight')
    .eq('document_id', documentId)
    .order('weight', { ascending: false })
    .limit(limit);

  if (error) return [];

  return (Array.isArray(data) ? data : []).map((row) => String((row as { entity_id: string }).entity_id));
}

async function entityNames(
  store: BrainGraphStore,
  ids: string[]
): Promise<Array<{ id: string; name: string; type: string }>> {
  if (ids.length === 0) return [];

  const { data, error } = await store.client
    .from('brain_entities')
    .select('id,canonical_name,entity_type')
    .in('id', ids)
    .limit(200);

  if (error) return [];

  return (Array.isArray(data) ? data : []).map((row) => ({
    id: String((row as { id: string }).id),
    name: String((row as { canonical_name: string }).canonical_name),
    type: String((row as { entity_type: string }).entity_type),
  }));
}

async function chunkEntities(
  store: BrainGraphStore,
  chunkIds: string[]
): Promise<Array<{ id: string; name: string; type: string }>> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await store.client
    .from('brain_entity_mentions')
    .select('entity_id')
    .in('chunk_id', chunkIds)
    .limit(500);

  if (error || !Array.isArray(data)) return [];

  const ids = Array.from(new Set(data.map((row) => String((row as { entity_id: string }).entity_id))));

  return entityNames(store, ids);
}

async function existingScopeKeys(
  store: BrainGraphStore,
  scopeType: 'document' | 'chapter' | 'project' | 'theme'
): Promise<Set<string>> {
  const rows = await store.listSummaries(scopeType, 5000);

  return new Set(rows.map((row) => String((row as { scope_key: string }).scope_key)));
}

export async function synthesizeDocuments(input: {
  store: BrainGraphStore;
  batchSize?: number;
  chatJson?: ChatJson;
}): Promise<SynthesisResult> {
  const batchSize = Math.min(Math.max(input.batchSize ?? 6, 1), 10);
  const existing = await existingScopeKeys(input.store, 'document');
  const documents = (await input.store.listDocuments(2000)).filter(
    (document) => !existing.has(document.id)
  );

  if (documents.length === 0) {
    return { step: 'documents', done: true, processed: 0, remaining: 0 };
  }

  const batch = documents.slice(0, batchSize);
  const summaryInputs: DocumentSummaryInput[] = [];
  const topicIds = new Map<string, string[]>();

  for (const document of batch) {
    const chunks = await input.store.getChunks(document.id);
    const ids = await documentEntityIds(input.store, document.id);
    const names = await entityNames(input.store, ids);

    topicIds.set(document.id, ids);
    summaryInputs.push({
      id: document.id,
      title: document.title,
      sourceType: document.source_type,
      author: document.author,
      publishedAt: document.published_at,
      entityNames: names.map((entity) => entity.name),
      headings: chunks.map((chunk) => chunk.heading).filter(Boolean).slice(0, 20),
      excerpt: chunks
        .slice(0, 3)
        .map((chunk) => `${chunk.heading}\n${chunk.content}`)
        .join('\n\n')
        .slice(0, 6000),
    });
  }

  const summaries = await summarizeDocumentsBatch(
    summaryInputs,
    input.chatJson || graphChatJson
  );

  for (const summary of summaries) {
    const document = batch.find((entry) => entry.id === summary.documentId);

    if (!document) continue;

    await input.store.upsertSummary({
      scopeType: 'document',
      scopeKey: document.id,
      title: document.title,
      summary: summary.summary,
      documentIds: [document.id],
      entityIds: topicIds.get(document.id) || [],
      confidence: summary.confidence,
      provenance: {
        source_type: document.source_type,
        author: document.author,
        published_at: document.published_at,
        canonical_url: document.canonical_url,
      },
      extractorVersion: BRAIN_GRAPH_EXTRACTOR_VERSION,
      model: getGraphModel(),
    });
  }

  const remaining = Math.max(0, documents.length - summaries.length);

  return {
    step: 'documents',
    done: summaries.length === 0 || remaining === 0,
    processed: summaries.length,
    remaining,
  };
}

export async function synthesizeChapters(input: {
  store: BrainGraphStore;
  batchSize?: number;
  chatJson?: ChatJson;
}): Promise<SynthesisResult> {
  const batchSize = Math.min(Math.max(input.batchSize ?? 8, 1), 12);
  const existing = await existingScopeKeys(input.store, 'chapter');
  const documents = (await input.store.listDocuments(2000)).filter(
    (document) => document.source_type === 'manuscript'
  );
  const inputs: Array<{
    document: BrainDocumentForGraph;
    chunkIds: string[];
    input: ChapterSummaryInput;
  }> = [];

  for (const document of documents) {
    const chunks = await input.store.getChunks(document.id);
    const bySection = new Map<number, typeof chunks>();

    for (const chunk of chunks) {
      const list = bySection.get(chunk.section_index) || [];
      list.push(chunk);
      bySection.set(chunk.section_index, list);
    }

    for (const [sectionIndex, sectionChunks] of bySection) {
      const scopeKey = `${document.id}:section:${sectionIndex}`;
      if (existing.has(scopeKey)) continue;

      const title = sectionChunks[0]?.heading || `Section ${sectionIndex + 1}`;
      const entities = await chunkEntities(
        input.store,
        sectionChunks.map((chunk) => chunk.id)
      );

      inputs.push({
        document,
        chunkIds: sectionChunks.map((chunk) => chunk.id),
        input: {
          scopeKey,
          title,
          entityNames: entities.map((entity) => entity.name),
          excerpt: sectionChunks
            .slice(0, 4)
            .map((chunk) => chunk.content)
            .join('\n\n')
            .slice(0, 7000),
        },
      });
    }
  }

  if (inputs.length === 0) {
    return { step: 'chapters', done: true, processed: 0, remaining: 0 };
  }

  const batch = inputs.slice(0, batchSize);
  const summaries = await summarizeChaptersBatch(
    batch.map((entry) => entry.input),
    input.chatJson || graphChatJson
  );

  for (const summary of summaries) {
    const entry = batch.find((candidate) => candidate.input.scopeKey === summary.scopeKey);

    if (!entry) continue;

    const entities = await chunkEntities(input.store, entry.chunkIds);

    await input.store.upsertSummary({
      scopeType: 'chapter',
      scopeKey: summary.scopeKey,
      title: summary.title,
      summary: summary.summary,
      documentIds: [entry.document.id],
      entityIds: entities.map((entity) => entity.id),
      confidence: summary.confidence,
      provenance: {
        document_id: entry.document.id,
        chunk_ids: entry.chunkIds.slice(0, 12),
        section_index: entry.input.scopeKey.split(':').pop(),
      },
      extractorVersion: BRAIN_GRAPH_EXTRACTOR_VERSION,
      model: getGraphModel(),
    });
  }

  return {
    step: 'chapters',
    done: summaries.length === 0 || inputs.length <= summaries.length,
    processed: summaries.length,
    remaining: Math.max(0, inputs.length - summaries.length),
  };
}

export async function synthesizeProjects(input: {
  store: BrainGraphStore;
  chatJson?: ChatJson;
}): Promise<SynthesisResult> {
  const documents = await input.store.listDocuments(2000);
  const groups = new Map<string, BrainDocumentForGraph[]>();

  for (const document of documents) {
    const key = projectKeyForDocument(document);

    if (!key) continue;

    const list = groups.get(key) || [];
    list.push(document);
    groups.set(key, list);
  }

  // Heart & Angel can be represented by articles that discuss the project.
  const heartAngelDocs: BrainDocumentForGraph[] = [];

  for (const document of documents) {
    const haystack = `${document.title} ${document.canonical_url || ''}`.toLowerCase();

    if (haystack.includes('heart & angel') || haystack.includes('heart and angel')) {
      heartAngelDocs.push(document);
    }
  }

  if (heartAngelDocs.length > 0) groups.set('heart_and_angel', heartAngelDocs);

  const inputs: ThemeSummaryInput[] = [];

  for (const [key, group] of groups) {
    const excerpts: string[] = [];
    const entityNamesSet = new Set<string>();

    for (const document of group.slice(0, 12)) {
      const chunks = await input.store.getChunks(document.id);
      const ids = await documentEntityIds(input.store, document.id, 12);
      const names = await entityNames(input.store, ids);

      for (const name of names) entityNamesSet.add(name.name);
      excerpts.push(
        `${document.title}\n${chunks
          .slice(0, 2)
          .map((chunk) => chunk.content)
          .join(' ')}`.slice(0, 1600)
      );
    }

    inputs.push({
      scopeKey: key,
      title: projectTitle(key),
      entityNames: Array.from(entityNamesSet).slice(0, 30),
      documentTitles: group.map((document) => document.title).slice(0, 20),
      excerpts: excerpts.slice(0, 10),
    });
  }

  if (inputs.length === 0) {
    return { step: 'projects', done: true, processed: 0, remaining: 0 };
  }

  const summaries = await summarizeThemesBatch(
    inputs,
    input.chatJson || graphChatJson
  );

  for (const summary of summaries) {
    const entry = inputs.find((candidate) => candidate.scopeKey === summary.scopeKey);

    if (!entry) continue;

    const group = groups.get(summary.scopeKey) || [];

    await input.store.upsertSummary({
      scopeType: 'project',
      scopeKey: summary.scopeKey,
      title: summary.title,
      summary: summary.summary,
      documentIds: group.map((document) => document.id),
      entityIds: [],
      confidence: summary.confidence,
      provenance: {
        document_titles: group.map((document) => document.title),
        extractor: 'brain-project-summary-v1',
      },
      extractorVersion: BRAIN_GRAPH_EXTRACTOR_VERSION,
      model: getGraphModel(),
    });
  }

  return {
    step: 'projects',
    done: true,
    processed: summaries.length,
    remaining: 0,
  };
}

export async function synthesizeThemes(input: {
  store: BrainGraphStore;
  batchSize?: number;
  chatJson?: ChatJson;
}): Promise<SynthesisResult> {
  const batchSize = Math.min(Math.max(input.batchSize ?? 8, 1), 12);
  const existing = await existingScopeKeys(input.store, 'theme');
  const { data: entityData, error: entityError } = await input.store.client
    .from('brain_entities')
    .select('id,canonical_name,entity_type')
    .in('entity_type', ['concept', 'theme'])
    .limit(3000);

  if (entityError) throw new Error('brain_theme_entities_query_failed');

  const { data: mentionData, error: mentionError } = await input.store.client
    .from('brain_entity_mentions')
    .select('entity_id,document_id,chunk_id')
    .limit(20000);

  if (mentionError) throw new Error('brain_theme_mentions_query_failed');

  const entityById = new Map(
    (Array.isArray(entityData) ? entityData : []).map((row) => {
      const value = row as { id: string; canonical_name: string; entity_type: string };
      return [value.id, value] as const;
    })
  );
  const documentsByEntity = new Map<string, Set<string>>();
  const chunksByEntity = new Map<string, string[]>();

  for (const row of Array.isArray(mentionData) ? mentionData : []) {
    const value = row as { entity_id: string; document_id: string; chunk_id: string };
    const documents = documentsByEntity.get(value.entity_id) || new Set<string>();
    documents.add(value.document_id);
    documentsByEntity.set(value.entity_id, documents);

    const chunks = chunksByEntity.get(value.entity_id) || [];
    if (chunks.length < 8 && !chunks.includes(value.chunk_id)) chunks.push(value.chunk_id);
    chunksByEntity.set(value.entity_id, chunks);
  }

  const themes = Array.from(documentsByEntity.entries())
    .filter(([entityId, documents]) => documents.size >= 2 && entityById.has(entityId))
    .sort((left, right) => right[1].size - left[1].size)
    .filter(([entityId]) => !existing.has(entityId))
    .slice(0, 30);

  if (themes.length === 0) {
    return { step: 'themes', done: true, processed: 0, remaining: 0 };
  }

  const batch = themes.slice(0, batchSize);
  const inputs: ThemeSummaryInput[] = [];
  const documents = await input.store.listDocuments(2000);
  const documentById = new Map(documents.map((document) => [document.id, document]));

  for (const [entityId, documentIds] of batch) {
    const entity = entityById.get(entityId);
    if (!entity) continue;

    const chunkIds = chunksByEntity.get(entityId) || [];

    if (chunkIds.length === 0) continue;

    const { data: chunkData } = await input.store.client
      .from('knowledge_chunks')
      .select('id,content,heading')
      .in('id', chunkIds)
      .limit(12);

    const excerpts = (Array.isArray(chunkData) ? chunkData : []).map((row) => {
      const value = row as { content: string; heading: string };
      return `${value.heading}\n${value.content}`.slice(0, 1800);
    });

    inputs.push({
      scopeKey: entityId,
      title: entity.canonical_name,
      entityNames: [entity.canonical_name],
      documentTitles: Array.from(documentIds)
        .map((id) => documentById.get(id)?.title)
        .filter((title): title is string => Boolean(title))
        .slice(0, 20),
      excerpts: excerpts.slice(0, 8),
    });
  }

  const summaries = await summarizeThemesBatch(
    inputs,
    input.chatJson || graphChatJson
  );

  for (const summary of summaries) {
    const entity = entityById.get(summary.scopeKey);

    if (!entity) continue;

    const documentIds = Array.from(documentsByEntity.get(summary.scopeKey) || []);

    await input.store.upsertSummary({
      scopeType: 'theme',
      scopeKey: summary.scopeKey,
      title: summary.title,
      summary: summary.summary,
      documentIds,
      entityIds: [summary.scopeKey],
      confidence: summary.confidence,
      provenance: {
        entity_type: entity.entity_type,
        document_count: documentIds.length,
        chunk_ids: (chunksByEntity.get(summary.scopeKey) || []).slice(0, 8),
      },
      extractorVersion: BRAIN_GRAPH_EXTRACTOR_VERSION,
      model: getGraphModel(),
    });
  }

  return {
    step: 'themes',
    done: summaries.length === 0 || themes.length <= summaries.length,
    processed: summaries.length,
    remaining: Math.max(0, themes.length - summaries.length),
  };
}

export async function synthesizeNext(input: {
  store: BrainGraphStore;
  step: SynthesisStep;
  chatJson?: ChatJson;
}): Promise<SynthesisResult> {
  switch (input.step) {
    case 'documents':
      return synthesizeDocuments(input);
    case 'chapters':
      return synthesizeChapters(input);
    case 'projects':
      return synthesizeProjects(input);
    case 'themes':
      return synthesizeThemes(input);
    default:
      return { step: input.step, done: true, processed: 0, remaining: 0 };
  }
}
