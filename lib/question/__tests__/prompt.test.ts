import {
  buildQuestionSynthesisPrompt,
  QUESTION_CORPUS_CHAR_BUDGET,
  QUESTION_SYNTHESIS_SYSTEM_PROMPT,
} from '../prompt';
import { sanitizeQuestionSynthesis } from '../sanitize';

const question = { id: '11111111-1111-4111-8111-111111111111', text: 'В чём смысл жизни?' };

describe('Question synthesis prompt', () => {
  it('passes only anonymous answer text and the question', () => {
    const prompt = buildQuestionSynthesisPrompt({
      question,
      answers: ['Первый ответ без имени.', 'Второй ответ без email.'],
      totalAnswerCount: 2,
    });

    expect(prompt.user).toContain('В чём смысл жизни?');
    expect(prompt.user).toContain('Первый ответ без имени.');
    expect(prompt.user).toContain('[Ответ 1]');
    expect(prompt.user).not.toContain('user_id');
    expect(prompt.user).not.toContain('@');
    expect(prompt.system).toBe(QUESTION_SYNTHESIS_SYSTEM_PROMPT);
  });

  it('states when the context contains only part of the corpus', () => {
    const answers = Array.from(
      { length: 40 },
      (_, index) => `Ответ ${index} ${'а'.repeat(3000)}`
    );

    const prompt = buildQuestionSynthesisPrompt({
      question,
      answers,
      totalAnswerCount: 40,
    });

    expect(prompt.omittedAnswers).toBeGreaterThan(0);
    expect(prompt.user).toContain('Не делай вид, что видел остальные');
    expect(prompt.includedAnswers).toBeLessThan(40);
    expect(prompt.includedAnswers).toBeGreaterThan(0);
  });

  it('never exceeds the corpus budget by more than one answer', () => {
    const answers = Array.from(
      { length: 60 },
      (_, index) => `${index}:${'б'.repeat(2500)}`
    );
    const prompt = buildQuestionSynthesisPrompt({
      question,
      answers,
      totalAnswerCount: answers.length,
    });

    const includedLength = answers
      .slice(0, prompt.includedAnswers)
      .reduce((total, answer) => total + answer.length, 0);

    expect(includedLength).toBeLessThanOrEqual(QUESTION_CORPUS_CHAR_BUDGET + 2500);
  });

  it('requires the editorial constraints in the system prompt', () => {
    expect(QUESTION_SYNTHESIS_SYSTEM_PROMPT).toContain('Не выдумывай факты');
    expect(QUESTION_SYNTHESIS_SYSTEM_PROMPT).toContain('Не называй авторов');
    expect(QUESTION_SYNTHESIS_SYSTEM_PROMPT).toContain('таблицы');
    expect(QUESTION_SYNTHESIS_SYSTEM_PROMPT).toContain('Не утверждай, что «большинство»');
  });
});

describe('Question synthesis sanitizer', () => {
  it('keeps editorial Markdown', () => {
    const value = '# Заголовок\n\nАбзац с **мыслью** и *интонацией*.\n\n> Цитата без автора.';

    expect(sanitizeQuestionSynthesis(value)).toBe(value);
  });

  it('drops tables, code fences, images, HTML and scripts', () => {
    const value = [
      '# Ответ',
      '',
      '| метрика | значение |',
      '| --- | --- |',
      '| шум | 42 |',
      '',
      '```js',
      'alert(1)',
      '```',
      '',
      '![график](https://example.com/x.png)',
      '',
      '<script>alert(1)</script>',
      '',
      'Живая мысль остаётся.',
    ].join('\n');

    const clean = sanitizeQuestionSynthesis(value);

    expect(clean).toContain('# Ответ');
    expect(clean).toContain('Живая мысль остаётся.');
    expect(clean).not.toContain('|');
    expect(clean).not.toContain('alert(1)');
    expect(clean).not.toContain('![');
    expect(clean).not.toContain('<script>');
  });

  it('rejects empty or punctuation-only output', () => {
    expect(sanitizeQuestionSynthesis('   ')).toBe('');
    expect(sanitizeQuestionSynthesis('— ... !?')).toBe('');
    expect(sanitizeQuestionSynthesis(null)).toBe('');
  });

  it('caps stored synthesis length', () => {
    expect(sanitizeQuestionSynthesis('а'.repeat(30_000)).length).toBe(20_000);
  });
});
