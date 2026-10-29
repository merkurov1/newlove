import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HomeClient from '@/components/HomeClient';
import LobbyClient from '@/app/lobby/LobbyClient';
import Header from '@/components/Header';
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

function TogglePierrotButton() {
  const { toggleConversation } = usePierrot();

  return (
    <button type="button" onClick={toggleConversation}>
      Toggle test Pierrot
    </button>
  );
}

function UnreadStatus() {
  const { hasUnread } = usePierrot();

  return <span data-testid="unread-status">{hasUnread ? 'unread' : 'read'}</span>;
}

function renderApp() {
  return render(
    <PierrotProvider>
      <HomeClient />
      <PierrotChat />
      <OpenChatButton />
      <TogglePierrotButton />
      <UnreadStatus />
    </PierrotProvider>
  );
}

function renderLobbyApp() {
  return render(
    <PierrotProvider>
      <LobbyClient />
      <PierrotChat />
      <OpenChatButton />
      <TogglePierrotButton />
      <UnreadStatus />
    </PierrotProvider>
  );
}

async function openArtIntro() {
  fireEvent.click(screen.getByRole('link', { name: 'Art' }));
  return screen.findByText(/Art is where the site becomes something other than a portfolio\./);
}

function chatFetchCalls() {
  return fetchMock.mock.calls.filter(
    ([url]) => typeof url === 'string' && url.includes('/api/pierrot-web')
  );
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
    window.localStorage.clear();
  });

  it('opens the single Pierrot window from the homepage P control', async () => {
    renderApp();

    expect(screen.queryByRole('textbox', { name: 'Message Pierrot' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Pierrot conversation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
    expect(within(dialog).getByText('Structure is the antidote to chaos.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Pierrot conversation' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open Pierrot conversation' })).toBeInTheDocument();
  });

  it('keeps the site header and shows the Pierrot identity inside the window', async () => {
    render(
      <PierrotProvider>
        <Header />
        <PierrotChat />
        <TogglePierrotButton />
      </PierrotProvider>
    );

    expect(screen.getByText('Merkurov')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pierrot')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Pierrot')).toBeInTheDocument();
    expect(screen.getByText('Merkurov')).toBeInTheDocument();
  });

  it('opens the same window from the homepage launcher', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open Pierrot conversation' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Pierrot' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open Pierrot conversation' })).toBeInTheDocument();
  });

  it('sends a short message from the Pierrot window', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
    });

    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toBeInTheDocument();
    expect(chatFetchCalls()[0][1].body).toContain('"message":"hello"');
  });

  it('resets the conversation from the window header', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'New chat' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Structure is the antidote to chaos.')).toBeInTheDocument();
    });
    expect(within(dialog).getByRole('button', { name: 'New chat' })).toBeDisabled();
  });

  it('renders assistant markdown as formatting, not literal asterisks', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Read **this** and open [Lobby](/lobby).',
      }),
    });

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
    });

    const strong = await within(dialog).findByText('this');
    expect(strong.tagName).toBe('STRONG');
    expect(within(dialog).queryByText(/\*\*this\*\*/)).not.toBeInTheDocument();

    const link = within(dialog).getByRole('link', { name: 'Lobby' });
    expect(link).toHaveAttribute('href', '/lobby');
  });

  it('turns known routes in assistant prose into clickable links', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply:
          'Погрузитесь в Арт (/heartandangel), Лобби (/lobby) или Журнал (/journal), чтобы почувствовать структуру.',
      }),
    });

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
    });

    expect(within(dialog).getByRole('link', { name: 'Арт' })).toHaveAttribute(
      'href',
      '/heartandangel'
    );
    expect(within(dialog).getByRole('link', { name: 'Лобби' })).toHaveAttribute('href', '/lobby');
    expect(within(dialog).getByRole('link', { name: 'Журнал' })).toHaveAttribute(
      'href',
      '/journal'
    );
    expect(within(dialog).queryByText(/\/heartandangel/)).not.toBeInTheDocument();
  });

  it('does not turn an unsafe markdown URL into a link', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Do not follow [this](javascript:alert(1)).',
      }),
    });

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
    });

    expect(await within(dialog).findByText('this')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'this' })).not.toBeInTheDocument();
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
    expect(chatFetchCalls()).toHaveLength(0);
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

  it('marks an arrival message as unread until the conversation opens', async () => {
    const view = renderApp();

    window.sessionStorage.setItem(
      'pierrot_navigation_arrival_v1',
      JSON.stringify({
        id: 'nav-unread',
        sectionId: 'art',
        route: '/heartandangel',
        arrivalDelivered: false,
        createdAt: Date.now(),
      })
    );

    currentPathname = '/heartandangel';
    view.rerender(
      <PierrotProvider>
        <HomeClient />
        <PierrotChat />
        <OpenChatButton />
        <TogglePierrotButton />
        <UnreadStatus />
      </PierrotProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unread-status')).toHaveTextContent('unread');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));

    await waitFor(() => {
      expect(screen.getByTestId('unread-status')).toHaveTextContent('read');
    });
  });

  it('closes the conversation without navigating and preserves the draft', async () => {
    currentPathname = '/lobby';
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
    currentPathname = '/lobby';
    renderApp();

    await openArtIntro();
    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');

    fireEvent.change(modalInput, { target: { value: 'yes' } });
    fireEvent.keyDown(modalInput, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/heartandangel');
    expect(chatFetchCalls()).toHaveLength(0);
  });

  it('does not navigate on a standalone yes or on a follow-up question', async () => {
    const standalone = renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle test Pierrot' }));
    const composerInput = screen.getByRole('textbox', {
      name: 'Message Pierrot',
    });

    fireEvent.change(composerInput, { target: { value: 'yes' } });
    fireEvent.keyDown(composerInput, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
    });
    expect(pushMock).not.toHaveBeenCalled();

    standalone.unmount();
    window.sessionStorage.clear();
    fetchMock.mockClear();
    pushMock.mockClear();
    currentPathname = '/lobby';

    renderApp();
    await openArtIntro();

    const dialog = screen.getByRole('dialog');
    const modalInput = within(dialog).getByRole('textbox');
    fireEvent.change(modalInput, {
      target: { value: 'What is the Temple?' },
    });
    fireEvent.keyDown(modalInput, { key: 'Enter' });

    await waitFor(() => {
      expect(chatFetchCalls()).toHaveLength(1);
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

  it('shows the navigation index in the empty conversation', () => {
    currentPathname = '/lobby';
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Structure is the antidote to chaos.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Context Architecture/)).not.toBeInTheDocument();

    for (const name of [
      'Anton Merkurov',
      'Lobby',
      'Unframed',
      'Flow',
      'Journal',
      'Art Engine',
      'Selection',
      'Heart & Angel',
      'Temple',
    ]) {
      expect(within(dialog).getByRole('link', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('starts a guaranteed curated dialogue from the default CTA', async () => {
    currentPathname = '/lobby';
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));

    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ask Pierrot something' }));

    expect(within(dialog).getByText('Where should I start?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Start with the/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Lobby' })).toHaveAttribute('href', '/lobby');
    expect(within(dialog).getByRole('button', { name: 'Enter the Lobby' })).toBeInTheDocument();
    expect(chatFetchCalls()).toHaveLength(0);
  });

  it('opens the Heritage scenario from the Lobby page', async () => {
    currentPathname = '/lobby';
    renderLobbyApp();

    fireEvent.click(screen.getAllByRole('link', { name: /Heritage/i })[0]);

    expect(await screen.findByText(/Heritage is the family archive/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('opens the Media scenario from the Lobby page', async () => {
    currentPathname = '/lobby';
    renderLobbyApp();

    fireEvent.click(screen.getByRole('link', { name: /Explore the media archive/i }));

    expect(await screen.findByText(/Media is the public record/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('runs the Lobby explanation and navigates to the verified route', async () => {
    currentPathname = '/lobby';
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
