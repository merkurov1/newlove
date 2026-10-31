import { graphChatJson } from './deepseek';
import { RawResearchAnswerSchema } from './schema';
import { clampConfidence } from './normalize';
import type { BrainGraphStore } from './store';
import type {
  BrainCitation,
  BrainDocumentForGraph,
  BrainEntityType,
  BrainResearchAnswer,
} from './types';
import { retrieveBrainEvidence } from '@/lib/knowledge/rag/brainRetrieval';
import { buildBrainQueryPlan } from '@/lib/knowledge/rag/queryRouting';
import { retrieveUnframedEvidence } from '@/lib/knowledge/rag/retrieval';

type ChatJson = (system: string, user: string) => Promise<unknown>;

type EntityRow = {
  id: string;
  entity_type: BrainEntityType;
  canonical_name: string;
  description: string | null;
  aliases: string[] | null;
  confidence: number;
};

type MentionRow = {
  entity_id: string;
  document_id: string;
  chunk_id: string;
};

type RelationshipRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence: number;
  inference: boolean;
  provenance_document_id: string;
  provenance_chunk_id: string;
  evidence: string;
};

type SummaryRow = {
  scope_type: string;
  scope_key: string;
  title: string;
  summary: string;
  document_ids: string[] | null;
  entity_ids: string[] | null;
  confidence: number;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function questionTokens(question: string): string[] {
  return Array.from(
    new Set(
      normalize(question)
        .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4)
    )
  ).slice(0, 30);
}

function asksAboutGaps(question: string): boolean {
  return /(not explored|under[- ]?explored|missing|gap|insufficient|not written|haven't written|have not written|не раскрыт|не исследован|недостаточно|пробел|не писал|не освещ|чего не хватает)/i.test(
    question
  );
}

export type PublicationInventorySource = 'novaya';

export type PublicationInventory = {
  source: PublicationInventorySource;
  label: string;
  documents: BrainDocumentForGraph[];
  count: number;
  totalChunks: number;
};

function documentDomain(document: BrainDocumentForGraph): string {
  const candidates = [
    document.canonical_url,
    document.source_url,
    typeof document.metadata?.source_domain === 'string'
      ? document.metadata.source_domain
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      // Continue to the next candidate.
    }
  }

  return '';
}

export function detectPublicationInventoryQuestion(
  question: string
): PublicationInventorySource | null {
  const text = normalize(question);
  const asksNovaya =
    text.includes('новой газет') ||
    text.includes('новую газет') ||
    text.includes('новая газета') ||
    text.includes('novaya gazeta') ||
    text.includes('novayagazeta');

  if (!asksNovaya) return null;

  const asksCount = /(?:сколько|how many)/i.test(text);
  const asksList =
    /(?:найти|найди|покажи|перечисли|выведи|list|find|show)/i.test(text) &&
    /(?:все|all)/i.test(text);
  const namesPublications =
    /(?:колонк|стат|публикац|материал|заметк|текст|columns?|articles?|publications?|pieces?)/i.test(
      text
    );

  return asksCount || (asksList && namesPublications) ? 'novaya' : null;
}

export function selectPublicationInventory(
  source: PublicationInventorySource,
  documents: BrainDocumentForGraph[],
  range?: { from?: string | null; to?: string | null }
): PublicationInventory {
  const from = range?.from ? Date.parse(range.from) : null;
  const to = range?.to ? Date.parse(range.to) : null;
  const seen = new Set<string>();
  const selected: BrainDocumentForGraph[] = [];

  for (const document of documents) {
    if (source === 'novaya') {
      if (document.source_type !== 'article') continue;

      const domain = documentDomain(document);
      if (domain !== 'novayagazeta.ru' && domain !== 'novayagazeta.eu') continue;
    }

    if (from !== null || to !== null) {
      const published = document.published_at ? Date.parse(document.published_at) : NaN;

      if (!Number.isFinite(published)) continue;
      if (from !== null && published < from) continue;
      if (to !== null && published > to) continue;
    }

    const key = document.canonical_url || document.source_url || document.id;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(document);
  }

  selected.sort((left, right) => {
    const leftDate = left.published_at ? Date.parse(left.published_at) : 0;
    const rightDate = right.published_at ? Date.parse(right.published_at) : 0;
    return rightDate - leftDate || left.title.localeCompare(right.title);
  });

  return {
    source,
    label: source === 'novaya' ? 'Новая газета' : source,
    documents: selected,
    count: selected.length,
    totalChunks: selected.reduce((sum, document) => sum + document.chunk_count, 0),
  };
}

