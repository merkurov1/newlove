import {
  UNFRAMED_EMBEDDING_BATCH_SIZE,
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
  UNFRAMED_RAG_DOCUMENT,
} from './config';
import {
  EmbeddingDimensionMismatchError,
  IngestionPlanError,
  KnowledgeDatabaseError,
  RagConfigurationError,
} from './errors';
import type {
  IngestionApplyInput,
  IngestionOptions,
  KnowledgeChunkRow,
  KnowledgeChunkWithEmbedding,
  KnowledgeIngestionPlan,
  KnowledgeIngestionSummary,
} from './types';

const DATABASE_WRITE_BATCH_SIZE = 25;

export function planEmbeddingBatches<T>(items: T[], batchSize: number): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new IngestionPlanError('batch_size_invalid');
  }

  const result: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    result.push(items.slice(index, index + batchSize));
  }

  return result;
}

function assertPlanMetadata(modelId: string, dimensions: number): void {
  if (modelId !== UNFRAMED_EMBEDDING_MODEL) {
    throw new RagConfigurationError('embedding_model_unsupported');
  }

  if (dimensions !== UNFRAMED_EMBEDDING_DIMENSIONS) {
    throw new RagConfigurationError('embedding_dimensions_unsupported');
  }
}

function embeddingInputForChunk(input: {
  heading: string;
  sectionPath: string[];
  text: string;
}): string {
  const path = input.sectionPath.filter(Boolean).join(' / ');
  const heading = input.heading.trim();
  const context = path || heading;

  return context ? `${context}\n\n${input.text}` : input.text;
}

/**
 * Builds a deterministic, metadata-complete ingestion plan from the frozen
 * Phase B parser output. No network or database access occurs here.
 */
export function buildUnframedIngestionPlan(options: IngestionOptions): KnowledgeIngestionPlan {
  const accessClass = options.accessClass ?? 'owner';
  const batchSize = options.batchSize ?? UNFRAMED_EMBEDDING_BATCH_SIZE;

  assertPlanMetadata(options.modelId, options.dimensions);

  if (accessClass !== 'owner' && accessClass !== 'public') {
    throw new IngestionPlanError('access_class_invalid');
  }

  const { build } = options;

  if (build.document.sourcePath.startsWith('public/')) {
    throw new IngestionPlanError('public_source_refused');
  }

  if (!Object.values(build.checks).every(Boolean)) {
    throw new IngestionPlanError('parser_checks_failed');
  }

  if (build.chunks.length === 0) {
    throw new IngestionPlanError('no_chunks');
  }

  const ids = new Set(build.chunks.map((chunk) => chunk.id));

  if (ids.size !== build.chunks.length) {
    throw new IngestionPlanError('duplicate_chunk_ids');
  }

  const chunks: KnowledgeChunkRow[] = build.chunks.map((chunk) => ({
    id: chunk.id,
    document_id: UNFRAMED_RAG_DOCUMENT.id,
    chunk_index: chunk.index,
    content: chunk.text,
    content_hash: chunk.contentHash,
    heading: chunk.heading,
    section_path: [...chunk.sectionPath],
    section_index: chunk.sectionIndex,
    char_start: chunk.charStart,
    char_end: chunk.charEnd,
    line_start: chunk.lineStart,
    line_end: chunk.lineEnd,
    embedding_model: options.modelId,
    embedding_dimensions: options.dimensions,
    access_class: accessClass,
  }));

  const embeddingInputs = chunks.map((chunk) => ({
    chunkId: chunk.id,
    text: embeddingInputForChunk({
      heading: chunk.heading,
      sectionPath: chunk.section_path,
      text: chunk.content,
    }),
  }));

  const document = {
    id: UNFRAMED_RAG_DOCUMENT.id,
    title: UNFRAMED_RAG_DOCUMENT.title,
    source_path: build.manifest.sourcePath,
    source_sha256: build.manifest.sourceSha256,
    manifest_hash: build.manifest.manifestHash,
    parser_version: build.manifest.parserVersion,
    chunker_version: build.manifest.chunkerVersion,
    ingestion_version: UNFRAMED_RAG_DOCUMENT.ingestionVersion,
    embedding_model: options.modelId,
    embedding_dimensions: options.dimensions,
    access_class: accessClass,
    chunk_count: chunks.length,
    source_char_count: build.manifest.sourceCharCount,
  };

  return {
    document,
    chunks,
    embeddingInputs,
    stats: {
      chunkCount: chunks.length,
      totalChunkChars: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
      totalEmbeddingInputChars: embeddingInputs.reduce((sum, item) => sum + item.text.length, 0),
      batchCount: planEmbeddingBatches(chunks, batchSize).length,
      sourceSha256: document.source_sha256,
      manifestHash: document.manifest_hash,
    },
  };
}

