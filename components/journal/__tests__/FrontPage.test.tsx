import React from 'react';
import { render, screen } from '@testing-library/react';
import FrontPage, { type FlowEntry, type FrontIssue } from '../FrontPage';

const enIssue: FrontIssue = {
  id: 'en-1',
  slug: 'issue-en',
  lang: 'en',
  number: 4,
  headline: 'The English headline',
  excerpt: 'English excerpt.',
  summary: 'Notes 3, Links 1',
  published: 4,
  publishedAt: '2026-11-20T10:00:00.000Z',
  periodStart: '2026-11-14',
  periodEnd: '2026-11-20',
};

const ruIssue: FrontIssue = {
  id: 'ru-1',
  slug: 'issue-ru',
  lang: 'ru',
  number: 5,
  headline: 'Русский заголовок',
  excerpt: 'Русский фрагмент.',
  summary: 'Заметки 2',
  published: 2,
  publishedAt: '2026-11-21T10:00:00.000Z',
  periodStart: '2026-11-15',
  periodEnd: '2026-11-21',
};

const olderRuIssue: FrontIssue = {
  ...ruIssue,
  id: 'ru-2',
  slug: 'issue-ru-old',
  number: 3,
  headline: 'Старый русский выпуск',
};

const flow: FlowEntry[] = [
  {
    id: 'flow-1',
    slug: 'flow-entry',
    type: 'note',
    lang: 'en',
    text: 'A recent English note',
    at: '2026-11-22T10:00:00.000Z',
  },
];

function renderPage(lang: 'en' | 'ru') {
  return render(
    <FrontPage
      lang={lang}
      featured={lang === 'en' ? enIssue : ruIssue}
      other={lang === 'en' ? ruIssue : enIssue}
      flow={flow}
      archive={[olderRuIssue]}
      subscribe={<div>Subscription form</div>}
    />
  );
}

describe('Journal FrontPage localization', () => {
  it('renders a complete English editorial page and links English issues to /en/flow-issues', () => {
    const { container } = renderPage('en');

    expect(screen.getByRole('heading', { level: 1, name: 'The Journal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stream' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Issue archive')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to the weekly dispatch')).toBeInTheDocument();
    expect(screen.getAllByText(/Read the issue/).length).toBeGreaterThan(0);
    expect(screen.getByText('A recent English note')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();

    expect(container.querySelector('a[href="/en/flow-issues/issue-en"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru-old"]')).not.toBeNull();

    // Original issue titles are preserved, but interface copy is English only.
    expect(screen.getByText('Русский заголовок')).toHaveAttribute('lang', 'ru');
    expect(screen.queryByText('Читать выпуск')).not.toBeInTheDocument();
    expect(screen.queryByText('Архив выпусков')).not.toBeInTheDocument();
  });

  it('renders a complete Russian editorial page without English interface labels', () => {
    const { container } = renderPage('ru');

    expect(screen.getByRole('heading', { level: 1, name: 'Журнал' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Поток' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Архив выпусков')).toBeInTheDocument();
    expect(screen.getByText('Подписка на еженедельную рассылку')).toBeInTheDocument();
    expect(screen.getAllByText(/Читать выпуск/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Заметка/)).toBeInTheDocument();
    expect(screen.getByText(/Заметка · EN/)).toBeInTheDocument();

    expect(container.querySelector('a[href="/en/flow-issues/issue-en"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru"]')).not.toBeNull();

    expect(screen.getByText('The English headline')).toHaveAttribute('lang', 'en');
    expect(screen.queryByText('Read the issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Issue archive')).not.toBeInTheDocument();
  });

  it('localizes article labels and marks entries from the other language', () => {
    render(
      <FrontPage
        lang="ru"
        featured={ruIssue}
        other={enIssue}
        flow={[{ ...flow[0], type: 'article', text: 'An English article' }]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(screen.getByText('Статья · EN')).toBeInTheDocument();
    expect(screen.getByText('An English article')).toHaveAttribute('lang', 'en');
  });

  it('offers the correct language switch targets on both versions', () => {
    const { unmount } = renderPage('en');
    expect(screen.getByRole('link', { name: 'English (EN)' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Russian (RU)' })).toHaveAttribute(
      'href',
      '/ru/journal'
    );
    unmount();

    renderPage('ru');
    expect(screen.getByRole('link', { name: 'English (EN)' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Russian (RU)' })).toHaveAttribute(
      'href',
      '/ru/journal'
    );
  });
});
