import { render, screen } from '@testing-library/react';

import JournalPageView from '../JournalPageView';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({})),
}));

jest.mock('@/lib/journal/load', () => ({
  loadAllJournalIssues: jest.fn(async () => []),
  loadJournalIssueDetail: jest.fn(async () => null),
}));

jest.mock('@/lib/flow/items-cash', () => ({
  loadFlowItemsPage: jest.fn(),
}));

jest.mock('@/components/journal/FrontPage', () => ({
  __esModule: true,
  default: ({
    lang,
    flow,
  }: {
    lang: string;
    flow: Array<{ id: string; text: string }>;
  }) => (
    <div data-testid="front-page" data-lang={lang}>
      {flow.map((entry) => (
        <p key={entry.id}>{entry.text}</p>
      ))}
    </div>
  ),
}));

jest.mock('@/components/journal/SubscribeFormClient', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/seo/JsonLd', () => ({
  JsonLd: () => null,
}));

jest.mock('@/components/analytics/PageEvent', () => ({
  PageEvent: () => null,
}));

jest.mock('@/components/i18n/HtmlLanguage', () => ({
  __esModule: true,
  default: () => null,
}));

const { loadFlowItemsPage } = require('@/lib/flow/items-cash') as {
  loadFlowItemsPage: jest.Mock;
};

const flowItems = [
  {
    id: 'ru-1',
    slug: 'ru-1',
    type: 'note',
    lang: 'ru',
    title: 'Русская заметка',
    body_md: 'Русская заметка',
    published_at: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'en-1',
    slug: 'en-1',
    type: 'article',
    lang: 'en',
    title: 'English note',
    body_md: 'English note',
    published_at: '2026-11-19T10:00:00.000Z',
  },
];

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe.each(['ru', 'en'] as const)('JournalPageView (%s)', (lang) => {
  it('renders both language streams from the shared loader without a self-fetch', async () => {
    loadFlowItemsPage.mockResolvedValue({
      items: flowItems,
      hasMore: false,
      total: 2,
      nextOffset: 2,
    });

    render(await JournalPageView({ lang }));

    expect(loadFlowItemsPage).toHaveBeenCalledWith(50, 0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('front-page')).toHaveAttribute('data-lang', lang);
    expect(screen.getByText('Русская заметка')).toBeInTheDocument();
    expect(screen.getByText('English note')).toBeInTheDocument();
  });

  it('logs a loader failure instead of silently replacing it with an empty stream', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    loadFlowItemsPage.mockRejectedValue(new Error('db down'));

    render(await JournalPageView({ lang }));

    expect(consoleError).toHaveBeenCalledWith('[Journal] Flow:', expect.any(Error));
    expect(screen.getByTestId('front-page')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
