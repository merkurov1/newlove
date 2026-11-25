import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import html2canvas from 'html2canvas';
import AbsolutionClient from '@/app/absolution/AbsolutionClient';

const logTempleEvent = jest.fn(async () => false);
const toDataURL = jest.fn(() => 'data:image/png;base64,absolution');

jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ toDataURL })),
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
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

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: (...args: unknown[]) => logTempleEvent(...args),
}));

const html2canvasMock = html2canvas as unknown as jest.Mock;

async function advanceCeremony() {
  await act(async () => {
    jest.advanceTimersByTime(2100);
    await Promise.resolve();
  });
}

async function revealStamp() {
  await act(async () => {
    jest.advanceTimersByTime(1300);
    await Promise.resolve();
  });
}

function startCeremony() {
  fireEvent.click(
    screen.getByRole('button', { name: /RECEIVE ABSOLUTION/i })
  );
}

async function flushTrace() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Absolution ceremony and trace status', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    logTempleEvent.mockClear();
    logTempleEvent.mockResolvedValue(false);
    html2canvasMock.mockClear();
    toDataURL.mockClear();
    window.localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('completes the ceremony but never claims a trace when the write failed', async () => {
    render(<AbsolutionClient />);

    startCeremony();
    await flushTrace();

    expect(logTempleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'ABSOLUTION',
        message: 'Completed the Absolution ritual.',
        author: 'Anonymous',
      })
    );

    const logged = JSON.stringify(logTempleEvent.mock.calls[0][0]);

    expect(logged).not.toContain('Doomscrolling');
    expect(logged).not.toContain('confessed');
    expect(logged).not.toContain('Pilgrim');

    await advanceCeremony();

    await waitFor(() =>
      expect(
        screen.getByText(/trace could not be recorded/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/Temple trace recorded/i)
    ).not.toBeInTheDocument();
  });

  it('reports a saved trace only after persistence succeeds', async () => {
    logTempleEvent.mockResolvedValue(true);

    render(<AbsolutionClient />);

    startCeremony();
    await flushTrace();
    await advanceCeremony();

    await waitFor(() =>
      expect(screen.getByText(/Temple trace recorded/i)).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/trace could not be recorded/i)
    ).not.toBeInTheDocument();
  });

  it('shows processing, then the certificate, then the stamp reveal', async () => {
    logTempleEvent.mockResolvedValue(true);

    render(<AbsolutionClient />);
    startCeremony();
    await flushTrace();

    expect(
      screen.getByText(/Dissolving burdens into light/i)
    ).toBeInTheDocument();

    await advanceCeremony();

    expect(
      screen.getByTestId('absolution-certificate')
    ).toBeInTheDocument();
    expect(screen.getByTestId('absolution-stamp')).toHaveAttribute(
      'data-visible',
      'false'
    );

    await revealStamp();

    expect(screen.getByTestId('absolution-stamp')).toHaveAttribute(
      'data-visible',
      'true'
    );
    expect(
      screen.getByRole('button', { name: /SAVE CERTIFICATE/i })
    ).toBeEnabled();
  });

  it('exports a certificate that includes the heart and larger stamp artwork', async () => {
    logTempleEvent.mockResolvedValue(true);
    const downloadClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<AbsolutionClient />);
    startCeremony();
    await flushTrace();
    await advanceCeremony();
    await revealStamp();

    const certificate = screen.getByTestId('absolution-certificate');
    const heart = screen.getByTestId('absolution-certificate-heart');
    const stamp = screen.getByTestId('absolution-stamp');
    const stampImage = screen.getByTestId('absolution-stamp-image');

    expect(certificate).toContainElement(heart);
    expect(certificate).toContainElement(stamp);
    expect(stampImage.className).toContain('w-[240px]');
    expect(stampImage.className).toContain('brightness-110');
    expect(heart.className).toContain('brightness-110');

    fireEvent.click(
      screen.getByRole('button', { name: /SAVE CERTIFICATE/i })
    );

    await waitFor(() => expect(html2canvasMock).toHaveBeenCalledTimes(1));

    expect(html2canvasMock).toHaveBeenCalledWith(
      certificate,
      expect.objectContaining({
        scale: 2,
        backgroundColor: '#f8f2e6',
        useCORS: true,
        allowTaint: true,
      })
    );
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    await waitFor(() => expect(downloadClick).toHaveBeenCalled());
  });

  it('resets the ritual back to confession', async () => {
    logTempleEvent.mockResolvedValue(true);

    render(<AbsolutionClient />);
    startCeremony();
    await flushTrace();
    await advanceCeremony();
    await revealStamp();

    fireEvent.click(
      screen.getByRole('button', { name: /NEW ABSOLUTION/i })
    );

    expect(
      screen.getByRole('button', { name: /RECEIVE ABSOLUTION/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('absolution-certificate')
    ).not.toBeInTheDocument();
    expect(logTempleEvent).toHaveBeenCalledTimes(1);
  });

  it('clears ceremony timers when the ritual closes', () => {
    const { unmount } = render(<AbsolutionClient />);

    startCeremony();

    expect(jest.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('explains that the certificate is private and only completion is public', () => {
    render(<AbsolutionClient />);

    const note = screen.getByTestId('absolution-privacy');

    expect(note).toHaveTextContent(/name and burden stay on this certificate/i);
    expect(note).toHaveTextContent(/Only the completed ritual is recorded/i);
  });

  it('keeps the canonical standalone page mode as the default', () => {
    const { container } = render(<AbsolutionClient />);
    const page = container.querySelector('.absolution-page');

    expect(page).toHaveAttribute('data-absolution-variant', 'page');
    expect(page).not.toHaveClass('absolution-page--modal');
    expect(container.querySelector('.noise-overlay')).toBeTruthy();
  });

  it('renders a compact modal variant without the standalone top bar', () => {
    const { container } = render(<AbsolutionClient variant="modal" />);
    const page = container.querySelector('.absolution-page');

    expect(page).toHaveAttribute('data-absolution-variant', 'modal');
    expect(page).toHaveClass('absolution-page--modal');
    expect(container.querySelector('.noise-overlay')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /Back to Temple/i })
    ).not.toBeInTheDocument();
  });
});
