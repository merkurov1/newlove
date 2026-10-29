/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import { appendPierrotMessage, createAssistantMessageId, recordPierrotEvent } from '../serverStore';

describe('Pierrot server store contracts', () => {
  it('derives a stable assistant message id for retries', () => {
    const first = createAssistantMessageId('conversation-1', 'user-message-1');
    const second = createAssistantMessageId('conversation-1', 'user-message-1');
    const different = createAssistantMessageId('conversation-1', 'user-message-2');

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^a_[a-f0-9]{40}$/);
  });

  it('passes the same message id to the atomic upsert on a retry', async () => {
    const rpc = jest.fn(async (..._args: unknown[]) => ({
      data: [{ sequence: 7, content: 'Stored reply', inserted: false }],
      error: null,
    }));

    const result = await appendPierrotMessage({ rpc } as never, {
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      messageId: 'user-message-1',
      role: 'user',
      content: 'Hello',
    });

    expect(result).toEqual({ sequence: 7, content: 'Stored reply', inserted: false });
    expect(rpc).toHaveBeenCalledWith(
      'pierrot_append_message',
      expect.objectContaining({
        p_message_id: 'user-message-1',
        p_conversation_id: 'conversation-1',
        p_session_id: 'session-1',
      })
    );
  });

  it('records events through the session-checked idempotent function', async () => {
    const rpc = jest.fn(async (..._args: unknown[]) => ({ data: true, error: null }));

    const inserted = await recordPierrotEvent({ rpc } as never, {
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      eventName: 'navigation_proposed',
      eventKey: 'navigation_proposed:navigation-1',
      payload: { section_id: 'art' },
    });

    expect(inserted).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'pierrot_record_event',
      expect.objectContaining({
        p_event_name: 'navigation_proposed',
        p_event_key: 'navigation_proposed:navigation-1',
        p_session_id: 'session-1',
      })
    );
  });
});
