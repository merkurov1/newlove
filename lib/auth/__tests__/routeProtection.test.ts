/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { needsAuthRefresh } from '../routeProtection';

describe('middleware auth refresh scope', () => {
  it.each(['/admin', '/admin/pierrot', '/profile', '/research/telegram', '/heartandangel/world'])(
    'refreshes protected route %s',
    (path) => expect(needsAuthRefresh(path)).toBe(true)
  );

  it.each(['/', '/lots', '/media', '/flow', '/journal', '/letters', '/pierrot'])(
    'does not refresh public route %s',
    (path) => expect(needsAuthRefresh(path)).toBe(false)
  );

  it('does not match a protected prefix inside another path', () => {
    expect(needsAuthRefresh('/administration')).toBe(false);
  });
});
