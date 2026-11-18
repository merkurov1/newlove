/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { isLongQuestionText, QUESTION_LONG_TEXT_MIN_CHARS } from '../typography';

const css = fs.readFileSync(
  path.join(process.cwd(), 'components/question/question.module.css'),
  'utf8'
);

describe('question typography', () => {
  it('keeps ordinary short questions in the original display scale', () => {
    expect(isLongQuestionText('В чём смысл жизни?')).toBe(false);
    expect(isLongQuestionText('а'.repeat(QUESTION_LONG_TEXT_MIN_CHARS))).toBe(false);
  });

  it('marks long questions for the calmer reading scale', () => {
    expect(isLongQuestionText('а'.repeat(QUESTION_LONG_TEXT_MIN_CHARS + 1))).toBe(true);
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
    expect(css).toMatch(/\.questionLong\s*\{[^}]*font-size:\s*clamp\(1\.55rem/s);
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.questionLong\s*\{[^}]*font-size:\s*clamp\(1\.35rem/s
    );
  });
});