export function inventoryAnswer(
  inventory: PublicationInventory,
  question: string,
  range?: { from?: string | null; to?: string | null }
): string {
  const ru = /[\u0400-\u04FF]/.test(question);
  const lines: string[] = [];
  const period =
    range?.from || range?.to
      ? `${range.from ? range.from.slice(0, 10) : '…'} — ${
          range.to ? range.to.slice(0, 10) : '…'
        }`
      : null;

  if (ru) {
    lines.push(
      `В индексированном Brain сейчас ${inventory.count} уникальных материалов «${inventory.label}» (${inventory.totalChunks} chunks).`
    );
    lines.push(
      'Считаю только source_type=article по домену novayagazeta.ru/.eu; дубликаты media_coverage исключены.'
    );
    if (period) lines.push(`Период публикаций: ${period}.`);
    lines.push('');
    lines.push('Список:');
  } else {
    lines.push(
      `The indexed Brain currently contains ${inventory.count} unique ${inventory.label} articles (${inventory.totalChunks} chunks).`
    );
    lines.push(
      'Only source_type=article documents on novayagazeta.ru/.eu are counted; media_coverage duplicates are excluded.'
    );
    if (period) lines.push(`Publication period: ${period}.`);
    lines.push('');
    lines.push('List:');
  }

  inventory.documents.forEach((document, index) => {
    const date = document.published_at ? document.published_at.slice(0, 10) : 'date not set';
    lines.push(`${index + 1}. ${date} — ${document.title.slice(0, 240)}`);
  });

  if (inventory.count === 0) {
    lines.push(ru ? 'Материалов по этому фильтру не найдено.' : 'No documents matched this filter.');
  }

  return lines.join('\n');
}

const RESEARCH_SYSTEM = [
  'You are the owner’s private Brain research assistant.',
  'Answer the actual question directly and conversationally, not as an academic report.',
  'Use ONLY the supplied passages, graph relationships and thematic summaries as evidence about the owner’s work.',
  'Distinguish what the documents explicitly state from your own interpretation or synthesis.',
  'When the question compares positions over time, use publication dates and note uncertainty where dates or evidence are missing.',
  'When the question asks what is missing or under-explored, base the answer on the supplied coverage statistics and say that they describe the indexed corpus, not the whole world.',
  'Preserve the author’s terminology and conceptual distinctions.',
  'Cite supporting passages inline as [S1], [S2], etc. Do not invent source numbers or references.',
  'If the evidence is insufficient, say so plainly instead of filling the gap.',
  'Graph relationships marked inference=true are hypotheses, not verified facts. Label them as such.',
  'Write in the language of the question.',
  'Return JSON only: {"answer":"...","used_sources":[{"document_id":"...","chunk_id":"..."}],"caveat":"...","confidence":0.0}.',
].join(' ');

