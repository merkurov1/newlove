import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TelegramNavigation from '@/components/telegram/TelegramNavigation';
import { hasTelegramBackHandler, runTopTelegramBackHandler } from '@/lib/telegram/backHandler';

let mockPathname = '/flow';
const mockToggleConversation = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/components/pierrot/PierrotContext', () => ({
  usePierrot: () => ({
    mode: 'site',
    hasUnread: false,
    toggleConversation: mockToggleConversation,
  }),
}));

function renderNavigation(pathname: string) {
  mockPathname = pathname;

  return render(<TelegramNavigation />);
}

async function openMenu(pathname: string, triggerName: string) {
  const view = renderNavigation(pathname);

  fireEvent.click(screen.getByRole('button', { name: triggerName }));

  const dialog = await screen.findByRole('dialog');

  return { view, dialog };
}

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  document.body.style.overflow = '';
});

describe('TelegramNavigation route-aware menu', () => {
  it('renders the Flow editorial index without Temple rituals', async () => {
    const { dialog } = await openMenu('/flow/an-entry', 'Open Flow navigation');

    expect(dialog).toHaveAttribute('data-nav-context', 'flow');
    expect(screen.getByRole('button', { name: 'Open Flow navigation' })).toHaveAttribute(
      'data-nav-context',
      'flow'
    );

    const flowLink = within(dialog).getByRole('link', {
      name: /Flow\s*Stream of thoughts & media/i,
    });
    const issuesLink = within(dialog).getByRole('link', {
      name: /Flow Issues\s*Editorial issues archive/i,
    });

    expect(flowLink).toHaveAttribute('href', '/flow');
    expect(flowLink).toHaveAttribute('aria-current', 'page');
    expect(issuesLink).toHaveAttribute('href', '/flow-issues');
    expect(issuesLink).not.toHaveAttribute('aria-current');

    expect(within(dialog).queryByText('Rituals')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Calm/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Let It Go/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Absolution/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Cast/ })).not.toBeInTheDocument();

    expect(within(dialog).getByRole('link', { name: /Visit the sanctuary/i })).toHaveAttribute(
      'href',
      '/temple'
    );
  });

  it('renders World, Temple and all four rituals with Temple active', async () => {
    const { dialog } = await openMenu('/temple', 'Open Temple navigation');

    expect(dialog).toHaveAttribute('data-nav-context', 'temple');
    expect(screen.getByRole('button', { name: 'Open Temple navigation' })).toHaveAttribute(
      'data-nav-context',
      'temple'
    );

    expect(
      within(dialog).getByRole('link', { name: /World\s*The living landscape/i })
    ).toHaveAttribute('href', '/heartandangel/world');

    const templeLink = within(dialog).getByRole('link', {
      name: /Temple\s*The sanctuary/i,
    });

    expect(templeLink).toHaveAttribute('href', '/temple');
    expect(templeLink).toHaveAttribute('aria-current', 'page');

    for (const [label, href] of [
      ['Calm', '/heartandangel/calm'],
      ['Let It Go', '/heartandangel/letitgo'],
      ['Absolution', '/absolution'],
      ['Cast', '/cast'],
    ]) {
      expect(within(dialog).getByRole('link', { name: new RegExp(label) })).toHaveAttribute(
        'href',
        href
      );
    }

    expect(within(dialog).queryByText('Threshold')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Where do you want to go?')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Flow Issues/ })).not.toBeInTheDocument();
  });

  it('marks a nested ritual route as current', async () => {
    const { dialog } = await openMenu('/heartandangel/calm', 'Open Temple navigation');

    expect(within(dialog).getByRole('link', { name: /^Calm/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(dialog).getByRole('link', { name: /^Temple/ })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('marks the Flow Issues archive current on its English alias', async () => {
    const { dialog } = await openMenu('/en/flow-issues/issue-1', 'Open Flow navigation');

    expect(within(dialog).getByRole('link', { name: /Flow Issues/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(dialog).getByRole('link', { name: /Stream of thoughts/ })).not.toHaveAttribute(
      'aria-current'
    );
  });
});

describe('TelegramNavigation shared behaviour', () => {
  it('locks the document, closes from the close button and restores focus', async () => {
    renderNavigation('/flow');

    const trigger = screen.getByRole('button', { name: 'Open Flow navigation' });

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close navigation' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(document.body.style.overflow).toBe('');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('closes on Escape and restores focus', async () => {
    renderNavigation('/flow');

    const trigger = screen.getByRole('button', { name: 'Open Flow navigation' });

    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('closes when the backdrop receives the click', async () => {
    renderNavigation('/temple');

    fireEvent.click(screen.getByRole('button', { name: 'Open Temple navigation' }));

    const dialog = await screen.findByRole('dialog');
    const backdrop = dialog.parentElement;

    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('registers a Telegram back handler while open and consumes it', async () => {
    renderNavigation('/temple');

    expect(hasTelegramBackHandler()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Open Temple navigation' }));
    await screen.findByRole('dialog');

    expect(hasTelegramBackHandler()).toBe(true);

    let consumed = false;

    act(() => {
      consumed = runTopTelegramBackHandler();
    });

    expect(consumed).toBe(true);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(hasTelegramBackHandler()).toBe(false);
  });

  it('keeps keyboard focus inside the dialog', async () => {
    const { dialog } = await openMenu('/flow', 'Open Flow navigation');

    const closeButton = within(dialog).getByRole('button', {
      name: 'Close navigation',
    });
    const links = within(dialog).getAllByRole('link');
    const lastLink = links[links.length - 1];

    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    lastLink.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(lastLink).toHaveFocus();
  });

  it('closes the sheet when a destination is chosen', async () => {
    const { dialog } = await openMenu('/flow', 'Open Flow navigation');

    fireEvent.click(within(dialog).getByRole('link', { name: /Flow Issues/ }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Flow navigation' })).toHaveFocus();
    });
  });

  it('keeps the separate Pierrot trigger intact', () => {
    renderNavigation('/flow');

    fireEvent.click(screen.getByRole('button', { name: /^Open Pierrot/ }));

    expect(mockToggleConversation).toHaveBeenCalledTimes(1);
  });
});
