/** @jest-environment node */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { POST } from '../route';

jest.mock('ethers', () => ({
  verifyMessage: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const { verifyMessage } = require('ethers') as { verifyMessage: jest.Mock };
const { createClient } = require('@supabase/supabase-js') as {
  createClient: jest.Mock;
};

const address = '0x1111111111111111111111111111111111111111';
const walletEmail = `${address}@wallet.merkur.io`;
const nonce = 'nonce_1234567890abcdef';

const upserts: Record<string, unknown> = {
  profiles: null,
  users: null,
};

function walletMessage() {
  return [
    'merkurov.love wants you to sign in with your Ethereum account:',
    address,
    '',
    'Sign in to Merkurov Ecosystem',
    '',
    'URI: https://merkurov.love',
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

function nonceChain() {
  const result = { data: { id: 'nonce-1' }, error: null };
  const maybeSingle = async () => result;

  return {
    eq: () => ({
      is: () => ({
        gt: () => ({
          select: () => ({ maybeSingle }),
        }),
      }),
    }),
  };
}

function adminClient() {
  return {
    from: (table: string) => ({
      update: () => nonceChain(),
      upsert: async (payload: unknown) => {
        upserts[table] = payload;
        return { error: null };
      },
    }),
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [{ id: 'user-1', email: walletEmail }] },
          error: null,
        }),
        createUser: async () => ({ data: null, error: new Error('unexpected create') }),
        updateUserById: async () => ({ data: null, error: null }),
      },
      signInWithPassword: async () => ({
        data: { session: { access_token: 'access', refresh_token: 'refresh' } },
        error: null,
      }),
    },
  };
}

describe('/api/auth/wallet', () => {
  beforeEach(() => {
    upserts.profiles = null;
    upserts.users = null;
    verifyMessage.mockReset().mockReturnValue(address);
    createClient.mockReset().mockReturnValue(adminClient());
  });

  it('writes the canonical users profile as well as the legacy wallet profile', async () => {
    const response = await POST(
      new Request('https://merkurov.love/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message: walletMessage(), signature: '0xsig' }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      session: { access_token: 'access', refresh_token: 'refresh' },
    });

    expect(upserts.profiles).toMatchObject({
      id: 'user-1',
      wallet_address: address,
      updated_at: expect.any(String),
    });
    expect(upserts.users).toEqual({
      id: 'user-1',
      email: walletEmail,
      updated_at: expect.any(String),
    });
  });

  it('rejects a used or expired nonce before touching profiles', async () => {
    createClient.mockReturnValueOnce({
      ...adminClient(),
      from: (table: string) => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }),
        }),
        upsert: async (payload: unknown) => {
          upserts[table] = payload;
          return { error: null };
        },
      }),
    });

    const response = await POST(
      new Request('https://merkurov.love/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message: walletMessage(), signature: '0xsig' }),
      })
    );

    expect(response.status).toBe(401);
    expect(upserts.profiles).toBeNull();
    expect(upserts.users).toBeNull();
  });
});