export async function answerBrainResearchQuestion(input: {
  question: string;
  store: BrainGraphStore;
  chatJson?: ChatJson;
  limitDocuments?: number;
}): Promise<BrainResearchAnswer> {
  const { store } = input;
  const question = input.question.trim();
  const chatJson = input.chatJson || graphChatJson;
  const normalizedQuestion = normalize(question);
  const tokens = questionTokens(question);

  const documents = await store.listDocuments(input.limitDocuments || 500);
  const documentById = new Map(documents.map((document) => [document.id, document]));

  const [entityResult, relationshipResult, summaryResult, mentionResult] = await Promise.all([
    store.client
      .from('brain_entities')
      .select('id,entity_type,canonical_name,description,aliases,confidence')
      .limit(5000),
    store.client
      .from('brain_relationships')
      .select(
        'id,source_entity_id,target_entity_id,relation_type,confidence,inference,provenance_document_id,provenance_chunk_id,evidence'
      )
      .limit(10000),
    store.client
      .from('brain_thematic_summaries')
      .select('scope_type,scope_key,title,summary,document_ids,entity_ids,confidence')
      .limit(1000),
    store.client
      .from('brain_entity_mentions')
      .select('entity_id,document_id,chunk_id')
      .limit(20000),
  ]);

  const entities = (Array.isArray(entityResult.data) ? entityResult.data : []) as EntityRow[];
  const relationships = (
    Array.isArray(relationshipResult.data) ? relationshipResult.data : []
  ) as RelationshipRow[];
  const summaries = (Array.isArray(summaryResult.data) ? summaryResult.data : []) as SummaryRow[];
  const mentions = (Array.isArray(mentionResult.data) ? mentionResult.data : []) as MentionRow[];

  const mentionCounts = new Map<string, number>();
  const entityDocuments = new Map<string, Set<string>>();

  for (const mention of mentions) {
    mentionCounts.set(mention.entity_id, (mentionCounts.get(mention.entity_id) || 0) + 1);
    const docs = entityDocuments.get(mention.entity_id) || new Set<string>();
    docs.add(mention.document_id);
    entityDocuments.set(mention.entity_id, docs);
  }

  const matchedEntities = entities
    .filter((entity) => {
      const name = normalize(entity.canonical_name);
      const aliases = (entity.aliases || []).map(normalize);

      return (
        (name.length >= 3 && normalizedQuestion.includes(name)) ||
        aliases.some((alias) => alias.length >= 3 && normalizedQuestion.includes(alias))
      );
    })
    .sort(
      (left, right) =>
        (mentionCounts.get(right.id) || 0) - (mentionCounts.get(left.id) || 0)
    )
    .slice(0, 20);

  const matchedIds = new Set(matchedEntities.map((entity) => entity.id));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const matchedRelationships = relationships
    .filter(
      (relationship) =>
        matchedIds.has(relationship.source_entity_id) ||
        matchedIds.has(relationship.target_entity_id)
    )
    .sort((left, right) => Number(right.confidence) - Number(left.confidence))
    .slice(0, 40);

  for (const relationship of matchedRelationships) {
    const source = entityById.get(relationship.source_entity_id);
    const target = entityById.get(relationship.target_entity_id);
    if (source) matchedIds.add(source.id);
    if (target) matchedIds.add(target.id);
  }

  const matchedSummaries = summaries
    .map((summary) => {
      const text = normalize(`${summary.title} ${summary.summary}`);
      const keywordScore = tokens.reduce(
        (score, token) => score + (text.includes(token) ? 1 : 0),
        0
      );
      const entityScore = (summary.entity_ids || []).some((id) => matchedIds.has(id)) ? 2 : 0;
      const scopeBoost = summary.scope_type === 'theme' || summary.scope_type === 'project' ? 1 : 0;

      return { summary, score: keywordScore + entityScore + scopeBoost };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((entry) => entry.summary);

  const graphRelationships = matchedRelationships.map((relationship) => {
    const source = entityById.get(relationship.source_entity_id);
    const target = entityById.get(relationship.target_entity_id);
    const document = documentById.get(relationship.provenance_document_id);

    return {
      source: source?.canonical_name || relationship.source_entity_id,
      target: target?.canonical_name || relationship.target_entity_id,
      relation: relationship.relation_type,
      confidence: Number(relationship.confidence),
      inference: Boolean(relationship.inference),
      document_id: relationship.provenance_document_id,
      document_title: document?.title || null,
      chunk_id: relationship.provenance_chunk_id,
      evidence: relationship.evidence,
    };
  });

  const inventorySource = detectPublicationInventoryQuestion(question);

  if (inventorySource) {
    const inventoryPlan = buildBrainQueryPlan(question);
    const inventory = selectPublicationInventory(inventorySource, documents, {
      from: inventoryPlan.publishedFrom,
      to: inventoryPlan.publishedTo,
    });
    const answer = inventoryAnswer(inventory, question, {
      from: inventoryPlan.publishedFrom,
      to: inventoryPlan.publishedTo,
    });

    return {
      answer,
      citations: inventory.documents.map((document) => ({
        documentId: document.id,
        documentTitle: document.title,
        chunkId: '',
        heading: document.title,
        sectionPath: [],
        similarity: null,
        publishedAt: document.published_at,
        sourceType: document.source_type,
      })),
      entities: matchedEntities.slice(0, 20).map((entity) => ({
        id: entity.id,
        name: entity.canonical_name,
        type: entity.entity_type,
        description: entity.description,
      })),
      relationships: graphRelationships.slice(0, 40),
      retrieval: {
        outcome: 'relevant_results',
        documentIds: inventory.documents.map((document) => document.id),
        chunkIds: [],
        latencyMs: 0,
      },
      graphContext: {
        matchedEntities: matchedEntities.length,
        matchedRelationships: graphRelationships.length,
        summaries: matchedSummaries.length,
      },
      caveat:
        'This count describes the indexed Brain corpus, not the publication’s complete archive. media_coverage duplicates are excluded.',
    };
  }

  let retrieval: Awaited<ReturnType<typeof retrieveUnframedEvidence>> = await retrieveBrainEvidence({
    query: question,
    scope: 'owner',
    ownerAuthorized: true,
  });

  if (retrieval.outcome === 'unavailable') {
    retrieval = await retrieveUnframedEvidence({
      query: question,
      scope: 'owner',
      ownerAuthorized: true,
    });
  }

  const passages = retrieval.hits.map((hit, index) => ({
    ref: `S${index + 1}`,
    chunk_id: hit.chunkId,
    document_id: hit.documentId,
    document_title: hit.documentTitle || documentById.get(hit.documentId)?.title || hit.heading,
    published_at: hit.publishedAt || documentById.get(hit.documentId)?.published_at || null,
    source_type: hit.sourceType || documentById.get(hit.documentId)?.source_type || null,
    heading: hit.heading,
    section_path: hit.sectionPath,
    similarity: Number(hit.similarity.toFixed(6)),
    text: hit.content.slice(0, 2200),
  }));

  const coverage = asksAboutGaps(question)
    ? {
        document_count: documents.length,
        by_source_type: Object.fromEntries(
          Array.from(
            documents.reduce((map, document) => {
              map.set(document.source_type, (map.get(document.source_type) || 0) + 1);
              return map;
            }, new Map<string, number>())
          )
        ),
        top_entities: entities
          .map((entity) => ({
            name: entity.canonical_name,
            type: entity.entity_type,
            documents: entityDocuments.get(entity.id)?.size || 0,
            mentions: mentionCounts.get(entity.id) || 0,
          }))
          .filter((entity) => entity.documents >= 2)
          .sort((left, right) => right.documents - left.documents || right.mentions - left.mentions)
          .slice(0, 25),
      }
    : null;

  const documentSummaries = summaries.filter(
    (summary) =>
      summary.scope_type === 'document' &&
      retrieval.hits.some((hit) => (summary.document_ids || []).includes(hit.documentId))
  );

  const raw = await chatJson(
    RESEARCH_SYSTEM,
    JSON.stringify({
      question,
      passages,
      graph_entities: matchedEntities.map((entity) => ({
        id: entity.id,
        name: entity.canonical_name,
        type: entity.entity_type,
        description: entity.description,
        documents: entityDocuments.get(entity.id)?.size || 0,
        mentions: mentionCounts.get(entity.id) || 0,
      })),
      graph_relationships: graphRelationships,
      summaries: [...matchedSummaries, ...documentSummaries].slice(0, 14).map((summary) => ({
        scope_type: summary.scope_type,
        title: summary.title,
        summary: summary.summary,
        confidence: summary.confidence,
      })),
      coverage,
    })
  );

  const parsed = RawResearchAnswerSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error('brain_research_invalid_response');
  }

  const passageByDocument = new Map(passages.map((passage) => [passage.document_id, passage]));
  const passageByChunk = new Map(
    passages.map((passage) => [`${passage.document_id}|${passage.chunk_id || ''}`, passage])
  );
  const usedSources = parsed.data.used_sources || [];
  const selectedPassages = usedSources.length
    ? usedSources
        .map(
          (source) =>
            passageByChunk.get(`${source.document_id}|${source.chunk_id || ''}`) ||
            passageByDocument.get(source.document_id)
        )
        .filter((passage): passage is (typeof passages)[number] => Boolean(passage))
    : passages.slice(0, 5);

  const citations = selectedPassages.map((passage) => ({
    documentId: passage.document_id,
    documentTitle: passage.document_title,
    chunkId: passage.chunk_id,
    heading: passage.heading,
    sectionPath: passage.section_path,
    similarity: passage.similarity,
    publishedAt: passage.published_at,
    sourceType: passage.source_type,
  })) satisfies BrainCitation[];

  return {
    answer: parsed.data.answer.trim(),
    citations,
    entities: matchedEntities.slice(0, 20).map((entity) => ({
      id: entity.id,
      name: entity.canonical_name,
      type: entity.entity_type,
      description: entity.description,
    })),
    relationships: graphRelationships.slice(0, 40),
    retrieval: {
      outcome: retrieval.outcome,
      documentIds: Array.from(new Set(retrieval.hits.map((hit) => hit.documentId))),
      chunkIds: retrieval.hits.map((hit) => hit.chunkId),
      latencyMs: retrieval.latencyMs,
    },
    graphContext: {
      matchedEntities: matchedEntities.length,
      matchedRelationships: graphRelationships.length,
      summaries: matchedSummaries.length + documentSummaries.length,
    },
    caveat:
      parsed.data.caveat?.trim() ||
      'Graph relationships marked as inference are model hypotheses, not verified facts.',
  };
}
