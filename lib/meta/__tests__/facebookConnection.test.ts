/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  loadFacebookConnectionState,
  loadFacebookRuntimeConfig,
  saveFacebookPageConnection,
} from '../facebookConnection';

const originalEnv = { ...process.env };

function fakeStore(options: { error?: string } = {}) {
  const rows: Record<string, any>[] = [];

  const client = {
    from(table: string) {
      if (table !== 'analytics_connections') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: () => ({
          eq: (field: string, value: unknown) => ({
            maybeSingle: async () => {
              if (options.error) {
                return { data: null, error: { message: options.error } };
              }

              return {
                data: rows.find((row) => row[field] === value) ?? null,
                error: null,
              };
            },
          }),
        }),
        upsert: async (payload: Record<string, any>) => {
          const index = rows.findIndex((row) => row.provider === payload.provider);

          if (index >= 0) {
            rows[index] = { ...rows[index], ...payload };
          } else {
            rows.push({ id: 'connection-1', ...payload });
          }

          return { error: null };
        },
      };
    },
  };

  return { client: client as any, rows };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Facebook connection storage', () => {
  it('seals the Page token and rehydrates it without persisting the User token', async () => {
    const { client, rows } = fakeStore();

    await saveFacebookPageConnection(client, {
      pageId: 'page-1',
      pageName: 'Cute Kitten Page',
      pageToken: 'page-token-1',
      scopes: ['pages_show_list', 'pages_manage_posts'],
      tasks: ['CREATE_CONTENT'],
      permissions: ['pages_show_list', 'pages_manage_posts'],
      userId: 'user-1',
      userTokenExpiresAt: '2027-01-01T00:00:00.000Z',
      connectedBy: 'admin',
      now: new Date('2026-11-26T12:00:00.000Z'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'facebook',
      status: 'connected',
      external_id: 'page-1',
      account_label: 'Cute Kitten Page',
      token_key_version: expect.stringContaining('v1'),
    });
    expect(JSON.stringify(rows[0])).not.toContain('page-token-1');
    expect(JSON.stringify(rows[0])).not.toContain('long-lived-user-token');

    const runtime = await loadFacebookRuntimeConfig({
      env: {},
      store: client,
    });
    expect(runtime).toMatchObject({
      pageId: 'page-1',
      accessToken: 'page-token-1',
      configured: true,
      source: 'database',
    });

    const state = await loadFacebookConnectionState({ store: client });
    expect(state).toMatchObject({
      connected: true,
      source: 'database',
      pageId: 'page-1',
      pageName: 'Cute Kitten Page',
      tokenExpiresAt: null,
      tokenExpiryKnown: true,
      storageAvailable: true,
    });
  });

  it('prefers the database connection over a legacy environment token', async () => {
    const { client } = fakeStore();

    await saveFacebookPageConnection(client, {
      pageId: 'page-db',
      pageName: 'Database Page',
      pageToken: 'database-token',
      scopes: [],
    });

    const runtime = await loadFacebookRuntimeConfig({
      env: {
        META_FACEBOOK_PAGE_ID: 'page-env',
        META_FACEBOOK_PAGE_ACCESS_TOKEN: 'environment-token',
      },
      store: client,
    });

    expect(runtime).toMatchObject({
      pageId: 'page-db',
      accessToken: 'database-token',
      source: 'database',
    });
  });

  it('falls back to the environment when no database connection exists', async () => {
    const { client } = fakeStore();

    const runtime = await loadFacebookRuntimeConfig({
      env: {
        META_FACEBOOK_PAGE_ID: 'page-env',
        META_FACEBOOK_PAGE_ACCESS_TOKEN: 'environment-token',
      },
      store: client,
    });

    expect(runtime).toMatchObject({
      pageId: 'page-env',
      accessToken: 'environment-token',
      configured: true,
      source: 'environment',
    });
  });

  it('does not fall back to a legacy env token after an explicit disconnect', async () => {
    const { client, rows } = fakeStore();
    rows.push({
      provider: 'facebook',
      status: 'disabled',
      external_id: 'page-1',
    });

    const runtime = await loadFacebookRuntimeConfig({
      env: {
        META_FACEBOOK_PAGE_ID: 'page-env',
        META_FACEBOOK_PAGE_ACCESS_TOKEN: 'environment-token',
      },
      store: client,
    });

    expect(runtime).toMatchObject({
      configured: false,
      source: 'none',
    });
  });

  it('reports an unavailable store instead of crashing the admin page', async () => {
    const { client } = fakeStore({ error: 'relation does not exist' });

    const state = await loadFacebookConnectionState({ store: client });

    expect(state.connected).toBe(false);
    expect(state.storageAvailable).toBe(false);
    expect(state.storageError).toContain('Хранилище подключений недоступно');
  });
});
