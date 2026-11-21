import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  publishedAt: '2025-10-10T10:00:00.000Z',
  periodStart: '2025-10-04',
  periodEnd: '2025-10-10',
};

const ruIssue: FrontIssue = {
  id: 'ru-1',
  slug: 'issue-ru',
  lang: 'ru',
  number: 4,
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
  number: 2,
  headline: 'Старый русский выпуск',
  publishedAt: '2024-09-10T10:00:00.000Z',
  periodStart: '2024-09-04',
  periodEnd: '2024-09-10',
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
      featured={ruIssue}
      flow={[enFlow[0], ruFlow[0]]}
      archive={[enIssue, olderEnIssue, olderRuIssue]}
      subscribe={<div>Subscription form</div>}
    />
  );
}

describe('Journal FrontPage localization', () => {
  it('shows the same globally latest issue on the English and Russian pages', () => {
    const { unmount } = renderPage('en');

    expect(screen.getByRole('heading', { level: 1, name: 'The Journal' })).toBeInTheDocument();
    expect(screen.getByText('Русский заголовок')).toHaveAttribute('lang', 'ru');
    expect(screen.getByText('Current issue')).toBeInTheDocument();

    unmount();

    renderPage('ru');

    expect(screen.getByRole('heading', { level: 1, name: 'Журнал' })).toBeInTheDocument();
    expect(screen.getByText('Русский заголовок')).toHaveAttribute('lang', 'ru');
    expect(screen.getByText('Текущий выпуск')).toBeInTheDocument();
  });

  it('renders complete chrome in the interface language', () => {
    const en = renderPage('en');

    expect(screen.getByRole('link', { name: 'Stream' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Issue archive')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to the weekly dispatch')).toBeInTheDocument();
    expect(screen.getByText('A recent English note')).toBeInTheDocument();
    expect(screen.getByText('Свежая русская статья')).toBeInTheDocument();
    expect(screen.getByText(/Note · In English/)).toBeInTheDocument();
    expect(screen.getByText(/Article · In Russian/)).toBeInTheDocument();

    en.unmount();

    renderPage('ru');

    expect(screen.getByRole('link', { name: 'Поток' })).toHaveAttribute('href', '#stream');
    expect(screen.getByText('Архив выпусков')).toBeInTheDocument();
    expect(screen.getByText('Подписка на еженедельную рассылку')).toBeInTheDocument();
  });

  it('links to the same issue in the other language when the pair exists', () => {
    renderPage('en');

    expect(
      screen.getByRole('link', { name: 'Other language edition: In English' })
    ).toHaveAttribute('href', '/en/flow-issues/issue-en');
  });

  it('does not render a language link when the issue has no counterpart', () => {
    render(
      <FrontPage
        lang="en"
        featured={{ ...enIssue, number: 9 }}
        flow={[]}
        archive={[olderEnIssue, olderRuIssue]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(
      screen.queryByRole('link', { name: /Other language edition/ })
    ).not.toBeInTheDocument();
  });

  it('shows the full multilingual archive while keeping each material language', () => {
    const { container } = render(
      <FrontPage
        lang="en"
        featured={ruIssue}
        flow={[enFlow[0], ruFlow[0]]}
        archive={[enIssue, olderEnIssue, olderRuIssue]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(container.querySelector('a[href="/en/flow-issues/issue-en"]')).not.toBeNull();
    expect(container.querySelector('a[href="/en/flow-issues/issue-en-old"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru-old"]')).not.toBeNull();

    expect(screen.getByText('The English headline')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Старый русский выпуск')).toHaveAttribute('lang', 'ru');
    expect(screen.getAllByText('In Russian').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In English').length).toBeGreaterThan(0);
  });

  it('filters the archive by year and language without losing the full catalogue', () => {
    const { container } = render(
      <FrontPage
        lang="en"
        featured={ruIssue}
        flow={[]}
        archive={[enIssue, olderEnIssue, olderRuIssue]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(container.querySelectorAll('#archive ul li')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ru' } });

    expect(container.querySelectorAll('#archive ul li')).toHaveLength(1);
    expect(container.querySelector('#archive a[href="/flow-issues/issue-ru-old"]')).not.toBeNull();
    expect(container.querySelector('#archive a[href="/en/flow-issues/issue-en"]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } });

    expect(screen.getByText('No issues match these filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(container.querySelectorAll('#archive ul li')).toHaveLength(3);
  });

  it('shows materials in their original language in the stream', () => {
    render(
      <FrontPage
        lang="en"
        featured={enIssue}
        flow={[enFlow[0], ruFlow[0]]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(screen.getByText('A recent English note')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Свежая русская статья')).toHaveAttribute('lang', 'ru');
    expect(screen.getAllByText(/In Russian/).length).toBeGreaterThan(0);
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
    expect(screen.getByText('No recent Flow entries yet.')).toBeInTheDocument();
    expect(screen.getByText('The issue archive is empty for now.')).toBeInTheDocument();
  });

  it('offers the correct journal language switch targets on both versions', () => {
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
