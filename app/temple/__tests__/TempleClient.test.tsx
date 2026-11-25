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
import { resolveVigilFlame } from '@/lib/vigil/flame';

jest.mock('next/navigation', () => ({
  usePathname: () => '/temple',
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
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
  useVigilSupporters: jest.fn(),
}));

const vigilSupporters = require('@/hooks/useVigilSupporters') as {
  useVigilSupporters: jest.Mock;
};

function vigilSnapshot(
  overrides: Record<string, unknown> = {}
) {
  const lastLitAt = new Date().toISOString();

  return {
    supporterCount: 12,
    lastLitAt,
    flameExpiresAt: new Date(
      Date.parse(lastLitAt) + 24 * 60 * 60 * 1000
    ).toISOString(),
    flameLit: true,
    windowStartedAt: new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    error: null,
    refresh: jest.fn(async () => undefined),
    ...overrides,
  };
}

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

jest.mock('@/lib/tributes/checkoutClient', () => ({
  createTributeCheckout: jest.fn(async () => ({
    url: 'https://checkout.stripe.com/c/pay/test',
    sessionId: 'cs_test_1234567890',
  })),
  openSecureCheckout: jest.fn(() => 'browser'),
}));

const checkoutClient = require('@/lib/tributes/checkoutClient') as {
  createTributeCheckout: jest.Mock;
  openSecureCheckout: jest.Mock;
};

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

  return jsonResponse({});
});

beforeEach(() => {
  vigilSupporters.useVigilSupporters.mockReturnValue(vigilSnapshot());
  fetchMock.mockClear();
  checkoutClient.createTributeCheckout.mockClear();
  checkoutClient.openSecureCheckout.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
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

  it('renders the exact Vigil caption, hierarchy and authoritative count', () => {
    render(<TempleClient />);

    expect(
      screen.getByText('VIGIL · TAP THE HEART TO KEEP WATCH')
    ).toBeInTheDocument();
    expect(screen.getByText('THE SANCTUARY')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Digital Temple', level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A place to be present, to do something small, and to leave a mark.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/12 supporters/)).toBeInTheDocument();
    expect(screen.getByText(/12 supporters/)).toHaveAttribute(
      'data-supporter-count',
      '12'
    );
  });

  it('renders the same shared flame intensity as the shared calculation', () => {
    const state = vigilSnapshot({ supporterCount: 4 });

    vigilSupporters.useVigilSupporters.mockReturnValue(state);

    render(<TempleClient />);

    const pulse = screen.getByTestId('temple-heart-pulse');
    const rendered = Number(pulse.getAttribute('data-vigil-intensity'));
    const expected = resolveVigilFlame(state, Date.now());

    expect(pulse).toHaveAttribute('data-vigil-flame-state', 'lit');
    expect(rendered).toBeCloseTo(expected.intensity, 3);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(1);
  });

  it('renders the heart fully off at the shared 24h expiry', () => {
    const lastLitAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString();

    vigilSupporters.useVigilSupporters.mockReturnValue(
      vigilSnapshot({
        supporterCount: 99,
        lastLitAt,
        flameExpiresAt: new Date(
          Date.parse(lastLitAt) + 24 * 60 * 60 * 1000
        ).toISOString(),
        flameLit: true,
      })
    );

    render(<TempleClient />);

    expect(screen.getByTestId('temple-heart-pulse')).toHaveAttribute(
      'data-vigil-flame-state',
      'extinguished'
    );
    expect(screen.getByTestId('temple-heart-pulse')).toHaveAttribute(
      'data-vigil-intensity',
      '0.0000'
    );
    expect(screen.getByText('Flame extinguished')).toBeInTheDocument();
  });

  it('keeps the triptych heart linked to the Vigil', () => {
    render(<TempleClient />);

    expect(
      screen.getByRole('link', { name: /Light the Vigil heart/ })
    ).toHaveAttribute('href', '/vigil');
  });

  it('renders exactly four canonical ritual links', () => {
    render(<TempleClient />);

    const rituals = screen
      .getByRole('heading', { name: 'Rituals' })
      .closest('section') as HTMLElement;

    expect(within(rituals).getAllByRole('link')).toHaveLength(4);
    expect(within(rituals).getByRole('link', { name: /Calm/ })).toHaveAttribute(
      'href',
      '/heartandangel/calm'
    );
    expect(
      within(rituals).getByRole('link', { name: /Let It Go/ })
    ).toHaveAttribute('href', '/heartandangel/letitgo');
    expect(
      within(rituals).getByRole('link', { name: /Absolution/ })
    ).toHaveAttribute('href', '/absolution');
    expect(within(rituals).getByRole('link', { name: /Cast/ })).toHaveAttribute(
      'href',
      '/cast'
    );

    expect(within(rituals).queryByRole('link', { name: /Vigil/ })).toBeNull();
    expect(within(rituals).queryByRole('link', { name: /Tribute/ })).toBeNull();
  });

  it('sends the generic Support CTA to the non-modal payment step', () => {
    render(<TempleClient />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('link', { name: /support the temple/i })
    ).toHaveAttribute('href', '/temple/support');
    expect(checkoutClient.createTributeCheckout).not.toHaveBeenCalled();
  });

  it('starts the existing Stripe checkout immediately for a specific amount', async () => {
    render(<TempleClient />);

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '$5' }));

    await waitFor(() => {
      expect(checkoutClient.createTributeCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5 })
      );
    });

    expect(checkoutClient.openSecureCheckout).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/test'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never routes a specific amount through /tribute', async () => {
    render(<TempleClient />);

    fireEvent.click(screen.getByRole('button', { name: '$20' }));

    await waitFor(() => {
      expect(checkoutClient.createTributeCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 20 })
      );
    });

    expect(window.location.pathname).toBe('/');
  });

  it('shows the full trace text in the DOM even when desktop rows truncate visually', async () => {
    render(<TempleClient />);

    const traces = screen.getByRole('region', { name: 'Traces' });

    await waitFor(() => {
      expect(within(traces).getByText('ASH trace 0')).toBeInTheDocument();
    });

    expect(within(traces).getAllByRole('listitem')).toHaveLength(7);
    expect(within(traces).getByText(/Alice/)).toBeInTheDocument();

    const firstRow = within(traces).getAllByRole('listitem')[0];

    expect(firstRow).toHaveAttribute(
      'title',
      'Let It Go — Alice — ASH trace 0'
    );
    expect(firstRow).toHaveAttribute(
      'aria-label',
      'Let It Go — Alice — ASH trace 0'
    );
  });

  it('shows the server-rendered traces before the client fetch resolves', () => {
    global.fetch = jest.fn(
      () => new Promise<Response>(() => undefined)
    ) as unknown as typeof fetch;

    render(
      <TempleClient
        initialFeed={
          feedPayload() as unknown as Parameters<
            typeof TempleClient
          >[0]['initialFeed']
        }
      />
    );

    const traces = screen.getByRole('region', { name: 'Traces' });

    expect(within(traces).getByText('ASH trace 0')).toBeInTheDocument();
    expect(within(traces).getAllByRole('listitem')).toHaveLength(7);
  });

  it('keeps Chronicles available with the full-window definitions', async () => {
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

  it('states that the Temple stays light at every hour', async () => {
    render(<TempleClient />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Sanctuary information' })
    );

    const dialog = await screen.findByRole('dialog', { name: 'The Sanctuary' });

    expect(dialog).toHaveTextContent('It stays light at every hour');
  });
});
