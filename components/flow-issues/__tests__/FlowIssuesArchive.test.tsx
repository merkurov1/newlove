import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FlowIssuesArchive from '../FlowIssuesArchive';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';

function issue(
  id: string,
  lang: 'ru' | 'en',
  number: number,
  publishedAt: string
): PublicFlowIssue {
  return {
    id,
    title: `Issue ${id}`,
    slug: id,
    lang,
    number,
    htmlWeb: '<html><body></body></html>',
    payload: null,
    publishedAt,
    createdAt: publishedAt,
  };
}

const issues = [
  issue('ru-2026', 'ru', 2, '2026-11-21T00:00:00.000Z'),
  issue('en-2026', 'en', 2, '2026-11-20T00:00:00.000Z'),
  issue('ru-2025', 'ru', 1, '2025-11-21T00:00:00.000Z'),
];

function renderArchive(lang: 'ru' | 'en') {
  return render(
    <FlowIssuesArchive
      issues={issues}
      lang={lang}
      hrefFor={(item) => `/${item.lang === 'ru' ? 'flow-issues' : 'en/flow-issues'}/${item.slug}`}
      alternateHref={lang === 'ru' ? '/en/flow-issues' : '/flow-issues'}
      alternateLabel={lang === 'ru' ? 'English' : 'Русский'}
    />
  );
}

describe('Flow issue archive filters', () => {
  it('starts with every language and year in the catalogue', () => {
    const { container } = renderArchive('en');

    expect(container.querySelectorAll('ol li')).toHaveLength(3);
    expect(screen.getByText('All years')).toBeInTheDocument();
    expect(screen.getByText('All languages')).toBeInTheDocument();
  });

  it('filters by language and year without losing the other subset', () => {
    const { container } = renderArchive('en');

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ru' } });

    expect(container.querySelectorAll('ol li')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2026' } });

    expect(container.querySelectorAll('ol li')).toHaveLength(1);
    expect(container.querySelector('a[href="/flow-issues/ru-2026"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(container.querySelectorAll('ol li')).toHaveLength(3);
  });

  it('uses Russian filter labels on the Russian archive', () => {
    renderArchive('ru');

    expect(screen.getByLabelText('Язык')).toBeInTheDocument();
    expect(screen.getByText('Все годы')).toBeInTheDocument();
  });

  it('paginates the complete catalogue and never drops filtered rows', () => {
    const many = Array.from({ length: 23 }, (_, index) =>
      issue(
        `issue-${index}`,
        index % 2 === 0 ? 'ru' : 'en',
        index + 1,
        new Date(Date.UTC(2026, 10, 21 - index)).toISOString()
      )
    );

    const { container } = render(
      <FlowIssuesArchive
        issues={many}
        lang="en"
        hrefFor={(item) => `/en/flow-issues/${item.slug}`}
        alternateHref="/flow-issues"
        alternateLabel="Русский"
      />
    );

    expect(container.querySelectorAll('ol li')).toHaveLength(10);
    expect(screen.getByText(/Page 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–10 \/ 23/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(container.querySelectorAll('ol li')).toHaveLength(10);
    expect(screen.getByText(/Page 2 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 11–20 \/ 23/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(container.querySelectorAll('ol li')).toHaveLength(3);
    expect(screen.getByText(/Page 3 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 21–23 \/ 23/)).toBeInTheDocument();

    // Filtering the whole catalogue returns to page one and keeps every
    // matching issue available through the same pagination.
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ru' } });

    expect(screen.getByText(/Page 1 \/ 2/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–10 \/ 12/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(screen.getByText(/Showing 11–12 \/ 12/)).toBeInTheDocument();
  });
});
