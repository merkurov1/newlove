/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

jest.mock('@/app/layout', () => ({
  metadata: { title: { default: 'Site' } },
}));

jest.mock('@/lib/metadataSanitize', () => ({
  sanitizeMetadata: (metadata: unknown) => metadata,
}));

jest.mock('../AdminChrome', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => ({ children }),
}));

const serverAuth = require('@/lib/serverAuth') as {
  requireAdmin: jest.Mock;
};
const { AuthenticationError } = require('@/lib/auth/errors') as {
  AuthenticationError: new (message?: string) => Error;
};
const { default: AdminLayout } = require('../layout') as {
  default: (props: { children: unknown }) => Promise<unknown>;
};

describe('admin server page access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects an anonymous visitor to /403 using the existing access model', async () => {
    serverAuth.requireAdmin.mockRejectedValueOnce(
      new AuthenticationError('Unauthorized: Admin access required')
    );

    await expect(AdminLayout({ children: null })).rejects.toThrow(
      'REDIRECT:/403'
    );
  });

  it('renders the admin shell for an authenticated owner', async () => {
    serverAuth.requireAdmin.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'ADMIN',
    });

    await expect(AdminLayout({ children: 'content' })).resolves.toBeTruthy();
    expect(serverAuth.requireAdmin).toHaveBeenCalledTimes(1);
  });
});
