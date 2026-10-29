/**
 * Documented hybrid fusion design. This is not used in measured Strategy D
 * results because semantic retrieval is blocked by the missing local runtime
 * and multilingual model.
 *
 * Reciprocal Rank Fusion (RRF) is used because BM25 and cosine similarities
 * have different scales. It combines ranks, not raw scores.
 */
export type FusedRank = {
  id: string;
  score: number;
  componentRanks: number[];
};

export function reciprocalRankFusion(
  rankings: string[][],
  k: number = 60,
): FusedRank[] {
  if (!Number.isFinite(k) || k < 0) {
    throw new Error('RRF k must be a non-negative finite number');
  }

  const scores = new Map<string, { score: number; ranks: number[] }>();

  rankings.forEach((ranking, rankingIndex) => {
    ranking.forEach((id, index) => {
      const entry = scores.get(id) ?? {
        score: 0,
        ranks: rankings.map(() => 0),
      };

      entry.score += 1 / (k + index + 1);
      entry.ranks[rankingIndex] = index + 1;
      scores.set(id, entry);
    });
  });

  return [...scores.entries()]
    .map(([id, value]) => ({
      id,
      score: value.score,
      componentRanks: value.ranks,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;

      return left.id.localeCompare(right.id);
    });
}
