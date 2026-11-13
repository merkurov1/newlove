/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/pierrot/model', () => ({
  callPierrotModel: jest.fn(),
}));

jest.mock('../store', () => ({
  getQuestionServiceClient: jest.fn(),
  loadSynthesisCorpus: jest.fn(),
}));

const model = require('@/lib/pierrot/model') as { callPierrotModel: jest.Mock };
const store = require('../store') as {
  getQuestionServiceClient: jest.Mock;
  loadSynthesisCorpus: jest.Mock;
};
const { requestQuestionSynthesis } = require('../synthesis') as typeof import('../synthesis');

const questionId = '11111111-1111-4111-8111-111111111111';

function corpus(answers: string[]) {
  return {
    question: { id: questionId, text: 'В чём смысл жизни?' },
    answers,
    totalAnswerCount: answers.length,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  model.callPierrotModel.mockResolvedValue({
    reply: '# Синтез\n\nСвязный ответ.',
    provider: 'deepseek',
    model: 'deepseek-chat',
    latencyMs: 10,
    fallbackUsed: false,
    finishReason: 'stop',
    usage: null,
  });
});

describe('requestQuestionSynthesis', () => {
  it('does not call the model when the corpus is empty', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ generation_token: 'token', corpus_count: 0 }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    store.getQuestionServiceClient.mockReturnValue({ rpc });
    store.loadSynthesisCorpus.mockResolvedValue(corpus([]));

    const result = await requestQuestionSynthesis(questionId);

    expect(result.status).toBe('failed');
    expect(model.callPierrotModel).not.toHaveBeenCalled();
    const token = rpc.mock.calls[0]?.[1]?.p_generation_token;
    expect(rpc).toHaveBeenLastCalledWith('question_fail_synthesis', {
      p_question_id: questionId,
      p_generation_token: token,
      p_error_code: 'generation_failed',
    });
  });

  it('claims once, generates, and saves a synthesis for the first answer', async () => {
    const rpc = jest.fn(async (name: string) => {
      if (name === 'question_claim_synthesis') {
        return {
          data: [
            {
              generation_token: '11111111-1111-4111-8111-111111111111',
              corpus_count: 1,
            },
          ],
          error: null,
        };
      }

      if (name === 'question_complete_synthesis') {
        return { data: [{ completed: true, dirty: false }], error: null };
      }

      return { data: null, error: null };
    });

    store.getQuestionServiceClient.mockReturnValue({ rpc });
    store.loadSynthesisCorpus.mockResolvedValue(corpus(['Первый человеческий ответ.']));

    const result = await requestQuestionSynthesis(questionId);

    expect(result).toEqual({ status: 'ready', content: '# Синтез\n\nСвязный ответ.' });
    expect(model.callPierrotModel).toHaveBeenCalledTimes(1);
    const token = rpc.mock.calls[0]?.[1]?.p_generation_token;
    expect(rpc).toHaveBeenCalledWith('question_complete_synthesis', {
      p_question_id: questionId,
      p_generation_token: token,
      p_content: '# Синтез\n\nСвязный ответ.',
      p_answer_count: 1,
    });
  });

  it('never starts a competing generation when the lock is held', async () => {
    const rpc = jest.fn(async () => ({ data: [], error: null }));

    store.getQuestionServiceClient.mockReturnValue({ rpc });

    const result = await requestQuestionSynthesis(questionId);

    expect(result.status).toBe('pending');
    expect(store.loadSynthesisCorpus).not.toHaveBeenCalled();
    expect(model.callPierrotModel).not.toHaveBeenCalled();
  });

  it('keeps the answer path alive and records a bounded failure', async () => {
    const rpc = jest.fn(async (name: string) => {
      if (name === 'question_claim_synthesis') {
        return {
          data: [
            {
              generation_token: '11111111-1111-4111-8111-111111111111',
              corpus_count: 1,
            },
          ],
          error: null,
        };
      }

      return { data: true, error: null };
    });

    store.getQuestionServiceClient.mockReturnValue({ rpc });
    store.loadSynthesisCorpus.mockResolvedValue(corpus(['Ответ']));
    model.callPierrotModel.mockRejectedValueOnce(new Error('provider down'));

    const result = await requestQuestionSynthesis(questionId);

    const token = rpc.mock.calls[0]?.[1]?.p_generation_token;
    expect(result.status).toBe('failed');
    expect(rpc).toHaveBeenLastCalledWith('question_fail_synthesis', {
      p_question_id: questionId,
      p_generation_token: token,
      p_error_code: 'generation_failed',
    });
  });

  it('runs one extra pass when answers arrived during generation', async () => {
    let claim = 0;
    let complete = 0;
    const rpc = jest.fn(async (name: string) => {
      if (name === 'question_claim_synthesis') {
        claim += 1;
        return {
          data: [
            {
              generation_token:
                claim === 1
                  ? '11111111-1111-4111-8111-111111111111'
                  : '22222222-2222-4222-8222-222222222222',
              corpus_count: claim,
            },
          ],
          error: null,
        };
      }

      if (name === 'question_complete_synthesis') {
        complete += 1;
        return { data: [{ completed: true, dirty: complete === 1 }], error: null };
      }

      return { data: null, error: null };
    });

    store.getQuestionServiceClient.mockReturnValue({ rpc });
    store.loadSynthesisCorpus
      .mockResolvedValueOnce(corpus(['Первый']))
      .mockResolvedValueOnce(corpus(['Первый', 'Второй']));

    const result = await requestQuestionSynthesis(questionId);

    expect(result.status).toBe('ready');
    expect(claim).toBe(2);
    expect(complete).toBe(2);
    expect(model.callPierrotModel).toHaveBeenCalledTimes(2);
  });

  it('does not write a stale result after the lease was taken over', async () => {
    const rpc = jest.fn(async (name: string) => {
      if (name === 'question_claim_synthesis') {
        return {
          data: [
            {
              generation_token: '11111111-1111-4111-8111-111111111111',
              corpus_count: 1,
            },
          ],
          error: null,
        };
      }

      if (name === 'question_complete_synthesis') {
        return { data: [{ completed: false, dirty: false }], error: null };
      }

      return { data: null, error: null };
    });

    store.getQuestionServiceClient.mockReturnValue({ rpc });
    store.loadSynthesisCorpus.mockResolvedValue(corpus(['Ответ']));

    const result = await requestQuestionSynthesis(questionId);

    expect(result.status).toBe('pending');
    expect(result.content).toBeUndefined();
  });
});
