export type BrainExampleQuestion = {
  label: string;
  prompt: string;
};

export type BrainLanguage = 'ru' | 'en';

const ACTIVATION_PHRASES = new Set([
  'включи мозг',
  'включи мозги',
  'включи свой мозг',
  'включи свои мозги',
  'включить мозг',
  'включить мозги',
  'включить свой мозг',
  'вруби мозг',
  'врубить мозг',
  'активируй мозг',
  'активировать мозг',
  'мозг включи',
  'мозги включи',
  'режим мозга',
  'мозг режим',
  'turn on brain',
  'turn on the brain',
  'turn on your brain',
  'switch on brain',
  'switch on the brain',
  'switch on your brain',
  'enable brain',
  'enable the brain',
  'activate brain',
  'activate the brain',
  'activate your brain',
  'activate brain mode',
  'brain mode',
  'brain mode on',
  'brain on',
  'start brain',
  'start the brain',
]);

const POLITE_PREFIX = /^(pierrot|пьеро|please|пожалуйста)\s+/;
const POLITE_SUFFIX = /\s+(please|пожалуйста)$/;

/**
 * Matches the explicit owner phrase that reveals the Brain control. It is
 * intentionally exact: ordinary questions containing the word "brain" must not
 * unlock the private mode.
 */
export function isBrainActivationPhrase(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;

  const withoutPoliteness = normalized
    .replace(POLITE_PREFIX, '')
    .replace(POLITE_SUFFIX, '')
    .trim();

  return ACTIVATION_PHRASES.has(normalized) || ACTIVATION_PHRASES.has(withoutPoliteness);
}

const EXAMPLE_QUESTIONS: Record<BrainLanguage, BrainExampleQuestion[]> = {
  ru: [
    {
      label: 'Главные темы',
      prompt: 'Какие главные темы повторяются в моих текстах?',
    },
    {
      label: 'Связи между текстами',
      prompt: 'Как связаны разные материалы в базе знаний?',
    },
    {
      label: 'Противоречия',
      prompt: 'Какие идеи в моих текстах противоречат друг другу?',
    },
    {
      label: 'Моя позиция',
      prompt: 'Какова моя позиция по ключевым вопросам?',
    },
    {
      label: 'Открытые вопросы',
      prompt: 'Какие вопросы мои тексты оставляют открытыми?',
    },
  ],
  en: [
    {
      label: 'Main themes',
      prompt: 'What are the main themes that recur across my texts?',
    },
    {
      label: 'Connections',
      prompt: 'How are the different pieces in the knowledge base connected?',
    },
    {
      label: 'Contradictions',
      prompt: 'Which ideas in my texts contradict each other?',
    },
    {
      label: 'My position',
      prompt: 'What is my position on the key questions?',
    },
    {
      label: 'Open questions',
      prompt: 'What questions do my texts leave open?',
    },
  ],
};

export function getBrainExampleQuestions(language: BrainLanguage): BrainExampleQuestion[] {
  return EXAMPLE_QUESTIONS[language].map((question) => ({ ...question }));
}

export function getBrainIntroText(language: BrainLanguage): string {
  return language === 'ru'
    ? 'Мозг включён. Пять вопросов, с которых имеет смысл начать:'
    : 'Brain is on. Five questions worth starting with:';
}

export function getBrainAvailableText(language: BrainLanguage): string {
  return language === 'ru'
    ? 'Мозг доступен. Нажмите кнопку Brain вверху, чтобы включить его.'
    : 'Brain is available. Use the Brain button above to turn it on.';
}
