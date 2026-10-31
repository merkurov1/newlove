import type { BrainRetrievalResult } from '@/lib/knowledge/rag/brainRetrieval';
import { buildBrainQueryPlan, type BrainQueryPlan } from '@/lib/knowledge/rag/queryRouting';
import type { BrainSourceClass, RetrievedChunk } from '@/lib/knowledge/rag/types';

export type BrainRetrievalAttempt = {
  label: 'original' | 'broaden_time' | 'lexical' | 'broader_topk';
  query: string;
  outcome: BrainRetrievalResult['outcome'];
  hitCount: number;
};

export type RefinedBrainRetrievalResult = BrainRetrievalResult & {
  attempts: number;
  refined: boolean;
  attemptLog: BrainRetrievalAttempt[];
};

type Retrieve = (input: {
  query: string;
  plan: BrainQueryPlan;
  topK?: number;
}) => Promise<BrainRetrievalResult>;

function resultWithHits(
  base: BrainRetrievalResult,
  hits: RetrievedChunk[],
  attemptLog: BrainRetrievalAttempt[],
  latencyMs: number
): RefinedBrainRetrievalResult {
  const documentIds = Array.from(new Set(hits.map((hit) => hit.documentId)));
  const chunkIds = hits.map((hit) => hit.chunkId);
  const selectedSourceClasses = Array.from(
    new Set(
      hits
        .map((hit) => hit.sourceClass as BrainSourceClass | undefined)
        .filter((value): value is BrainSourceClass => Boolean(value))
    )
  );

  return {
    ...base,
    outcome: hits.length > 0 ? 'relevant_results' : base.outcome,
    hits,
    latencyMs,
    topSimilarity: hits.length > 0 ? Math.max(...hits.map((hit) => hit.similarity)) : base.topSimilarity,
    documentIds,
    chunkIds,
    selectedSourceClasses:
      selectedSourceClasses.length > 0 ? selectedSourceClasses : base.selectedSourceClasses,
    ranking:
      hits.length > 0
        ? hits.map((hit) => ({
            chunkId: hit.chunkId,
            documentId: hit.documentId,
            documentTitle: hit.documentTitle || '',
            sourceClass: (hit.sourceClass || 'other') as BrainSourceClass,
            similarity: hit.similarity,
            lexicalScore: hit.lexicalScore || 0,
            combinedScore: hit.combinedScore || hit.similarity,
          }))
        : base.ranking,
    attempts: attemptLog.length,
    refined: attemptLog.length > 1,
    attemptLog,
  };
}

function mergeHits(results: BrainRetrievalResult[], limit = 8): RetrievedChunk[] {
  const seen = new Set<string>();
  const hits: RetrievedChunk[] = [];

  for (const result of results) {
    for (const hit of result.hits) {
      if (seen.has(hit.chunkId)) continue;

      seen.add(hit.chunkId);
      hits.push(hit);
    }
  }

  return hits
    .sort(
      (left, right) =>
        (right.combinedScore || right.similarity) - (left.combinedScore || left.similarity) ||
        left.chunkId.localeCompare(right.chunkId)
    )
    .slice(0, limit);
}

function preservedPlan(plan: BrainQueryPlan, overrides: Partial<BrainQueryPlan>): BrainQueryPlan {
  return {
    ...plan,
    ...overrides,
    requestedSources: plan.requestedSources,
    requestedDomains: plan.requestedDomains,
    requestedAuthors: plan.requestedAuthors,
  };
}

/**
 * Owner Brain retrieval with deterministic refinement.
 *
 * A single no-match is never treated as proof that the knowledge base lacks
 * an answer. If the first attempt does not produce evidence, the retriever:
 *   1. broadens a too-narrow date filter;
 *   2. retries with the lexical query when it differs from the raw message;
 *   3. increases topK and merges the results.
 *
 * The function deliberately does not invent evidence: it returns the first
 * honest no-match when every attempt is empty.
 */
export async function retrieveBrainEvidenceWithRefinement(input: {
  query: string;
  plan: BrainQueryPlan;
  retrieve: Retrieve;
  topK?: number;
  maxAttempts?: number;
}): Promise<RefinedBrainRetrievalResult> {
  const attempts: BrainRetrievalAttempt[] = [];
  const results: BrainRetrievalResult[] = [];
  const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 3, 1), 4);
  const started = Date.now();

  const run = async (label: BrainRetrievalAttempt['label'], query: string, plan: BrainQueryPlan, topK?: number) => {
    const result = await input.retrieve({ query, plan, topK });
    attempts.push({
      label,
      query,
      outcome: result.outcome,
      hitCount: result.hits.length,
    });
    results.push(result);
    return result;
  };

  const first = await run('original', input.query, input.plan, input.topK);

  if (first.outcome === 'relevant_results' && first.hits.length > 0) {
    return resultWithHits(first, first.hits, attempts, first.latencyMs);
  }

  if (first.outcome === 'unavailable') {
    return resultWithHits(first, first.hits, attempts, first.latencyMs);
  }

  if (attempts.length < maxAttempts && (input.plan.publishedFrom || input.plan.publishedTo)) {
    const broadenPlan = preservedPlan(input.plan, {
      publishedFrom: null,
      publishedTo: null,
    });
    const broadened = await run('broaden_time', input.query, broadenPlan, input.topK);

    if (broadened.outcome === 'relevant_results' && broadened.hits.length > 0) {
      return resultWithHits(
        broadened,
        mergeHits(results),
        attempts,
        Date.now() - started
      );
    }
  }

  if (
    attempts.length < maxAttempts &&
    input.plan.lexicalQuery &&
    input.plan.lexicalQuery !== input.query
  ) {
    const lexicalPlanBase = buildBrainQueryPlan(input.plan.lexicalQuery);
    const lexicalPlan = preservedPlan(input.plan, {
      lexicalQuery: lexicalPlanBase.lexicalQuery,
      subject: lexicalPlanBase.subject,
      intent: lexicalPlanBase.intent,
    });
    const lexical = await run('lexical', input.plan.lexicalQuery, lexicalPlan, input.topK);

    if (lexical.outcome === 'relevant_results' && lexical.hits.length > 0) {
      return resultWithHits(lexical, mergeHits(results), attempts, Date.now() - started);
    }
  }

  if (attempts.length < maxAttempts) {
    const broader = await run(
      'broader_topk',
      input.query,
      input.plan,
      Math.min(Math.max((input.topK ?? 8) + 4, 8), 20)
    );

    if (broader.outcome === 'relevant_results' && broader.hits.length > 0) {
      return resultWithHits(broader, mergeHits(results), attempts, Date.now() - started);
    }
  }

  const last = results[results.length - 1] || first;

  return resultWithHits(
    last,
    [],
    attempts,
    Date.now() - started
  );
}
