/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  isMissingIdentityColumn,
  normalizePierrotVisitorId,
  resolvePierrotIdentity,
} from '../identity';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const visitorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Pierrot identity resolution', () => {
  it('gives a verified owner precedence over a visitor pseudonym', () => {
    expect(
      resolvePierrotIdentity({
        ownerAuthorized: true,
        ownerUserId: userId,
        ownerSource: 'supabase_session',
        visitorId,
        visitorAllowed: true,
      })
    ).toMatchObject({
      type: 'owner',
      userId,
      visitorId: null,
      source: 'supabase_session',
    });
  });

  it('keeps a Telegram owner without a UUID user id', () => {
    expect(
      resolvePierrotIdentity({
        ownerAuthorized: true,
        ownerUserId: 'telegram-12345',
        ownerSource: 'telegram_owner',
        visitorId,
        visitorAllowed: true,
      })
    ).toMatchObject({
      type: 'owner',
      userId: null,
      visitorId: null,
      source: 'telegram_owner',
    });
  });

  it('creates a visitor only with consent and a valid pseudonym', () => {
    expect(
      resolvePierrotIdentity({
        ownerAuthorized: false,
        visitorId,
        visitorAllowed: true,
      })
    ).toMatchObject({ type: 'visitor', visitorId, source: 'visitor_local_storage' });

    expect(
      resolvePierrotIdentity({
        ownerAuthorized: false,
        visitorId,
        visitorAllowed: false,
      })
    ).toEqual({
      type: 'unknown',
      userId: null,
      visitorId: null,
      source: 'anonymous',
      verifiedAt: null,
    });
  });

  it('never accepts an invalid or client-shaped visitor id', () => {
    expect(normalizePierrotVisitorId('owner')).toBeNull();
    expect(normalizePierrotVisitorId('is_owner=true')).toBeNull();
    expect(
      resolvePierrotIdentity({
        ownerAuthorized: false,
        visitorId: 'owner',
        visitorAllowed: true,
      }).type
    ).toBe('unknown');
  });

  it('recognises missing attribution columns for the pre-migration fallback', () => {
    expect(
      isMissingIdentityColumn({
        code: 'PGRST204',
        message: "Could not find the 'visitor_id' column",
      })
    ).toBe(true);
    expect(isMissingIdentityColumn({ code: '23505', message: 'duplicate' })).toBe(false);
  });
});
