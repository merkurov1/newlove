import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HomeClient from '@/components/HomeClient';
import LobbyClient from '@/app/lobby/LobbyClient';
import PierrotChat from '@/components/PierrotChat';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';
import { parseNavigationRecord } from '@/lib/pierrot/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...props
  }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    href: string | { pathname?: string };
    children: React.ReactNode;
  }) {
    const resolvedHref = typeof href === 'string' ? href : href?.pathname || '#';

    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  };
});

import { usePathname, useRouter } from 'next/navigation';

const mockedUseRouter = useRouter as jest.Mock;
const mockedUsePathname = usePathname as jest.Mock;

let currentPathname = '/';
let pushMock: jest.Mock;
let fetchMock: jest.Mock;

function OpenChatButton() {
  const { openChat } = usePierrot();

  return (
    <button type="button" onClick={openChat}>
      Open test chat
    </button>
  );
}

function renderApp() {
  return render(
    <PierrotProvider>
      <HomeClient />
      <PierrotChat />
      <OpenChatButton />
    </PierrotProvider>
  );
}

function renderLobbyApp() {
  return render(
    <PierrotProvider>
      <LobbyClient />
      <PierrotChat />
      <OpenChatButton />
    </PierrotProvider>
  );
}

async function openComposer() {
  fireEvent.click(screen.getByRole('button', { name: 'Show Pierrot composer' }));
  return screen.getByRole('textbox', { name: 'Message Pierrot' });
}

async function openArtIntro() {
  fireEvent.click(screen.getByRole('link', { name: 'Art' }));
  return screen.findByText(/Art is where the site becomes something other than a portfolio\./);
}

