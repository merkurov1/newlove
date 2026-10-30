/** @jest-environment node */

import {
  emptyOverview,
  mediaIntelligenceCacheKey,
  parseMediaIntelligenceFilters,
  safePercent,
} from '../mediaIntelligenceFilters';

describe('Media Intelligence filters', () => {
  it('parses valid filters and clamps pagination', () => {
    const filters = parseMediaIntelligenceFilters({
      from: '2026-01-01',
      to: '2026-12-31',
      topic: 'AI & Tech',
      language: 'fr',
      outlet: 'Le Monde',
      status: 'published',
      page: '3',
      pageSize: '999',
    });

    expect(filters).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
      topic: 'AI & Tech',
      language: 'FR',
      outlet: 'Le Monde',
      status: 'published',
      page: 3,
      pageSize: 100,
    });
  });

  it('drops invalid dates, topics, languages and statuses', () => {
    const filters = parseMediaIntelligenceFilters({
      from: '2026-02-31',
      topic: 'Not a topic',
      language: 'a',
      status: 'archived',
      page: '-1',
      pageSize: '0',
    });

    expect(filters.from).toBeNull();
    expect(filters.topic).toBeNull();
    expect(filters.language).toBeNull();
    expect(filters.status).toBeNull();
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(20);
  });

  it('orders reversed date ranges safely', () => {
    const filters = parseMediaIntelligenceFilters({
      from: '2026-12-31',
      to: '2026-01-01',
    });

    expect(filters.from).toBe('2026-12-31');
    expect(filters.to).toBe('2026-12-31');
  });

  it('calculates percentages without dividing by zero', () => {
    expect(safePercent(5, 10)).toBe(50);
    expect(safePercent(0, 0)).toBeNull();
    expect(safePercent(1, 3)).toBe(33.3);
  });

  it('returns a stable empty overview', () => {
    expect(emptyOverview()).toMatchObject({
      total: 0,
      byStatus: { published: 0, draft: 0 },
      quotes: { direct: 0, indirect: 0, mentions: 0 },
      fullTextShare: null,
      awaitingReviewShare: null,
    });
  });

  it('builds stable cache keys', () => {
    const filters = parseMediaIntelligenceFilters({
      topic: 'AI & Tech',
      page: '2',
      pageSize: '20',
    });

    expect(mediaIntelligenceCacheKey('overview', filters)).toContain('AI & Tech');
    expect(mediaIntelligenceCacheKey('overview', filters)).toContain('|2|20');
  });
});
