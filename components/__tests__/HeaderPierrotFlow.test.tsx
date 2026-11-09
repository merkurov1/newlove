import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Header from '@/components/Header';
import { PierrotProvider } from '@/components/pierrot/PierrotContext';

let mockPathname = '/lobby';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

let mockAuth: Record<string, unknown> = {};

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function app() {
  return (
    <PierrotProvider>
      <Header />
    </PierrotProvider>
  );
}

describe('Header Pierrot and Flow controls', () => {
  beforeEach(() => {
    mockPathname = '/lobby';
  });

  it('does not offer the admin Flow composer to a non-admin user', () => {
    mockAuth = {
      user: { id: 'user-1', email: 'reader@example.com' },
      profile: { id: 'user-1', name: 'Reader' },
      roles: [],
      isLoading: false,
      signOut: jest.fn(),
    };

    render(app());

    expect(screen.queryByRole('button', { name: 'Create Flow post' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Open Pierrot/ })).toBeInTheDocument();
  });

  it('shows the Flow composer to an admin and keeps Pierrot next to it', () => {
    mockPathname = '/flow';
    mockAuth = {
      user: { id: 'admin-1', email: 'owner@example.com' },
      profile: { id: 'admin-1', name: 'Owner' },
      roles: ['ADMIN'],
      isLoading: false,
      signOut: jest.fn(),
    };

    render(app());

    expect(screen.getByRole('button', { name: 'Create Flow post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Open Pierrot/ })).toBeInTheDocument();
  });

  it('keeps the header background transparent after scrolling', async () => {
    mockAuth = {
      user: null,
      profile: null,
      roles: [],
      isLoading: false,
      signOut: jest.fn(),
    };

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });

    render(app());

    const header = document.querySelector('header.site-header');
    expect(header).toHaveAttribute('data-scrolled', 'false');
    expect(header?.className).toContain('bg-transparent');

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 120,
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(header).toHaveAttribute('data-scrolled', 'true');
    });

    expect(header?.className).toContain('bg-transparent');
    expect(header?.className).not.toContain('bg-[#FAF8F5]/85');
  });

  it('keeps the internal navigation and control surfaces transparent too', () => {
    mockPathname = '/flow';
    mockAuth = {
      user: { id: 'admin-1', email: 'owner@example.com' },
      profile: { id: 'admin-1', name: 'Owner' },
      roles: ['ADMIN'],
      isLoading: false,
      signOut: jest.fn(),
    };

    render(app());

    const header = document.querySelector('header.site-header');
    const surfaces = Array.from(header?.querySelectorAll('.site-header-surface') || []);

    expect(surfaces.length).toBeGreaterThanOrEqual(3);
    for (const surface of surfaces) {
      expect(surface.className).toContain('bg-transparent');
      expect(surface.className).not.toContain('bg-white');
      expect(surface.className).not.toContain('backdrop-blur-md');
    }

    const opaqueWhiteSurface = Array.from(header?.querySelectorAll('*') || []).find((element) =>
      /(^|\s)bg-white(\/\d+)?(\s|$)|(^|\s)bg-\[#F4EFE7\](\s|$)/.test(element.className || '')
    );
    expect(opaqueWhiteSurface).toBeUndefined();
  });
});
