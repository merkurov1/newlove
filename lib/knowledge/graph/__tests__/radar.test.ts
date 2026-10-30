/** @jest-environment node */

import { clusterQuestionVectors } from '../radar';

describe('Brain editorial radar clustering', () => {
  it('groups near-identical questions and separates unrelated ones', () => {
    const clusters = clusterQuestionVectors(
      [
        [1, 0, 0],
        [0.99, 0.01, 0],
        [0, 1, 0],
        [0, 0.99, 0.01],
        [0, 0, 1],
      ],
      0.9
    );

    expect(clusters).toHaveLength(3);
    expect(clusters.some((indices) => indices.length === 2)).toBe(true);
  });
});
