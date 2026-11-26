import React from 'react';
import { render, screen } from '@testing-library/react';
import FlowIssueDetail from '../FlowIssueDetail';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';
import type { IssuePayload } from '@/lib/flow-issue/types';

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

  it('keeps the published headline and issue links while protecting the layout', () => {
    const { container } = render(
      <FlowIssueDetail
        issue={{
          ...current,
          htmlWeb:
            '<html><head><style>.issue-custom{color:#7A2233}</style></head><body><h1>A complete issue headline that must not be cut</h1></body></html>',
        }}
        canonical="https://www.merkurov.love/flow-issues/ru-2"
        indexHref="/flow-issues"
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'A complete issue headline that must not be cut',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Flow' })).toHaveAttribute('href', '/flow');
    expect(screen.getByRole('link', { name: 'Все выпуски' })).toHaveAttribute(
      'href',
      '/flow-issues'
    );
    expect(screen.getByRole('link', { name: 'Постоянная ссылка' })).toHaveAttribute(
      'href',
      '/letters/ru-2'
    );

    const page = container.querySelector('.flow-issue-page') as HTMLElement;
    expect(page.className).toContain('flow-issue-root');
    expect(page.textContent).toContain('.issue-custom{color:#7A2233}');
    expect(page.textContent).toContain('--font-serif');
    expect(page.textContent).not.toContain('body:has(.flow-issue-page)');
    expect(page.textContent).not.toContain('overflow-x: clip');
  });

  it('preserves a stored legacy title for an old issue re-rendered with a payload', () => {
    const legacyTitle = 'Old headline | New Scientist «| Поток - 13 ноября 2026 г.»';
    const payload: IssuePayload = {
      schemaVersion: 2,
      lang: 'ru',
      period: {
        start: '2026-11-06T00:00:00.000Z',
        end: '2026-11-13T00:00:00.000Z',
        timezone: 'UTC',
      },
      stats: {
        total: 1,
        published: 1,
        drafts: 0,
        days: 7,
        medianDelaySeconds: null,
        byType: {},
        byKind: { about_flow: 0, world: 1, other: 0 },
        own: 0,
        external: 1,
        byUtcHour: [],
        perDay: [],
        delays: [],
        quality: { langFieldMismatch: 0, photoAltEqualsFilename: 0, emptyDrafts: 0 },
      },
      lead: {
        id: 'lead',
        type: 'link',
        title: 'Old headline',
        body: '',
        url: 'https://example.com/story',
        publishedAt: '2026-11-13T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:00.000Z',
        metadata: {},
        lang: 'ru',
        kind: 'world',
        own: false,
      },
      latest: [],
      links: [],
      videos: [],
      photos: [],
      sourceIndex: [],
      templateVersion: 1,
      template: {
        theme: {
          accent: '#7A2233',
          paper: '#FAF8F5',
          ink: '#1C1A1B',
          muted: '#5B5658',
          rule: '#DAD3CC',
          maxWidth: 760,
          serifFont: "Georgia, 'Times New Roman', serif",
          sansFont: 'Inter, Arial, sans-serif',
        },
        limits: { latest: 6, links: 5, videos: 4, photos: 4 },
        sections: {
          order: ['lead', 'latest', 'links', 'videos', 'photos', 'metrics', 'sources', 'subscribe'],
          enabled: {
            lead: true,
            latest: true,
            links: true,
            videos: true,
            photos: true,
            metrics: true,
            sources: true,
            subscribe: true,
          },
        },
        labels: {
          ru: {
            masthead: 'Поток',
            lead: 'Главное',
            latest: 'Последнее',
            links: 'Читать',
            videos: 'Смотреть',
            photos: 'Кадр',
            metrics: 'Цифры',
            sources: 'Источники',
            subscribe: 'Подписка',
            subscribeCopy: '',
          },
          en: {
            masthead: 'Flow',
            lead: 'Lead',
            latest: 'Latest',
            links: 'Read',
            videos: 'Watch',
            photos: 'Frame',
            metrics: 'Numbers',
            sources: 'Sources',
            subscribe: 'Subscribe',
            subscribeCopy: '',
          },
        },
      },
      design: {
        template: 'classic',
        tokens: { accent: '#7A2233', paper: '#FAF8F5', ink: '#1C1A1B' },
      },
    };

    const { container } = render(
      <FlowIssueDetail
        issue={{
          ...current,
          title: legacyTitle,
          htmlWeb: '<html><body><h1>stored</h1></body></html>',
          payload,
        }}
        canonical="https://www.merkurov.love/flow-issues/ru-2"
        indexHref="/flow-issues"
      />
    );

    expect(container.querySelector('h1')?.textContent).toBe(legacyTitle);
  });
});
