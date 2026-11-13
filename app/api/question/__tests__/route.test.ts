/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/question/store', () => ({
  getPublicQuestion: jest.fn(),
}));

const store = require('@/lib/question/store') as { getPublicQuestion: jest.Mock };
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

const questionId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/question', () => {
  it('returns only the public question contract', async () => {
    store.getPublicQuestion.mockResolvedValueOnce({
      question: { id: questionId, text: 'В чём смысл жизни?' },
      synthesis: {
        content: '# Синтез\n\nТекст.',
        updatedAt: '2026-12-07T10:00:00.000Z',
        version: 1,
      },
      hasAnswers: true,
    });

    const response = await GET(
      new Request(`https://www.merkurov.love/api/question?questionId=${questionId}`)
    );
    const payload = await response.json();

    expect(store.getPublicQuestion).toHaveBeenCalledWith(questionId);
    expect(payload).toEqual({
      question: { id: questionId, text: 'В чём смысл жизни?' },
      synthesis: {
        content: '# Синтез\n\nТекст.',
        updatedAt: '2026-12-07T10:00:00.000Z',
        version: 1,
      },
      hasAnswers: true,
    });
    expect(JSON.stringify(payload)).not.toContain('answerText');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('uses a random lookup for an invalid id and does not cache it', async () => {
    store.getPublicQuestion.mockResolvedValueOnce({
      question: null,
      synthesis: null,
      hasAnswers: false,
    });

    const response = await GET(
      new Request('https://www.merkurov.love/api/question?questionId=not-a-uuid')
    );

    expect(store.getPublicQuestion).toHaveBeenCalledWith(null);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
