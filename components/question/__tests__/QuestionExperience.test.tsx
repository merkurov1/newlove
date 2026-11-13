import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import QuestionExperience from '../QuestionExperience';

let mockUser: { id: string } | null = null;
let mockLoading = false;

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: mockLoading }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockLoginModal() {
    return null;
  },
}));

const question = {
  id: '11111111-1111-4111-8111-111111111111',
  text: 'В чём смысл жизни?',
};

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `слово${index + 1}`).join(' ');
}

const baseProps = {
  question,
  synthesis: null,
  hasAnswers: false,
  isAuthenticated: false,
  hasAnswered: false,
  requestedQuestionId: null,
};

beforeEach(() => {
  mockUser = null;
  mockLoading = false;
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/question');
  jest.restoreAllMocks();
});

describe('QuestionExperience', () => {
  it('shows the silent Pierrot state before the first human answer', () => {
    render(<QuestionExperience {...baseProps} />);

    expect(screen.getByText('Никто пока не ответил на этот вопрос.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'О проекте' })).toHaveAttribute(
      'href',
      '/question/about'
    );
  });

  it('requires 25 client-side words before enabling submission', () => {
    render(<QuestionExperience {...baseProps} />);

    const textarea = screen.getByRole('textbox', { name: 'Ваш ответ' });
    const button = screen.getByRole('button', { name: 'Отправить' });

    fireEvent.change(textarea, { target: { value: words(24) } });
    expect(button).toBeDisabled();

    fireEvent.change(textarea, { target: { value: words(25) } });
    expect(button).not.toBeDisabled();
  });

  it('opens the existing login flow and preserves question and draft when signed out', () => {
    render(<QuestionExperience {...baseProps} />);

    const draft = words(25);
    fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(window.localStorage.getItem('login_redirect_path')).toBe(
      `/question?q=${question.id}`
    );
    expect(window.sessionStorage.getItem(`question:draft:${question.id}`)).toBe(draft);
    expect(new URL(window.location.href).searchParams.get('q')).toBe(question.id);
  });

  it('restores a saved draft on mount', () => {
    const draft = words(26);
    window.sessionStorage.setItem(`question:draft:${question.id}`, draft);

    render(<QuestionExperience {...baseProps} />);

    expect(screen.getByRole('textbox', { name: 'Ваш ответ' })).toHaveValue(draft);
  });

  it('submits an authenticated answer and shows a private confirmation', async () => {
    mockUser = { id: '22222222-2222-4222-8222-222222222222' };

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        synthesisState: 'ready',
        synthesis: { content: '# Синтез\n\nОтвет Пьеро.' },
      }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<QuestionExperience {...baseProps} isAuthenticated />);

    const draft = words(30);
    fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => {
      expect(screen.getByText('Ответ сохранён.')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      questionId: question.id,
      content: draft,
    });
    expect(screen.getByText('Ответ Пьеро.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ваш ответ' })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(`question:draft:${question.id}`)).toBeNull();
  });

  it('keeps a previously saved synthesis visible', () => {
    render(
      <QuestionExperience
        {...baseProps}
        synthesis={{
          content: '# Старый синтез\n\nОн остаётся на месте.',
          updatedAt: null,
          version: 2,
        }}
        hasAnswers
      />
    );

    expect(screen.getByRole('heading', { name: 'Старый синтез' })).toBeInTheDocument();
  });

  it('falls back to the pending state when the first synthesis is not ready', async () => {
    mockUser = { id: '22222222-2222-4222-8222-222222222222' };

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, synthesisState: 'pending', synthesis: null }),
    })) as unknown as typeof fetch;

    render(<QuestionExperience {...baseProps} isAuthenticated />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ваш ответ' }), {
      target: { value: words(25) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await screen.findByText('Ответ Пьеро ещё не готов.');
    expect(screen.getByText('Ответ сохранён.')).toBeInTheDocument();
  });
});
