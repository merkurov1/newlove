import {
  countQuestionWords,
  isQuestionId,
  safeQuestionReturnPath,
  validateQuestionAnswer,
} from '../validation';

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `слово${index + 1}`).join(' ');
}

describe('question answer validation', () => {
  it('requires at least 25 words', () => {
    expect(validateQuestionAnswer(words(24))).toMatchObject({
      ok: false,
      reason: 'too_short',
      wordCount: 24,
    });

    expect(validateQuestionAnswer(words(25))).toMatchObject({
      ok: true,
      wordCount: 25,
    });
  });

  it('rejects empty and whitespace-only answers', () => {
    expect(validateQuestionAnswer('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateQuestionAnswer('   \n\t  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateQuestionAnswer(null)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('rejects an answer above the character limit', () => {
    const content = `${words(25)} ${'x'.repeat(6000)}`;
    expect(validateQuestionAnswer(content)).toMatchObject({
      ok: false,
      reason: 'too_long',
    });
  });

  it('rejects an answer above the word limit', () => {
    expect(validateQuestionAnswer(words(901))).toMatchObject({
      ok: false,
      reason: 'too_long',
    });
  });

  it('trims the stored answer and counts Cyrillic, hyphens and apostrophes as words', () => {
    const content = `  ${words(24)} по-настоящему d’artagnan  `;
    const result = validateQuestionAnswer(content);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.startsWith('слово1')).toBe(true);
      expect(result.content.endsWith('d’artagnan')).toBe(true);
      expect(result.wordCount).toBe(26);
    }

    expect(countQuestionWords('— ... !?')).toBe(0);
  });

  it('accepts only UUID question ids', () => {
    expect(isQuestionId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isQuestionId('not-a-uuid')).toBe(false);
    expect(isQuestionId('11111111-1111-4111-8111-111111111111 or 1=1')).toBe(false);
  });

  it('keeps login returns on /question only', () => {
    expect(safeQuestionReturnPath('/question?q=11111111-1111-4111-8111-111111111111')).toBe(
      '/question?q=11111111-1111-4111-8111-111111111111'
    );
    expect(safeQuestionReturnPath('//evil.example/question')).toBeNull();
    expect(safeQuestionReturnPath('/admin')).toBeNull();
    expect(safeQuestionReturnPath('/question/../admin')).toBeNull();
    expect(safeQuestionReturnPath('https://evil.example/question')).toBeNull();
  });
});
