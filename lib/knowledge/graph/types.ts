export type BrainEntityType =
  | 'person'
  | 'organization'
  | 'publication'
  | 'country'
  | 'city'
  | 'technology'
  | 'artwork'
  | 'art_project'
  | 'event'
  | 'concept'
  | 'theme';

export type BrainRelationType =
  | 'authored_by'
  | 'published_in'
  | 'mentions'
  | 'discusses'
  | 'related_to'
  | 'created_by'
  | 'part_of'
  | 'occurred_in'
  | 'contradicts'
  | 'develops'
  | 'references';

export type ExtractedEntity = {
  name: string;
  type: BrainEntityType;
  normalizedName: string;
  description: string | null;
  aliases: string[];
  confidence: number;
  chunkId: string;
  evidence: string | null;
};

export type ExtractedRelationship = {
  sourceName: string;
  sourceType: BrainEntityType;
  targetName: string;
  targetType: BrainEntityType;
  relationType: BrainRelationType;
  confidence: number;
  chunkId: string;
  evidence: string;
  inference: boolean;
};

export type DocumentExtraction = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  chunkIds: string[];
  batches: number;
};

export type BrainGraphJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export type BrainGraphRunStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type BrainGraphRun = {
  id: string;
  status: BrainGraphRunStatus;
  extractor_version: string;
  model: string;
  total_documents: number;
  completed_documents: number;
  failed_documents: number;
  skipped_documents: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type BrainGraphJob = {
  id: string;
  run_id: string;
  document_id: string;
  status: BrainGraphJobStatus;
  content_hash: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_detail: string | null;
  worker_id: string | null;
  locked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BrainGraphProgress = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  skipped: number;
  failed: number;
  cancelled: number;
  done: boolean;
};

export type BrainDocumentForGraph = {
  id: string;
  title: string;
  source_type: string;
  source_path: string;
  source_url: string | null;
  canonical_url: string | null;
  author: string | null;
  language: string | null;
  published_at: string | null;
  content_hash: string | null;
  source_sha256: string;
  chunk_count: number;
  metadata: Record<string, unknown> | null;
};

export type BrainChunkForGraph = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading: string;
  section_path: string[];
  section_index: number;
  line_start: number;
  line_end: number;
};

export type GraphNodeKind = 'document' | BrainEntityType;

export type BrainGraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  subtitle: string | null;
  documentId?: string;
  entityId?: string;
  sourceType?: string;
  publishedAt?: string | null;
  mentionCount?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type BrainGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: BrainRelationType | 'mentions' | 'related_to';
  label: string;
  confidence: number;
  inference: boolean;
  provenance?: {
    documentId: string;
    documentTitle: string;
    chunkId: string;
    heading: string | null;
    sectionPath: string[];
  } | null;
};

export type BrainGraphPayload = {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
  stats: {
    documents: number;
    entities: number;
    relationships: number;
    mentions: number;
    shownNodes: number;
    shownEdges: number;
  };
};

export type BrainCitation = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  heading: string;
  sectionPath: string[];
  similarity: number | null;
  publishedAt: string | null;
  sourceType: string | null;
};

export type BrainResearchAnswer = {
  answer: string;
  citations: BrainCitation[];
  entities: Array<{ id: string; name: string; type: BrainEntityType; description: string | null }>;
  relationships: Array<{
    source: string;
    target: string;
    relation: string;
    confidence: number;
    inference: boolean;
    document_id: string;
    document_title: string | null;
    chunk_id: string;
    evidence: string;
  }>;
  retrieval: {
    outcome: string;
    documentIds: string[];
    chunkIds: string[];
    latencyMs: number;
  };
  graphContext: {
    matchedEntities: number;
    matchedRelationships: number;
    summaries: number;
  };
  caveat: string;
};

export type BrainRadarSuggestion = {
  id: string;
  radar_run_id: string | null;
  topic: string;
  representative_question: string;
  occurrences: number;
  avg_retrieval_similarity: number | null;
  missing_knowledge: boolean;
  related_document_ids: string[];
  related_document_titles: string[];
  related_entity_ids: string[];
  suggestion: string;
  rationale: string | null;
  confidence: number;
  status: 'pending' | 'approved' | 'dismissed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
