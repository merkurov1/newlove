/** @jest-environment node */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { GET } from '../route';

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

const { createServerClient } = require('@supabase/ssr') as {
  createServerClient: jest.Mock;
};

const exchangeCodeForSession = jest.fn();

function location(response: Response): URL {
  return new URL(response.headers.get('location') || '');
}

describe('/auth/callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    createServerClient.mockReset().mockReturnValue({
      auth: { exchangeCodeForSession },
    });
  });

  it('exchanges a code and returns to a safe internal path', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const response = await GET(
      new Request('https://merkurov.love/auth/callback?code=abc&next=%2Fjournal%3Ffrom%3Doauth')
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(location(response).pathname).toBe('/journal');
    expect(location(response).search).toBe('?from=oauth');
  });

  it('rejects an external next path', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const response = await GET(
      new Request(
        'https://merkurov.love/auth/callback?code=abc&next=https%3A%2F%2Fevil.example%2Fsteal'
      )
    );

    expect(location(response).origin).toBe('https://merkurov.love');
    expect(location(response).pathname).toBe('/profile');
  });

  it('returns to /login with an error instead of the missing auth-code-error page', async () => {
    const response = await GET(
      new Request('https://merkurov.love/auth/callback?error=access_denied&next=%2Fadmin')
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(response).pathname).toBe('/login');
    expect(location(response).searchParams.get('error')).toBe('callback');
    expect(location(response).searchParams.get('next')).toBe('/admin');
  });

  it('falls back to /login when the code exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('bad code') });

    const response = await GET(
      new Request('https://merkurov.love/auth/callback?code=abc&next=%2Fprofile')
    );

    expect(location(response).pathname).toBe('/login');
    expect(location(response).searchParams.get('error')).toBe('callback');
  });
});
