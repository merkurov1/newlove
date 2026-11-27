import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import NewPostModal from '../NewPostModal';
import { useNewPostModal } from '../new-post/useNewPostModal';

const originalFetch = global.fetch;

function apiResponse(
  body: Record<string, unknown>,
  options: { ok?: boolean; status?: number } = {}
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

async function renderComposer(body: string) {
  const onClose = jest.fn();
  const utils = render(<NewPostModal open onClose={onClose} />);
  const textarea = await screen.findByLabelText('Post text');

  await waitFor(() => {
    expect(textarea).toBeEnabled();
  });

  fireEvent.change(textarea, { target: { value: body } });

  return {
    ...utils,
    onClose,
    textarea: textarea as HTMLTextAreaElement,
    wand: screen.getByRole('button', { name: 'Proofread text' }),
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('Flow composer proofread wand', () => {
  it('sits immediately beside Post and is visually secondary', async () => {
    const { wand } = await renderComposer('Hello, wrld.');

    const post = screen.getByRole('button', { name: 'Post' });

    expect(wand.nextElementSibling).toBe(post);
    expect(wand).toHaveClass('text-[#898277]');
    expect(wand).not.toHaveAttribute('title');
    expect(wand).not.toHaveTextContent(/proofread/i);
  });

  it('is disabled for an empty or whitespace-only body', async () => {
    const { textarea, wand } = await renderComposer('');

    expect(wand).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '   \n\t ' } });

    expect(wand).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'Hello.' } });

    expect(wand).toBeEnabled();
  });

  it('sends only the body text and replaces it with the corrected version', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(apiResponse({ text: 'Hello, world. This is correct.', unchanged: false }));

    global.fetch = fetchMock as typeof fetch;

    const { textarea, wand } = await renderComposer('Hello, wrld. This is corect.');

    fireEvent.click(wand);

    await waitFor(() => {
      expect(textarea.value).toBe('Hello, world. This is correct.');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('/api/flow/proofread');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      text: 'Hello, wrld. This is corect.',
    });
    // No title, attachments, metadata or language is sent.
    expect(Object.keys(JSON.parse(init.body))).toEqual(['text']);
  });

  it('shows a quiet busy state without blocking typing, Post, attach or close', async () => {
    const pending = deferredResponse();
    const fetchMock = jest.fn().mockReturnValue(pending.promise);

    global.fetch = fetchMock as typeof fetch;

    const { textarea, wand } = await renderComposer('Привет, мир.');

    fireEvent.click(wand);

    await waitFor(() => {
      expect(wand).toHaveAttribute('aria-busy', 'true');
    });

    expect(wand).toBeDisabled();
    expect(wand.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
    expect(textarea).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Attach images' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close composer' })).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: /proofread/i })).toBeNull();

    // Typing stays possible while the request is in flight.
    fireEvent.change(textarea, { target: { value: 'Привет, мир! Я печатаю.' } });

    expect(textarea.value).toBe('Привет, мир! Я печатаю.');

    pending.resolve(apiResponse({ text: 'Привет, мир.', unchanged: true }));

    await waitFor(() => {
      expect(wand).toBeEnabled();
    });
  });

  it('does not issue duplicate concurrent requests', async () => {
    const pending = deferredResponse();
    const fetchMock = jest.fn().mockReturnValue(pending.promise);

    global.fetch = fetchMock as typeof fetch;

    const { wand } = await renderComposer('Hello.');

    fireEvent.click(wand);
    fireEvent.click(wand);

    await waitFor(() => {
      expect(wand).toHaveAttribute('aria-busy', 'true');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(apiResponse({ text: 'Hello.', unchanged: true }));

    await waitFor(() => {
      expect(wand).toBeEnabled();
    });
  });

  it('keeps the text and reports unchanged when the model returns it verbatim', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        apiResponse({ text: 'Уже корректный текст.', unchanged: true })
      ) as typeof fetch;

    const { textarea, wand } = await renderComposer('Уже корректный текст.');

    fireEvent.click(wand);

    await waitFor(() => {
      expect(screen.getByText('No changes needed.')).toBeInTheDocument();
    });

    expect(textarea.value).toBe('Уже корректный текст.');
  });

  it('preserves the exact draft on provider failure', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      apiResponse(
        {
          error: 'provider_error',
          message: 'Proofreading is unavailable right now.',
        },
        { ok: false, status: 502 }
      )
    ) as typeof fetch;

    const draft = 'Черновик с ашибкой, который нельзя терять.';
    const { textarea, wand } = await renderComposer(draft);

    fireEvent.click(wand);

    await waitFor(() => {
      expect(screen.getByText("Couldn't proofread. Your text is unchanged.")).toBeInTheDocument();
    });

    expect(textarea.value).toBe(draft);
  });

  it('preserves the draft on empty or invalid model output', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        apiResponse(
          { error: 'invalid_output', message: 'Invalid result.' },
          { ok: false, status: 422 }
        )
      ) as typeof fetch;

    const draft = 'Hello, wrld.';
    const { textarea, wand } = await renderComposer(draft);

    fireEvent.click(wand);

    await waitFor(() => {
      expect(screen.getByText("Couldn't proofread. Your text is unchanged.")).toBeInTheDocument();
    });

    expect(textarea.value).toBe(draft);
  });

  it('discards a stale response instead of overwriting newer edits', async () => {
    const pending = deferredResponse();

    global.fetch = jest.fn().mockReturnValue(pending.promise) as typeof fetch;

    const { textarea, wand } = await renderComposer('Hello, wrld.');

    fireEvent.click(wand);

    await waitFor(() => {
      expect(wand).toHaveAttribute('aria-busy', 'true');
    });

    // The author keeps writing while the model works.
    fireEvent.change(textarea, {
      target: { value: 'Hello, world. I kept writing.' },
    });

    pending.resolve(apiResponse({ text: 'Hello, world.', unchanged: false }));

    await waitFor(() => {
      expect(screen.getByText('Text changed; kept your edits.')).toBeInTheDocument();
    });

    expect(textarea.value).toBe('Hello, world. I kept writing.');
  });

  it('guards against duplicate concurrent calls at the hook level', async () => {
    const pending = deferredResponse();
    const fetchMock = jest.fn().mockReturnValue(pending.promise);

    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useNewPostModal({ open: true, onClose: jest.fn() }));

    act(() => {
      result.current.setBodyMd('Hello, wrld.');
    });

    act(() => {
      void result.current.proofread();
      void result.current.proofread();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(apiResponse({ text: 'Hello, world.', unchanged: false }));

    await act(async () => {
      await pending.promise;
    });

    await waitFor(() => {
      expect(result.current.isProofreading).toBe(false);
    });
  });
});
