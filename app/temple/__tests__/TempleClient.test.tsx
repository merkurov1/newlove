import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import TempleClient from '../TempleClient';

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

function trace(index: number, eventType: string) {
  const createdAt = new Date(
    Date.parse('2026-11-24T12:00:00.000Z') - index * 60_000
  ).toISOString();

  return {
    id: `trace-${index}`,
    event_type: eventType.toLowerCase(),
    canonical_type: eventType,
    category: 'ritual',
    author: index === 0 ? 'Alice' : 'Pilgrim',
    message: `${eventType} trace ${index}`,
    created_at: createdAt,
    audio_url: null,
  };
}

function feedPayload() {
  return {
    ok: true,
    data: [
      trace(0, 'ASH'),
      trace(1, 'VIGIL_SPARK'),
      trace(2, 'CAST'),
      trace(3, 'ABSOLUTION'),
      trace(4, 'TRIBUTE'),
      trace(5, 'MEDITATION'),
      trace(6, 'WHISPER'),
    ],
    stats: {
      completedRituals: 42,
      namedAuthors: 3,
      vigilSparks: 9,
      byType: {
        ASH: 7,
        VIGIL_SPARK: 9,
        CAST: 6,
        ABSOLUTION: 5,
        TRIBUTE: 4,
        MEDITATION: 6,
        WHISPER: 5,
      },
      windowDays: 30,
      windowStart: '2026-10-25T12:00:00.000Z',
      windowEnd: '2026-11-24T12:00:00.000Z',
      excluded: { infrastructure: 11, incomplete: 4 },
      truncated: false,
    },
    meta: {
      generatedAt: '2026-11-24T12:00:00.000Z',
      cachedAt: '2026-11-24T12:00:00.000Z',
      ttlSeconds: 60,
      traceLimit: 7,
      windowDays: 30,
      stale: false,
      cache: 'miss',
      truncated: false,
      definitions: {},
    },
    error: null,
  };
}

const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
  const url = String(input);

  if (url.includes('/api/temple_logs')) {
    return jsonResponse(feedPayload());
  }

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
  window.localStorage.clear();
});

describe('Temple home composition', () => {
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

  it('renders only the seven server-filtered ritual traces', async () => {
    render(<TempleClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Traces' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Sanctuary Traces',
    });

    await waitFor(() => {
      expect(within(dialog).getByText('ASH trace 0')).toBeInTheDocument();
    });

    expect(within(dialog).getAllByText(/\w+ trace \d/)).toHaveLength(7);
    expect(within(dialog).getByText('Alice')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/entry, navigation and incomplete events excluded/i)
    ).toBeInTheDocument();
  });

  it('shows full-window Chronicles definitions instead of latest-ten sample metrics', async () => {
    render(<TempleClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Chronicles' }));

    const dialog = await screen.findByRole('dialog', { name: 'Chronicles' });

    expect(within(dialog).getByText('Named Authors')).toBeInTheDocument();
    expect(within(dialog).getByText('Completed Rituals')).toBeInTheDocument();
    expect(within(dialog).getByText('Vigil Sparks')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByText('42')).toBeInTheDocument();
    });
    expect(within(dialog).getByText('9')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/not verified unique people/i)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/11 entry\/navigation/i)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Last 30 days · all eligible ritual events/i)
    ).toBeInTheDocument();
  });
});
