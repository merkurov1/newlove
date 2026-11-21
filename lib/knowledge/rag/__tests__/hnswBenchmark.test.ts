/** @jest-environment node */

import {
  HNSW_RECALL_GATES,
  chooseEfSearch,
  meetsGates,
  overlapAtK,
  percentile,
  rankChunkIds,
  recallAtK,
  summarizeEfSearch,
  summarizeLatencies,
  top10Preserved,
} from '../hnswBenchmark';

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}_${index}`);
}

describe('rankChunkIds', () => {
  it('orders by similarity descending and chunk id ascending for ties', () => {
    expect(
      rankChunkIds(
        [
          { chunkId: 'b', similarity: 0.5 },
          { chunkId: 'a', similarity: 0.5 },
          { chunkId: 'c', similarity: 0.9 },
          { chunkId: 'bad', similarity: Number.NaN },
        ],
        2
      )
    ).toEqual(['c', 'a']);
  });
});

describe('recallAtK and overlapAtK', () => {
  it('returns 1 for identical result sets', () => {
    const exact = ids('e', 40);

    expect(recallAtK(exact, exact, 20)).toBe(1);
    expect(overlapAtK(exact, exact, 10)).toBe(1);
  });

  it('counts only the shared ids inside k', () => {
    const exact = ids('e', 10);
    const approx = [...ids('e', 5), ...ids('x', 5)];

    expect(recallAtK(exact, approx, 10)).toBe(0.5);
    expect(recallAtK(exact, approx, 5)).toBe(1);
    expect(overlapAtK(exact, approx, 10)).toBe(0.5);
  });

  it('uses the available exact results as denominator', () => {
    expect(recallAtK(['a', 'b'], ['a'], 40)).toBe(0.5);
  });

  it('treats an empty exact set as undefined recall but an explicit overlap', () => {
    expect(recallAtK([], [], 10)).toBeNull();
    expect(overlapAtK([], [], 10)).toBe(1);
    expect(overlapAtK([], ['unexpected'], 10)).toBe(0);
  });

  it('preserves the top-10 when at least 9 of 10 ids overlap', () => {
    const exact = ids('e', 10);
    const nine = [...ids('e', 9), 'other'];

    expect(top10Preserved(exact, nine)).toBe(true);
    expect(top10Preserved(exact, ids('other', 10))).toBe(false);
  });
});

describe('summarizeEfSearch and chooseEfSearch', () => {
  const exact = ids('e', 40);

  it('aggregates recall and top-10 preservation across queries', () => {
    const summary = summarizeEfSearch(80, [
      { exact, approx: exact },
      {
        exact,
        approx: [...ids('e', 18), ...ids('x', 22)],
      },
    ]);

    expect(summary.queries).toBe(2);
    expect(summary.recallAt10).toBe(1);
    expect(summary.recallAt20).toBe(0.95);
    expect(summary.recallAt40).toBe(0.725);
    expect(summary.top10PreservedRate).toBe(1);
  });

  it('chooses the smallest ef_search that passes every gate', () => {
    const failing = summarizeEfSearch(40, [{ exact, approx: [...ids('e', 10), ...ids('x', 30)] }]);
    const passing80 = summarizeEfSearch(80, [{ exact, approx: exact }]);
    const passing120 = summarizeEfSearch(120, [{ exact, approx: exact }]);

    expect(meetsGates(failing)).toBe(false);
    expect(meetsGates(passing80)).toBe(true);
    expect(chooseEfSearch([passing120, failing, passing80])).toBe(80);
  });

  it('returns null when no tested ef_search satisfies the gates', () => {
    const failing = summarizeEfSearch(40, [{ exact, approx: ids('x', 40) }]);

    expect(chooseEfSearch([failing])).toBeNull();
  });

  it('exposes the documented gates', () => {
    expect(HNSW_RECALL_GATES).toEqual({
      recallAt20: 0.95,
      recallAt40: 0.97,
      top10PreservedRate: 0.95,
    });
  });
});

describe('latency aggregation', () => {
  it('computes nearest-rank percentiles', () => {
    const values = [...Array.from({ length: 99 }, () => 100), 900];

    expect(percentile(values, 50)).toBe(100);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile(values, 100)).toBe(900);
    expect(percentile([], 95)).toBeNull();
  });

  it('summarizes median, p95 and extremes', () => {
    const summary = summarizeLatencies([10, 20, 30, 40, 1000]);

    expect(summary.count).toBe(5);
    expect(summary.medianMs).toBe(30);
    expect(summary.p95Ms).toBe(1000);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(1000);
  });

  it('returns null fields for an empty sample', () => {
    expect(summarizeLatencies([])).toEqual({
      count: 0,
      medianMs: null,
      p95Ms: null,
      maxMs: null,
      minMs: null,
    });
  });
});
