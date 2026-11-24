import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import FlowPage from '../page';
import Header from '@/components/Header';
import { PierrotProvider } from '@/components/pierrot/PierrotContext';
import { resetBottomButtonOwnership } from '@/lib/telegram/bottomButton';

jest.mock('next/navigation', () => ({
  usePathname: () => '/flow',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    refresh: jest.fn(),
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

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    roles: [],
    isLoading: false,
    signOut: jest.fn(),
  }),
}));

const FLOW_ITEM = {
  id: 'flow-1',
  title: 'Existing Flow entry',
  slug: 'existing-flow-entry',
  lang: 'en',
  type: 'note',
  contentType: 'note',
  status: 'published',
  visibility: 'public',
  showTitle: true,
  bodyText: 'The established Flow composition.',
};

function installBottomButton() {
  const button = {
    show: jest.fn(),
    hide: jest.fn(),
    setText: jest.fn(),
    setParams: jest.fn(),
    onClick: jest.fn(),
    offClick: jest.fn(),
  };

  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: {
      initData: 'query_id=test&user=test',
      BottomButton: button,
    },
  };

  return button;
}

function installFetch(admin: boolean) {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith('/api/flow/items')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [FLOW_ITEM], hasMore: false }),
      } as Response);
    }

    if (url === '/api/admin/items/list') {
      return Promise.resolve({
        ok: admin,
        status: admin ? 200 : 401,
        json: async () => ({}),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
}

function app() {
  return (
    <PierrotProvider>
      <Header />
      <FlowPage />
    </PierrotProvider>
  );
}

const originalFetch = global.fetch;

beforeEach(() => {
  resetBottomButtonOwnership();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetBottomButtonOwnership();
  global.fetch = originalFetch;
});

describe('Telegram Flow layout', () => {
  it('omits the Flow-specific Temple/WRITE header row while keeping the owner BottomButton working', async () => {
    const button = installBottomButton();
    installFetch(true);

    render(app());

    await waitFor(() => {
      expect(document.querySelector('header.site-header')).toBeNull();
    });

    expect(screen.queryByText('← Temple')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'WRITE' })).not.toBeInTheDocument();
    expect(await screen.findByText('Existing Flow entry')).toBeInTheDocument();

    await waitFor(() => {
      expect(button.setParams).toHaveBeenCalledWith({
        text: 'WRITE',
        is_active: true,
        is_visible: true,
      });
    });

    const onClick = button.onClick.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(onClick).toBeDefined();

    act(() => {
      onClick?.();
    });

    expect(await screen.findByRole('dialog', { name: 'New Flow post' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Post text' })).toBeInTheDocument();
  });

  it('keeps the ordinary browser Flow page and global site header unchanged', async () => {
    installFetch(false);

    render(app());

    expect(await screen.findByText('Existing Flow entry')).toBeInTheDocument();
    expect(document.querySelector('header.site-header')).not.toBeNull();
    expect(document.querySelector('.flow-page__title')?.textContent).toBe('Flow');
    expect(document.querySelector('.flow-page__subtitle')?.textContent).toBe(
      'Stream of thoughts & media'
    );
    expect(screen.queryByText('← Temple')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'WRITE' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
