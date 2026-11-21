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
    kicker: string;
    title: string;
    description: string;
  };
  nav: {
    ariaLabel: string;
    issues: string;
    contents: string;
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
    originalLanguage: string;
    leadLabel: string;
    periodLabel: string;
    materialsLabel: string;
    typesLabel: string;
  };
  inside: {
    title: string;
    kicker: string;
    empty: string;
    lead: string;
    open: string;
    contents: string;
    types: Record<string, string>;
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
    previewNote: string;
    filters: {
      ariaLabel: string;
      year: string;
      language: string;
      allYears: string;
      allLanguages: string;
      reset: string;
      noMatches: string;
    };
  };
  subscribe: {
    kicker: string;
    title: string;
    body: string;
    quote: string;
  };
  languages: Record<JournalLanguage | 'other', string>;
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
      kicker: 'Flow · Editorial',
      title: 'The Journal',
      description:
        'Notes on art, technology and the architecture of value — in English and Russian.',
    },
    nav: {
      ariaLabel: 'Journal sections',
      issues: 'Flow / Issues',
      contents: 'Inside',
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
      originalLanguage: 'Original language',
      leadLabel: 'Editorial lead',
      periodLabel: 'Period',
      materialsLabel: 'Materials',
      typesLabel: 'By type',
    },
    inside: {
      title: 'Inside this issue',
      kicker: 'What is in the issue',
      empty: 'The materials of this issue are being prepared.',
      lead: 'Lead',
      open: 'Open material',
      contents: 'Issue contents',
      types: {
        note: 'Notes',
        link: 'Links',
        article: 'Articles',
        video: 'Video',
        photo: 'Photos',
        other: 'Other',
      },
    },
    flow: {
      title: 'Flow',
      cta: 'Full stream',
      empty: 'No recent Flow entries yet.',
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
      previewNote: 'Both language editions, newest first.',
      filters: {
        ariaLabel: 'Filter the issue archive',
        year: 'Year',
        language: 'Language',
        allYears: 'All years',
        allLanguages: 'All languages',
        reset: 'Reset filters',
        noMatches: 'No issues match these filters.',
      },
    },
    subscribe: {
      kicker: 'Flow · Weekly',
      title: 'Subscribe to the weekly dispatch',
      body: 'The English edition collects notes, links and signals selected by Anton Merkurov. One letter, no noise.',
      quote: 'I do not write. I only select.',
    },
    languages: {
      en: 'In English',
      ru: 'In Russian',
      other: 'Other language',
    },
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
      kicker: 'Flow · Редакция',
      title: 'Журнал',
      description:
        'Заметки об искусстве, технологиях и архитектуре ценности — на русском и английском.',
    },
    nav: {
      ariaLabel: 'Разделы журнала',
      issues: 'Flow / Выпуски',
      contents: 'Содержание',
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
      originalLanguage: 'Язык оригинала',
      leadLabel: 'Редакционный анонс',
      periodLabel: 'Период',
      materialsLabel: 'Материалы',
      typesLabel: 'По типам',
    },
    inside: {
      title: 'В этом выпуске',
      kicker: 'Что внутри',
      empty: 'Материалы этого выпуска готовятся к публикации.',
      lead: 'Главное',
      open: 'Открыть материал',
      contents: 'Содержание выпуска',
      types: {
        note: 'Заметки',
        link: 'Ссылки',
        article: 'Статьи',
        video: 'Видео',
        photo: 'Фото',
        other: 'Другое',
      },
    },
    flow: {
      title: 'Flow',
      cta: 'Весь поток',
      empty: 'Свежих материалов Flow пока нет.',
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
      previewNote: 'Обе языковые версии, от новых к старым.',
      filters: {
        ariaLabel: 'Фильтр архива выпусков',
        year: 'Год',
        language: 'Язык',
        allYears: 'Все годы',
        allLanguages: 'Все языки',
        reset: 'Сбросить фильтры',
        noMatches: 'По этим фильтрам выпусков нет.',
      },
    },
    subscribe: {
      kicker: 'Flow · Еженедельно',
      title: 'Подписка на еженедельную рассылку',
      body: 'Русская редакция собирает заметки, ссылки и сигналы, отобранные Антоном Меркуровым. Одно письмо, без шума.',
      quote: 'Я ничего не пишу, я только отбираю.',
    },
    languages: {
      en: 'На английском',
      ru: 'На русском',
      other: 'Другой язык',
    },
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
