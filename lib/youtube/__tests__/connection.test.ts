/** @jest-environment node */

import type { StoredConnection } from '@/lib/analytics/website/store';

import {
  createYouTubeTokenManager,
  hasYouTubeScopes,
  loadYouTubeConnectionState,
  missingYouTubeScopes,
} from '../connection';
import { YOUTUBE_ANALYTICS_READONLY_SCOPE, YOUTUBE_READONLY_SCOPE } from '../config';
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
