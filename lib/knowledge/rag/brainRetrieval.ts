import {
  BRAIN_RAG_CANDIDATE_LIMIT,
  BRAIN_RAG_MAX_QUERY_CHARS,
  BRAIN_RAG_EMBEDDING_TIMEOUT_MS,
  BRAIN_RAG_SEARCH_TIMEOUT_MS,
  BRAIN_RAG_TOTAL_TIMEOUT_MS,
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
  isFoodQuery,
  resolveBrainSourceFilters,
  sourcePriorityForPlan,
  type BrainQueryPlan,
} from './queryRouting';
import { retrieveFoodChunks } from './foodRetrieval';
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

export type BrainRetrievalTimings = {
  embeddingMs: number;
  searchMs: number;
  rankingMs: number;
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
  timings?: BrainRetrievalTimings;
  timeoutStage?: 'embedding' | 'search' | 'ranking';
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

function stageAbort(timeoutMs: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
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
  topSimilarity: number | null = null,
  timings?: BrainRetrievalTimings,
  timeoutStage?: 'embedding' | 'search' | 'ranking'
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
    ...(timings ? { timings } : {}),
    ...(timeoutStage ? { timeoutStage } : {}),
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
  const totalBudget = Math.max(1, Math.trunc(input.timeoutMs ?? BRAIN_RAG_TOTAL_TIMEOUT_MS));
  const deadline = startedAt + totalBudget;
  const embeddingBudget = Math.min(
    Math.max(1, Math.trunc(BRAIN_RAG_EMBEDDING_TIMEOUT_MS)),
    totalBudget
  );
  const searchBudget = Math.min(Math.max(1, Math.trunc(BRAIN_RAG_SEARCH_TIMEOUT_MS)), totalBudget);
  const timings: BrainRetrievalTimings = { embeddingMs: 0, searchMs: 0, rankingMs: 0 };
  let timeoutStage: 'embedding' | 'search' | 'ranking' | undefined;
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

    const embeddingStartedAt = Date.now();
    const embeddingStage = stageAbort(
      Math.min(embeddingBudget, Math.max(1, remainingMs(deadline)))
    );
    let vectors: number[][] = [];

    try {
      vectors = await withAbort(
        embeddingClient.embed([query], embeddingStage.controller.signal),
        embeddingStage.controller.signal
      );
    } catch (error) {
      if (embeddingStage.controller.signal.aborted) timeoutStage = 'embedding';
      throw error;
    } finally {
      embeddingStage.clear();
      timings.embeddingMs = Date.now() - embeddingStartedAt;
    }

    if (!Array.isArray(vectors) || vectors.length !== 1) {
      return emptyResult(plan, startedAt, 'unavailable', 'embedding_failed', null, timings);
    }

    const queryVector = vectors[0];

    if (!Array.isArray(queryVector) || queryVector.length !== dimensions) {
      return emptyResult(
        plan,
        startedAt,
        'unavailable',
        'embedding_dimension_mismatch',
        null,
        timings
      );
    }

    const searchStartedAt = Date.now();
    const searchStage = stageAbort(Math.min(searchBudget, Math.max(1, remainingMs(deadline))));
    let rows: Awaited<ReturnType<BrainSearch>> = [];

    try {
      rows = await withAbort(
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
          signal: searchStage.controller.signal,
        }),
        searchStage.controller.signal
      );
    } catch (error) {
      if (searchStage.controller.signal.aborted) timeoutStage = 'search';
      throw error;
    } finally {
      searchStage.clear();
      timings.searchMs = Date.now() - searchStartedAt;
    }

    const rankingStartedAt = Date.now();
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

    if (ranked.length === 0 && !(isFoodQuery(plan) && input.scope === 'owner')) {
      timings.rankingMs = Date.now() - rankingStartedAt;
      return emptyResult(plan, startedAt, 'no_match', undefined, null, timings);
    }

    const maxPerDocument =
      plan.specificDocument || plan.requestedSources.includes('manuscript')
        ? Math.max(topK, 12)
        : 2;
    const explicitManuscript = plan.requestedSources.includes('manuscript');
    const maxManuscript = explicitManuscript ? Math.max(topK, 12) : 1;
    const maxPerClass = explicitManuscript ? Math.max(topK, 12) : 5;
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
    // An explicitly requested source narrows the search scope; it does not
    // make every chunk in that source relevant. The candidate still has to
    // pass a (slightly relaxed) relevance threshold.
    const explicitThreshold =
      plan.requestedSources.length > 0 || plan.specificDocument ? threshold * 0.8 : threshold;
    const usable = diverse.filter(
      (candidate) =>
        candidate.row.similarity >= explicitThreshold || (candidate.row.lexical_score || 0) >= 0.15
    );

    const ordered = plan.wantsRecent
      ? [...usable].sort((left, right) => {
          const leftDate = left.row.published_at ? Date.parse(left.row.published_at) : NaN;
          const rightDate = right.row.published_at ? Date.parse(right.row.published_at) : NaN;

          if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
            return rightDate - leftDate;
          }

          if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) {
            return Number.isFinite(leftDate) ? -1 : 1;
          }

          return right.combinedScore - left.combinedScore;
        })
      : usable;

    const normalHits = ordered
      .slice(0, topK)
      .map((candidate) => toHit(candidate.row, candidate.sourceClass, candidate.combinedScore));

    let foodHits: RetrievedChunk[] = [];

    if (isFoodQuery(plan) && input.scope === 'owner' && remainingMs(deadline) > 0) {
      foodHits = await retrieveFoodChunks({
        query: input.query,
        scope: 'owner',
        topK: Math.min(topK + 2, 12),
        maxPerDocument: 6,
      });
    }

    timings.rankingMs = Date.now() - rankingStartedAt;

    if (usable.length === 0 && foodHits.length === 0) {
      return {
        ...emptyResult(
          plan,
          startedAt,
          ranked.length === 0 ? 'no_match' : 'weak_match',
          undefined,
          topSimilarity,
          timings
        ),
        candidateCount: ranked.length,
      };
    }

    let hits = normalHits;

    if (foodHits.length > 0) {
      const seen = new Set<string>();
      hits = [...foodHits, ...normalHits]
        .filter((hit) => {
          if (seen.has(hit.chunkId)) return false;
          seen.add(hit.chunkId);
          return true;
        })
        .slice(0, topK);
    }

    const hitTopSimilarity =
      hits.length > 0 ? Math.max(...hits.map((hit) => hit.similarity)) : topSimilarity;

    return {
      outcome: 'relevant_results',
      hits,
      latencyMs: Math.max(0, Date.now() - startedAt),
      topSimilarity: hitTopSimilarity,
      plan,
      method: 'hybrid_v2',
      selectedSourceClasses:
        hits.length > 0
          ? Array.from(
              new Set(
                hits
                  .map((hit) => hit.sourceClass)
                  .filter((value): value is BrainSourceClass => Boolean(value))
              )
            )
          : filters.sourceClasses.length
            ? filters.sourceClasses
            : Array.from(new Set(ranked.map((candidate) => candidate.sourceClass))),
      selectedSourceDomains: filters.sourceDomains || [],
      candidateCount:
        ranked.length + (hits.length > normalHits.length ? hits.length - normalHits.length : 0),
      documentIds: Array.from(new Set(hits.map((hit) => hit.documentId))),
      chunkIds: hits.map((hit) => hit.chunkId),
      timings,
      ranking: hits.map((hit) => ({
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        documentTitle: hit.documentTitle || '',
        sourceClass: (hit.sourceClass || 'other') as BrainSourceClass,
        similarity: hit.similarity,
        lexicalScore: hit.lexicalScore || 0,
        combinedScore: hit.combinedScore || hit.similarity,
      })),
    };
  } catch (error) {
    return emptyResult(
      plan,
      startedAt,
      'unavailable',
      errorCode(error),
      null,
      timings,
      timeoutStage
    );
  }
}
