import { projectSlugBase, uniqueProjectSlug } from '../slug';

describe('project slugs', () => {
  it('normalizes names on the server and preserves unicode-only names via a stable fallback', () => {
    expect(projectSlugBase('Heart & Angel')).toBe('heart-angel');
    expect(projectSlugBase('Проект')).toBe(projectSlugBase('Проект'));
    expect(projectSlugBase('Проект')).toMatch(/^project-[a-f0-9]{10}$/);
  });

  it('adds a deterministic available suffix for duplicate names', () => {
    expect(uniqueProjectSlug('Heart & Angel', ['heart-angel'])).toBe('heart-angel-2');
    expect(uniqueProjectSlug('Heart & Angel', ['heart-angel', 'heart-angel-2'])).toBe('heart-angel-3');
  });
});
