import React from 'react';
import { render, screen } from '@testing-library/react';
import FlowIssueDetail from '../FlowIssueDetail';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';

function issue(id: string, lang: 'ru' | 'en', number: number): PublicFlowIssue {
  return {
    id,
    title: `Issue ${id}`,
    slug: id,
    lang,
    number,
    htmlWeb: '<html><head><style>.x{}</style></head><body><h1>Body</h1></body></html>',
    payload: null,
    publishedAt: '2026-11-20T00:00:00.000Z',
    createdAt: '2026-11-20T00:00:00.000Z',
  };
}

const current = issue('ru-2', 'ru', 2);
const previous = issue('ru-1', 'ru', 1);
const next = issue('ru-3', 'ru', 3);

describe('Flow issue Previous / Next navigation', () => {
  it('renders localized links with the correct order and rel attributes', () => {
    render(
      <FlowIssueDetail
        issue={current}
        canonical="https://www.merkurov.love/flow-issues/ru-2"
        indexHref="/flow-issues"
        previousIssue={previous}
        nextIssue={next}
      />
    );

    expect(screen.getByRole('link', { name: /Предыдущий выпуск №1/ })).toHaveAttribute(
      'href',
      '/flow-issues/ru-1'
    );
    expect(screen.getByRole('link', { name: /Предыдущий выпуск №1/ })).toHaveAttribute(
      'rel',
      'prev'
    );
    expect(screen.getByRole('link', { name: /Следующий выпуск №3/ })).toHaveAttribute(
      'href',
      '/flow-issues/ru-3'
    );
    expect(screen.getByRole('link', { name: /Следующий выпуск №3/ })).toHaveAttribute(
      'rel',
      'next'
    );
  });

  it('omits navigation when there are no adjacent issues', () => {
    render(
      <FlowIssueDetail
        issue={current}
        canonical="https://www.merkurov.love/flow-issues/ru-2"
        indexHref="/flow-issues"
      />
    );

    expect(screen.queryByRole('navigation', { name: 'Навигация по выпускам' })).toBeNull();
  });
});
