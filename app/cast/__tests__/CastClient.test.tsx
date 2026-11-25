import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CastClient from '@/app/cast/CastClient';

const CAST_DRAFT_KEY = 'cast:draft:v1';

const getSession = jest.fn(async () => ({
  data: { session: null },
}));

let mockUser: { email?: string } | null = null;

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
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useTempleIdentity', () => ({
  __esModule: true,
  default: () => ({
    displayName: '',
    source: null,
    isLoading: false,
    error: null,
    isTelegram: false,
    refresh: async () => false,
  }),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  }),
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

const ANALYSIS = {
  archetype: 'UNFRAMED',
  agency_index: 82,
  scores: {
    VOID: 10,
    STONE: 20,
    NOISE: 15,
    UNFRAMED: 80,
  },
  executive_summary: 'You act from clear intent and tolerate ambiguity.',
  structural_weaknesses: 'You still explain the past more than you shape the next step.',
  core_assets: 'Specific memory, structural thinking and a refusal to perform.',
  strategic_directive: 'Choose one next action today and execute it without an audience.',
};

const CAST_RESPONSE = {
  analysis: ANALYSIS,
  archetype: 'UNFRAMED',
  agencyIndex: 82,
  recordId: 'record-cast-12345678',
  captureToken: 'capture-token-1',
};

const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
  if (String(input).includes('/api/cast/capture')) {
    return jsonResponse({ success: true });
  }

  return jsonResponse(CAST_RESPONSE);
});

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function finishTyping() {
  await act(async () => {
    jest.advanceTimersByTime(40_000);
    await Promise.resolve();
  });
}

function answerQuestion(value: string, final = false) {
  const textarea = screen.getByRole('textbox');

  fireEvent.change(textarea, {
    target: { value },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: final ? /ANALYZE/i : /NEXT/i,
    })
  );
}

function startEnglishProtocol() {
  fireEvent.click(
    screen.getByRole('button', {
      name: /Continue in English/i,
    })
  );
}

