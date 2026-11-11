import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/components/pierrot/PierrotContext', () => ({
  usePierrot: () => ({ closeConversation: jest.fn() }),
  usePierrotOptional: () => null,
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MockDynamicChart() {
    return <div data-testid="mock-chart" />;
  },
}));

import PierrotResponseRenderer from '@/components/pierrot/response/PierrotResponseRenderer';
import { PIERROT_RESPONSE_VERSION, type PierrotResponse } from '@/lib/pierrot/response/types';

function response(blocks: PierrotResponse['blocks']): PierrotResponse {
  return { version: PIERROT_RESPONSE_VERSION, language: 'ru', blocks };
}

describe('Pierrot structured response renderer', () => {
  it('keeps a simple answer as clean text', () => {
    render(
      <PierrotResponseRenderer
        response={response([{ type: 'text', markdown: 'Короткий ответ.' }])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('Короткий ответ.')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-chart')).not.toBeInTheDocument();
  });

  it('renders metrics without inventing a comparison', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'metric',
            title: 'Bluesky',
            metrics: [
              {
                label: 'Подписчики',
                value: 33,
                unit: 'count',
                source: 'Bluesky',
                confidence: 'measured',
              },
              {
                label: 'Взаимодействия',
                value: 120,
                unit: 'count',
                source: 'Bluesky',
                confidence: 'calculated',
              },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getAllByText('расчётно').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('renders charts through the lazy component', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'chart',
            chart: 'bar',
            title: 'Просмотры страниц',
            data: [
              { page: '/flow', views: 120 },
              { page: '/', views: 500 },
            ],
            xKey: 'page',
            series: [{ key: 'views', label: 'Views' }],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('Просмотры страниц')).toBeInTheDocument();
    expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
  });

  it('renders a responsive table with numeric alignment', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'table',
            title: 'Публикации',
            columns: [
              { key: 'outlet', label: 'Издание' },
              { key: 'count', label: 'Материалы', align: 'right', format: 'number' },
            ],
            rows: [
              { outlet: 'Le Monde', count: 12 },
              { outlet: 'Meduza', count: 7 },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Le Monde')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders an evidence-based timeline with source links', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'timeline',
            title: 'Хронология',
            events: [
              {
                date: '2026-11-01',
                title: 'Выпуск №24',
                description: 'Редакционный выпуск.',
                category: 'Journal',
                source: '/letters/issue-24',
                url: '/letters/issue-24',
              },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('Выпуск №24')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/letters/issue-24' })).toHaveAttribute(
      'href',
      '/letters/issue-24'
    );
  });

  it('renders a diagram and keeps direct links distinct from inference', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'diagram',
            diagram: 'relationship',
            title: 'Найденные связи',
            nodes: [
              { id: 'a', label: 'Digital Temple' },
              { id: 'b', label: 'UNFRAMED' },
            ],
            edges: [
              { from: 'a', to: 'b', label: 'part of', kind: 'direct' },
              { from: 'b', to: 'a', label: 'related to', kind: 'inference' },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByRole('img', { name: 'Найденные связи' })).toBeInTheDocument();
    expect(screen.getByText('Digital Temple')).toBeInTheDocument();
    expect(screen.getByText('related to')).toBeInTheDocument();
  });

  it('renders comparisons as editorial columns, not a universal table', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'comparison',
            title: 'Две стратегии',
            columns: [
              { id: 'a', title: 'Осторожная' },
              { id: 'b', title: 'Быстрая' },
            ],
            rows: [
              { label: 'Срок', values: { a: '6 месяцев', b: '3 месяца' } },
              { label: 'Риск', values: { a: 'низкий', b: 'средний' } },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('Осторожная')).toBeInTheDocument();
    expect(screen.getByText('Быстрая')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a quotation with attribution', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'quote',
            text: 'Structure is the antidote to chaos.',
            attribution: 'Pierrot',
            source: 'merkurov.love',
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('Structure is the antidote to chaos.')).toBeInTheDocument();
    expect(screen.getByText(/Pierrot/)).toBeInTheDocument();
  });

  it('shows only verified gallery images with a source', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'gallery',
            layout: 'grid',
            images: [
              {
                src: '/images/verified-work.jpg',
                alt: 'Проверенная работа',
                caption: 'Работа из архива.',
                source: 'Архив merkurov.love',
              },
              {
                src: 'https://tracking.example/pixel.jpg',
                alt: 'Не должно отрендериться',
                source: 'unknown',
              },
            ],
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByAltText('Проверенная работа')).toBeInTheDocument();
    expect(screen.queryByAltText('Не должно отрендериться')).not.toBeInTheDocument();
  });

  it('renders a code block with a language label and copy control', () => {
    render(
      <PierrotResponseRenderer
        response={response([
          {
            type: 'code',
            code: 'const answer = 42;',
            language: 'javascript',
            filename: 'answer.js',
          },
        ])}
        fallbackMarkdown="fallback"
      />
    );

    expect(screen.getByText('answer.js')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
    expect(screen.getByText('const answer = 42;')).toBeInTheDocument();
  });

  it('falls back to Markdown when the structured payload is invalid', () => {
    render(
      <PierrotResponseRenderer
        response={
          {
            version: PIERROT_RESPONSE_VERSION,
            language: 'ru',
            blocks: [{ type: 'chart', data: [], xKey: 'x', series: [] }],
          } as unknown as PierrotResponse
        }
        fallbackMarkdown="Безопасный Markdown fallback"
      />
    );

    expect(screen.getByText('Безопасный Markdown fallback')).toBeInTheDocument();
  });

  it('keeps an old Markdown-only answer unchanged', () => {
    render(
      <PierrotResponseRenderer
        response={response([]) as unknown as PierrotResponse}
        fallbackMarkdown="**Old answer** stays visible."
      />
    );

    expect(screen.getByText('Old answer')).toBeInTheDocument();
  });
});