describe('Pierrot conversational navigation', () => {
  beforeEach(() => {
    currentPathname = '/';
    pushMock = jest.fn();
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'A quiet answer.', provider: 'test' }),
    });

    mockedUseRouter.mockReturnValue({ push: pushMock });
    mockedUsePathname.mockImplementation(() => currentPathname);
    global.fetch = fetchMock as unknown as typeof fetch;

    window.sessionStorage.clear();
  });

  it('toggles the homepage composer with the P control', async () => {
    renderApp();

    expect(screen.queryByRole('textbox', { name: 'Message Pierrot' })).not.toBeInTheDocument();

    await openComposer();

    expect(screen.getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Pierrot composer' }));

    expect(screen.queryByRole('textbox', { name: 'Message Pierrot' })).not.toBeInTheDocument();
  });

  it('expands only above 100 characters and preserves the draft', async () => {
    renderApp();
    const composer = await openComposer();
    const thresholdDraft = 'a'.repeat(100);

    fireEvent.change(composer, { target: { value: thresholdDraft } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const longDraft = `${thresholdDraft}b`;
    fireEvent.change(composer, { target: { value: longDraft } });

    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');

    expect(modalInput).toHaveValue(longDraft);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a short message normally without opening the modal first', async () => {
    renderApp();
    const composer = await openComposer();

    fireEvent.change(composer, { target: { value: 'hello' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].body).toContain('"message":"hello"');
  });

  it('opens Art as a conversation and inserts its curated intro once', async () => {
    renderApp();

    const artLink = screen.getByRole('link', { name: 'Art' });
    fireEvent.click(artLink);
    fireEvent.click(artLink);

    expect(pushMock).not.toHaveBeenCalled();

    const intro = await screen.findByText(
      /Art is where the site becomes something other than a portfolio\./
    );

    expect(intro).toBeInTheDocument();
    expect(
      screen.getAllByText(/Art is where the site becomes something other than a portfolio\./)
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Enter Art' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('navigates to Art from the action and delivers the arrival message once', async () => {
    const view = renderApp();

    await openArtIntro();
    fireEvent.click(screen.getByRole('button', { name: 'Enter Art' }));

    expect(pushMock).toHaveBeenCalledWith('/heartandangel');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const record = parseNavigationRecord(
      window.sessionStorage.getItem('pierrot_navigation_arrival_v1')
    );
    expect(record).toMatchObject({
      sectionId: 'art',
      route: '/heartandangel',
      executed: true,
      arrivalDelivered: false,
    });

    currentPathname = '/heartandangel';
    view.rerender(
      <PierrotProvider>
        <HomeClient />
        <PierrotChat />
        <OpenChatButton />
      </PierrotProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    await waitFor(() => {
      expect(screen.getAllByText(/You're now in Heart & Angel\./)).toHaveLength(1);
    });

    view.rerender(
      <PierrotProvider>
        <HomeClient />
        <PierrotChat />
        <OpenChatButton />
      </PierrotProvider>
    );

    expect(screen.getAllByText(/You're now in Heart & Angel\./)).toHaveLength(1);

    view.unmount();

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    await waitFor(() => {
      expect(screen.getAllByText(/You're now in Heart & Angel\./)).toHaveLength(1);
    });
  });

  it('closes the conversation without navigating and preserves the draft', async () => {
    renderApp();
    await openArtIntro();

    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');

    fireEvent.change(modalInput, { target: { value: 'a draft I want to keep' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Pierrot' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue(
        'a draft I want to keep'
      );
    });
  });

  it('allows a natural-language confirmation only while a proposal is pending', async () => {
    renderApp();

    await openArtIntro();
    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');

    fireEvent.change(modalInput, { target: { value: 'yes' } });
    fireEvent.keyDown(modalInput, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/heartandangel');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not navigate on a standalone yes or on a follow-up question', async () => {
    const standalone = renderApp();

    await openComposer();
    const composerInput = screen.getByRole('textbox', {
      name: 'Message Pierrot',
    });

    fireEvent.change(composerInput, { target: { value: 'yes' } });
    fireEvent.keyDown(composerInput, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).not.toHaveBeenCalled();

    standalone.unmount();
    window.sessionStorage.clear();
    fetchMock.mockClear();
    pushMock.mockClear();

    renderApp();
    await openArtIntro();

    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');
    fireEvent.change(modalInput, {
      target: { value: 'What is the Temple?' },
    });
    fireEvent.keyDown(modalInput, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Selection', /Selection is the vault/],
    ['Advising', /Advising is the Office/],
    ['Journal', /The Journal is the editorial record/],
  ])('opens the curated %s scenario from the homepage', async (label, intro) => {
    renderApp();

    fireEvent.click(screen.getByRole('link', { name: label }));

    expect(await screen.findByText(intro)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('navigates to Selection, closes the chat, and delivers its arrival message', async () => {
    const view = renderApp();

    fireEvent.click(screen.getByRole('link', { name: 'Selection' }));
    await screen.findByText(/Selection is the vault/);
    fireEvent.click(screen.getByRole('button', { name: 'Enter Selection' }));

    expect(pushMock).toHaveBeenCalledWith('/selection');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    currentPathname = '/selection';
    view.rerender(
      <PierrotProvider>
        <HomeClient />
        <PierrotChat />
        <OpenChatButton />
      </PierrotProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    expect(await screen.findByText(/You're now in Selection\./)).toBeInTheDocument();
  });

  it('shows homepage copy in the empty conversation and uses section buttons', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Structure is the antidote to chaos.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Context Architecture/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Selection' }));

    expect(await within(dialog).findByText(/Selection is the vault/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the Heritage scenario from the Lobby page', async () => {
    renderLobbyApp();

    fireEvent.click(screen.getAllByRole('link', { name: /Heritage/i })[0]);

    expect(await screen.findByText(/Heritage is the family archive/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('opens the Media scenario from the Lobby page', async () => {
    renderLobbyApp();

    fireEvent.click(screen.getByRole('link', { name: /Explore the media archive/i }));

    expect(await screen.findByText(/Media is the public record/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('runs the Lobby explanation and navigates to the verified route', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('link', { name: /Enter The Lobby/i }));

    await screen.findByText(/The Lobby is the private office/);
    fireEvent.click(screen.getByRole('button', { name: 'Enter Lobby' }));

    expect(pushMock).toHaveBeenCalledWith('/lobby');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
