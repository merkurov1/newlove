/** @jest-environment node */

import {
  clampConfidence,
  cosineSimilarity,
  entityId,
  normalizeEntityName,
  normalizeEntityType,
  normalizeRelationType,
  redactQuestion,
  relationshipId,
} from '../normalize';

describe('Brain graph normalization', () => {
  it('maps entity type aliases and rejects unknown types', () => {
    expect(normalizeEntityType('person')).toBe('person');
    expect(normalizeEntityType('People')).toBe('person');
    expect(normalizeEntityType('art project')).toBe('art_project');
    expect(normalizeEntityType('newspaper')).toBe('publication');
    expect(normalizeEntityType('alien')).toBeNull();
  });

  it('maps relationship aliases', () => {
    expect(normalizeRelationType('authored_by')).toBe('authored_by');
    expect(normalizeRelationType('written by')).toBe('authored_by');
    expect(normalizeRelationType('builds_on')).toBe('develops');
    expect(normalizeRelationType('nonsense')).toBeNull();
  });

  it('normalizes names deterministically', () => {
    expect(normalizeEntityName('  Heart & Angel  ')).toBe('heart & angel');
    expect(normalizeEntityName('Ёлка')).toBe('елка');
    expect(normalizeEntityName('AI-regulation')).toBe('ai-regulation');
  });

  it('builds stable entity and relationship ids', () => {
    expect(entityId('concept', 'attention')).toBe(entityId('concept', 'attention'));
    expect(entityId('concept', 'attention')).toMatch(/^ent_[a-f0-9]{32}$/);
    expect(
      relationshipId({
        sourceEntityId: 'ent_a',
        targetEntityId: 'ent_b',
        relationType: 'develops',
        chunkId: 'chk_1',
      })
    ).toMatch(/^rel_[a-f0-9]{32}$/);
  });

  it('clamps confidence and computes cosine similarity', () => {
    expect(clampConfidence(2)).toBe(1);
    expect(clampConfidence(-1)).toBe(0);
    expect(clampConfidence('bad', 0.4)).toBe(0.4);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('redacts obvious personal data from radar questions', () => {
    const redacted = redactQuestion('Write to me at a@b.com or +7 999 123-45-67 from https://x.test');
    expect(redacted).not.toContain('a@b.com');
    expect(redacted).not.toContain('123-45-67');
    expect(redacted).not.toContain('https://x.test');
  });
});
