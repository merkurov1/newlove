import {
  dropTrailingDuplicateTurn,
  selectRecentHistoryWindow,
  type NormalizedHistoryItem,
} from '../historyWindow';

describe('Pierrot context assembly', () => {
  it('keeps the newest turns when an older message exhausts the character budget', () => {
    const history: NormalizedHistoryItem[] = [
      { role: 'user', content: 'OLD '.repeat(60) },
      { role: 'assistant', content: 'recent assistant answer' },
      { role: 'user', content: 'the actual current topic' },
    ];

    const window = selectRecentHistoryWindow(history, 24, 80, 4_000);

    expect(window.map((item) => item.content)).toEqual([
      'recent assistant answer',
      'the actual current topic',
    ]);
  });

  it('never exceeds the item, item-count or character budget', () => {
    const history: NormalizedHistoryItem[] = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index} ${'x'.repeat(50)}`,
    }));

    const window = selectRecentHistoryWindow(history, 4, 120, 20);

    expect(window.length).toBeLessThanOrEqual(4);
    expect(window.reduce((total, item) => total + item.content.length, 0)).toBeLessThanOrEqual(120);
    expect(window.every((item) => item.content.length <= 20)).toBe(true);
    expect(window[window.length - 1]?.content.startsWith('message-9')).toBe(true);
  });

  it('drops a stored copy of the current turn when the same user message is retried', () => {
    const stored: NormalizedHistoryItem[] = [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: '  same retried question  ' },
    ];

    const window = dropTrailingDuplicateTurn(stored, 'same retried question');

    expect(window).toEqual([
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ]);
  });

  it('keeps a distinct last turn intact', () => {
    const stored: NormalizedHistoryItem[] = [{ role: 'user', content: 'different question' }];

    expect(dropTrailingDuplicateTurn(stored, 'new question')).toEqual(stored);
  });
});
