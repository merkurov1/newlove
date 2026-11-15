/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../store', () => ({
  getQuestionServiceClient: jest.fn(),
}));

const store = require('../store') as { getQuestionServiceClient: jest.Mock };
const { getQuestionDashboardRows } = require('../dashboard') as typeof import('../dashboard');

const questionId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Question dashboard aggregates', () => {
  it('maps counts and synthesis state without copying answer text', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          question_id: questionId,
          question: 'В чём смысл жизни?',
          status: 'active',
          answer_count: 7,
          first_answer_at: '2026-11-01T10:00:00.000Z',
          last_answer_at: '2026-11-15T09:00:00.000Z',
          synthesis_status: 'idle',
          synthesis_version: 2,
          synthesis_answer_count: 7,
          synthesis_updated_at: '2026-11-15T09:01:00.000Z',
          synthesis_last_error: null,
          answer_text: 'private answer that must never be returned',
          user_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
      error: null,
    }));

    store.getQuestionServiceClient.mockReturnValue({ rpc });

    const rows = await getQuestionDashboardRows();

    expect(rpc).toHaveBeenCalledWith('question_dashboard_stats');
    expect(rows).toEqual([
      {
        id: questionId,
        text: 'В чём смысл жизни?',
        status: 'active',
        answerCount: 7,
        firstAnswerAt: '2026-11-01T10:00:00.000Z',
        lastAnswerAt: '2026-11-15T09:00:00.000Z',
        synthesis: {
          status: 'idle',
          version: 2,
          answerCount: 7,
          updatedAt: '2026-11-15T09:01:00.000Z',
          lastError: null,
        },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('private answer');
    expect(JSON.stringify(rows)).not.toContain('22222222');
  });

  it('returns an empty dashboard when the aggregate lookup fails', async () => {
    store.getQuestionServiceClient.mockReturnValue({
      rpc: jest.fn(async () => ({ data: null, error: { code: 'XX000' } })),
    });

    await expect(getQuestionDashboardRows()).resolves.toEqual([]);
  });
});
