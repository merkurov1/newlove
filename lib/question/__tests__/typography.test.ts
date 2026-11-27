/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { isLongQuestionText, QUESTION_LONG_TEXT_MIN_CHARS } from '../typography';

const css = fs.readFileSync(
  path.join(process.cwd(), 'components/question/question.module.css'),
  'utf8'
);

// Real shapes from the seeded bank and from restored production questions.
const SEEDED_SHORT_QUESTIONS = [
  'В чём смысл жизни?',
  'Должна ли у каждого человека быть возможность начать жизнь с чистого листа?',
  'Почему люди продолжают верить в то, что заведомо не соответствует действительности?',
];

const RESTORED_LONG_QUESTIONS = [
  'тот кто делает вид, что понимает, выглядит, как правило, гораздо убедительней того кто понимает? типа в коммуникации хитрая риторика кроет наивную компетентность?',
  'кто, как правило, судит тебя (твои действия и результаты) строже (не путать с заинтересованностью), ты сам или другие?',
  'при попытке овладеть новой деятельностью, во внутреннем диалоге можно разглядеть (осознать) и "тренера" и "тренирующегося".  при этом, "тренирующийся" меняется гораздо интенсивнее чем "тренер". Как понять, что пришла пора менять тренера? и как сделать такую замену надёжной и адекватной?',
];

describe('question typography', () => {
  it('keeps ordinary short questions in the original display scale', () => {
    expect(isLongQuestionText('В чём смысл жизни?')).toBe(false);
    expect(isLongQuestionText('а'.repeat(QUESTION_LONG_TEXT_MIN_CHARS))).toBe(false);

    for (const text of SEEDED_SHORT_QUESTIONS) {
      expect(text.length).toBeLessThanOrEqual(QUESTION_LONG_TEXT_MIN_CHARS);
      expect(isLongQuestionText(text)).toBe(false);
    }
  });

  it('marks long questions for the calmer reading scale', () => {
    expect(isLongQuestionText('а'.repeat(QUESTION_LONG_TEXT_MIN_CHARS + 1))).toBe(true);

    for (const text of RESTORED_LONG_QUESTIONS) {
      expect(text.length).toBeGreaterThan(QUESTION_LONG_TEXT_MIN_CHARS);
      expect(isLongQuestionText(text)).toBe(true);
    }
  });

  it('calms restored single-line questions that used to render as a poster', () => {
    // 162 characters, no authored line breaks: the old 180-character cutoff
    // kept it at the display size and it took ten lines on a phone.
    const text =
      'тот кто делает вид, что понимает, выглядит, как правило, гораздо убедительней того кто понимает? типа в коммуникации хитрая риторика кроет наивную компетентность?';

    expect(text).not.toContain('\n');
    expect(isLongQuestionText(text)).toBe(true);
  });

  it('calms multi-paragraph questions without changing their text', () => {
    const text = 'Первый абзац.\n\nВторой абзац.';

    expect(isLongQuestionText(text)).toBe(true);
    expect(text).toBe('Первый абзац.\n\nВторой абзац.');
  });

  it('handles CRLF input without mutating the stored wording', () => {
    const text = 'Первый абзац.\r\n\r\nВторой абзац.';

    expect(isLongQuestionText(text)).toBe(true);
    expect(text).toContain('\r\n\r\n');
  });

  it('renders verbatim whitespace and lowers the long-question scale', () => {
    expect(css).toMatch(/\.question\s*\{[^}]*white-space:\s*pre-wrap/s);
    expect(css).toMatch(/\.questionLong\s*\{[^}]*max-width:\s*46rem/s);
    expect(css).toMatch(/\.questionLong\s*\{[^}]*line-height:\s*1\.42/s);
    expect(css).toMatch(/\.questionLong\s*\{[^}]*font-size:\s*clamp\(1\.55rem/s);
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.questionLong\s*\{[^}]*font-size:\s*clamp\(1\.35rem/s
    );
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.questionLong\s*\{[^}]*line-height:\s*1\.46/s
    );
  });
});
