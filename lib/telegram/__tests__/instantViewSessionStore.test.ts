/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: jest.Mock;
};

const {
  createSupabaseInstantViewSessionStore,
  emptyInstantViewSessionState,
  INSTANT_VIEW_SESSION_SETTING_KEY,
} = require('../instantViewSessionStore') as typeof import('../instantViewSessionStore');

function storedRow(value: unknown) {
  const maybeSingle = jest.fn(async () => ({ data: { value }, error: null }));

  serverAuth.getServerSupabaseClient.mockReturnValue({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle })),
      })),
    })),
  });

  return maybeSingle;
}

function captureUpsert() {
  const upsert = jest.fn(async () => ({ error: null }));

  serverAuth.getServerSupabaseClient.mockReturnValue({
    from: jest.fn(() => ({ upsert })),
  });

  return upsert;
}

beforeEach(() => {
  serverAuth.getServerSupabaseClient.mockReset();
});

describe('Instant View private session store', () => {
  it('loads the diagnostic status fields without a hash value', async () => {
    storedRow({
      version: 1,
      status: 'connected',
      cookie: {
        ciphertext: 'ciphertext-only',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1:dedicated',
      },
      pending: null,
      pendingExpiresAt: null,
      connectedAt: '2026-11-28T09:00:00.000Z',
      lastVerifiedAt: '2026-11-28T09:05:00.000Z',
      lastErrorCode: null,
      template: {
        templatePresent: true,
        rhashPresent: true,
        hashMatchesEnv: true,
        hashStatus: 'verified',
        serverHashConfigured: true,
        detailStatus: 'loaded',
        detailChecked: true,
        templateUrl: 'https://instantview.telegram.org/my/merkurov.love',
        checkedAt: '2026-11-28T09:05:00.000Z',
      },
    });

    const state = await createSupabaseInstantViewSessionStore().read();

    expect(state.status).toBe('connected');
    expect(state.template).toMatchObject({
      hashStatus: 'verified',
      hashMatchesEnv: true,
      serverHashConfigured: true,
      detailStatus: 'loaded',
      detailChecked: true,
    });
    expect(state.template).not.toHaveProperty('rhash');
    expect(state.template).not.toHaveProperty('editorHash');
  });

  it('persists only the sealed session and safe diagnostic booleans', async () => {
    const upsert = captureUpsert();
    const store = createSupabaseInstantViewSessionStore();

    await store.write(
      {
        ...emptyInstantViewSessionState(),
        status: 'connected',
        cookie: {
          ciphertext: 'ciphertext-only',
          iv: 'iv',
          tag: 'tag',
          keyVersion: 'v1:dedicated',
        },
        template: {
          templatePresent: true,
          rhashPresent: false,
          hashMatchesEnv: null,
          hashStatus: 'unknown',
          serverHashConfigured: true,
          detailStatus: 'loaded',
          detailChecked: true,
          templateUrl: 'https://instantview.telegram.org/my/merkurov.love',
          checkedAt: '2026-11-28T09:05:00.000Z',
        },
      },
      'owner-1'
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0] as [
      {
        key: string;
        value: {
          template: Record<string, unknown>;
          cookie: { ciphertext: string };
        };
        updated_by: string;
      },
      { onConflict: string },
    ];

    expect(payload.key).toBe(INSTANT_VIEW_SESSION_SETTING_KEY);
    expect(options).toEqual({ onConflict: 'key' });
    expect(payload.value.template).toMatchObject({
      hashStatus: 'unknown',
      serverHashConfigured: true,
      detailStatus: 'loaded',
      detailChecked: true,
    });
    expect(payload.value.cookie.ciphertext).toBe('ciphertext-only');
    expect(JSON.stringify(payload)).not.toContain('editor-cookie-secret');
  });

  it('drops unknown diagnostic statuses from older or damaged rows', async () => {
    storedRow({
      version: 1,
      status: 'connected',
      template: {
        templatePresent: true,
        hashStatus: 'something-else',
        detailStatus: 'something-else',
        serverHashConfigured: 'yes',
      },
    });

    const state = await createSupabaseInstantViewSessionStore().read();

    expect(state.template).toMatchObject({
      templatePresent: true,
      hashStatus: null,
      detailStatus: null,
      serverHashConfigured: undefined,
    });
  });
});
