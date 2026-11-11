/** @jest-environment node */

import { resolveEntityCandidates } from '../types';
import type { PierrotEntity } from '../types';

function entity(overrides: Partial<PierrotEntity>): PierrotEntity {
  return {
    id: 'e1',
    ownerUserId: 'owner',
    entityType: 'PROJECT',
    name: 'UNFRAMED',
    canonicalName: 'unframed',
    description: '',
    projectId: null,
    parentEntityId: null,
    status: 'active',
    aliases: [],
    sourceRefs: [],
    metadata: {},
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('entity resolution', () => {
  it('keeps the UNFRAMED book and project distinct instead of choosing one', () => {
    const book = entity({
      id: 'book-1',
      entityType: 'BOOK',
      name: 'UNFRAMED',
      description: 'Literary work: manuscript, chapters, editions.',
      aliases: ['UNFRAMED book'],
    });
    const project = entity({
      id: 'project-1',
      entityType: 'PROJECT',
      name: 'UNFRAMED',
      description: 'Larger creative project: series, video, website, proposal.',
      aliases: ['UNFRAMED project'],
    });

    const resolution = resolveEntityCandidates({
      entities: [book, project],
      query: 'UNFRAMED',
    });

    expect(resolution.ambiguous).toBe(true);
    expect(resolution.reason).toBe('MULTIPLE_TYPES');
    expect(resolution.resolved).toBeNull();
    expect(resolution.candidates.map((item) => item.entity.entityType).sort()).toEqual([
      'BOOK',
      'PROJECT',
    ]);
  });

  it('uses an explicit type hint without merging the other entity', () => {
    const book = entity({ id: 'book-1', entityType: 'BOOK', name: 'UNFRAMED' });
    const project = entity({ id: 'project-1', entityType: 'PROJECT', name: 'UNFRAMED' });

    const resolution = resolveEntityCandidates({
      entities: [book, project],
      query: 'UNFRAMED',
      typeHint: 'BOOK',
    });

    expect(resolution.ambiguous).toBe(false);
    expect(resolution.resolved?.entityType).toBe('BOOK');
  });

  it('does not resolve a short unrelated name by substring accident', () => {
    const project = entity({ id: 'project-1', entityType: 'PROJECT', name: 'Heart & Angel' });
    const resolution = resolveEntityCandidates({
      entities: [project],
      query: 'heart surgery research',
    });
    expect(resolution.candidates).toHaveLength(0);
  });
});
