/** @jest-environment node */

import { beforeEach, describe, expect, it } from '@jest/globals';

import RegisterPage from '../page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const { redirect } = require('next/navigation') as { redirect: jest.Mock };

describe('/register redirect', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it('forwards a safe internal next path to the login screen', async () => {
    await RegisterPage({ searchParams: Promise.resolve({ next: '/journal?from=register' }) });

    expect(redirect).toHaveBeenCalledWith(
      `/login?mode=register&next=${encodeURIComponent('/journal?from=register')}`
    );
  });

  it('falls back to /profile when next is missing or external', async () => {
    await RegisterPage({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenLastCalledWith(
      `/login?mode=register&next=${encodeURIComponent('/profile')}`
    );

    await RegisterPage({ searchParams: Promise.resolve({ next: 'https://evil.example' }) });
    expect(redirect).toHaveBeenLastCalledWith(
      `/login?mode=register&next=${encodeURIComponent('/profile')}`
    );
  });

  it('does not forward a login loop', async () => {
    await RegisterPage({ searchParams: Promise.resolve({ next: '/login?next=/admin' }) });

    expect(redirect).toHaveBeenLastCalledWith(
      `/login?mode=register&next=${encodeURIComponent('/profile')}`
    );
  });
});
