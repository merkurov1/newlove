import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Header from '@/components/Header';
import HomeClient from '@/components/HomeClient';
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
    </PierrotProvider>
  );
}

describe('Telegram Pierrot parity with the web header', () => {
  beforeEach(() => {
    installTelegram();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it('keeps the web identity and exit control in Telegram inline mode', () => {
    render(app());

    // Site mode uses the compact Telegram navigation, not the web header.
    expect(screen.getByRole('button', { name: 'Open Pierrot' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).toBeInTheDocument();
    const composerTrigger = screen.getByRole('button', {
      name: 'Show Pierrot composer',
    });
    expect(composerTrigger.style.bottom).toContain('56px');
    expect(screen.queryByLabelText('Pierrot avatar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Pierrot' }));

    // Inline mode now matches the web: Pierrot identity and exit live in the header.
    expect(screen.getByLabelText('Pierrot avatar')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Exit Pierrot mode' })).toHaveLength(1);
    expect(document.body).toHaveClass('telegram-pierrot-inline');
    expect(screen.getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Pierrot composer' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit Pierrot mode' }));

    expect(screen.getByRole('button', { name: 'Open Pierrot' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open World, Temple and rituals navigation' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Pierrot avatar')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('telegram-pierrot-inline');

    fireEvent.click(screen.getByRole('button', { name: 'Show Pierrot composer' }));

    const composer = document.getElementById('pierrot-home-composer');
    expect(composer?.parentElement?.style.paddingBottom).not.toContain('56px');
    expect(composer?.parentElement?.style.paddingBottom).toContain('safe-area-inset-bottom');

    fireEvent.click(screen.getByRole('button', { name: 'Hide Pierrot composer' }));
  });
});
