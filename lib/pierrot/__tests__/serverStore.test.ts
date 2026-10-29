/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import {
  appendPierrotMessage,
  createAssistantMessageId,
  loadPierrotHistory,
  recordPierrotEvent,
} from '../serverStore';

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

  it('loads chronological history only for an owned conversation', async () => {
    const maybeSingle = jest.fn(async () => ({ data: { id: 'conversation-1' }, error: null }));
    const limit = jest.fn(async (..._args: unknown[]) => ({
      data: [
        { role: 'assistant', content: 'Second' },
        { role: 'user', content: 'First' },
        { role: 'system', content: 'Ignored' },
      ],
      error: null,
    }));
    const order = jest.fn(() => ({ limit }));
    const eq2 = jest.fn(() => ({ maybeSingle }));
    const eq1 = jest.fn(() => ({ eq: eq2, order }));
    const select = jest.fn(() => ({ eq: eq1 }));
    const store = { from: jest.fn(() => ({ select })) } as never;

    const history = await loadPierrotHistory(store, 'conversation-1', 'session-1', 10);

    expect(history).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
    ]);
    expect(limit).toHaveBeenCalledWith(10);
  });

  it('returns an empty history when the session does not own the conversation', async () => {
    const maybeSingle = jest.fn(async () => ({ data: null, error: null }));
    const eq2 = jest.fn(() => ({ maybeSingle }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const select = jest.fn(() => ({ eq: eq1 }));
    const store = { from: jest.fn(() => ({ select })) } as never;

    await expect(loadPierrotHistory(store, 'conversation-1', 'other', 10)).resolves.toEqual([]);
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
