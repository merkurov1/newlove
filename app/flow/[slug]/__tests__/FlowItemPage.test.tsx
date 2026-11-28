import React from 'react';
import { render, screen } from '@testing-library/react';

import FlowItemPage from '../page';
import { getCachedFlowItem, getCachedFlowNeighbors } from '@/lib/flow/items-cash';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('not found');
  }),
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

// react-markdown ships ESM only. The reader composition, not the renderer, is
// under test here; the Playwright reader spec exercises real Markdown.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock('@/lib/flow/items-cash', () => ({
  getCachedFlowItem: jest.fn(),
  getCachedFlowNeighbors: jest.fn(),
}));

jest.mock('@/components/flow/FlowReaderShell', () => ({
  __esModule: true,
  default: () => <div data-reader-shell />,
}));

jest.mock('@/components/flow/FlowShare', () => ({
  __esModule: true,
  default: () => <div className="flow-share" data-flow-share />,
}));

jest.mock('@/components/flow/FlowHomeScreenPrompt', () => ({
  __esModule: true,
  default: ({ className }: { className?: string }) => (
    <div className={className} data-home-screen />
  ),
}));

const BASE_ITEM = {
  id: 'flow-item-1',
  title: 'A measured publication',
  slug: 'a-measured-publication',
  lang: 'en',
  type: 'note',
  status: 'published',
  visibility: 'public',
  body_md: 'The publication body.',
  metadata: {},
  published_at: '2026-11-24T12:00:00.000Z',
  created_at: '2026-11-24T12:00:00.000Z',
  updated_at: '2026-11-24T12:00:00.000Z',
  bluesky_uri: null,
  telegram_message_id: null,
};

const READY_CONTEXT = {
  id: 'context-1',
  item_id: 'flow-item-1',
  content: '[EN] A quiet editorial note.\n\n[RU] Тихая редакционная заметка.',
  model: 'test',
  provider: 'test',
  status: 'ready',
  generated_at: '2026-11-24T12:00:00.000Z',
};

const mockedGetCachedFlowItem = getCachedFlowItem as jest.MockedFunction<typeof getCachedFlowItem>;
const mockedGetCachedFlowNeighbors = getCachedFlowNeighbors as jest.MockedFunction<
  typeof getCachedFlowNeighbors
>;

function bundle(overrides: Record<string, unknown> = {}, aiContext: unknown = READY_CONTEXT) {
  return {
    item: { ...BASE_ITEM, ...overrides },
    media: [],
    aiContext,
  } as Awaited<ReturnType<typeof getCachedFlowItem>>;
}

async function renderPage(
  overrides: Record<string, unknown> = {},
  aiContext: unknown = READY_CONTEXT
) {
  mockedGetCachedFlowItem.mockResolvedValue(bundle(overrides, aiContext));
  mockedGetCachedFlowNeighbors.mockResolvedValue({
    newer: {
      id: 'newer',
      title: 'Newer publication',
      slug: 'newer-publication',
      publishedAt: '2026-11-25T12:00:00.000Z',
    },
    older: {
      id: 'older',
      title: 'Older publication',
      slug: 'older-publication',
      publishedAt: '2026-11-20T12:00:00.000Z',
    },
  });

  const element = await FlowItemPage({
    params: Promise.resolve({ slug: 'a-measured-publication' }),
  });

  return render(element);
}

function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Flow item reader composition', () => {
  it('orders content, Pierrot, share and reader navigation without duplicates', async () => {
    const { container } = await renderPage();

    const article = container.querySelector('article.flow-item');
    const hero = article?.querySelector('.flow-item__hero');
    const pierrot = article?.querySelector('[data-flow-pierrot]');
    const footer = article?.querySelector('.flow-reader__footer');
    const share = article?.querySelector('.flow-reader__share');
    const sources = article?.querySelector('.flow-reader__sources');
    const pager = article?.querySelector('.flow-reader__pager');

    expect(article).not.toBeNull();
    expect(hero).not.toBeNull();
    expect(pierrot).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(share).not.toBeNull();
    expect(sources).not.toBeNull();
    expect(pager).not.toBeNull();

    expect(isBefore(hero as Element, pierrot as Element)).toBe(true);
    expect(isBefore(pierrot as Element, share as Element)).toBe(true);
    expect(isBefore(share as Element, sources as Element)).toBe(true);
    expect(isBefore(sources as Element, pager as Element)).toBe(true);

    // Share is the first footer utility, ahead of Older/Newer navigation.
    expect(footer?.firstElementChild).toBe(share);
    expect(footer?.contains(pierrot as Element)).toBe(false);

    expect(container.querySelectorAll('.flow-reader__share')).toHaveLength(1);
    expect(container.querySelectorAll('[data-flow-pierrot]')).toHaveLength(1);
    expect(screen.getByText('Pierrot')).toBeInTheDocument();
  });

  it('shows a leading Markdown heading once as the page title and removes it from the body', async () => {
    const { container } = await renderPage({
      title: 'Heart & Angel > World > Temple',
      body_md: '## Heart & Angel > World > Temple\n\nФотография храма.',
      metadata: {
        title_source: 'body',
        generated_title: 'Heart & Angel > World > Temple',
      },
    });

    const hero = container.querySelector('.flow-item__hero');
    const heading = hero?.querySelector('h1');
    const body = hero?.querySelector('.flow-item__body');

    expect(heading).toHaveTextContent('Heart & Angel > World > Temple');
    expect(body).toHaveTextContent('Фотография храма.');
    expect(body).not.toHaveTextContent('Heart & Angel > World > Temple');
  });

  it('omits the Pierrot block when there is no ready context', async () => {
    const { container } = await renderPage({}, null);

    expect(container.querySelector('[data-flow-pierrot]')).toBeNull();
    expect(container.querySelector('.flow-reader__share')).not.toBeNull();
  });

  it('omits the Pierrot block for photo items while keeping the footer', async () => {
    const { container } = await renderPage({ type: 'photo', body_md: '' });

    expect(container.querySelector('[data-flow-pierrot]')).toBeNull();
    expect(container.querySelector('.flow-reader__share')).not.toBeNull();
    expect(container.querySelector('.flow-reader__pager')).not.toBeNull();
  });
});
