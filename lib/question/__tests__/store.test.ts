/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: jest.Mock;
};

const questionId = '11111111-1111-4111-8111-111111111111';

const store = require('../store') as typeof import('../store');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('question store', () => {
  it('normalizes only public question and synthesis fields', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          id: questionId,
          question: 'В чём смысл жизни?',
          synthesis_content: '# Синтез\n\nТекст.',
          synthesis_updated_at: '2026-12-07T10:00:00.000Z',
          synthesis_version: 3,
          has_answers: true,
        },
      ],
      error: null,
    }));

    serverAuth.getServerSupabaseClient.mockReturnValue({ rpc });

    const result = await store.getPublicQuestion(null);

    expect(rpc).toHaveBeenCalledWith('question_public_page', { p_question_id: null });
    expect(result).toEqual({
      question: { id: questionId, text: 'В чём смысл жизни?' },
      synthesis: {
        content: '# Синтез\n\nТекст.',
        updatedAt: '2026-12-07T10:00:00.000Z',
        version: 3,
      },
      hasAnswers: true,
    });
    expect(JSON.stringify(result)).not.toContain('answer');
  });

  it('does not turn an invalid question id into a random lookup', async () => {
    const rpc = jest.fn(async () => ({ data: [], error: null }));
    serverAuth.getServerSupabaseClient.mockReturnValue({ rpc });

    await store.getPublicQuestion('not-a-uuid');

    expect(rpc).toHaveBeenCalledWith('question_public_page', { p_question_id: null });
  });

  it('keeps the saved answer when queueing the synthesis fails', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [{ submitted: true, reason: 'submitted', corpus_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000' },
      });

    serverAuth.getServerSupabaseClient.mockReturnValue({ rpc });

    const result = await store.submitQuestionAnswer({
      questionId,
      userId: '22222222-2222-4222-8222-222222222222',
      content: 'текст',
      wordCount: 25,
    });

    expect(result).toEqual({ ok: true, corpusCount: 1 });
    expect(rpc).toHaveBeenNthCalledWith(1, 'question_submit_answer', {
      p_question_id: questionId,
      p_user_id: '22222222-2222-4222-8222-222222222222',
      p_content: 'текст',
      p_word_count: 25,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'question_record_answer', {
      p_question_id: questionId,
    });
  });

  it('maps a duplicate answer to a stable reason', async () => {
    const rpc = jest.fn(async () => ({
      data: [{ submitted: false, reason: 'already_answered', corpus_count: 2 }],
      error: null,
    }));

    serverAuth.getServerSupabaseClient.mockReturnValue({ rpc });

    const result = await store.submitQuestionAnswer({
      questionId,
      userId: '22222222-2222-4222-8222-222222222222',
      content: 'текст',
      wordCount: 25,
    });

    expect(result).toEqual({ ok: false, reason: 'already_answered' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
