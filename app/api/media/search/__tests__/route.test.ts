/** @jest-environment node */

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => null,
  getClientIp: () => '127.0.0.1',
}));

jest.mock('@/lib/mediaRecords', () => ({
  getMediaRecords: jest.fn(),
}));

jest.mock('@/lib/knowledge/media/search', () => ({
  searchMediaIntelligence: jest.fn(),
}));

import { getMediaRecords } from '@/lib/mediaRecords';
import { searchMediaIntelligence } from '@/lib/knowledge/media/search';

import { POST } from '../route';

const record = {
  id: 'media-1',
  slug: 'le-monde-digital-control',
  title: 'Digital control and hardware',
  outlet: 'Le Monde',
  url: 'https://example.com/article',
  date: '2026-10-13',
  lang: 'EN' as const,
  topic: 'Internet & Censorship' as const,
  kind: 'quote' as const,
  summary: 'An article about digital control.',
  verifiedQuotes: [
    {
      id: 'mq_1',
      text: 'Hardware control is the next frontier.',
      type: 'direct_quote' as const,
      language: 'fr',
    },
  ],
};

describe('Public media search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMediaRecords as jest.Mock).mockResolvedValue([record]);
    (searchMediaIntelligence as jest.Mock).mockRejectedValue(new Error('embeddings unavailable'));
  });

  it('falls back to metadata and verified quotes when RAG is unavailable', async () => {
    const response = await POST(
      new Request('http://localhost/api/media/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'digital control', filters: {} }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.semantic).toBe(false);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].quotes[0].text).toContain('Hardware control');
    expect(json.results[0].href).toBe('/media/record/le-monde-digital-control');
  });

  it('returns an explicit empty state', async () => {
    const response = await POST(
      new Request('http://localhost/api/media/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'unrelated term', filters: {} }),
      })
    );
    const json = await response.json();

    expect(json.count).toBe(0);
    expect(json.summary).toContain('No publications');
  });
});
