/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  PIERROT_RELIABILITY_BENCHMARK,
  PIERROT_RELIABILITY_BENCHMARK_STATS,
  verifiedBenchmarkQueries,
} from '../reliabilityBenchmark';

describe('Pierrot reliability benchmark manifest', () => {
  it('contains at least 60 reproducible queries', () => {
    expect(PIERROT_RELIABILITY_BENCHMARK_STATS.total).toBeGreaterThanOrEqual(60);
    expect(PIERROT_RELIABILITY_BENCHMARK).toHaveLength(PIERROT_RELIABILITY_BENCHMARK_STATS.total);
  });

  it('keeps verified ground truth separate from pending queries', () => {
    expect(PIERROT_RELIABILITY_BENCHMARK_STATS.verified).toBeGreaterThan(0);
    expect(PIERROT_RELIABILITY_BENCHMARK_STATS.pendingGroundTruth).toBeGreaterThan(0);
    expect(verifiedBenchmarkQueries().every((query) => query.expectedDocumentIds !== null)).toBe(
      true
    );

    const pending = PIERROT_RELIABILITY_BENCHMARK.filter(
      (query) => query.answerability === 'pending_ground_truth'
    );
    expect(pending.every((query) => query.expectedDocumentIds === null)).toBe(true);
  });

  it('covers the required categories', () => {
    const categories = new Set(PIERROT_RELIABILITY_BENCHMARK.map((query) => query.category));
    for (const category of [
      'biography',
      'articles',
      'unframed',
      'personal_notes',
      'projects',
      'media_coverage',
      'exact_document',
      'thematic',
      'cross_language',
      'no_answer',
      'routing',
      'commercial',
      'failure_handling',
    ]) {
      expect(categories.has(category as never)).toBe(true);
    }
  });
});
