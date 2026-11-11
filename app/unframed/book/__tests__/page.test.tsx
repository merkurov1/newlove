import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BookReaderPage from '../page';

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock('react-markdown', () => {
  const ReactLib = require('react');

  return {
    __esModule: true,
    default: ({ children }: { children?: string }) =>
      ReactLib.createElement(
        'div',
        null,
        String(children || '')
          .split(/\n+/)
          .filter(Boolean)
          .map((line: string, index: number) =>
            ReactLib.createElement('p', { key: index }, line.replace(/^#{1,6}\s*/, ''))
          )
      ),
  };
});

const MANUSCRIPT = '# UNFRAMED\n\nOpening line.';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  window.scrollTo = jest.fn();
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = jest.fn();

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

describe('UNFRAMED book reader', () => {
  it('loads the manuscript after a successful admin login', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ content: MANUSCRIPT, version: 'version-1' }));

    render(<BookReaderPage />);

    expect(
      await screen.findByRole('heading', { name: /UNFRAMED \/ Manuscript/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Author \/ Admin Login/i }));
    fireEvent.change(screen.getByLabelText(/Admin key/i), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    await waitFor(() => {
      expect(screen.getByText('Opening line.')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/unframed/content',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('shows a load error instead of masking it with the paywall', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Manuscript temporarily unavailable' }, 500)
    );

    render(<BookReaderPage />);

    expect(await screen.findByText(/Reader error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /UNFRAMED \/ Manuscript/i })
    ).not.toBeInTheDocument();
  });

  it('recovers corrupted preferences without breaking the reader', async () => {
    window.localStorage.setItem('unframed_prefs', '{broken');
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: MANUSCRIPT, version: 'version-1' }));

    render(<BookReaderPage />);

    await screen.findByRole('heading', { name: 'Unframed' });
    fireEvent.click(screen.getByRole('button', { name: /Open settings/i }));

    expect(await screen.findByText('19px')).toBeInTheDocument();
  });

  it('restores a saved reading position only for the same manuscript version', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
    window.localStorage.setItem(
      'unframed_reading_position',
      JSON.stringify({ version: 'version-1', progress: 0.5 })
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: MANUSCRIPT, version: 'version-1' }));

    render(<BookReaderPage />);

    await screen.findByRole('heading', { name: 'Unframed' });

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: Math.round(0.5 * (5000 - window.innerHeight)),
        behavior: 'auto',
      });
    });
  });

  it('supports arrow-key navigation inside the table of contents', async () => {
    const contentWithHeadings = '# One\n\nText\n\n## Two\n\nText\n\n## Three';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ content: contentWithHeadings, version: 'version-2' })
    );

    render(<BookReaderPage />);
    await screen.findByRole('heading', { name: 'Unframed' });
    fireEvent.click(screen.getAllByRole('button', { name: /Open contents/i })[0]);

    const one = await screen.findByRole('button', { name: 'One' });
    const two = screen.getByRole('button', { name: 'Two' });

    one.focus();
    fireEvent.keyDown(one, { key: 'ArrowDown' });

    expect(two).toHaveFocus();
  });
});
