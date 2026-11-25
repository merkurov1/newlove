import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import VigilExperience from '../VigilExperience';
import { resolveVigilFlame } from '@/lib/vigil/flame';

jest.mock('next/navigation', () => ({
  usePathname: () => '/vigil',
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
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

jest.mock('next/image', () => {
  return function MockImage({
    alt,
    src,
    fill,
    priority,
    sizes,
    unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
    unoptimized?: boolean;
  }) {
    void fill;
    void priority;
    void sizes;
    void unoptimized;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} {...props} />;
  };
});

jest.mock('@/components/TempleTopBar', () => ({
  __esModule: true,
  default: () => <div data-testid="temple-top-bar" />,
}));

jest.mock('@/components/temple/useRitualModalTimer', () => ({
  useRitualModalTimer: jest.fn(),
}));

jest.mock('@/components/telegram/useTelegramBottomButton', () => ({
  useTelegramBottomButton: jest.fn(),
}));

jest.mock('@/components/useIsTelegram', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('@/components/pierrot/usePrefersReducedMotion', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('@/hooks/useTempleIdentity', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/hooks/useVigilSupporters', () => ({
  useVigilSupporters: jest.fn(),
}));

jest.mock('@/lib/supabase-browser', () => {
  const builder: Record<string, unknown> = {};

  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  });

  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };

  return {
    supabase: {
      from: () => builder,
      channel: () => channel,
      removeChannel: jest.fn(),
      auth: {
        getSession: async () => ({ data: { session: null } }),
      },
    },
  };
});

const identityModule = require('@/hooks/useTempleIdentity') as {
  default: jest.Mock;
};
const supportersModule = require('@/hooks/useVigilSupporters') as {
  useVigilSupporters: jest.Mock;
};

const HOUR = 60 * 60 * 1000;

function identity(overrides: Record<string, unknown> = {}) {
  return {
    displayName: '',
    source: null,
    isLoading: false,
    error: null,
    isTelegram: false,
    refresh: jest.fn(async () => false),
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const lastLitAt = new Date().toISOString();

  return {
    supporterCount: 5,
    lastLitAt,
    flameExpiresAt: new Date(
      Date.parse(lastLitAt) + 24 * HOUR
    ).toISOString(),
    flameLit: true,
    windowStartedAt: new Date(Date.now() - 24 * HOUR).toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ready',
    error: null,
    refresh: jest.fn(async () => undefined),
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => 'application/json' },
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  identityModule.default.mockReturnValue(identity());
  supportersModule.useVigilSupporters.mockReturnValue(snapshot());
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/api/vigil/claim')) {
      return jsonResponse({
        authenticated: true,
        canSpark: false,
        remainingMs: HOUR,
        remainingLabel: '1h',
        lastSparkAt: new Date().toISOString(),
      });
    }

    return jsonResponse({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('/vigil shared flame surface', () => {
  it('renders the same intensity as the shared calculation for the same server state', async () => {
    const state = snapshot({ supporterCount: 8 });

    supportersModule.useVigilSupporters.mockReturnValue(state);

    render(<VigilExperience />);

    const heart = screen.getByTestId('vigil-heart');

    await waitFor(() => {
      expect(heart).toHaveAttribute('data-vigil-flame-state', 'lit');
    });

    const rendered = Number(heart.getAttribute('data-vigil-intensity'));
    const expected = resolveVigilFlame(state, Date.now());

    expect(rendered).toBeCloseTo(expected.intensity, 3);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(1);
    expect(heart).toHaveAttribute('data-supporter-count', '8');
  });

  it('is fully off at the shared 24h expiry regardless of supporters', async () => {
    const lastLitAt = new Date(Date.now() - 25 * HOUR).toISOString();

    supportersModule.useVigilSupporters.mockReturnValue(
      snapshot({
        supporterCount: 99,
        lastLitAt,
        flameExpiresAt: new Date(
          Date.parse(lastLitAt) + 24 * HOUR
        ).toISOString(),
        flameLit: true,
      })
    );

    render(<VigilExperience />);

    const heart = screen.getByTestId('vigil-heart');

    await waitFor(() => {
      expect(heart).toHaveAttribute(
        'data-vigil-flame-state',
        'extinguished'
      );
    });

    expect(heart).toHaveAttribute('data-vigil-intensity', '0.0000');
    expect(screen.getByText('FLAME EXTINGUISHED')).toBeInTheDocument();
  });

  it('keeps the personal cooldown independent of the shared flame expiry', async () => {
    const lastLitAt = new Date(Date.now() - 25 * HOUR).toISOString();

    identityModule.default.mockReturnValue(
      identity({
        displayName: 'Anna',
        source: 'supabase',
      })
    );
    supportersModule.useVigilSupporters.mockReturnValue(
      snapshot({
        supporterCount: 0,
        lastLitAt,
        flameExpiresAt: new Date(
          Date.parse(lastLitAt) + 24 * HOUR
        ).toISOString(),
        flameLit: true,
      })
    );

    render(<VigilExperience />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Spark returns in 1h/i })
      ).toBeDisabled();
    });

    expect(screen.getByTestId('vigil-heart')).toHaveAttribute(
      'data-vigil-flame-state',
      'extinguished'
    );
  });
});
