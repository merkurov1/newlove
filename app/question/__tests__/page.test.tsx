import { render, screen } from '@testing-library/react';

import QuestionPage, { generateMetadata } from '../page';

jest.mock('next/cache', () => ({
  unstable_noStore: jest.fn(),
}));

const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/question/store', () => ({
  getPublicQuestion: jest.fn(),
  getQuestionPageData: jest.fn(),
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function MockLoginModal() {
      return null;
    },
}));

const serverAuth = require('@/lib/serverAuth') as { getCurrentUser: jest.Mock };
const store = require('@/lib/question/store') as {
  getPublicQuestion: jest.Mock;
  getQuestionPageData: jest.Mock;
};

const questionId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

const question = {
  id: questionId,
  text: 'В чём смысл жизни?',
};

const otherQuestion = {
  id: otherId,
  text: 'Что делает человека свободным?',
};

function pageData(activeQuestion: typeof question | null) {
  return {
    question: activeQuestion,
    synthesis: null,
    hasAnswers: false,
    isAuthenticated: false,
    hasAnswered: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getCurrentUser.mockResolvedValue(null);
  store.getPublicQuestion.mockResolvedValue({
    question: null,
    synthesis: null,
    hasAnswers: false,
  });
});

describe('Question page', () => {
  it('resolves the requested q id and shows that exact question', async () => {
    store.getQuestionPageData.mockResolvedValue(pageData(question));

    const ui = await QuestionPage({ searchParams: Promise.resolve({ q: questionId }) });
    render(ui);

    expect(store.getQuestionPageData).toHaveBeenCalledWith({
      questionId,
      userId: null,
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(question.text);
    expect(screen.queryByText(otherQuestion.text)).not.toBeInTheDocument();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('uses the first value when q is repeated', async () => {
    store.getQuestionPageData.mockResolvedValue(pageData(question));

    const ui = await QuestionPage({
      searchParams: Promise.resolve({ q: [questionId, otherId] }),
    });
    render(ui);

    expect(store.getQuestionPageData).toHaveBeenCalledWith({
      questionId,
      userId: null,
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(question.text);
  });

  it('keeps the random question when q is absent', async () => {
    store.getQuestionPageData.mockResolvedValue(pageData(question));

    const ui = await QuestionPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(store.getQuestionPageData).toHaveBeenCalledWith({
      questionId: null,
      userId: null,
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(question.text);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('does not replace a malformed q with a random question', async () => {
    await expect(
      QuestionPage({ searchParams: Promise.resolve({ q: 'not-a-question-id' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(store.getQuestionPageData).not.toHaveBeenCalled();
  });

  it('does not replace an unavailable requested question with a random one', async () => {
    store.getQuestionPageData.mockResolvedValue(pageData(null));

    await expect(
      QuestionPage({ searchParams: Promise.resolve({ q: questionId }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(store.getQuestionPageData).toHaveBeenCalledTimes(1);
    expect(store.getQuestionPageData).toHaveBeenCalledWith({
      questionId,
      userId: null,
    });
    expect(store.getQuestionPageData).not.toHaveBeenCalledWith({
      questionId: null,
      userId: null,
    });
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('builds share metadata from the awaited q id', async () => {
    store.getPublicQuestion.mockResolvedValue({
      question,
      synthesis: null,
      hasAnswers: false,
    });

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ q: questionId }),
    });

    expect(store.getPublicQuestion).toHaveBeenCalledWith(questionId);
    expect(metadata.openGraph?.title).toBe(question.text);
    expect(metadata.twitter?.title).toBe(question.text);
    expect(metadata.alternates?.canonical).toBe(
      `https://www.merkurov.love/question?q=${questionId}`
    );
  });

  it('keeps generic metadata without q and never queries a random question', async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(store.getPublicQuestion).not.toHaveBeenCalled();
    expect(metadata.openGraph?.url).toBe('https://www.merkurov.love/question');
  });

  it('keeps generic metadata for a malformed q without a random lookup', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ q: 'not-a-question-id' }),
    });

    expect(store.getPublicQuestion).not.toHaveBeenCalled();
    expect(metadata.openGraph?.url).toBe('https://www.merkurov.love/question');
  });
});
