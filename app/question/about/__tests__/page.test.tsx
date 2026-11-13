import React from 'react';
import { render, screen } from '@testing-library/react';

import QuestionAboutPage from '../page';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('Question about page', () => {
  it('explains the project in Russian and returns to the question', () => {
    render(<QuestionAboutPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'О проекте' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К вопросу' })).toHaveAttribute(
      'href',
      '/question'
    );

    for (const heading of [
      'Почему человеческие ответы',
      'Как появляется ответ Пьеро',
      'Почему ответы остаются приватными',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }

    expect(screen.getByText(/модель не вызывается/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sign in|Read more|Learn more/i)).not.toBeInTheDocument();
  });
});
