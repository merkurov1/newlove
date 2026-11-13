import { pageMetadata } from '@/lib/seo';

/**
 * Russian-only surface. Titles and descriptions are deliberately distinct so
 * /question and /question/about never compete as duplicate pages.
 */
export const questionPageMetadata = pageMetadata({
  title: 'Question — человеческие ответы на один вопрос | Антон Меркуров',
  description:
    'Один случайный вопрос, приватные человеческие ответы и синтез Пьеро. Читайте без регистрации, отвечайте от 25 слов — один ответ на вопрос.',
  path: '/question',
  type: 'website',
  locale: 'ru_RU',
});

export const questionAboutMetadata = pageMetadata({
  title: 'О проекте Question — зачем нужны человеческие ответы | Антон Меркуров',
  description:
    'Question — пространство, где люди отвечают на один общий вопрос. Как появляется синтез Пьеро, почему ответы приватны и как устроен проект.',
  path: '/question/about',
  type: 'website',
  locale: 'ru_RU',
});
