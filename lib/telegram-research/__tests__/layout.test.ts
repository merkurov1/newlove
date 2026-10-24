/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';

const mockGetCurrentUser = jest.fn(async () => null as { role: string } | null);
const mockRedirect = jest.fn((url: string): never => {
  throw new Error(`REDIRECT:${url}`);
});

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

type LayoutModule = {
  default: (props: { children: React.ReactNode }) => Promise<React.ReactNode>;
};

// Deliberately require after the mocks are registered: static ES imports are
// evaluated before jest.mock() in this setup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: TelegramResearchLayout } = require('@/app/research/telegram/layout') as LayoutModule;

describe('TelegramResearchLayout server guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects an unauthenticated visitor to the existing login page', async () => {
    mockGetCurrentUser.mockImplementation(async () => null);

    await expect(
      TelegramResearchLayout({ children: React.createElement('div') })
    ).rejects.toThrow('REDIRECT:/login?next=%2Fresearch%2Ftelegram');
    expect(mockRedirect).toHaveBeenCalledWith('/login?next=%2Fresearch%2Ftelegram');
  });

  it('redirects an authenticated ordinary user to 403', async () => {
    mockGetCurrentUser.mockImplementation(async () => ({ role: 'USER' }));

    await expect(
      TelegramResearchLayout({ children: React.createElement('div') })
    ).rejects.toThrow('REDIRECT:/403');
    expect(mockRedirect).toHaveBeenCalledWith('/403');
  });

  it('renders children for the ADMIN role without redirecting', async () => {
    mockGetCurrentUser.mockImplementation(async () => ({ role: 'ADMIN' }));

    const result = await TelegramResearchLayout({ children: React.createElement('div') });

    expect(result).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
