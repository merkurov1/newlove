import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import TempleClient from '../TempleClient';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';

jest.mock('next/navigation', () => ({
  usePathname: () => '/temple',
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

jest.mock('next/image', () => {
  return function MockImage({
    alt,
    src,
    fill,
    priority,
    sizes,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
  }) {
    void fill;
    void priority;
    void sizes;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} {...props} />;
  };
});

jest.mock('@/components/useIsTelegram', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('@/hooks/useVigilSupporters', () => ({
  useVigilSupporters: () => ({
    supporterCount: 12,
    lastLitAt: new Date().toISOString(),
    flameLit: true,
    windowStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    error: null,
    refresh: jest.fn(async () => undefined),
  }),
}));

jest.mock('@/lib/tributes/analytics', () => ({
  trackTributeSupportView: jest.fn(),
  trackTributeAmountSelected: jest.fn(),
  trackTributeCheckoutCreated: jest.fn(),
  trackTributeCheckoutReturned: jest.fn(),
  trackTributePaymentAbandoned: jest.fn(),
  trackTributePaymentConfirmed: jest.fn(),
  trackTributePaymentFailed: jest.fn(),
  markTributeConfirmedOnce: jest.fn(() => false),
}));

jest.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: jest.fn(),
  }),
  supabase: {
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: jest.fn(),
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: {
      get: () => 'application/json',
    },
  } as unknown as Response;
}

const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
  const url = String(input);

  if (url.includes('/api/tribute/summary')) {
    return jsonResponse({ total: 0 });
  }

  if (url.includes('/api/tribute/checkout')) {
    return jsonResponse({ error: 'checkout blocked in test' }, 500);
  }

  return jsonResponse({});
});

function checkoutCalls() {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).includes('/api/tribute/checkout')
  );
}

beforeEach(() => {
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.sessionStorage.clear();
});

describe('Temple home composition', () => {
  it('renders the supplied triptych with the exact owner URLs', () => {
    render(<TempleClient />);

    expect(screen.getByTestId('temple-heart')).toHaveAttribute(
      'src',
      TEMPLE_HOME_ASSETS.heart
    );
    expect(screen.getByTestId('temple-left-panel')).toHaveAttribute(
      'src',
      TEMPLE_HOME_ASSETS.left
    );
    expect(screen.getByTestId('temple-right-panel')).toHaveAttribute(
      'src',
      TEMPLE_HOME_ASSETS.right
    );
    expect(screen.getByAltText('Stained-glass Angel')).toBeInTheDocument();
    expect(screen.getByAltText('Stained-glass Demon')).toBeInTheDocument();
    expect(screen.getByAltText('Shared Temple heart')).toBeInTheDocument();
  });

  it('renders the live supporter count on the heart', () => {
    render(<TempleClient />);

    expect(screen.getByTestId('temple-heart')).toBeInTheDocument();
    expect(screen.getByText(/12 supporters/)).toBeInTheDocument();
  });

  it('keeps Vigil and Tribute out of the rituals menu', () => {
    render(<TempleClient />);

    const rituals = screen
      .getByRole('heading', { name: 'Rituals' })
      .closest('section') as HTMLElement;

    expect(within(rituals).getByRole('link', { name: 'Calm' })).toHaveAttribute(
      'href',
      '/heartandangel/calm'
    );
    expect(
      within(rituals).getByRole('link', { name: 'Let It Go' })
    ).toHaveAttribute('href', '/heartandangel/letitgo');
    expect(
      within(rituals).getByRole('link', { name: 'Absolution' })
    ).toHaveAttribute('href', '/absolution');
    expect(within(rituals).getByRole('link', { name: 'Cast' })).toHaveAttribute(
      'href',
      '/cast'
    );

    expect(within(rituals).queryByRole('link', { name: 'Vigil' })).toBeNull();
    expect(within(rituals).queryByRole('link', { name: 'Tribute' })).toBeNull();
  });

  it('opens the Tribute journey in place without navigating to /tribute or charging', async () => {
    render(<TempleClient />);

    expect(
      screen.queryByRole('link', { name: /support the temple/i })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: /support the temple/i })
    );

    const dialog = await screen.findByRole('dialog', { name: 'Tribute' });

    expect(dialog).toHaveTextContent('Offer $20 for the Temple');
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Tribute' })).toBeNull();
    expect(checkoutCalls()).toHaveLength(0);
  });

  it('keeps amount selection explicit before checkout can start', async () => {
    render(<TempleClient />);

    fireEvent.click(screen.getByRole('button', { name: '$5' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tribute' });

    expect(dialog).toHaveTextContent('Offer $5 for the Temple');
    expect(checkoutCalls()).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Offer $5 for the Temple',
      })
    );

    await waitFor(() => {
      expect(checkoutCalls()).toHaveLength(1);
    });
  });
});
