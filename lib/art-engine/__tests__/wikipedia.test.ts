/** @jest-environment node */

import {
  findWikipediaArticle,
  normalizeArtistName,
} from '../wikipedia';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe('Wikipedia artist enrichment', () => {
  it('normalizes artist names with dates and attribution prefixes', () => {
    expect(normalizeArtistName('MICHAEL ARMITAGE (B. 1984)')).toBe(
      'MICHAEL ARMITAGE',
    );
    expect(normalizeArtistName('Attributed to Alma Thomas (1891–1978)')).toBe(
      'Alma Thomas',
    );
  });

  it('finds the correct artist article', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('list=search')) {
        return jsonResponse({
          query: {
            search: [{ title: 'Alma Thomas' }],
          },
        });
      }

      return jsonResponse({
        title: 'Alma Thomas',
        description: 'American painter (1891–1978)',
        extract:
          'Alma Woodsey Thomas was an American artist and educator, best known for her colorful abstract paintings.',
        type: 'standard',
        content_urls: {
          desktop: { page: 'https://en.wikipedia.org/wiki/Alma_Thomas' },
        },
      });
    });

    const result = await findWikipediaArticle('Alma Thomas (1891–1978)', {
      fetchImpl,
    });

    expect(result.status).toBe('found');
    expect(result.title).toBe('Alma Thomas');
    expect(result.url).toContain('Alma_Thomas');
    expect(result.extract).toContain('American artist');
    expect(result.match_score).toBeGreaterThanOrEqual(0.7);
  });

  it('rejects a disambiguation page', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('list=search')) {
        return jsonResponse({
          query: { search: [{ title: 'John Smith (disambiguation)' }] },
        });
      }

      return jsonResponse({
        title: 'John Smith (disambiguation)',
        description: 'Topics referred to by the same term',
        extract: 'John Smith may refer to:',
        type: 'disambiguation',
      });
    });

    const result = await findWikipediaArticle('John Smith', { fetchImpl });

    expect(result.status).toBe('not_found');
    expect(result.title).toBeUndefined();
  });

  it('returns an ambiguous result when only a surname matches', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('list=search')) {
        return jsonResponse({
          query: { search: [{ title: 'Smith' }] },
        });
      }

      return jsonResponse({
        title: 'Smith',
        description: 'British artist',
        extract: 'Smith is a British artist known for paintings.',
        type: 'standard',
        content_urls: {
          desktop: { page: 'https://en.wikipedia.org/wiki/Smith' },
        },
      });
    });

    const result = await findWikipediaArticle('John Smith', { fetchImpl });

    expect(result.status).toBe('ambiguous');
    expect(result.candidates?.length).toBe(1);
    expect(result.warnings[0]).toContain('ambiguous');
  });

  it('returns not_found when Wikipedia has no result', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ query: { search: [] } }),
    );

    const result = await findWikipediaArticle('Unknown Artist', { fetchImpl });

    expect(result.status).toBe('not_found');
    expect(result.extract).toBeUndefined();
  });

  it('returns unavailable when Wikipedia cannot be reached', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await findWikipediaArticle('Alma Thomas', { fetchImpl });

    expect(result.status).toBe('unavailable');
    expect(result.warnings[0]).toContain('network down');
  });

  it('skips lookup when the artist is missing', async () => {
    const result = await findWikipediaArticle('');

    expect(result.status).toBe('skipped');
    expect(result.warnings[0]).toContain('missing');
  });
});
