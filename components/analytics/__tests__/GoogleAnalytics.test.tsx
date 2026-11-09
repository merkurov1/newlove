import { render, waitFor } from '@testing-library/react';

let mockPath = '/flow';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
}));

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}));

import { GoogleAnalytics } from '../GoogleAnalytics';
import { resetGaForTests } from '@/lib/analytics/ga4';

const originalNodeEnv = process.env.NODE_ENV;

function pageViews(): Array<Record<string, unknown>> {
  const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer || [];
  return dataLayer.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      (entry as Record<string, unknown>).event === 'page_view'
  );
}

beforeEach(() => {
  mockPath = '/flow';
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'production',
    configurable: true,
  });
  resetGaForTests();
});

afterEach(() => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: originalNodeEnv,
    configurable: true,
  });
  resetGaForTests();
});

describe('GoogleAnalytics route tracker', () => {
  it('sends exactly one page_view per pathname', async () => {
    const { rerender } = render(<GoogleAnalytics />);

    await waitFor(() => expect(pageViews()).toHaveLength(1));

    rerender(<GoogleAnalytics />);
    expect(pageViews()).toHaveLength(1);

    mockPath = '/journal';
    rerender(<GoogleAnalytics />);

    await waitFor(() => expect(pageViews()).toHaveLength(2));
    expect(pageViews()[1]).toMatchObject({ event: 'page_view', page_path: '/journal' });
  });

  it('renders nothing outside production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    });
    const { container } = render(<GoogleAnalytics />);
    expect(container).toBeEmptyDOMElement();
  });
});
