import {
  BRAIN_RAG_CANDIDATE_LIMIT,
  BRAIN_RAG_MAX_QUERY_CHARS,
  BRAIN_RAG_TIMEOUT_MS,
  BRAIN_RAG_TOP_K,
  isPierrotRagEnabled,
  resolveBrainRagThreshold,
  resolveUnframedEmbeddingConfig,
  type RagEnvironment,
} from './config';
import {
  EmbeddingDimensionMismatchError,
  EmbeddingModelMismatchError,
  EmbeddingProviderError,
  EmbeddingTimeoutError,
  KnowledgeDatabaseError,
  RagConfigurationError,
} from './errors';
import { createOpenRouterEmbeddingClientFromEnv, type EmbeddingClient } from './embeddings';
import {
  buildBrainQueryPlan,
  classifyBrainDocument,
  resolveBrainSourceFilters,
  sourcePriorityForPlan,
  type BrainQueryPlan,
} from './queryRouting';
import { createSupabaseBrainSearch } from './supabaseStore';
import type {
  BrainSearch,
  BrainSourceClass,
  KnowledgeAccessClass,
  RagRetrievalResult,
  RagUnavailableCode,
  RetrievedChunk,
} from './types';

export type RetrieveBrainEvidenceInput = {
  query: string;
  scope: KnowledgeAccessClass;
  ownerAuthorized: boolean;
  /** Optional single-document scope. Whole Brain is used when omitted. */
  documentId?: string | null;
  enabled?: boolean;
  env?: RagEnvironment;
  embeddingClient?: EmbeddingClient;
  search?: BrainSearch;
  topK?: number;
  minSimilarity?: number;
  timeoutMs?: number;
  plan?: BrainQueryPlan;
};

export type BrainRetrievalRanking = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceClass: BrainSourceClass;
  similarity: number;
  lexicalScore: number;
  combinedScore: number;
};

export type BrainRetrievalResult = RagRetrievalResult & {
  plan: BrainQueryPlan;
  method: 'hybrid_v2';
  selectedSourceClasses: BrainSourceClass[];
  selectedSourceDomains: string[];
  candidateCount: number;
  documentIds: string[];
  chunkIds: string[];
  ranking: BrainRetrievalRanking[];
};

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new EmbeddingTimeoutError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new EmbeddingTimeoutError());
    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function errorCode(error: unknown): RagUnavailableCode {
  if (error instanceof EmbeddingTimeoutError) return 'timeout';
  if (error instanceof EmbeddingDimensionMismatchError) return 'embedding_dimension_mismatch';
  if (error instanceof EmbeddingModelMismatchError) return 'embedding_model_mismatch';
  if (error instanceof EmbeddingProviderError) return 'embedding_failed';
  if (error instanceof KnowledgeDatabaseError) {
    return error.code === 'database_unavailable' ? 'database_unavailable' : 'database_failed';
  }
  if (error instanceof RagConfigurationError) return 'missing_configuration';
  return 'unexpected';
}

function emptyResult(
  plan: BrainQueryPlan,
  startedAt: number,
  outcome: RagRetrievalResult['outcome'],
  code?: RagUnavailableCode,
  topSimilarity: number | null = null
): BrainRetrievalResult {
  const filters = resolveBrainSourceFilters(plan);

  return {
    outcome,
    hits: [],
    latencyMs: Math.max(0, Date.now() - startedAt),
    topSimilarity,
    ...(code ? { code } : {}),
    plan,
    method: 'hybrid_v2',
    selectedSourceClasses: filters.sourceClasses,
    selectedSourceDomains: filters.sourceDomains || [],
    candidateCount: 0,
    documentIds: [],
    chunkIds: [],
    ranking: [],
  };
}

function domainMatches(domain: string | null, allowed: string[]): boolean {
  if (!domain) return false;
  const normalized = domain.toLowerCase().replace(/^www\./, '');

  return allowed.some(
    (value) => normalized === value.toLowerCase() || normalized.endsWith(`.${value.toLowerCase()}`)
  );
}

function rowMatchesFilters(
  row: Awaited<ReturnType<BrainSearch>>[number],
  sourceClass: BrainSourceClass,
  filters: ReturnType<typeof resolveBrainSourceFilters>,
  plan: BrainQueryPlan
): boolean {
  if (filters.sourceClasses.length > 0 && !filters.sourceClasses.includes(sourceClass)) {
    return false;
  }

  if (filters.sourceTypes && !filters.sourceTypes.includes(row.source_type)) {
    return false;
  }

  if (filters.sourceDomains && !domainMatches(row.source_domain, filters.sourceDomains)) {
    return false;
  }

  if (filters.authors) {
    const author = (row.author || '').toLowerCase();

    if (!filters.authors.some((value) => author === value.toLowerCase())) {
      return false;
    }
  }

  if (plan.publishedFrom && row.published_at && row.published_at < plan.publishedFrom) {
    return false;
  }

  if (plan.publishedTo && row.published_at && row.published_at > plan.publishedTo) {
    return false;
  }

  return true;
}

