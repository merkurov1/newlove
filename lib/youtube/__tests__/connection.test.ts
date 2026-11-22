/** @jest-environment node */

import type { StoredConnection } from '@/lib/analytics/website/store';

import {
  createYouTubeTokenManager,
  hasYouTubeManagementScopes,
  hasYouTubeScopes,
  loadYouTubeConnectionState,
  missingYouTubeManagementScopes,
  missingYouTubeScopes,
} from '../connection';
import {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
} from '../config';
import { YouTubeError } from '../types';

jest.mock('@/lib/analytics/website/store', () => ({
  getStoredConnection: jest.fn(),
  markConnectionError: jest.fn(),
  updateConnectionSecret: jest.fn(),
}));

const storeModule = require('@/lib/analytics/website/store') as {
  getStoredConnection: jest.Mock;
};

const REQUIRED_SCOPES = [YOUTUBE_READONLY_SCOPE, YOUTUBE_ANALYTICS_READONLY_SCOPE];

function connection(overrides: Partial<StoredConnection> = {}): StoredConnection {
  return {
    id: 'conn-youtube',
    provider: 'youtube',
    status: 'connected',
    account_label: 'Shared channel',
    external_id: 'UC_shared',
    external_meta: {},
    scopes: REQUIRED_SCOPES,
    token_ciphertext: 'cipher',
    token_iv: 'iv',
    token_tag: 'tag',
    token_key_version: 'v1:test',
    connected_by: 'owner',
    connected_at: '2026-11-01T00:00:00.000Z',
    disabled_at: null,
    last_sync_at: null,
    last_sync_status: null,
    last_error_code: null,
    last_error_message: null,
    last_error_at: null,
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('YouTube OAuth scope validation', () => {
  it('requires both read-only scopes and never accepts monetary access', () => {
    expect(hasYouTubeScopes(REQUIRED_SCOPES)).toBe(true);
    expect(missingYouTubeScopes([YOUTUBE_READONLY_SCOPE])).toEqual([
      YOUTUBE_ANALYTICS_READONLY_SCOPE,
    ]);
    expect(hasYouTubeScopes([])).toBe(false);
  });

  it('requires both incremental management scopes without weakening analytics', () => {
    expect(hasYouTubeManagementScopes(YOUTUBE_MANAGEMENT_SCOPES)).toBe(true);
    expect(hasYouTubeManagementScopes([YOUTUBE_UPLOAD_SCOPE])).toBe(false);
    expect(missingYouTubeManagementScopes([YOUTUBE_UPLOAD_SCOPE])).toEqual([
      YOUTUBE_FORCE_SSL_SCOPE,
    ]);
    expect(hasYouTubeManagementScopes(REQUIRED_SCOPES)).toBe(false);
    expect(missingYouTubeManagementScopes(REQUIRED_SCOPES)).toEqual([
      YOUTUBE_UPLOAD_SCOPE,
      YOUTUBE_FORCE_SSL_SCOPE,
    ]);
    expect(hasYouTubeScopes(YOUTUBE_MANAGEMENT_SCOPES)).toBe(false);
    expect(missingYouTubeManagementScopes([YOUTUBE_FORCE_SSL_SCOPE])).toEqual([
      YOUTUBE_UPLOAD_SCOPE,
    ]);
  });
});

describe('on-demand YouTube token refresh', () => {
  it('refreshes once, caches the access token and never returns the refresh token', async () => {
    const refresh = jest.fn(async () => ({
      accessToken: 'access-1',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: REQUIRED_SCOPES.join(' '),
      tokenType: 'Bearer',
    }));
    const manager = createYouTubeTokenManager({
      readConnection: async () => connection(),
      refresh,
      open: () => 'refresh-secret',
      seal: () => ({
        ciphertext: 'new-cipher',
        iv: 'new-iv',
        tag: 'new-tag',
        keyVersion: 'v1:test',
      }),
      persistRotated: jest.fn(async () => undefined),
      markError: jest.fn(async () => undefined),
    });

    const first = await manager.getAccessToken();
    const second = await manager.getAccessToken();

    expect(first.accessToken).toBe('access-1');
    expect(second.accessToken).toBe('access-1');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('refresh-secret');
  });

  it('persists a rotated refresh token without exposing it', async () => {
    const persistRotated = jest.fn(async () => undefined);
    const manager = createYouTubeTokenManager({
      readConnection: async () => connection(),
      refresh: async () => ({
        accessToken: 'access-2',
        refreshToken: 'rotated-refresh',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        scope: REQUIRED_SCOPES.join(' '),
        tokenType: 'Bearer',
      }),
      open: () => 'old-refresh',
      seal: (value) => {
        expect(value).toBe('rotated-refresh');
        return {
          ciphertext: 'rotated-cipher',
          iv: 'rotated-iv',
          tag: 'rotated-tag',
          keyVersion: 'v1:test',
        };
      },
      persistRotated,
      markError: jest.fn(async () => undefined),
    });

    await manager.getAccessToken();

    expect(persistRotated).toHaveBeenCalledWith({
      ciphertext: 'rotated-cipher',
      iv: 'rotated-iv',
      tag: 'rotated-tag',
      keyVersion: 'v1:test',
    });
  });

  it('uses the separate management credential for write scopes', async () => {
    const open = jest.fn(() => 'management-refresh-secret');
    const refresh = jest.fn(async () => ({
      accessToken: 'management-access',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: [YOUTUBE_READONLY_SCOPE, ...YOUTUBE_MANAGEMENT_SCOPES].join(' '),
      tokenType: 'Bearer',
    }));
    const manager = createYouTubeTokenManager({
      readConnection: async () =>
        connection({
          scopes: [YOUTUBE_READONLY_SCOPE, ...YOUTUBE_MANAGEMENT_SCOPES],
          token_ciphertext: 'analytics-cipher',
          token_iv: 'analytics-iv',
          token_tag: 'analytics-tag',
          management_token_ciphertext: 'management-cipher',
          management_token_iv: 'management-iv',
          management_token_tag: 'management-tag',
        }),
      readCredential: (stored) => ({
        ciphertext: stored.management_token_ciphertext ?? null,
        iv: stored.management_token_iv ?? null,
        tag: stored.management_token_tag ?? null,
      }),
      refresh,
      open,
      seal: jest.fn(),
      persistRotated: jest.fn(),
      markError: jest.fn(),
    });

    const token = await manager.getAccessToken([
      YOUTUBE_READONLY_SCOPE,
      ...YOUTUBE_MANAGEMENT_SCOPES,
    ]);

    expect(token.accessToken).toBe('management-access');
    expect(open).toHaveBeenCalledWith({
      ciphertext: 'management-cipher',
      iv: 'management-iv',
      tag: 'management-tag',
    });
    expect(refresh).toHaveBeenCalledWith('management-refresh-secret');
  });

  it('asks for re-consent when the management grant was revoked', async () => {
    const manager = createYouTubeTokenManager({
      readConnection: async () => connection({ scopes: REQUIRED_SCOPES }),
      readCredential: () => ({
        ciphertext: 'management-cipher',
        iv: 'management-iv',
        tag: 'management-tag',
      }),
      refresh: jest.fn(),
      open: () => 'management-refresh-secret',
      seal: jest.fn(),
      persistRotated: jest.fn(),
      markError: jest.fn(async () => undefined),
    });

    await expect(
      manager.getAccessToken([YOUTUBE_READONLY_SCOPE, ...YOUTUBE_MANAGEMENT_SCOPES])
    ).rejects.toMatchObject({
      code: 'insufficient_permissions',
      requiredScopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_FORCE_SSL_SCOPE],
    });
  });

  it('reports insufficient permissions instead of silently returning empty analytics', async () => {
    const markError = jest.fn(async () => undefined);
    const manager = createYouTubeTokenManager({
      readConnection: async () => connection({ scopes: [YOUTUBE_READONLY_SCOPE] }),
      refresh: jest.fn(),
      open: () => 'refresh-secret',
      seal: jest.fn(),
      persistRotated: jest.fn(),
      markError,
    });

    await expect(manager.getAccessToken()).rejects.toMatchObject<YouTubeError>({
      code: 'insufficient_permissions',
      requiredScopes: [YOUTUBE_ANALYTICS_READONLY_SCOPE],
    });
    expect(markError).toHaveBeenCalledWith('insufficient_permissions', expect.any(String));
  });

  it('never exposes token ciphertext in owner-facing connection state', async () => {
    storeModule.getStoredConnection.mockResolvedValue(
      connection({
        token_ciphertext: 'secret-ciphertext',
        token_iv: 'secret-iv',
        token_tag: 'secret-tag',
      })
    );

    const state = await loadYouTubeConnectionState({} as never);
    const serialized = JSON.stringify(state);

    expect(state.channelId).toBe('UC_shared');
    expect(state).not.toHaveProperty('token_ciphertext');
    expect(state).not.toHaveProperty('scopes_plaintext');
    expect(serialized).not.toContain('secret-ciphertext');
    expect(serialized).not.toContain('secret-iv');
    expect(serialized).not.toContain('secret-tag');
  });

  it('distinguishes no connection from an expired refresh token', async () => {
    const noConnection = createYouTubeTokenManager({
      readConnection: async () => null,
      refresh: jest.fn(),
      open: jest.fn(),
      seal: jest.fn(),
      persistRotated: jest.fn(),
      markError: jest.fn(),
    });

    await expect(noConnection.getAccessToken()).rejects.toMatchObject({ code: 'not_connected' });

    const noToken = createYouTubeTokenManager({
      readConnection: async () => connection({ token_ciphertext: null, token_tag: null }),
      refresh: jest.fn(),
      open: () => null,
      seal: jest.fn(),
      persistRotated: jest.fn(),
      markError: jest.fn(),
    });

    await expect(noToken.getAccessToken()).rejects.toMatchObject({
      code: 'needs_reauthorization',
    });
  });
});
