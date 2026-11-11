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

  it('writes history/session provenance through the v2 append function', async () => {
    const rpc = jest.fn(async (..._args: unknown[]) => ({
      data: [{ sequence: 9, content: 'Scoped reply', inserted: true, history_sequence: 41 }],
      error: null,
    }));

    const result = await appendPierrotMessage({ rpc } as never, {
      conversationId: 'main-conversation',
      sessionId: 'conversation-token',
      historyId: '11111111-1111-4111-8111-111111111111',
      episodeId: '22222222-2222-4222-8222-222222222222',
      messageId: 'user-message-2',
      role: 'user',
      content: 'Hello again',
    });

    expect(result).toEqual({
      sequence: 9,
      content: 'Scoped reply',
      inserted: true,
      historySequence: 41,
    });
    expect(rpc).toHaveBeenCalledWith(
      'pierrot_append_message_v2',
      expect.objectContaining({
        p_conversation_id: 'main-conversation',
        p_history_id: '11111111-1111-4111-8111-111111111111',
        p_episode_id: '22222222-2222-4222-8222-222222222222',
      })
    );
  });

  it('stores a validated structured response next to the transcript', async () => {
    const rpc = jest.fn(async (..._args: unknown[]) => ({
      data: [{ sequence: 10, content: 'Markdown fallback', inserted: true }],
      error: null,
    }));
    const eqConversation = jest.fn(async () => ({ error: null }));
    const eq = jest.fn(() => ({ eq: eqConversation }));
    const update = jest.fn(() => ({ eq }));
    const store = { rpc, from: jest.fn(() => ({ update })) } as never;

    const response = {
      version: 1,
      language: 'ru',
      blocks: [{ type: 'text', markdown: 'Короткий ответ.' }],
    };

    await appendPierrotMessage(store, {
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      role: 'assistant',
      content: 'Markdown fallback',
      metadata: { response },
    });

    expect(update).toHaveBeenCalledWith({ metadata: { response } });
    expect(eq).toHaveBeenCalledWith('id', 'assistant-1');
  });

  it('loads chronological history only for an owned conversation', async () => {
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
