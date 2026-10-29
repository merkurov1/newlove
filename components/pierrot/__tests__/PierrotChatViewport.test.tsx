import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PierrotChat from '@/components/PierrotChat';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

function OpenButton() {
  const { openChat } = usePierrot();

  return (
    <button type="button" onClick={openChat}>
      Open
    </button>
  );
}

function renderPierrot() {
  return render(
    <PierrotProvider>
      <PierrotChat />
      <OpenButton />
    </PierrotProvider>
  );
}

describe('PierrotChat keyboard viewport', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    // @ts-expect-error test cleanup
    delete window.matchMedia;
  });

  it('uses the visual viewport rectangle for the modal shell', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: 390,
        height: 500,
        offsetTop: 50,
        offsetLeft: 3,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    renderPierrot();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');

    await waitFor(() => {
      expect(dialog).toHaveStyle({
        height: '500px',
        maxHeight: '500px',
        width: '390px',
        maxWidth: '390px',
        top: '50px',
        left: '3px',
      });
    });

    expect(screen.getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
  });

  it('falls back to CSS viewport units without VisualViewport', async () => {
    renderPierrot();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog.style.height).toBe('var(--tg-viewport-height, 100dvh)');
    expect(dialog.style.maxHeight).toBe('var(--tg-viewport-height, 100dvh)');
    expect(dialog.style.width).toBe('100%');
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.left).toBe('0px');
  });

  it('does not focus the composer when the modal opens on a touch device', async () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: 390,
        height: 844,
        offsetTop: 0,
        offsetLeft: 0,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    renderPierrot();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const input = screen.getByRole('textbox', { name: 'Message Pierrot' });

    await waitFor(() => {
      expect(document.activeElement).not.toBe(input);
    });
  });

  it('keeps the desktop convenience of focusing the composer', async () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: 1280,
        height: 720,
        offsetTop: 0,
        offsetLeft: 0,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: query.includes('pointer: fine'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    renderPierrot();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const input = screen.getByRole('textbox', { name: 'Message Pierrot' });

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('locks document scrolling while the modal is open and restores it on close', async () => {
    renderPierrot();

    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close Pierrot' }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('does not steal focus back into the composer after a response', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    const fetchMock = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    window.sessionStorage.setItem(
      'pierrot_chat_history_v2',
      JSON.stringify([
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Pick a direction.',
          actions: [{ kind: 'prompt', label: 'Tell me more', prompt: 'more' }],
        },
      ])
    );

    renderPierrot();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const input = screen.getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.click(screen.getByRole('button', { name: 'Tell me more' }));

    await waitFor(() => {
      expect(input).toHaveAttribute('readonly');
    });
    expect(document.activeElement).not.toBe(input);

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ reply: 'A quiet answer.' }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('A quiet answer.')).toBeInTheDocument();
    });

    expect(input).not.toHaveAttribute('readonly');
    expect(document.activeElement).not.toBe(input);
  });
});
