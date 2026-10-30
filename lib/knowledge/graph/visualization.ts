import type { BrainGraphStore } from './store';
import type {
  BrainEntityType,
  BrainGraphEdge,
  BrainGraphNode,
  BrainGraphPayload,
  GraphNodeKind,
} from './types';

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
  section_path: string[] | null;
  evidence: string | null;
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

type ChunkMetaRow = {
  id: string;
  document_id: string;
  heading: string;
  section_path: string[] | null;
};

export type GraphQuery = {
  q?: string;
  types?: GraphNodeKind[];
  limit?: number;
};

const ENTITY_TYPES: GraphNodeKind[] = [
  'person',
  'organization',
  'publication',
  'country',
  'city',
  'technology',
  'artwork',
  'art_project',
  'event',
  'concept',
  'theme',
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function parseGraphTypes(value: string | null | undefined): GraphNodeKind[] {
  if (!value) return ['document', ...ENTITY_TYPES];

  const requested = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .filter((part): part is GraphNodeKind =>
      part === 'document' || (ENTITY_TYPES as string[]).includes(part)
    );

  return requested.length > 0 ? requested : ['document', ...ENTITY_TYPES];
}

export async function loadBrainGraph(
  store: BrainGraphStore,
  query: GraphQuery = {}
): Promise<BrainGraphPayload> {
  const client = store.client;
  const limit = Math.min(Math.max(query.limit ?? 250, 20), 800);
  const types = query.types && query.types.length > 0 ? query.types : ['document', ...ENTITY_TYPES];
  const search = query.q ? normalize(query.q) : '';

  const [documents, entityResult, mentionResult, relationshipResult, chunkResult] =
    await Promise.all([
      store.listDocuments(2000),
      client
        .from('brain_entities')
        .select('id,entity_type,canonical_name,description,aliases,confidence')
        .limit(5000),
      client
        .from('brain_entity_mentions')
        .select('entity_id,document_id,chunk_id,section_path,evidence')
        .limit(20000),
      client
        .from('brain_relationships')
        .select(
          'id,source_entity_id,target_entity_id,relation_type,confidence,inference,provenance_document_id,provenance_chunk_id,evidence'
        )
        .limit(10000),
      client
        .from('knowledge_chunks')
        .select('id,document_id,heading,section_path')
        .limit(5000),
    ]);

  if (entityResult.error) throw new Error('brain_graph_entities_query_failed');
  if (mentionResult.error) throw new Error('brain_graph_mentions_query_failed');
  if (relationshipResult.error) throw new Error('brain_graph_relationships_query_failed');

  const entities = (Array.isArray(entityResult.data) ? entityResult.data : []) as EntityRow[];
  const mentions = (Array.isArray(mentionResult.data) ? mentionResult.data : []) as MentionRow[];
  const relationships = (
    Array.isArray(relationshipResult.data) ? relationshipResult.data : []
  ) as RelationshipRow[];
  const chunks = (Array.isArray(chunkResult.data) ? chunkResult.data : []) as ChunkMetaRow[];

  const documentById = new Map(documents.map((document) => [document.id, document]));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const mentionCount = new Map<string, number>();
  const documentCount = new Map<string, Set<string>>();
  const entityDocuments = new Map<string, Set<string>>();

  for (const mention of mentions) {
    mentionCount.set(mention.entity_id, (mentionCount.get(mention.entity_id) || 0) + 1);
    const docs = documentCount.get(mention.entity_id) || new Set<string>();
    docs.add(mention.document_id);
    documentCount.set(mention.entity_id, docs);

    const entityDocs = entityDocuments.get(mention.document_id) || new Set<string>();
    entityDocs.add(mention.entity_id);
    entityDocuments.set(mention.document_id, entityDocs);
  }

  const matches = (value: string | null | undefined): boolean => {
    if (!search) return true;
    return normalize(value || '').includes(search);
  };

  const selectedEntityIds = new Set<string>();

  for (const entity of entities) {
    if (!types.includes(entity.entity_type)) continue;

    const aliasMatch = (entity.aliases || []).some((alias) => matches(alias));

    if (matches(entity.canonical_name) || matches(entity.description) || aliasMatch) {
      selectedEntityIds.add(entity.id);
    }
  }

  const selectedDocumentIds = new Set<string>();

  for (const document of documents) {
    if (!types.includes('document')) continue;

    if (
      matches(document.title) ||
      matches(document.author) ||
      matches(document.canonical_url) ||
      matches(document.source_url)
    ) {
      selectedDocumentIds.add(document.id);
    }
  }

  // With no search, keep the most mentioned entities and their documents.
  if (!search) {
    const rankedEntities = entities
      .filter((entity) => types.includes(entity.entity_type))
      .sort(
        (left, right) =>
          (mentionCount.get(right.id) || 0) - (mentionCount.get(left.id) || 0)
      )
      .slice(0, Math.max(40, limit - documents.length));

    for (const entity of rankedEntities) selectedEntityIds.add(entity.id);

    for (const entityIdValue of selectedEntityIds) {
      for (const mention of mentions) {
        if (mention.entity_id === entityIdValue && types.includes('document')) {
          selectedDocumentIds.add(mention.document_id);
        }
      }
    }
  } else {
    // Include one-hop neighbours so a search result is not an isolated dot.
    for (const relationship of relationships) {
      if (selectedEntityIds.has(relationship.source_entity_id)) {
        selectedEntityIds.add(relationship.target_entity_id);
      }
      if (selectedEntityIds.has(relationship.target_entity_id)) {
        selectedEntityIds.add(relationship.source_entity_id);
      }
    }

    for (const mention of mentions) {
      if (selectedEntityIds.has(mention.entity_id)) {
        selectedDocumentIds.add(mention.document_id);
      }
    }
  }

  // Respect the global node limit after prioritising matched/central nodes.
  const entityNodes: BrainGraphNode[] = [];
  const documentNodes: BrainGraphNode[] = [];

  for (const entity of entities) {
    if (!selectedEntityIds.has(entity.id)) continue;

    entityNodes.push({
      id: `entity:${entity.id}`,
      kind: entity.entity_type,
      label: entity.canonical_name,
      subtitle: entity.description ? entity.description.slice(0, 180) : null,
      entityId: entity.id,
      mentionCount: mentionCount.get(entity.id) || 0,
      confidence: Number(entity.confidence) || 0.6,
      metadata: {
        aliases: entity.aliases || [],
        documents: documentCount.get(entity.id)?.size || 0,
      },
    });
  }

  for (const document of documents) {
    if (!selectedDocumentIds.has(document.id)) continue;

    documentNodes.push({
      id: `doc:${document.id}`,
      kind: 'document',
      label: document.title,
      subtitle: [document.author, document.published_at?.slice(0, 10)].filter(Boolean).join(' · ') || null,
      documentId: document.id,
      sourceType: document.source_type,
      publishedAt: document.published_at,
      mentionCount: entityDocuments.get(document.id)?.size || 0,
      metadata: {
        canonicalUrl: document.canonical_url,
        language: document.language,
      },
    });
  }

  const allNodes = [...documentNodes, ...entityNodes]
    .sort((left, right) => (right.mentionCount || 0) - (left.mentionCount || 0))
    .slice(0, limit);
  const allowedNodeIds = new Set(allNodes.map((node) => node.id));

  const edges: BrainGraphEdge[] = [];
  const seenMentionEdges = new Set<string>();

  for (const mention of mentions) {
    const source = `doc:${mention.document_id}`;
    const target = `entity:${mention.entity_id}`;

    if (!allowedNodeIds.has(source) || !allowedNodeIds.has(target)) continue;

    const key = `${source}|${target}`;
    if (seenMentionEdges.has(key)) continue;

    seenMentionEdges.add(key);
    const document = documentById.get(mention.document_id);
    const chunk = chunkById.get(mention.chunk_id);

    edges.push({
      id: `mention:${mention.document_id}:${mention.entity_id}`,
      source,
      target,
      relation: 'mentions',
      label: 'mentions',
      confidence: 0.8,
      inference: false,
      provenance: document
        ? {
            documentId: document.id,
            documentTitle: document.title,
            chunkId: mention.chunk_id,
            heading: chunk?.heading || null,
            sectionPath: chunk?.section_path || mention.section_path || [],
          }
        : null,
    });
  }

  for (const relationship of relationships) {
    const source = `entity:${relationship.source_entity_id}`;
    const target = `entity:${relationship.target_entity_id}`;

    if (!allowedNodeIds.has(source) || !allowedNodeIds.has(target)) continue;

    const document = documentById.get(relationship.provenance_document_id);
    const chunk = chunkById.get(relationship.provenance_chunk_id);

    edges.push({
      id: relationship.id,
      source,
      target,
      relation: relationship.relation_type as BrainGraphEdge['relation'],
      label: relationship.relation_type.replace(/_/g, ' '),
      confidence: Number(relationship.confidence) || 0.5,
      inference: Boolean(relationship.inference),
      provenance: document
        ? {
            documentId: document.id,
            documentTitle: document.title,
            chunkId: relationship.provenance_chunk_id,
            heading: chunk?.heading || null,
            sectionPath: chunk?.section_path || [],
          }
        : null,
    });
  }

  // Document-document links derived from shared entities (not model claims).
  const documentPairs = new Map<string, string[]>();
  const docs = Array.from(entityDocuments.keys());

  for (let leftIndex = 0; leftIndex < docs.length; leftIndex += 1) {
    const left = docs[leftIndex];
    const leftEntities = entityDocuments.get(left);

    if (!leftEntities) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < docs.length; rightIndex += 1) {
      const right = docs[rightIndex];
      const rightEntities = entityDocuments.get(right);

      if (!rightEntities) continue;

      const shared: string[] = [];
      for (const entityIdValue of leftEntities) {
        if (rightEntities.has(entityIdValue)) shared.push(entityIdValue);
      }

      if (shared.length < 2) continue;
      const key = [left, right].sort().join('|');
      if (!documentPairs.has(key)) documentPairs.set(key, shared.slice(0, 20));
    }
  }

  let documentLinkCount = 0;

  for (const [key, shared] of documentPairs) {
    if (documentLinkCount >= 400) break;
    const [left, right] = key.split('|');
    const source = `doc:${left}`;
    const target = `doc:${right}`;

    if (!allowedNodeIds.has(source) || !allowedNodeIds.has(target)) continue;

    documentLinkCount += 1;
    edges.push({
      id: `doclink:${left}:${right}`,
      source,
      target,
      relation: 'related_to',
      label: `shares ${shared.length} entities`,
      confidence: Math.min(0.9, 0.4 + shared.length / 20),
      inference: false,
      provenance: null,
    });
  }

  return {
    nodes: allNodes,
    edges,
    stats: {
      documents: documents.length,
      entities: entities.length,
      relationships: relationships.length,
      mentions: mentions.length,
      shownNodes: allNodes.length,
      shownEdges: edges.length,
    },
  };
}
