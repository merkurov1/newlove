import type { Language } from './config';

export type HeritageLanguage = Extract<Language, 'en' | 'ru'>;

export type HeritageCopy = {
  meta: {
    title: string;
    description: string;
  };
  structured: {
    collectionName: string;
    collectionDescription: string;
    items: { name: string; url: string }[];
    breadcrumbs: { home: string; section: string };
  };
};

export const HERITAGE_COPY: Record<HeritageLanguage, HeritageCopy> = {
  en: {
    meta: {
      title: 'Heritage Archive — Sergey & Anton Merkurov',
      description:
        'The documented legacy of sculptor Sergey Merkurov and the archival, museum, print and digital-art initiatives of his great-grandson Anton Merkurov.',
    },
    structured: {
      collectionName: 'Heritage Archive — Sergey & Anton Merkurov',
      collectionDescription:
        'The documented legacy of sculptor Sergey Merkurov and the archival, museum, print and digital-art initiatives of his great-grandson Anton Merkurov.',
      items: [
        { name: 'Sergey Merkurov — biography and monuments', url: '/heritage' },
        { name: 'The Gyumri house-museum', url: '/heritage' },
        { name: 'Dynamo Stadium reliefs', url: '/heritage' },
        { name: 'Death masks and the Lenin mausoleum', url: '/heritage' },
      ],
      breadcrumbs: { home: 'Home', section: 'Heritage Archive' },
    },
  },
  ru: {
    meta: {
      title: 'Архив наследия — Сергей и Антон Меркуровы',
      description:
        'Документированное наследие скульптора Сергея Меркурова и музейные, издательские и цифровые инициативы его правнука Антона Меркурова.',
    },
    structured: {
      collectionName: 'Архив наследия — Сергей и Антон Меркуровы',
      collectionDescription:
        'Документированное наследие скульптора Сергея Меркурова и музейные, издательские и цифровые инициативы его правнука Антона Меркурова.',
      items: [
        { name: 'Сергей Меркуров — биография и монументы', url: '/ru/heritage' },
        { name: 'Дом-музей в Гюмри', url: '/ru/heritage' },
        { name: 'Барельефы стадиона «Динамо»', url: '/ru/heritage' },
        { name: 'Посмертные маски и Мавзолей Ленина', url: '/ru/heritage' },
      ],
      breadcrumbs: { home: 'Главная', section: 'Архив наследия' },
    },
  },
};
