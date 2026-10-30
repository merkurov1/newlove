/** @jest-environment node */

import {
  getBrainAvailableText,
  getBrainExampleQuestions,
  getBrainIntroText,
  isBrainActivationPhrase,
} from '../brain';

describe('Brain activation phrase', () => {
  it.each([
    'включи мозг',
    'Включи мозг!',
    'Пожалуйста, включи мозг',
    'включи свой мозг',
    'включить мозги',
    'Пьеро, включи мозг',
    'активируй мозг',
    'режим мозга',
    'turn on brain',
    'Turn on the brain.',
    'turn on your brain',
    'please enable the brain',
    'activate brain mode',
    'brain on',
    'switch on the brain',
  ])('recognises %s', (phrase) => {
    expect(isBrainActivationPhrase(phrase)).toBe(true);
  });

  it.each([
    'what do you think about the brain?',
    'расскажи про мозг',
    'turn on the light',
    'brain',
    'мозг',
    'I read UNFRAMED',
  ])('does not unlock on unrelated text: %s', (phrase) => {
    expect(isBrainActivationPhrase(phrase)).toBe(false);
  });
});

describe('Brain example questions', () => {
  it.each(['ru', 'en'] as const)('returns five unique questions in %s', (language) => {
    const questions = getBrainExampleQuestions(language);

    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(5);
    expect(questions.every((question) => question.label.length > 0)).toBe(true);
    expect(questions.every((question) => question.prompt.endsWith('?'))).toBe(true);
  });

  it('uses the requested language for the intro and availability text', () => {
    expect(getBrainIntroText('ru')).toMatch(/Мозг/);
    expect(getBrainIntroText('en')).toMatch(/Brain/);
    expect(getBrainAvailableText('ru')).toMatch(/кнопку Brain/);
    expect(getBrainAvailableText('en')).toMatch(/Brain button/);
  });
});
