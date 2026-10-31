import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Header from '@/components/Header';
import HomeClient from '@/components/HomeClient';
import PierrotChat from '@/components/PierrotChat';
import TelegramMiniApp from '@/components/TelegramMiniApp';
import { PierrotProvider } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), refresh: jest.fn() }),
}));

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

function installTelegram() {
  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: {
      initData: 'query_id=test&user=test',
      viewportHeight: 800,
      viewportStableHeight: 800,
      ready: jest.fn(),
      expand: jest.fn(),
      setHeaderColor: jest.fn(),
      setBackgroundColor: jest.fn(),
      onEvent: jest.fn(),
      offEvent: jest.fn(),
      BackButton: {
        show: jest.fn(),
        hide: jest.fn(),
        onClick: jest.fn(),
        offClick: jest.fn(),
      },
    },
  };
}

function app() {
  return (
    <PierrotProvider>
      <Header />
      <TelegramMiniApp />
      <HomeClient />
      <PierrotChat />
    </PierrotProvider>
  );
}

describe('Telegram Pierrot uses the single conversation window', () => {
  beforeEach(() => {
    installTelegram();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it('opens the same window as the web, with avatar, name, reset and close', async () => {
    render(app());

    expect(screen.getByRole('button', { name: /^Open Pierrot/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).toBeInTheDocument();

    // The single header P control replaces the retired floating launcher.
    expect(
      screen.queryByRole('button', { name: 'Open Pierrot conversation' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Merkurov')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Open Pierrot/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pierrot')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Pierrot')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close Pierrot' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Pierrot' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Open Pierrot/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).toBeInTheDocument();
  });

  it('does not render a duplicate floating Pierrot launcher in Telegram', async () => {
    render(app());

    expect(
      screen.queryByRole('button', { name: 'Open Pierrot conversation' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Open Pierrot/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Pierrot' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Open Pierrot conversation' })
    ).not.toBeInTheDocument();
  });
});
