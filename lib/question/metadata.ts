import { ogImageUrl, pageMetadata, truncate } from '@/lib/seo';
import type { PublicQuestion } from './constants';

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

/**
 * Per-question social metadata for a shared /question?q=… link.
 *
 * The document title keeps the site suffix, while Open Graph and Twitter use
 * the question itself, so the shared card reads as the question rather than as
 * a generic product page.
 */
export function questionShareMetadata(question: PublicQuestion) {
  const shortQuestion = truncate(question.text, 96);
  const description = truncate(
    `${shortQuestion} Человеческие ответы на Question и синтез Пьеро. Добавьте свой ответ — от 25 слов.`,
    160
  );

  const base = pageMetadata({
    title: `${shortQuestion} — Question | Антон Меркуров`,
    description,
    path: `/question?q=${encodeURIComponent(question.id)}`,
    image: ogImageUrl(question.text, 'Question · человеческие ответы'),
    imageAlt: question.text,
    type: 'website',
    locale: 'ru_RU',
  });

  return {
    ...base,
    openGraph: {
      ...(base.openGraph || {}),
      title: question.text,
    },
    twitter: {
      ...(base.twitter || {}),
      title: question.text,
    },
  };
}
