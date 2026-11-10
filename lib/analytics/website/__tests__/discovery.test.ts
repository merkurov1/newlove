/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  chooseGa4Property,
  chooseSearchConsoleSite,
  discoverGa4PropertiesDetailed,
} from '../providers/oauth';
import { resolveGoogleRefreshCredential, runGoogleDiscovery } from '../discovery';
import { openSecret, sealSecret } from '../tokenCrypto';

const previousEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeStore(initial: Record<string, Record<string, unknown>> = {}) {
  const rows = new Map<string, Record<string, unknown>>(Object.entries(initial));

  const store = {
    from(table: string) {
      if (table !== 'analytics_connections') {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle: async () => ({ data: rows.get(value) ?? null, error: null }),
              };
            },
          };
        },
        upsert: async (payload: Record<string, unknown>) => {
          const provider = String(payload.provider);
          rows.set(provider, { ...(rows.get(provider) ?? {}), ...payload });
          return { error: null };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_column: string, value: string) => {
              rows.set(value, { ...(rows.get(value) ?? {}), ...patch });
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { store: store as unknown as SupabaseClient, rows };
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
  delete process.env.ANALYTICS_GA4_PROPERTY_ID;
  delete process.env.ANALYTICS_GSC_SITE_URL;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

afterAll(() => {
  process.env = previousEnv;
});

describe('GA4 discovery', () => {
  it('reads every account page, every property and only web stream measurement ids', async () => {
    const accountPages: string[] = [];
    const streamCalls: string[] = [];

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/accountSummaries')) {
        accountPages.push(url);

        if (url.includes('pageToken=page-2')) {
          return jsonResponse({
            accountSummaries: [
              {
                displayName: 'Second account',
                propertySummaries: [{ property: 'properties/333', displayName: 'Three' }],
              },
            ],
          });
        }

        return jsonResponse({
          accountSummaries: [
            {
              displayName: 'First account',
              propertySummaries: [
                { property: 'properties/111', displayName: 'Other' },
                { property: 'properties/222', displayName: 'Merkurov' },
              ],
            },
          ],
          nextPageToken: 'page-2',
        });
      }

      if (url.includes('/dataStreams')) {
        streamCalls.push(url);
        const propertyId = url.match(/properties\/(\d+)\/dataStreams/)?.[1];

        if (propertyId === '222') {
          return jsonResponse({
            dataStreams: [
              {
                type: 'WEB_DATA_STREAM',
                webStreamData: { measurementId: 'G-J1F4ZTK9ND' },
              },
            ],
          });
        }

        if (propertyId === '111') {
          return jsonResponse({
            dataStreams: [
              {
                type: 'IOS_APP_DATA_STREAM',
                webStreamData: { measurementId: 'G-IOS-MUST-NOT-MATCH' },
              },
              {
                type: 'WEB_DATA_STREAM',
                webStreamData: { measurementId: 'G-OTHER' },
              },
            ],
          });
        }

        return jsonResponse({
          dataStreams: [
            {
              type: 'WEB_DATA_STREAM',
              webStreamData: { measurementId: 'G-THREE' },
            },
          ],
        });
      }

      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const result = await discoverGa4PropertiesDetailed('access-token');

    expect(accountPages).toHaveLength(2);
    expect(streamCalls).toHaveLength(3);
    expect(result.accountCount).toBe(2);
    expect(result.properties.map((property) => property.propertyId)).toEqual(['111', '222', '333']);
    expect(result.properties[0].measurementIds).toEqual(['G-OTHER']);
    expect(chooseGa4Property(result.properties)?.propertyId).toBe('222');
    expect(result.warnings).toHaveLength(0);
  });

  it('continues after one property stream request fails', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/accountSummaries')) {
        return jsonResponse({
          accountSummaries: [
            {
              displayName: 'Account',
              propertySummaries: [
                { property: 'properties/111', displayName: 'Broken' },
                { property: 'properties/222', displayName: 'Merkurov' },
              ],
            },
          ],
        });
      }

      if (url.includes('properties/111/dataStreams')) {
        return jsonResponse(
          { error: { code: 403, status: 'PERMISSION_DENIED', message: 'No access' } },
          403
        );
      }

      return jsonResponse({
        dataStreams: [
          {
            type: 'WEB_DATA_STREAM',
            webStreamData: { measurementId: 'G-J1F4ZTK9ND' },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await discoverGa4PropertiesDetailed('access-token');

    expect(result.properties).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      provider: 'google_analytics',
      code: 'insufficient_permissions',
      httpStatus: 403,
      stage: 'dataStreams:111',
      retryable: false,
    });
    expect(chooseGa4Property(result.properties)?.propertyId).toBe('222');
  });

  it('does not fabricate a property from an environment override', () => {
    expect(
      chooseGa4Property(
        [
          {
            propertyId: '111',
            displayName: 'Other',
            accountName: 'Account',
            measurementIds: ['G-OTHER'],
          },
        ],
        { override: '999' }
      )
    ).toBeNull();
  });
});

