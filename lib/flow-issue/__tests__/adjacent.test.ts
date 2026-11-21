import type { PublicFlowIssue } from '../public';
import { findAdjacentFlowIssues } from '../navigation';

function issue(
  id: string,
  lang: 'ru' | 'en',
  number: number,
  publishedAt: string
): PublicFlowIssue {
  return {
    id,
    title: `Issue ${id}`,
    slug: id,
    lang,
    number,
    htmlWeb: '<html><body></body></html>',
    payload: null,
    publishedAt,
    createdAt: publishedAt,
  };
}

const ru1 = issue('ru-1', 'ru', 1, '2026-10-01T00:00:00.000Z');
const ru2 = issue('ru-2', 'ru', 2, '2026-10-08T00:00:00.000Z');
const ru3 = issue('ru-3', 'ru', 3, '2026-10-15T00:00:00.000Z');
const en9 = issue('en-9', 'en', 9, '2026-10-20T00:00:00.000Z');

describe('Flow issue Previous / Next navigation', () => {
  it('walks the same language edition in publication order', () => {
    const { previous, next } = findAdjacentFlowIssues([ru2, en9, ru1, ru3], ru2);

    expect(previous?.slug).toBe('ru-1');
    expect(next?.slug).toBe('ru-3');
  });

  it('has no next issue for the newest and no previous for the oldest', () => {
    expect(findAdjacentFlowIssues([ru1, ru2, ru3], ru3)).toEqual({
      previous: ru2,
      next: null,
    });

    expect(findAdjacentFlowIssues([ru1, ru2, ru3], ru1)).toEqual({
      previous: null,
      next: ru2,
    });
  });

  it('does not cross into another language edition', () => {
    const { previous, next } = findAdjacentFlowIssues([ru2, en9], ru2);

    expect(previous).toBeNull();
    expect(next).toBeNull();
  });

  it('falls back to publication dates when the current row is not in the list', () => {
    const { previous, next } = findAdjacentFlowIssues([ru1, ru3], ru2);

    expect(previous?.slug).toBe('ru-1');
    expect(next?.slug).toBe('ru-3');
  });

  it('ignores duplicate rows', () => {
    const { previous, next } = findAdjacentFlowIssues([ru1, ru2, ru2, ru3], ru2);

    expect(previous?.id).toBe('ru-1');
    expect(next?.id).toBe('ru-3');
  });
});
