import { computeIngestionStatus, findMissingFields, mergeVault, normalizeVault } from '../vault';

describe('Art Engine vault state', () => {
  it('normalizes empty and malformed vault values', () => {
    expect(normalizeVault(null)).toEqual({ schema_version: 1 });

    expect(normalizeVault({ schema_version: 99, ingestion: { status: 'ready' } })).toMatchObject({
      schema_version: 1,
      ingestion: {
        status: 'ready',
        warnings: [],
        errors: [],
        missing_fields: [],
      },
    });
  });

  it('merges ingestion warnings and attempt ids without losing existing state', () => {
    const first = mergeVault(null, {
      ingestion: {
        status: 'queued',
        attempt_ids: ['a'],
        warnings: ['first'],
        errors: [],
        missing_fields: [],
      },
    });

    const second = mergeVault(first, {
      ingestion: {
        status: 'partial',
        attempt_ids: ['b'],
        warnings: ['second', 'first'],
        errors: ['image failed'],
        missing_fields: ['image'],
      },
      audit: [{ at: '2026-11-03T00:00:00.000Z', action: 'lot.ingested' }],
    });

    expect(second.ingestion?.status).toBe('partial');
    expect(second.ingestion?.attempt_ids).toEqual(['a', 'b']);
    expect(second.ingestion?.warnings).toEqual(['first', 'second']);
    expect(second.ingestion?.errors).toEqual(['image failed']);
    expect(second.audit).toHaveLength(1);
  });

  it('marks complete records ready and missing images partial', () => {
    expect(
      computeIngestionStatus({
        artist: 'Artist',
        title: 'Title',
        imageUrl: 'https://example.com/image.jpg',
      }),
    ).toBe('ready');

    expect(
      computeIngestionStatus({
        artist: 'Artist',
        title: 'Title',
        imageUrl: null,
      }),
    ).toBe('partial');

    expect(computeIngestionStatus({})).toBe('failed');
  });

  it('reports missing fields without inventing values', () => {
    expect(
      findMissingFields({
        artist: '',
        title: 'Title',
        imageUrl: '',
      }),
    ).toEqual(
      expect.arrayContaining(['artist', 'image']),
    );
  });
});
