/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireUser: jest.fn(),
}));

jest.mock('@/lib/question/store', () => ({
  submitQuestionAnswer: jest.fn(),
}));

jest.mock('@/lib/question/synthesis', () => ({
  requestQuestionSynthesis: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  requireUser: jest.Mock;
};
const store = require('@/lib/question/store') as {
  submitQuestionAnswer: jest.Mock;
};
const synthesis = require('@/lib/question/synthesis') as {
  requestQuestionSynthesis: jest.Mock;
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const questionId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `слово${index + 1}`).join(' ');
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://www.merkurov.love/api/question/answer', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'www.merkurov.love',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.requireUser.mockResolvedValue({ id: userId, role: 'USER', profile: {} });
  store.submitQuestionAnswer.mockResolvedValue({ ok: true, corpusCount: 1 });
  synthesis.requestQuestionSynthesis.mockResolvedValue({
    status: 'ready',
    content: '# Синтез\n\nОтвет Пьеро.',
  });
});

describe('POST /api/question/answer', () => {
  it('rejects an unauthenticated request without touching the database', async () => {
    auth.requireUser.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(makeRequest({ questionId, content: words(30) }));

    expect(response.status).toBe(401);
    expect(store.submitQuestionAnswer).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin write', async () => {
    const response = await POST(
      makeRequest({ questionId, content: words(30) }, { origin: 'https://evil.example' })
    );

    expect(response.status).toBe(403);
    expect(store.submitQuestionAnswer).not.toHaveBeenCalled();
  });

  it('rejects an answer shorter than 25 words on the server', async () => {
    const response = await POST(makeRequest({ questionId, content: words(24) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'too_short', minWords: 25 });
    expect(store.submitQuestionAnswer).not.toHaveBeenCalled();
    expect(synthesis.requestQuestionSynthesis).not.toHaveBeenCalled();
  });

  it('rejects an unknown question id', async () => {
    const response = await POST(makeRequest({ questionId: 'nope', content: words(30) }));

    expect(response.status).toBe(400);
    expect(store.submitQuestionAnswer).not.toHaveBeenCalled();
  });

  it('saves a valid answer and triggers one synthesis for the new corpus', async () => {
    const response = await POST(
      makeRequest({ questionId, content: `  ${words(30)}  ` })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(store.submitQuestionAnswer).toHaveBeenCalledWith({
      questionId,
      userId,
      content: words(30),
      wordCount: 30,
    });
    expect(synthesis.requestQuestionSynthesis).toHaveBeenCalledTimes(1);
    expect(synthesis.requestQuestionSynthesis).toHaveBeenCalledWith(questionId);
    expect(payload).toMatchObject({
      ok: true,
      synthesisState: 'ready',
      synthesis: { content: '# Синтез\n\nОтвет Пьеро.' },
    });
    expect(JSON.stringify(payload)).not.toContain(words(30));
  });

  it('returns 409 when the user already answered this question', async () => {
    store.submitQuestionAnswer.mockResolvedValueOnce({
      ok: false,
      reason: 'already_answered',
    });

    const response = await POST(makeRequest({ questionId, content: words(30) }));

    expect(response.status).toBe(409);
    expect(synthesis.requestQuestionSynthesis).not.toHaveBeenCalled();
  });

  it('confirms a saved answer even when synthesis generation fails', async () => {
    synthesis.requestQuestionSynthesis.mockResolvedValueOnce({ status: 'failed' });

    const response = await POST(makeRequest({ questionId, content: words(30) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      synthesisState: 'deferred',
      synthesis: null,
    });
    expect(store.submitQuestionAnswer).toHaveBeenCalledTimes(1);
  });

  it('marks generation as pending when another request owns the lock', async () => {
    synthesis.requestQuestionSynthesis.mockResolvedValueOnce({ status: 'pending' });

    const response = await POST(makeRequest({ questionId, content: words(30) }));

    expect(await response.json()).toMatchObject({
      ok: true,
      synthesisState: 'pending',
    });
  });

  it('sets private no-store headers on every response', async () => {
    const response = await POST(makeRequest({ questionId, content: words(30) }));

    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
