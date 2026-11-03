/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  loginReturnPathFromReferrer,
  resolveLoginReturnPath,
  safeLoginReturnPath,
} from '../returnPath';

describe('login return path', () => {
  it('prefers an explicit internal next path', () => {
    expect(
      resolveLoginReturnPath({
        requested: '/journal?from=login',
        stored: '/art-engine',
        fallback: '/art-engine',
      })
    ).toBe('/journal?from=login');
  });

  it('uses the stored path when next is absent', () => {
    expect(
      resolveLoginReturnPath({
        stored: '/art-engine',
        fallback: '/art-engine',
      })
    ).toBe('/art-engine');
  });

  it('uses a same-origin referrer path', () => {
    expect(
      loginReturnPathFromReferrer('https://merkurov.love/flow/join?x=1', 'https://merkurov.love')
    ).toBe('/flow/join?x=1');
  });

  it('rejects external, protocol-relative, login loops and backslash paths', () => {
    expect(safeLoginReturnPath('https://evil.example')).toBeNull();
    expect(safeLoginReturnPath('//evil.example')).toBeNull();
    expect(safeLoginReturnPath('/\\evil.example')).toBeNull();
    expect(safeLoginReturnPath('/login?next=/art-engine')).toBeNull();
    expect(
      loginReturnPathFromReferrer('https://evil.example/x', 'https://merkurov.love')
    ).toBeNull();
  });

  it('falls back safely when nothing valid is available', () => {
    expect(resolveLoginReturnPath({})).toBe('/art-engine');
  });
});
