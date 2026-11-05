import type { PierrotChatAction } from './navigation';

export type PierrotLanguage = 'ru' | 'en';

export type PierrotStarter = {
  id: string;
  title: string;
  description: string;
  action: PierrotChatAction;
};

/**
 * The public greeting is intentionally not a catalogue. It explains what
 * Pierrot can do and lets the visitor start a real conversation; concrete
 * projects and offers are introduced later by the existing commercial planner
 * when the visitor's intent justifies them.
 */
export function getPierrotGreeting(language: PierrotLanguage): string {
  if (language === 'ru') {
    return [
      'Я Пьеро — тень Антона Меркурова, проводник по этому сайту и хранитель нескольких дверей.',
      'Спроси своими словами о его работе, искусстве, книге или Journal. Отвечаю прямо — и предлагаю что-то только когда это действительно уместно.',
    ].join('\n\n');
  }

  return [
    'I am Pierrot — Anton Merkurov’s shadow, guide through this site, and keeper of a few doors.',
    'Ask in your own words about his work, the art, the book, or the Journal. I answer plainly — and mention an offer only when it genuinely fits.',
  ].join('\n\n');
}

export function getPierrotStarters(language: PierrotLanguage): PierrotStarter[] {
  if (language === 'ru') {
    return [
      {
        id: 'anton',
        title: 'Кто такой Антон?',
        description: 'Работа, метод, архив.',
        action: {
          kind: 'prompt',
          label: 'Кто такой Антон?',
          prompt: 'Кто такой Антон Меркуров и чем он известен?',
        },
      },
      {
        id: 'art',
        title: 'Искусство и Heart',
        description: 'Heart & Angel, Art Engine, Temple.',
        action: {
          kind: 'prompt',
          label: 'Искусство и Heart',
          prompt: 'Расскажи о Heart & Angel и Art Engine, включая Temple.',
        },
      },
      {
        id: 'unframed',
        title: 'UNFRAMED',
        description: 'Книга, рукопись, предложение.',
        action: {
          kind: 'prompt',
          label: 'UNFRAMED',
          prompt: 'Что такое UNFRAMED и как его прочитать?',
        },
      },
      {
        id: 'journal',
        title: 'Journal и Flow',
        description: 'Тексты, выпуски, еженедельная рассылка.',
        action: {
          kind: 'prompt',
          label: 'Journal и Flow',
          prompt: 'Что такое Journal и Flow?',
        },
      },
    ];
  }

  return [
    {
      id: 'anton',
      title: 'Who is Anton?',
      description: 'The work, the method, the record.',
      action: {
        kind: 'prompt',
        label: 'Who is Anton?',
        prompt: 'Who is Anton Merkurov, and what is he known for?',
      },
    },
    {
      id: 'art',
      title: 'Art & Heart',
      description: 'Heart & Angel, the Art Engine, the Temple.',
      action: {
        kind: 'prompt',
        label: 'Art & Heart',
        prompt: 'Tell me about Heart & Angel and the Art Engine, including the Temple.',
      },
    },
    {
      id: 'unframed',
      title: 'UNFRAMED',
      description: 'The book, the manuscript, the proposal.',
      action: {
        kind: 'prompt',
        label: 'UNFRAMED',
        prompt: 'What is UNFRAMED, and how can I read it?',
      },
    },
    {
      id: 'journal',
      title: 'Journal & Flow',
      description: 'Essays, issues, the weekly dispatch.',
      action: {
        kind: 'prompt',
        label: 'Journal & Flow',
        prompt: 'What are the Journal and Flow?',
      },
    },
  ];
}

export function detectPierrotInterfaceLanguage(): PierrotLanguage {
  if (typeof navigator === 'undefined') return 'en';

  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
