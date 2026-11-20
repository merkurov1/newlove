/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { consumeStoredLoginRedirect } from '../useSupabaseSession';

describe('consumeStoredLoginRedirect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('returns an internal stored path once and removes all redirect keys', () => {
    window.localStorage.setItem('login_redirect_path', '/journal?from=login');

    expect(consumeStoredLoginRedirect()).toBe('/journal?from=login');
    expect(window.localStorage.getItem('login_redirect_path')).toBeNull();
    expect(consumeStoredLoginRedirect()).toBeNull();
  });

  it('rejects an external stored path', () => {
    window.localStorage.setItem('login_redirect_path', 'https://evil.example/steal');

    expect(consumeStoredLoginRedirect()).toBeNull();
    expect(window.localStorage.getItem('login_redirect_path')).toBeNull();
  });

  it('rejects a protocol-relative stored path', () => {
    window.localStorage.setItem('supabase_oauth_redirect', '//evil.example/steal');

    expect(consumeStoredLoginRedirect()).toBeNull();
    expect(window.localStorage.getItem('supabase_oauth_redirect')).toBeNull();
  });
});