export function summarizeDryRun(plan: KnowledgeIngestionPlan): KnowledgeIngestionSummary {
  return {
    status: 'dry_run',
    documentId: plan.document.id,
    chunkCount: plan.chunks.length,
    batchCount: plan.stats.batchCount,
    embeddingModel: plan.document.embedding_model,
    embeddingDimensions: plan.document.embedding_dimensions,
    staleChunkCount: 0,
    deletedChunkCount: 0,
    sourceSha256: plan.document.source_sha256,
    manifestHash: plan.document.manifest_hash,
  };
}

function validateEmbeddings(plan: KnowledgeIngestionPlan, embeddings: number[][]): void {
  if (!Array.isArray(embeddings) || embeddings.length !== plan.chunks.length) {
    throw new IngestionPlanError('embedding_count_mismatch');
  }

  for (const vector of embeddings) {
    if (!Array.isArray(vector)) {
      throw new IngestionPlanError('embedding_vector_invalid');
    }

    if (vector.length !== plan.document.embedding_dimensions) {
      throw new EmbeddingDimensionMismatchError(plan.document.embedding_dimensions, vector.length);
    }

    if (!vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new IngestionPlanError('embedding_vector_invalid');
    }
  }
}

async function writeChunks(
  repository: IngestionApplyInput['repository'],
  chunks: KnowledgeChunkWithEmbedding[]
): Promise<void> {
  for (const batch of planEmbeddingBatches(chunks, DATABASE_WRITE_BATCH_SIZE)) {
    await repository.upsertChunks(batch);
  }
}

/**
 * Writes an already-embedded plan. Embeddings must be produced before this
 * function is called so a provider failure cannot leave a partial index.
 *
 * Stale rows are only deleted when `allowStaleDelete` is explicitly true.
 */
export async function applyUnframedIngestion(
  input: IngestionApplyInput
): Promise<KnowledgeIngestionSummary> {
  const { plan, embeddings, repository } = input;

  validateEmbeddings(plan, embeddings);

  let existingIds: string[];
  try {
    existingIds = await repository.listChunkIds(plan.document.id);
  } catch {
    throw new KnowledgeDatabaseError('query_failed');
  }

  const nextIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const staleIds = existingIds.filter((id) => !nextIds.has(id));

  // A changed manuscript produces new deterministic chunk IDs. Never overwrite
  // an index while obsolete rows remain unless an operator explicitly reviewed
  // and enabled stale deletion.
  if (staleIds.length > 0 && !input.allowStaleDelete) {
    throw new IngestionPlanError('stale_chunks_require_review');
  }

  const rows: KnowledgeChunkWithEmbedding[] = plan.chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  try {
    await repository.upsertDocument(plan.document);
    await writeChunks(repository, rows);

    if (input.allowStaleDelete && staleIds.length > 0) {
      await repository.deleteChunks(plan.document.id, staleIds);
    }
  } catch (error) {
    if (error instanceof KnowledgeDatabaseError) throw error;
    throw new KnowledgeDatabaseError('write_failed');
  }

  return {
    status: 'ingested',
    documentId: plan.document.id,
    chunkCount: plan.chunks.length,
    batchCount: plan.stats.batchCount,
    embeddingModel: plan.document.embedding_model,
    embeddingDimensions: plan.document.embedding_dimensions,
    staleChunkCount: staleIds.length,
    deletedChunkCount: input.allowStaleDelete ? staleIds.length : 0,
    sourceSha256: plan.document.source_sha256,
    manifestHash: plan.document.manifest_hash,
  };
}
