/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { classifyTrafficPath, isInternalPath, isPublicPath } from '../traffic';

describe('Analytics traffic classification', () => {
  it.each([
    '/admin/pierrot',
    '/admin/pierrot/analytics',
    '/pierrot/ios',
    '/api/admin/analytics',
    '/_next/static/chunk.js',
    '/robots.txt',
    '/?preview=1',
  ])('classifies internal path %s', (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each(['/', '/journal', '/flow', '/media/record/example', '/letters'])(
    'keeps public path %s',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
      expect(classifyTrafficPath(path)).toBe('public');
    }
  );

  it('separates owner/admin from automated traffic', () => {
    expect(classifyTrafficPath('/admin/pierrot')).toBe('owner_admin');
    expect(classifyTrafficPath('/api/admin/analytics')).toBe('automated');
  });
});
