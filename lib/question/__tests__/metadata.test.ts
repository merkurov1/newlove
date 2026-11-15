/** @jest-environment node */

import { PUBLIC_ROUTES } from '@/lib/seo';
import {
  questionAboutMetadata,
  questionPageMetadata,
  questionShareMetadata,
} from '../metadata';

const sharedQuestion = {
  id: '11111111-1111-4111-8111-111111111111',
  text: 'В чём смысл жизни?',
};

function absoluteTitle(value: unknown): string {
  if (value && typeof value === 'object' && 'absolute' in value) {
    return String((value as { absolute?: unknown }).absolute || '');
  }
  return String(value || '');
}

describe('Question SEO metadata', () => {
  it('uses unique Russian titles and descriptions', () => {
    const questionTitle = absoluteTitle(questionPageMetadata.title);
    const aboutTitle = absoluteTitle(questionAboutMetadata.title);

    expect(questionTitle).toContain('Question');
    expect(aboutTitle).toContain('О проекте');
    expect(questionTitle).not.toBe(aboutTitle);
    expect(questionPageMetadata.description).not.toBe(questionAboutMetadata.description);
    expect(/[А-Яа-яЁё]/.test(String(questionPageMetadata.description))).toBe(true);
    expect(/[А-Яа-яЁё]/.test(String(questionAboutMetadata.description))).toBe(true);
  });

  it('sets self-referencing canonical and Open Graph URLs', () => {
    expect(questionPageMetadata.alternates?.canonical).toBe(
      'https://www.merkurov.love/question'
    );
    expect(questionAboutMetadata.alternates?.canonical).toBe(
      'https://www.merkurov.love/question/about'
    );
    expect(questionPageMetadata.openGraph?.url).toBe('https://www.merkurov.love/question');
    expect(questionAboutMetadata.openGraph?.url).toBe(
      'https://www.merkurov.love/question/about'
    );
    expect(questionPageMetadata.openGraph?.locale).toBe('ru_RU');
    expect(questionAboutMetadata.openGraph?.locale).toBe('ru_RU');
  });

  it('keeps both public pages indexable', () => {
    expect(questionPageMetadata.robots).toMatchObject({ index: true, follow: true });
    expect(questionAboutMetadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('lists both pages in the sitemap source', () => {
    expect(PUBLIC_ROUTES).toContain('/question');
    expect(PUBLIC_ROUTES).toContain('/question/about');
  });

  it('does not leak private corpus language into public metadata', () => {
    const serialized = JSON.stringify(questionPageMetadata) + JSON.stringify(questionAboutMetadata);
    expect(serialized).not.toMatch(/user_id|answer_text|question_answers|service_role/i);
  });

  it('puts a shared question into the social title and image', () => {
    const metadata = questionShareMetadata(sharedQuestion);
    const image = Array.isArray(metadata.openGraph?.images)
      ? String((metadata.openGraph.images[0] as { url?: unknown }).url || '')
      : '';

    expect(absoluteTitle(metadata.title)).toContain(sharedQuestion.text);
    expect(metadata.openGraph?.title).toBe(sharedQuestion.text);
    expect(metadata.twitter?.title).toBe(sharedQuestion.text);
    expect(metadata.description).toContain('В чём смысл жизни?');
    expect(metadata.alternates?.canonical).toBe(
      `https://www.merkurov.love/question?q=${sharedQuestion.id}`
    );
    const imageParams = new URL(image).searchParams;
    expect(imageParams.get('title')).toBe(sharedQuestion.text);
    expect(image).toContain('/og?title=');
  });
});
