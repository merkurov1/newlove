import type { UnframedBuild } from '../types';

export type KnowledgeAccessClass = 'public' | 'owner';

export type RagRetrievalOutcome = 'relevant_results' | 'weak_match' | 'no_match' | 'unavailable';

export type RagUnavailableCode =
  | 'disabled'
  | 'unauthorized_scope'
  | 'missing_configuration'
  | 'invalid_query'
  | 'embedding_failed'
  | 'embedding_timeout'
  | 'embedding_dimension_mismatch'
  | 'embedding_model_mismatch'
  | 'database_unavailable'
  | 'database_failed'
  | 'timeout'
  | 'unexpected';

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  content: string;
  heading: string;
  sectionPath: string[];
  sectionIndex: number;
  lineStart: number;
  lineEnd: number;
  similarity: number;
};

export type RagRetrievalResult = {
  outcome: RagRetrievalOutcome;
  hits: RetrievedChunk[];
  latencyMs: number;
  topSimilarity: number | null;
  code?: RagUnavailableCode;
};

export type KnowledgeDocumentRow = {
  id: string;
  title: string;
  source_path: string;
  source_sha256: string;
  manifest_hash: string;
  parser_version: string;
  chunker_version: string;
  ingestion_version: string;
  embedding_model: string;
  embedding_dimensions: number;
  access_class: KnowledgeAccessClass;
  chunk_count: number;
  source_char_count: number;
  metadata?: Record<string, unknown>;
};

export type KnowledgeChunkRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  heading: string;
  section_path: string[];
  section_index: number;
  char_start: number;
  char_end: number;
  line_start: number;
  line_end: number;
  embedding_model: string;
  embedding_dimensions: number;
  access_class: KnowledgeAccessClass;
};

export type KnowledgeChunkWithEmbedding = KnowledgeChunkRow & {
  embedding: number[];
};

export type KnowledgeIngestionPlan = {
  document: KnowledgeDocumentRow;
  chunks: KnowledgeChunkRow[];
  /** Full text sent to the embedding provider. Never write this to logs or reports. */
  embeddingInputs: Array<{ chunkId: string; text: string }>;
  stats: {
    chunkCount: number;
    totalChunkChars: number;
    totalEmbeddingInputChars: number;
    batchCount: number;
    sourceSha256: string;
    manifestHash: string;
  };
};

export type KnowledgeIngestionSummary = {
  status: 'dry_run' | 'ingested';
  documentId: string;
  chunkCount: number;
  batchCount: number;
  embeddingModel: string;
  embeddingDimensions: number;
  staleChunkCount: number;
  deletedChunkCount: number;
  sourceSha256: string;
  manifestHash: string;
};

export type KnowledgeSearchRow = {
  chunk_id: string;
  document_id: string;
  content: string;
  heading: string;
  section_path: string[];
  section_index: number;
  line_start: number;
  line_end: number;
  similarity: number;
};

export type KnowledgeSearchInput = {
  queryEmbedding: number[];
  modelId: string;
  dimensions: number;
  accessClass: KnowledgeAccessClass;
  documentId: string;
  topK: number;
  minSimilarity: number;
  signal?: AbortSignal;
};

export type KnowledgeSearch = (input: KnowledgeSearchInput) => Promise<KnowledgeSearchRow[]>;

export type KnowledgeRepository = {
  upsertDocument(document: KnowledgeDocumentRow): Promise<void>;
  upsertChunks(chunks: KnowledgeChunkWithEmbedding[]): Promise<void>;
  listChunkIds(documentId: string): Promise<string[]>;
  deleteChunks(documentId: string, chunkIds: string[]): Promise<void>;
  search: KnowledgeSearch;
};

export type IngestionOptions = {
  build: UnframedBuild;
  modelId: string;
  dimensions: number;
  accessClass?: KnowledgeAccessClass;
  batchSize?: number;
};

export type IngestionApplyInput = {
  plan: KnowledgeIngestionPlan;
  embeddings: number[][];
  repository: KnowledgeRepository;
  allowStaleDelete: boolean;
};
