import {
  planIsNoop,
  planProjectConversationMerge,
  type MergeMessage,
} from '../mergePlan';

function message(
  id: string,
  conversationId: string,
  messageIndex: number,
  createdAt: string,
  content = id,
  role: 'user' | 'assistant' = 'user'
): MergeMessage {
  return { id, conversationId, messageIndex, createdAt, content, role };
}

describe('project conversation merge plan', () => {
  it('keeps every message in one continuous sequence without duplication', () => {
    const plan = planProjectConversationMerge('conv-a', [
      message('a2', 'conv-a', 2, '2026-01-02T10:00:00Z'),
      message('b1', 'conv-b', 1, '2026-01-01T10:00:00Z'),
      message('a1', 'conv-a', 1, '2026-01-01T09:00:00Z'),
    ]);

    expect(plan.messageCountBefore).toBe(3);
    expect(plan.messageCountAfter).toBe(3);
    expect(plan.duplicates).toBe(0);
    expect(plan.assignments.map((item) => [item.messageId, item.newMessageIndex])).toEqual([
      ['a1', 1],
      ['b1', 2],
      ['a2', 3],
    ]);
  });

  it('does not move an exact repeated message and records the duplicate', () => {
    const plan = planProjectConversationMerge('conv-a', [
      message('a1', 'conv-a', 1, '2026-01-01T10:00:00Z', 'Проверить выпуск'),
      message('b1', 'conv-b', 1, '2026-01-01T10:00:00Z', 'Проверить выпуск'),
    ]);

    expect(plan.messageCountAfter).toBe(1);
    expect(plan.duplicates).toBe(1);
    expect(plan.assignments[1]).toMatchObject({
      messageId: 'b1',
      skippedDuplicate: true,
      duplicateOf: 'a1',
      newMessageIndex: null,
    });
  });

  it('is a no-op when the canonical conversation is already contiguous', () => {
    const plan = planProjectConversationMerge('conv-a', [
      message('a1', 'conv-a', 1, '2026-01-01T10:00:00Z'),
      message('a2', 'conv-a', 2, '2026-01-02T10:00:00Z'),
    ]);

    expect(planIsNoop(plan)).toBe(true);
  });
});
