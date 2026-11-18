import React from 'react';
import { render, screen } from '@testing-library/react';

import QuestionDashboardPage from '../page';

jest.mock('next/cache', () => ({
  unstable_noStore: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/question/dashboard', () => ({
  getQuestionDashboardRows: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as { getCurrentUser: jest.Mock };
const dashboard = require('@/lib/question/dashboard') as {
  getQuestionDashboardRows: jest.Mock;
};

const questionId = '11111111-1111-4111-8111-111111111111';
const archivedId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getCurrentUser.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  dashboard.getQuestionDashboardRows.mockResolvedValue([
    {
      id: questionId,
      text: 'В чём смысл жизни?',
      status: 'active',
      answerCount: 3,
      firstAnswerAt: null,
      lastAnswerAt: null,
      synthesis: {
        status: 'idle',
        version: 1,
        answerCount: 3,
        updatedAt: null,
        lastError: null,
      },
    },
    {
      id: archivedId,
      text: 'Архивный вопрос',
      status: 'archived',
      answerCount: 0,
      firstAnswerAt: null,
      lastAnswerAt: null,
      synthesis: {
        status: 'missing',
        version: 0,
        answerCount: 0,
        updatedAt: null,
        lastError: null,
      },
    },
  ]);
});

describe('Question dashboard links', () => {
  it('links an active question by its question id', async () => {
    render(await QuestionDashboardPage());

    const links = screen.getAllByRole('link', { name: 'В чём смысл жизни?' });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', `/question?q=${questionId}`);
    }
  });

  it('does not link an archived question to the random question page', async () => {
    render(await QuestionDashboardPage());

    expect(screen.queryByRole('link', { name: 'Архивный вопрос' })).not.toBeInTheDocument();
    expect(screen.getByText('Архивный вопрос')).toBeInTheDocument();
  });
});
