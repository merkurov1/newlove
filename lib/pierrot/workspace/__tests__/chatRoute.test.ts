/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { resolveChatRouteParams, firstChatParam } from '../chatRoute';

describe('Pierrot chat route params', () => {
  it('unwraps the Promise Next.js passes to a server page', async () => {
    const params = Promise.resolve({
      project: 'heart-and-angel',
      history: 'history-1',
      session: 'session-1',
      conversation: 'conversation-1',
      new: '1',
    });

    await expect(resolveChatRouteParams(params)).resolves.toEqual({
      historyId: 'history-1',
      sessionId: 'session-1',
      conversationId: 'conversation-1',
      projectRef: 'heart-and-angel',
      startNew: true,
    });
  });

  it('documents the original failure: a Promise has no query properties', () => {
    // This is exactly what the page used to do. Next.js 16 supplies a
    // Promise, so every property read was undefined and every deep link fell
    // back to MAIN.
    const nextSearchParams = Promise.resolve({ project: 'heart-and-angel' }) as unknown as {
      project?: string;
    };
    expect(nextSearchParams.project).toBeUndefined();
  });

  it('accepts a plain object, arrays and an absent value', async () => {
    await expect(
      resolveChatRouteParams({
        history: ['history-2', 'history-ignored'],
        session: ['session-2'],
        new: '0',
      })
    ).resolves.toMatchObject({
      historyId: 'history-2',
      sessionId: 'session-2',
      startNew: false,
    });

    await expect(resolveChatRouteParams(undefined)).resolves.toEqual({
      historyId: '',
      sessionId: '',
      conversationId: '',
      projectRef: '',
      startNew: false,
    });
  });

  it('resolves each history entry independently for back/forward navigation', async () => {
    const first = await resolveChatRouteParams(
      Promise.resolve({ history: 'history-alpha', session: 'session-alpha' })
    );
    const second = await resolveChatRouteParams(
      Promise.resolve({ history: 'history-beta', session: 'session-beta' })
    );

    expect(first).toMatchObject({
      historyId: 'history-alpha',
      sessionId: 'session-alpha',
    });
    expect(second).toMatchObject({
      historyId: 'history-beta',
      sessionId: 'session-beta',
    });
    expect(first).not.toEqual(second);
  });

  it('normalizes empty and repeated query values deterministically', () => {
    expect(firstChatParam(undefined)).toBe('');
    expect(firstChatParam([])).toBe('');
    expect(firstChatParam(['first', 'second'])).toBe('first');
  });
});