describe('Search Console discovery', () => {
  const sites = [
    { siteUrl: 'https://www.merkurov.love/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:merkurov.love', permissionLevel: 'siteFullUser' },
    { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
  ];

  it('matches the configured override with or without a trailing slash', () => {
    expect(chooseSearchConsoleSite(sites, { siteUrl: 'https://www.merkurov.love' })?.siteUrl).toBe(
      'https://www.merkurov.love/'
    );
    expect(chooseSearchConsoleSite(sites, { siteUrl: 'sc-domain:merkurov.love' })?.siteUrl).toBe(
      'sc-domain:merkurov.love'
    );
  });

  it('does not fabricate a site when the override is not in the account', () => {
    expect(chooseSearchConsoleSite(sites, { siteUrl: 'sc-domain:missing.example' })).toBeNull();
  });

  it('prefers an owner property and ignores unverified access', () => {
    const chosen = chooseSearchConsoleSite(
      [
        {
          siteUrl: 'sc-domain:merkurov.love',
          permissionLevel: 'siteUnverifiedUser',
        },
        ...sites,
      ],
      {}
    );

    expect(chosen?.siteUrl).toBe('https://www.merkurov.love/');
    expect(chosen?.permissionLevel).toBe('siteOwner');
  });
});

describe('refresh token retention', () => {
  it('keeps the existing encrypted refresh token when Google omits a new one', () => {
    const sealed = sealSecret('existing-refresh-token');
    const credential = resolveGoogleRefreshCredential({
      newRefreshToken: null,
      existing: {
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        token_key_version: sealed.keyVersion,
      },
    });

    expect(credential.refreshToken).toBe('existing-refresh-token');
    expect(credential.sealed?.ciphertext).toBe(sealed.ciphertext);
    expect(
      openSecret({
        ciphertext: credential.sealed?.ciphertext,
        iv: credential.sealed?.iv,
        tag: credential.sealed?.tag,
      })
    ).toBe('existing-refresh-token');
  });

  it('replaces the credential when Google returns a new refresh token', () => {
    const credential = resolveGoogleRefreshCredential({
      newRefreshToken: 'new-refresh-token',
      existing: null,
    });

    expect(credential.refreshToken).toBe('new-refresh-token');
    expect(
      openSecret({
        ciphertext: credential.sealed?.ciphertext,
        iv: credential.sealed?.iv,
        tag: credential.sealed?.tag,
      })
    ).toBe('new-refresh-token');
  });
});

describe('successful discovery persistence', () => {
  it('stores the Search Console site and permission level', async () => {
    const { store, rows } = fakeStore();

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/webmasters/v3/sites')) {
        throw new Error(`unexpected url ${url}`);
      }

      return jsonResponse({
        siteEntry: [
          { siteUrl: 'https://merkurov.love/', permissionLevel: 'siteRestrictedUser' },
          { siteUrl: 'https://www.merkurov.love/', permissionLevel: 'siteOwner' },
          { siteUrl: 'sc-domain:merkurov.love', permissionLevel: 'siteFullUser' },
        ],
      });
    }) as unknown as typeof fetch;

    const results = await runGoogleDiscovery(store, {
      accessToken: 'access-token',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      providers: ['search_console'],
    });

    expect(results[0]).toMatchObject({
      provider: 'search_console',
      status: 'connected',
      externalId: 'https://www.merkurov.love/',
    });
    expect(rows.get('search_console')).toMatchObject({
      provider: 'search_console',
      status: 'connected',
      external_id: 'https://www.merkurov.love/',
      account_label: 'https://www.merkurov.love/',
    });
    expect(
      (rows.get('search_console')?.external_meta as Record<string, unknown>)?.permission_level
    ).toBe('siteOwner');
    expect(
      (rows.get('search_console')?.external_meta as Record<string, unknown>)?.discovered_sites
    ).toHaveLength(3);
  });
});

