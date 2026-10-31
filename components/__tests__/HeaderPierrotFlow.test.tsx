import React from 'react';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';
import { PierrotProvider } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  usePathname: () => '/lobby',
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
});
