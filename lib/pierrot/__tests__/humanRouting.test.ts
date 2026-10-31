/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { planOwnerHumanRouting } from '../humanRouting';
import type { HumanPresenceRecord, HumanRequestRow } from '../humanPresence';

function request(status: HumanRequestRow['status']): HumanRequestRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    status,
    access_token_hash: 'a'.repeat(64),
    visitor_label: '#A821',
    start_page: '/lobby',
    context_summary: null,
    language: 'ru',
    resolved_by: null,
    telegram_chat_id: 123456789,
    telegram_message_id: 77,
    telegram_status_message_id: 77,
    created_at: '2026-10-30T10:00:00.000Z',
    updated_at: '2026-10-30T10:00:00.000Z',
    expires_at: '2026-10-30T10:20:00.000Z',
    accepted_at: status === 'active' ? '2026-10-30T10:01:00.000Z' : null,
    declined_at: null,
    closed_at: null,
    expired_at: null,
  };
}

function record(status: HumanRequestRow['status']): HumanPresenceRecord {
  return {
    request: request(status),
    session:
      status === 'active'
        ? {
            id: '55555555-5555-4555-8555-555555555555',
            request_id: '11111111-1111-4111-8111-111111111111',
            conversation_id: '22222222-2222-4222-8222-222222222222',
            owner_telegram_id: 123456789,
            status: 'active',
            opened_at: '2026-10-30T10:01:00.000Z',
            closed_at: null,
            closed_by: null,
          }
        : null,
    conversationSessionId: '33333333-3333-4333-8333-333333333333',
  };
}

describe('owner human routing', () => {
  it('prefers the Reply anchor over an active session', () => {
    const plan = planOwnerHumanRouting({
      replyTarget: record('active'),
      activeTarget: record('active'),
      pendingTarget: record('pending'),
    });

    expect(plan?.source).toBe('reply');
    expect(plan?.autoAccept).toBe(false);
  });

  it('routes plain text to the single active session without a Reply', () => {
    const plan = planOwnerHumanRouting({
      activeTarget: record('active'),
      pendingTarget: record('pending'),
    });

    expect(plan?.source).toBe('active');
    expect(plan?.autoAccept).toBe(false);
  });

  it('auto-accepts the only pending request when no session is active', () => {
    const plan = planOwnerHumanRouting({ pendingTarget: record('pending') });

    expect(plan?.source).toBe('pending');
    expect(plan?.autoAccept).toBe(true);
  });

  it('does not invent a target when nothing is waiting', () => {
    expect(planOwnerHumanRouting({})).toBeNull();
  });

  it('returns a closed reply target so the bot can report the closure', () => {
    const plan = planOwnerHumanRouting({ replyTarget: record('closed') });

    expect(plan?.source).toBe('reply');
    expect(plan?.autoAccept).toBe(false);
    expect(plan?.target.request.status).toBe('closed');
  });
});
