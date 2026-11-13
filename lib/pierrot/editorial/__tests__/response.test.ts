import {
  appendTruncationNotice,
  editorialContinuationInstruction,
  isTruncatedFinishReason,
} from '../response';

describe('editorial response safety', () => {
  it('O. detects a truncated generation and marks it explicitly', () => {
    expect(isTruncatedFinishReason('length')).toBe(true);
    expect(isTruncatedFinishReason('stop')).toBe(false);
    expect(isTruncatedFinishReason(null)).toBe(false);

    const result = appendTruncationNotice('Первая часть анализа.', 'ru', 'length');
    expect(result.truncated).toBe(true);
    expect(result.reply).toContain('оборван по лимиту');
    expect(result.reply).toContain('продолжай');
    expect(result.reply).not.toContain('Первая часть анализа._\n\n_Первая');
  });

  it('does not modify a complete response', () => {
    const result = appendTruncationNotice('Полный ответ.', 'en', 'stop');
    expect(result.truncated).toBe(false);
    expect(result.reply).toBe('Полный ответ.');
  });

  it('adds a no-repeat instruction only for a real follow-up', () => {
    expect(editorialContinuationInstruction('ru', true)).toContain('не повторяя');
    expect(editorialContinuationInstruction('en', true)).toContain('without repeating');
    expect(editorialContinuationInstruction('ru', false)).toBeNull();
  });
});