beforeEach(() => {
  mockUser = null;
  window.sessionStorage.clear();
  fetchMock.mockClear();
  getSession.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Cast language selector', () => {
  it('opens on one minimal language selector instead of two content cards', () => {
    const { container } = render(<CastClient />);

    expect(
      screen.getByRole('heading', {
        name: /Choose your language/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('group', {
        name: /Reading language/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: /Continue in English/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Continue in Русский/i,
      })
    ).toBeInTheDocument();

    expect(container.querySelectorAll('.cast-intro')).toHaveLength(1);

    // The old two-card marketing copy must not return.
    expect(screen.queryByText(/Protocol 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Протокол 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/spent 20 years building/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Индекс Агентности/i)).not.toBeInTheDocument();

    expect(container.querySelector('.temple-topbar')).toBeTruthy();
    expect(container.querySelector('.cast-page')).toHaveAttribute('data-cast-variant', 'page');
  });

  it('discloses AI processing, private storage and public visibility before the first question', () => {
    render(<CastClient />);

    const disclosure = screen.getByTestId('cast-disclosure');

    expect(disclosure).toBeVisible();
    expect(disclosure).toHaveTextContent(
      /answers are sent to an external AI model/i
    );
    expect(disclosure).toHaveTextContent(/stored privately/i);
    expect(disclosure).toHaveTextContent(/anonymous readings do not retain raw answers/i);
    expect(disclosure).toHaveTextContent(/public Temple trace/i);
    expect(disclosure).toHaveTextContent(/never your answers/i);
    expect(disclosure).toHaveTextContent(/not a clinical diagnosis/i);

    // The disclosure is on the initial screen, before a language is chosen.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('enters the existing English protocol on selection', () => {
    render(<CastClient />);

    startEnglishProtocol();

    expect(screen.getByText(/Question 01 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByText(/failed ambition/i)).toBeInTheDocument();
    expect(
      screen.getByTestId('cast-question-disclosure')
    ).toHaveTextContent(/not a diagnosis/i);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Answer honestly...');
    expect(screen.getByRole('button', { name: /NEXT/i })).toBeDisabled();
  });

  it('enters the Russian ten-question protocol on selection', () => {
    const { container } = render(<CastClient />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Continue in Русский/i,
      })
    );

    expect(screen.getByText(/Вопрос 01 \/ 10/i)).toBeInTheDocument();
    expect(container).toHaveTextContent(/нереализованном потенциале/i);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Пишите честно...');
  });
});

describe('Cast drafts and presentation switching', () => {
  it('restores a half-finished answer draft', () => {
    window.sessionStorage.setItem(
      CAST_DRAFT_KEY,
      JSON.stringify({
        language: 'ru',
        currentStep: 3,
        answers: ['first answer', 'second answer'],
        currentAnswer: 'черновик ответа',
        analysisData: null,
        archetype: '',
        recordId: null,
        captureToken: null,
        emailSent: false,
      })
    );

    const { container } = render(<CastClient />);

    expect(screen.getByText(/Вопрос 03 \/ 10/i)).toBeInTheDocument();
    expect(container).toHaveTextContent(/самый большой защитный механизм/i);
    expect(screen.getByRole('textbox')).toHaveValue('черновик ответа');
  });

  it('restores a completed result draft without calling the API again', async () => {
    jest.useFakeTimers();

    window.sessionStorage.setItem(
      CAST_DRAFT_KEY,
      JSON.stringify({
        language: 'en',
        currentStep: 11,
        answers: Array.from({ length: 10 }, (_, index) => `answer ${index + 1}`),
        currentAnswer: '',
        analysisData: ANALYSIS,
        archetype: 'UNFRAMED',
        recordId: 'record-cast-12345678',
        captureToken: 'capture-token-1',
        emailSent: false,
      })
    );

    const { container } = render(<CastClient />);

    await finishTyping();

    expect(container).toHaveTextContent(/AGENCY INDEX/i);
    expect(container).toHaveTextContent(/82\/100/);
    expect(screen.getByText('[UNFRAMED]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Secure/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps answers when switching from the page to the modal presentation', async () => {
    const page = render(<CastClient />);

    startEnglishProtocol();
    answerQuestion('My first honest answer');

    expect(screen.getByText(/Question 02 \/ 10/i)).toBeInTheDocument();

    await waitFor(() => {
      const draft = JSON.parse(window.sessionStorage.getItem(CAST_DRAFT_KEY) || '{}');

      expect(draft.currentStep).toBe(2);
      expect(draft.answers).toEqual(['My first honest answer']);
    });

    page.unmount();

    const modal = render(<CastClient variant="modal" />);

    expect(screen.getByText(/Question 02 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');

    const root = modal.container.querySelector('.cast-page');

    expect(root).toHaveAttribute('data-cast-variant', 'modal');
    expect(root).toHaveClass('cast-page--modal');
    expect(root).not.toHaveClass('min-h-[100dvh]');
    expect(modal.container.querySelector('.temple-topbar')).toBeNull();
    expect(modal.container.querySelector('h1')).toBeNull();
  });

  it('submits with Enter and keeps the current answer in the draft', async () => {
    render(<CastClient />);

    startEnglishProtocol();

    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, {
      target: { value: 'An answer transmitted by Enter' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(screen.getByText(/Question 02 \/ 10/i)).toBeInTheDocument();

    await waitFor(() => {
      const draft = JSON.parse(window.sessionStorage.getItem(CAST_DRAFT_KEY) || '{}');

      expect(draft.answers).toEqual(['An answer transmitted by Enter']);
    });
  });
});

describe('Cast analysis, result and email capture', () => {
  it('runs the ten-question protocol into the analysis result and stamp', async () => {
    jest.useFakeTimers();

    render(<CastClient />);

    startEnglishProtocol();

    for (let index = 1; index <= 10; index += 1) {
      answerQuestion(`Answer number ${index}`, index === 10);
    }

    await flushPromises();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cast',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          answers: Array.from({ length: 10 }, (_, index) => `Answer number ${index + 1}`),
          language: 'en',
          show_identity: false,
        }),
      })
    );

    await finishTyping();

    expect(screen.getByText(/AGENCY INDEX/i)).toBeInTheDocument();
    expect(screen.getByText(/82\/100/)).toBeInTheDocument();
    expect(screen.getByText('[UNFRAMED]')).toBeInTheDocument();
    expect(screen.getByText(/You act from clear intent/i)).toBeInTheDocument();
    expect(
      screen.getByText(/not a clinical diagnosis/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/true diagnosis/i)).toBeNull();
  });

  it('secures the result to an email without changing the capture contract', async () => {
    jest.useFakeTimers();

    render(<CastClient />);

    startEnglishProtocol();

    for (let index = 1; index <= 10; index += 1) {
      answerQuestion(`Answer number ${index}`, index === 10);
    }

    await flushPromises();
    await flushPromises();
    await finishTyping();

    fireEvent.change(screen.getByPlaceholderText('name@domain.com'), {
      target: { value: 'pilgrim@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Secure/i }));

    await flushPromises();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cast/capture',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          recordId: 'record-cast-12345678',
          captureToken: 'capture-token-1',
          email: 'pilgrim@example.com',
        }),
      })
    );

    expect(screen.getByText(/Reading secured to your email/i)).toBeInTheDocument();
  });

  it('shows a retry path when the analysis fails', async () => {
    jest.useFakeTimers();

    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: 'Core unavailable.' }, 500));

    render(<CastClient />);

    startEnglishProtocol();

    for (let index = 1; index <= 10; index += 1) {
      answerQuestion(`Answer number ${index}`, index === 10);
    }

    await flushPromises();
    await flushPromises();

    expect(screen.getByText('The reading could not be completed. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try the reading again/i })).toBeEnabled();
  });
});
