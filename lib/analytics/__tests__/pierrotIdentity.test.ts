/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { summarizePierrotIdentity, type IdentityConversationRow } from '../pierrotIdentity';

function row(
  id: string,
  identity: 'owner' | 'visitor' | 'unknown',
  visitorId: string | null,
  startedAt = '2026-11-01T10:00:00.000Z',
  sessionId = `session-${id}`
): IdentityConversationRow {
  return {
    id,
    session_id: sessionId,
    identity_type: identity,
    visitor_id: visitorId,
    user_id: identity === 'owner' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : null,
    identity_source:
      identity === 'owner'
        ? 'supabase_session'
        : identity === 'visitor'
          ? 'visitor_local_storage'
          : 'anonymous',
    identity_verified_at: identity === 'owner' ? startedAt : null,
    start_page: identity === 'visitor' ? '/journal' : '/',
    referrer: identity === 'visitor' ? 'https://example.com' : null,
    started_at: startedAt,
  };
}

describe('Pierrot identity metrics', () => {
  it('separates owner, visitor and unknown, and excludes both from visitor totals', () => {
    const metrics = summarizePierrotIdentity(
      [
        row('o1', 'owner', null),
        row('v1', 'visitor', 'visitor-11111111'),
        row('v2', 'visitor', 'visitor-11111111', '2026-11-02T10:00:00.000Z'),
        row('v3', 'visitor', 'visitor-22222222'),
        row('u1', 'unknown', null),
        row('u2', 'unknown', null),
      ],
      new Set(['visitor-11111111'])
    );

    expect(metrics.ownerConversations).toBe(1);
    expect(metrics.visitorConversations).toBe(3);
    expect(metrics.unknownConversations).toBe(2);
    expect(metrics.uniqueVisitors).toBe(2);
    expect(metrics.newVisitors).toBe(1);
    expect(metrics.returningVisitors).toBe(1);
    expect(metrics.conversationsPerVisitor).toBe(1.5);
    expect(metrics.ownerTestsExcluded).toBe(1);
    expect(metrics.visitorEntryPages).toEqual([{ key: '/journal', value: 3 }]);
  });

  it('keeps new/returning unknown when history could not be checked', () => {
    const metrics = summarizePierrotIdentity([row('v1', 'visitor', 'visitor-11111111')], null);

    expect(metrics.newVisitors).toBeNull();
    expect(metrics.returningVisitors).toBeNull();
    expect(metrics.uniqueVisitors).toBe(1);
  });

  it('treats legacy rows without identity fields as unknown', () => {
    const metrics = summarizePierrotIdentity([
      {
        id: 'legacy',
        session_id: 'session-legacy',
        started_at: '2026-10-20T10:00:00.000Z',
      } as IdentityConversationRow,
    ]);

    expect(metrics.unknownConversations).toBe(1);
    expect(metrics.visitorConversations).toBe(0);
    expect(metrics.uniqueVisitors).toBe(0);
  });
});
