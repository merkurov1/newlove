/**
 * Pure metric helpers for the Brain HNSW benchmark.
 *
 * They are intentionally independent of PostgreSQL and of the embedding
 * provider so that recall, overlap and latency aggregation can be unit tested
 * without production credentials.
 */

export type RankedCandidate = {
  chunkId: string;
  similarity: number;
};

export type QueryRanking = {
  /** Chunk ids ordered exactly as the exact (ground-truth) search returns them. */
  exact: string[];
  /** Chunk ids ordered exactly as the approximate search returns them. */
  approx: string[];
};

export type EfSearchSummary = {
  efSearch: number;
  queries: number;
  recallAt10: number | null;
  recallAt20: number | null;
  recallAt40: number | null;
  overlapAt10: number;
  overlapAt20: number;
  overlapAt40: number;
  /** Share of queries whose approximate top-10 overlaps the exact top-10 by >= 0.9. */
  top10PreservedRate: number;
};

export type LatencySummary = {
  count: number;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  minMs: number | null;
};

export const HNSW_RECALL_GATES = {
  recallAt20: 0.97,
  recallAt40: 0.97,
  top10PreservedRate: 0.95,
} as const;

export const TOP10_MIN_OVERLAP = 0.9;

function clampK(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Orders candidates the same way the SQL vector branch does: similarity
 * descending, then chunk id ascending for deterministic ties.
 */
export function rankChunkIds(rows: RankedCandidate[], k: number): string[] {
  return [...rows]
    .filter(
      (row) =>
        row &&
        typeof row.chunkId === 'string' &&
        row.chunkId.length > 0 &&
        Number.isFinite(row.similarity)
    )
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.chunkId.localeCompare(right.chunkId)
    )
    .slice(0, clampK(k))
    .map((row) => row.chunkId);
}

/**
 * Recall@k of the approximate set relative to the exact set.
 *
 * The denominator is the number of exact results actually available up to k.
 * It returns null when the exact search returned no results, because recall is
 * undefined rather than zero in that case.
 */
export function recallAtK(exactIds: string[], approxIds: string[], k: number): number | null {
  const limit = clampK(k);
  const exact = exactIds.slice(0, limit);

  if (exact.length === 0) return null;

  const approx = new Set(approxIds.slice(0, limit));
  const hit = exact.filter((id) => approx.has(id)).length;

  return hit / exact.length;
}

/**
 * Overlap@k uses the same numerator as recall but defines the empty-exact case
 * explicitly: an approximate result with no exact counterpart is a regression,
 * while two empty results are a match. This is used for the "top-10 preserved"
 * gate.
 */
export function overlapAtK(exactIds: string[], approxIds: string[], k: number): number {
  const limit = clampK(k);
  const exact = exactIds.slice(0, limit);
  const approx = approxIds.slice(0, limit);

  if (exact.length === 0) return approx.length === 0 ? 1 : 0;

  const approxSet = new Set(approx);
  const hit = exact.filter((id) => approxSet.has(id)).length;

  return hit / exact.length;
}

export function top10Preserved(
  exactIds: string[],
  approxIds: string[],
  minOverlap: number = TOP10_MIN_OVERLAP
): boolean {
  return overlapAtK(exactIds, approxIds, 10) >= minOverlap;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeEfSearch(efSearch: number, rankings: QueryRanking[]): EfSearchSummary {
  const recall10: number[] = [];
  const recall20: number[] = [];
  const recall40: number[] = [];
  const overlap10: number[] = [];
  const overlap20: number[] = [];
  const overlap40: number[] = [];
  const preserved: number[] = [];

  for (const ranking of rankings) {
    const value10 = recallAtK(ranking.exact, ranking.approx, 10);
    const value20 = recallAtK(ranking.exact, ranking.approx, 20);
    const value40 = recallAtK(ranking.exact, ranking.approx, 40);

    if (value10 !== null) recall10.push(value10);
    if (value20 !== null) recall20.push(value20);
    if (value40 !== null) recall40.push(value40);

    overlap10.push(overlapAtK(ranking.exact, ranking.approx, 10));
    overlap20.push(overlapAtK(ranking.exact, ranking.approx, 20));
    overlap40.push(overlapAtK(ranking.exact, ranking.approx, 40));
    preserved.push(top10Preserved(ranking.exact, ranking.approx) ? 1 : 0);
  }

  return {
    efSearch,
    queries: rankings.length,
    recallAt10: mean(recall10),
    recallAt20: mean(recall20),
    recallAt40: mean(recall40),
    overlapAt10: mean(overlap10) ?? 0,
    overlapAt20: mean(overlap20) ?? 0,
    overlapAt40: mean(overlap40) ?? 0,
    top10PreservedRate: mean(preserved) ?? 0,
  };
}

export function meetsGates(
  summary: EfSearchSummary,
  gates: { recallAt20: number; recallAt40: number; top10PreservedRate: number } = HNSW_RECALL_GATES
): boolean {
  return (
    summary.recallAt20 !== null &&
    summary.recallAt40 !== null &&
    summary.recallAt20 >= gates.recallAt20 &&
    summary.recallAt40 >= gates.recallAt40 &&
    summary.top10PreservedRate >= gates.top10PreservedRate
  );
}

/**
 * Returns the smallest ef_search that satisfies every gate, or null when no
 * tested value does. Requirement: test 40, 80 and 120 before choosing.
 */
export function chooseEfSearch(
  summaries: EfSearchSummary[],
  gates: { recallAt20: number; recallAt40: number; top10PreservedRate: number } = HNSW_RECALL_GATES
): number | null {
  const passing = summaries
    .filter((summary) => meetsGates(summary, gates))
    .sort((left, right) => left.efSearch - right.efSearch);

  return passing.length > 0 ? passing[0].efSearch : null;
}

/** Nearest-rank percentile. Returns null for an empty sample. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

  if (sorted.length === 0) return null;

  const bounded = Math.min(100, Math.max(0, p));
  const rank = Math.max(1, Math.ceil((bounded / 100) * sorted.length));

  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

export function summarizeLatencies(values: number[]): LatencySummary {
  const sorted = [...values].filter((value) => Number.isFinite(value));

  return {
    count: sorted.length,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.length > 0 ? Math.max(...sorted) : null,
    minMs: sorted.length > 0 ? Math.min(...sorted) : null,
  };
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Deterministic hashing vectorizer used only by the local benchmark fixture.
 *
 * It is intentionally not an embedding model: it lowers and tokenises text,
 * hashes character trigrams into fixed buckets and L2-normalises the result.
 * It lets the benchmark plumbing (exact SQL, production RPC, HNSW helper,
 * recall and latency aggregation) be exercised without an API key. Outputs
 * produced with this function must be labelled synthetic and must never be
 * presented as real-query quality evidence.
 */
export function deterministicTextEmbedding(text: string, dimensions = 1024): number[] {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error('dimensions must be a positive integer');
  }

  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.normalize('NFKC').toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u1e00-\u1eff]+/g)
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const padded = `^${token}$`;

    for (let index = 0; index + 3 <= padded.length; index += 1) {
      const hash = fnv1a(padded.slice(index, index + 3));
      const bucket = hash % dimensions;
      const sign = hash & 0x80000000 ? -1 : 1;
      vector[bucket] += sign;
    }
  }

  let norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (norm === 0) {
    vector[0] = 1;
    norm = 1;
  }

  return vector.map((value) => value / norm);
}
