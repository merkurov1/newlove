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

const olderEnIssue: FrontIssue = {
  ...enIssue,
  id: 'en-2',
  slug: 'issue-en-old',
  number: 3,
  headline: 'An older English issue',
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

const enFlow: FlowEntry[] = [
  {
    id: 'flow-en-1',
    slug: 'flow-en-entry',
    type: 'note',
    lang: 'en',
    text: 'A recent English note',
    at: '2026-11-22T10:00:00.000Z',
  },
];

const ruFlow: FlowEntry[] = [
  {
    id: 'flow-ru-1',
    slug: 'flow-ru-entry',
    type: 'article',
    lang: 'ru',
    text: 'Свежая русская статья',
    at: '2026-11-22T10:00:00.000Z',
  },
];

function renderPage(lang: 'en' | 'ru') {
  return render(
    <FrontPage
      lang={lang}
      featured={lang === 'en' ? enIssue : ruIssue}
      flow={lang === 'en' ? enFlow : ruFlow}
      archive={lang === 'en' ? [olderEnIssue] : [olderRuIssue]}
      subscribe={<div>Subscription form</div>}
    />
  );
}

describe('Journal FrontPage localization', () => {
  it('renders a complete English editorial page with only English publications', () => {
    const { container } = renderPage('en');

    expect(screen.getByRole('heading', { level: 1, name: 'The Journal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stream' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Issue archive')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to the weekly dispatch')).toBeInTheDocument();
    expect(screen.getAllByText(/Read the issue/).length).toBeGreaterThan(0);
    expect(screen.getByText('A recent English note')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();

    expect(container.querySelector('a[href="/en/flow-issues/issue-en"]')).not.toBeNull();
    expect(container.querySelector('a[href="/en/flow-issues/issue-en-old"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru"]')).toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru-old"]')).toBeNull();

    expect(screen.getByText('The English headline')).toHaveAttribute('lang', 'en');
    expect(screen.queryByText('Русский заголовок')).not.toBeInTheDocument();
    expect(screen.queryByText('Читать выпуск')).not.toBeInTheDocument();
    expect(screen.queryByText('Архив выпусков')).not.toBeInTheDocument();
  });

  it('renders a complete Russian editorial page with only Russian publications', () => {
    const { container } = renderPage('ru');

    expect(screen.getByRole('heading', { level: 1, name: 'Журнал' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Поток' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Архив выпусков')).toBeInTheDocument();
    expect(screen.getByText('Подписка на еженедельную рассылку')).toBeInTheDocument();
    expect(screen.getAllByText(/Читать выпуск/).length).toBeGreaterThan(0);
    expect(screen.getByText('Статья')).toBeInTheDocument();
    expect(screen.getByText('Свежая русская статья')).toBeInTheDocument();

    expect(container.querySelector('a[href="/flow-issues/issue-ru"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru-old"]')).not.toBeNull();
    expect(container.querySelector('a[href="/en/flow-issues/issue-en"]')).toBeNull();
    expect(container.querySelector('a[href="/en/flow-issues/issue-en-old"]')).toBeNull();

    expect(screen.getByText('Русский заголовок')).toHaveAttribute('lang', 'ru');
    expect(screen.queryByText('The English headline')).not.toBeInTheDocument();
    expect(screen.queryByText('Read the issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Issue archive')).not.toBeInTheDocument();
  });

  it('shows a localized empty state instead of falling back to another language', () => {
    render(
      <FrontPage
        lang="en"
        featured={null}
        flow={[]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(screen.getByText('The first issue is coming soon.')).toBeInTheDocument();
    expect(screen.getByText('No recent Flow entries in this language yet.')).toBeInTheDocument();
    expect(screen.getByText('The issue archive is empty for now.')).toBeInTheDocument();
    expect(screen.queryByText('Русский заголовок')).not.toBeInTheDocument();
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
