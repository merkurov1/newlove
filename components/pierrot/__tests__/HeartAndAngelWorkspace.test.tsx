import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import HeartAndAngelWorkspace from '../workspace/HeartAndAngelWorkspace';

afterEach(cleanup);

jest.setTimeout(20000);

describe('HeartAndAngelWorkspace', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/postcards')) {
        return {
          ok: true,
          json: async () => ({
            postcards: [
              { available: true, _count: { orders: 2 } },
              { available: false, postcard_orders: [{ count: 1 }] },
            ],
          }),
        } as Response;
      }

      if (url.includes('/api/temple_logs')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                event_type: 'WHISPER',
                created_at: '2026-11-05T10:00:00.000Z',
              },
            ],
          }),
        } as Response;
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;
  });

  it('opens existing Heart & Angel rooms and reads existing APIs', async () => {
    render(<HeartAndAngelWorkspace />);

    expect(screen.getByRole('link', { name: /The living landscape/ })).toHaveAttribute(
      'href',
      '/heartandangel/world'
    );
    expect(screen.getByRole('link', { name: /Six rituals/ })).toHaveAttribute('href', '/temple');
    expect(screen.getByRole('link', { name: /Open public hub/ })).toHaveAttribute(
      'href',
      '/heartandangel'
    );
    expect(screen.getByRole('link', { name: /Postcard catalogue/ })).toHaveAttribute(
      'href',
      '/admin/postcards'
    );

    expect(await screen.findByText('1 available')).toBeInTheDocument();
    expect(await screen.findByText('catalogue total')).toBeInTheDocument();
    expect(await screen.findByText('WHISPER')).toBeInTheDocument();
  });
});