function toHit(
  row: Awaited<ReturnType<BrainSearch>>[number],
  sourceClass: BrainSourceClass,
  combinedScore: number
): RetrievedChunk {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    sourceType: row.source_type,
    sourceClass,
    sourceDomain: row.source_domain,
    author: row.author,
    language: row.language,
    publishedAt: row.published_at,
    content: row.content,
    heading: row.heading,
    sectionPath: [...row.section_path],
    sectionIndex: row.section_index,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    similarity: row.similarity,
    lexicalScore: row.lexical_score,
    combinedScore,
  };
}

/**
 * Source-aware hybrid retrieval. The old retrieveUnframedEvidence() remains
 * untouched and can still be selected with PIERROT_BRAIN_RETRIEVAL_V2=false.
 */
export async function retrieveBrainEvidence(
  input: RetrieveBrainEvidenceInput
): Promise<BrainRetrievalResult> {
  const startedAt = Date.now();
  const env = input.env ?? process.env;
  const plan = input.plan ?? buildBrainQueryPlan(input.query);
  const enabled = input.enabled ?? isPierrotRagEnabled(env);

  if (!enabled) return emptyResult(plan, startedAt, 'unavailable', 'disabled');

  if (input.scope !== 'owner' && input.scope !== 'public') {
    return emptyResult(plan, startedAt, 'unavailable', 'unauthorized_scope');
  }

  if (input.scope === 'owner' && !input.ownerAuthorized) {
    return emptyResult(plan, startedAt, 'unavailable', 'unauthorized_scope');
  }

  const query = typeof input.query === 'string' ? input.query.trim() : '';

  if (!query || query.length > BRAIN_RAG_MAX_QUERY_CHARS) {
    return emptyResult(plan, startedAt, 'unavailable', 'invalid_query');
  }

  let modelId: string;
  let dimensions: number;
  let threshold: number;

  try {
    const config = resolveUnframedEmbeddingConfig(env);
    modelId = config.modelId;
    dimensions = config.dimensions;
    threshold = input.minSimilarity ?? resolveBrainRagThreshold(env);
  } catch {
    return emptyResult(plan, startedAt, 'unavailable', 'missing_configuration');
  }

  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    return emptyResult(plan, startedAt, 'unavailable', 'missing_configuration');
  }

  const topK = Math.min(Math.max(Math.trunc(input.topK ?? BRAIN_RAG_TOP_K), 1), BRAIN_RAG_TOP_K);
  const timeoutMs = Math.max(1, Math.trunc(input.timeoutMs ?? BRAIN_RAG_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const filters = input.documentId
    ? {
        sourceClasses: [],
        sourceTypes: null,
        sourceDomains: null,
        authors: null,
      }
    : resolveBrainSourceFilters(plan);
  const sourcePriority = sourcePriorityForPlan(plan);

  try {
    const embeddingClient = input.embeddingClient ?? createOpenRouterEmbeddingClientFromEnv(env);
    const search = input.search ?? createSupabaseBrainSearch(env);

    if (!search) return emptyResult(plan, startedAt, 'unavailable', 'database_unavailable');
    if (embeddingClient.modelId !== modelId) {
      return emptyResult(plan, startedAt, 'unavailable', 'embedding_model_mismatch');
    }
    if (embeddingClient.dimensions !== dimensions) {
      return emptyResult(plan, startedAt, 'unavailable', 'embedding_dimension_mismatch');
    }

    const vectors = await withAbort(
      embeddingClient.embed([query], controller.signal),
      controller.signal
    );

    if (!Array.isArray(vectors) || vectors.length !== 1) {
      return emptyResult(plan, startedAt, 'unavailable', 'embedding_failed');
    }

    const queryVector = vectors[0];

    if (!Array.isArray(queryVector) || queryVector.length !== dimensions) {
      return emptyResult(plan, startedAt, 'unavailable', 'embedding_dimension_mismatch');
    }

    const rows = await withAbort(
      search({
        queryEmbedding: queryVector,
        modelId,
        dimensions,
        accessClass: input.scope,
        documentId: input.documentId ?? null,
        documentIds: input.documentId ? [input.documentId] : null,
        topK,
        matchCount: Math.max(BRAIN_RAG_CANDIDATE_LIMIT, topK),
        minSimilarity: -1,
        queryText: plan.lexicalQuery || plan.originalQuery,
        sourceTypes: filters.sourceTypes,
        sourceDomains: filters.sourceDomains,
        authors: filters.authors,
        languages: null,
        publishedFrom: plan.publishedFrom,
        publishedTo: plan.publishedTo,
        signal: controller.signal,
      }),
      controller.signal
    );

    const scopedDocumentId = input.documentId ?? null;
    const ranked = rows
      .filter(
        (row) =>
          row &&
          typeof row.chunk_id === 'string' &&
          typeof row.document_id === 'string' &&
          typeof row.content === 'string' &&
          row.content.length > 0 &&
          Number.isFinite(row.similarity) &&
          (scopedDocumentId === null || row.document_id === scopedDocumentId)
      )
      .map((row) => {
        const sourceClass = classifyBrainDocument({
          source_type: row.source_type,
          title: row.document_title,
          source_domain: row.source_domain,
          author: row.author,
          metadata: null,
        });

        if (!rowMatchesFilters(row, sourceClass, filters, plan)) return null;

        const priority = sourcePriority[sourceClass] ?? 0;
        const lexical = Math.max(0, Math.min(1, row.lexical_score || 0));
        const authorMatch =
          plan.requestedAuthors.length > 0 &&
          plan.requestedAuthors.some((author) =>
            (row.author || '').toLowerCase().includes(author.toLowerCase())
          )
            ? 1
            : 0;
        const combinedScore = Number(
          (0.75 * row.similarity + 0.17 * lexical + 0.05 * priority + 0.03 * authorMatch).toFixed(6)
        );

        return { row, sourceClass, combinedScore };
      })
      .filter(
        (
          candidate
        ): candidate is {
          row: Awaited<ReturnType<BrainSearch>>[number];
          sourceClass: BrainSourceClass;
          combinedScore: number;
        } => candidate !== null
      )
      .sort(
        (left, right) =>
          right.combinedScore - left.combinedScore ||
          right.row.similarity - left.row.similarity ||
          left.row.chunk_id.localeCompare(right.row.chunk_id)
      );

    if (ranked.length === 0) {
      return emptyResult(plan, startedAt, 'no_match');
    }

    const maxPerDocument =
      plan.specificDocument || plan.requestedSources.includes('manuscript') ? 4 : 2;
    const explicitManuscript = plan.requestedSources.includes('manuscript');
    const maxManuscript = explicitManuscript ? topK : 1;
    const maxPerClass = explicitManuscript ? topK : 5;
    const documentCounts = new Map<string, number>();
    const classCounts = new Map<BrainSourceClass, number>();
    const diverse: Array<{
      row: (typeof ranked)[number]['row'];
      sourceClass: BrainSourceClass;
      combinedScore: number;
    }> = [];

    for (const candidate of ranked) {
      const documentCount = documentCounts.get(candidate.row.document_id) ?? 0;
      const classCount = classCounts.get(candidate.sourceClass) ?? 0;

      if (documentCount >= maxPerDocument) continue;
      if (candidate.sourceClass === 'manuscript' && classCount >= maxManuscript) continue;
      if (classCount >= maxPerClass) continue;

      diverse.push(candidate);
      documentCounts.set(candidate.row.document_id, documentCount + 1);
      classCounts.set(candidate.sourceClass, classCount + 1);

      if (diverse.length >= topK) break;
    }

    const topSimilarity = diverse.length > 0 ? diverse[0].row.similarity : null;
    const explicitThreshold =
      plan.requestedSources.length > 0 || plan.specificDocument ? threshold * 0.8 : threshold;
    const usable = diverse.filter(
      (candidate) =>
        candidate.row.similarity >= explicitThreshold || (candidate.row.lexical_score || 0) >= 0.15
    );

    if (usable.length === 0) {
      return {
        ...emptyResult(plan, startedAt, 'weak_match', undefined, topSimilarity),
        candidateCount: ranked.length,
      };
    }

    const hits = usable
      .slice(0, topK)
      .map((candidate) => toHit(candidate.row, candidate.sourceClass, candidate.combinedScore));

    return {
      outcome: 'relevant_results',
      hits,
      latencyMs: Math.max(0, Date.now() - startedAt),
      topSimilarity,
      plan,
      method: 'hybrid_v2',
      selectedSourceClasses: filters.sourceClasses.length
        ? filters.sourceClasses
        : Array.from(new Set(ranked.map((candidate) => candidate.sourceClass))),
      selectedSourceDomains: filters.sourceDomains || [],
      candidateCount: ranked.length,
      documentIds: Array.from(new Set(hits.map((hit) => hit.documentId))),
      chunkIds: hits.map((hit) => hit.chunkId),
      ranking: usable.slice(0, topK).map((candidate) => ({
        chunkId: candidate.row.chunk_id,
        documentId: candidate.row.document_id,
        documentTitle: candidate.row.document_title,
        sourceClass: candidate.sourceClass,
        similarity: candidate.row.similarity,
        lexicalScore: candidate.row.lexical_score,
        combinedScore: candidate.combinedScore,
      })),
    };
  } catch (error) {
    return emptyResult(plan, startedAt, 'unavailable', errorCode(error));
  } finally {
    clearTimeout(timer);
  }
}