describe('partial discovery persistence', () => {
  it('keeps GA4 connected when GSC fails, and preserves an existing GSC resource', async () => {
    const existingSealed = sealSecret('refresh-token');
    const { store, rows } = fakeStore({
      search_console: {
        provider: 'search_console',
        status: 'connected',
        account_label: 'https://www.merkurov.love/',
        external_id: 'https://www.merkurov.love/',
        external_meta: {
          permission_level: 'siteOwner',
          discovery: { last_success_at: '2026-11-01T00:00:00.000Z' },
        },
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        token_ciphertext: existingSealed.ciphertext,
        token_iv: existingSealed.iv,
        token_tag: existingSealed.tag,
        token_key_version: existingSealed.keyVersion,
      },
    });

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/accountSummaries')) {
        return jsonResponse({
          accountSummaries: [
            {
              displayName: 'Account',
              propertySummaries: [{ property: 'properties/222', displayName: 'Merkurov' }],
            },
          ],
        });
      }

      if (url.includes('/dataStreams')) {
        return jsonResponse({
          dataStreams: [
            {
              type: 'WEB_DATA_STREAM',
              webStreamData: { measurementId: 'G-J1F4ZTK9ND' },
            },
          ],
        });
      }

      if (url.includes('/webmasters/v3/sites')) {
        return jsonResponse(
          {
            error: {
              code: 403,
              status: 'PERMISSION_DENIED',
              message: 'Search Console API has not been used in project 123',
              details: [{ reason: 'SERVICE_DISABLED' }],
            },
          },
          403
        );
      }

      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;

    const results = await runGoogleDiscovery(store, {
      accessToken: 'access-token',
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
      sealed: existingSealed,
    });

    const ga = results.find((result) => result.provider === 'google_analytics');
    const gsc = results.find((result) => result.provider === 'search_console');

    expect(ga?.status).toBe('connected');
    expect(rows.get('google_analytics')).toMatchObject({
      status: 'connected',
      external_id: '222',
    });
    expect(gsc?.status).toBe('error');
    expect(gsc?.code).toBe('api_not_enabled');
    expect(rows.get('search_console')).toMatchObject({
      status: 'error',
      external_id: 'https://www.merkurov.love/',
      account_label: 'https://www.merkurov.love/',
    });
    expect(
      (rows.get('search_console')?.external_meta as Record<string, unknown>)?.discovery
    ).toMatchObject({
      status: 'error',
      code: 'api_not_enabled',
      http_status: 403,
      last_success_at: '2026-11-01T00:00:00.000Z',
    });
  });

  it('does not destroy an existing GA4 property when discovery becomes empty', async () => {
    const { store, rows } = fakeStore({
      google_analytics: {
        provider: 'google_analytics',
        status: 'connected',
        account_label: 'Account · Merkurov',
        external_id: '222',
        external_meta: {
          property_id: '222',
          discovery: { last_success_at: '2026-11-01T00:00:00.000Z' },
        },
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      },
    });

    global.fetch = jest.fn(async () =>
      jsonResponse({ accountSummaries: [] })
    ) as unknown as typeof fetch;

    const result = await runGoogleDiscovery(store, {
      accessToken: 'access-token',
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      providers: ['google_analytics'],
    });

    expect(result[0].status).toBe('discovery_empty');
    expect(rows.get('google_analytics')).toMatchObject({
      status: 'error',
      external_id: '222',
      account_label: 'Account · Merkurov',
    });
    expect(
      (rows.get('google_analytics')?.external_meta as Record<string, unknown>)?.property_id
    ).toBe('222');
  });
});
