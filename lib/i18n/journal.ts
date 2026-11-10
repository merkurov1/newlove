import type { Metadata } from 'next';
import { LANGUAGE_META, languageAlternates, localizedPath } from './config';
import { pageMetadata } from '@/lib/seo';
import type { Language } from './config';

export type JournalLanguage = Extract<Language, 'en' | 'ru'>;

export type JournalCopy = {
  meta: {
    title: string;
    description: string;
    structuredName: string;
    breadcrumbs: { home: string; section: string };
  };
  masthead: {
    title: string;
    description: string;
  };
  nav: {
    ariaLabel: string;
    issues: string;
    stream: string;
    archive: string;
    subscribe: string;
  };
  featured: {
    ariaLabel: string;
    currentEdition: string;
    otherEdition: string;
    issue: string;
    read: string;
    emptyTitle: string;
    emptyBody: string;
  };
  flow: {
    title: string;
    cta: string;
    empty: string;
    types: Record<string, string>;
  };
  archive: {
    title: string;
    cta: string;
    empty: string;
    issue: string;
  };
  subscribe: {
    kicker: string;
    title: string;
    body: string;
    quote: string;
  };
  languages: Record<JournalLanguage, string>;
};

export const JOURNAL_COPY: Record<JournalLanguage, JournalCopy> = {
  en: {
    meta: {
      title: 'The Journal — Chronicles of the Unframed | Anton Merkurov',
      description:
        'A bilingual editorial journal of essays, dispatches, Flow issues and signals on art, digital heritage, technology and cultural capital.',
      structuredName: 'The Journal — Chronicles of the Unframed',
      breadcrumbs: { home: 'Home', section: 'The Journal' },
    },
    masthead: {
      title: 'The Journal',
      description:
        'Notes on art, technology and the architecture of value — in English and Russian.',
    },
    nav: {
      ariaLabel: 'Journal sections',
      issues: 'Flow / Issues',
      stream: 'Stream',
      archive: 'Archive',
      subscribe: 'Subscribe',
    },
    featured: {
      ariaLabel: 'Featured Flow issues',
      currentEdition: 'Current issue',
      otherEdition: 'Other language edition',
      issue: 'Issue',
      read: 'Read the issue',
      emptyTitle: 'The first issue is coming soon.',
      emptyBody: 'The archive will open here as soon as the first issue is published.',
    },
    flow: {
      title: 'Flow',
      cta: 'Full stream',
      empty: 'No recent Flow entries in this language yet.',
      types: {
        note: 'Note',
        article: 'Article',
        link: 'Link',
        video: 'Video',
        photo: 'Photo',
        quote: 'Quote',
        mixed: 'Post',
      },
    },
    archive: {
      title: 'Issue archive',
      cta: 'All Flow issues',
      empty: 'The issue archive is empty for now.',
      issue: 'Issue',
    },
    subscribe: {
      kicker: 'Flow · Weekly',
      title: 'Subscribe to the weekly dispatch',
      body: 'The English edition collects notes, links and signals selected by Anton Merkurov. One letter, no noise.',
      quote: 'I do not write. I only select.',
    },
    languages: { en: 'In English', ru: 'In Russian' },
  },
  ru: {
    meta: {
      title: 'Журнал — хроники без рамки | Антон Меркуров',
      description:
        'Двуязычный редакционный журнал: эссе, заметки, выпуски Flow и сигналы об искусстве, цифровом наследии, технологиях и культурном капитале.',
      structuredName: 'Журнал — хроники без рамки',
      breadcrumbs: { home: 'Главная', section: 'Журнал' },
    },
    masthead: {
      title: 'Журнал',
      description:
        'Заметки об искусстве, технологиях и архитектуре ценности — на русском и английском.',
    },
    nav: {
      ariaLabel: 'Разделы журнала',
      issues: 'Flow / Выпуски',
      stream: 'Поток',
      archive: 'Архив',
      subscribe: 'Подписка',
    },
    featured: {
      ariaLabel: 'Главные выпуски Flow',
      currentEdition: 'Текущий выпуск',
      otherEdition: 'Версия на другом языке',
      issue: 'Выпуск',
      read: 'Читать выпуск',
      emptyTitle: 'Первый выпуск скоро появится.',
      emptyBody: 'Архив откроется здесь, как только выйдет первый выпуск.',
    },
    flow: {
      title: 'Flow',
      cta: 'Весь поток',
      empty: 'В этом языке пока нет свежих материалов Flow.',
      types: {
        note: 'Заметка',
        article: 'Статья',
        link: 'Ссылка',
        video: 'Видео',
        photo: 'Фото',
        quote: 'Цитата',
        mixed: 'Запись',
      },
    },
    archive: {
      title: 'Архив выпусков',
      cta: 'Все выпуски Flow',
      empty: 'Архив выпусков пока пуст.',
      issue: 'Выпуск',
    },
    subscribe: {
      kicker: 'Flow · Еженедельно',
      title: 'Подписка на еженедельную рассылку',
      body: 'Русская редакция собирает заметки, ссылки и сигналы, отобранные Антоном Меркуровым. Одно письмо, без шума.',
      quote: 'Я ничего не пишу, я только отбираю.',
    },
    languages: { en: 'На английском', ru: 'На русском' },
  },
};

export function journalMetadata(lang: JournalLanguage): Metadata {
  const copy = JOURNAL_COPY[lang].meta;

  return pageMetadata({
    title: copy.title,
    description: copy.description,
    path: localizedPath('journal', lang),
    locale: LANGUAGE_META[lang].ogLocale,
    alternateLocale: lang === 'en' ? 'ru_RU' : 'en_US',
    languages: languageAlternates('journal'),
  });
}

export function journalIssueHref(lang: JournalLanguage, slug: string): string {
  const base = lang === 'ru' ? '/flow-issues' : '/en/flow-issues';
  return `${base}/${encodeURIComponent(slug)}`;
}

export function journalArchiveHref(lang: JournalLanguage): string {
  return lang === 'ru' ? '/flow-issues' : '/en/flow-issues';
}
