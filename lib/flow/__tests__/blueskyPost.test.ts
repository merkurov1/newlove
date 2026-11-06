/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { RichText } from '@atproto/api';

import {
  BLUESKY_MAX_GRAPHEMES,
  composeBlueskyPost,
  fallbackBlueskySummary,
  resolveBlueskyShareUrl,
} from '../blueskyPost';
import { graphemeLength } from '../content';

const FLOW_URL = 'https://www.merkurov.love/flow/memory-notes?ref=flow&x=1';

function facetsFor(text: string) {
  const richText = new RichText({ text });
  richText.detectFacetsWithoutResolution();
  return { richText, facets: richText.facets ?? [] };
}

describe('Bluesky post composition', () => {
  it('uses short text in full and appends the exact Flow URL', () => {
    const post = composeBlueskyPost({
      title: 'Заметка',
      bodyText: 'Короткая мысль о памяти.',
      language: 'ru',
      flowUrl: FLOW_URL,
    });

    expect(post.text).toContain('Короткая мысль о памяти.');
    expect(post.text.endsWith(FLOW_URL)).toBe(true);
    expect(graphemeLength(post.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
  });

  it('summarizes long text instead of cutting an arbitrary character slice', () => {
    const body = [
      'Городская память перестаёт быть архивом и становится протоколом.',
      'Инфраструктура определяет, какие истории вообще могут быть услышаны.',
      'Третье предложение содержит детали, которые не нужны в коротком посте.',
      'Четвёртое предложение добавляет ещё больше подробностей для проверки сокращения.',
    ].join(' ');

    const post = composeBlueskyPost({
      title: 'Город как интерфейс',
      bodyText: body,
      language: 'ru',
      flowUrl: FLOW_URL,
    });

    expect(post.text.endsWith(FLOW_URL)).toBe(true);
    expect(post.body).toContain('Городская память');
    expect(post.body).toContain('Инфраструктура');
    expect(post.body).not.toContain('Четвёртое предложение');
    expect(graphemeLength(post.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
  });

  it('uses a provided summary and strips model-added URLs', () => {
    const post = composeBlueskyPost({
      title: 'Title',
      bodyText: 'Long body that would otherwise be used.',
      language: 'en',
      flowUrl: FLOW_URL,
      summary: 'A precise summary of the argument. https://invented.example',
    });

    expect(post.usedSummary).toBe(true);
    expect(post.body).toBe('A precise summary of the argument.');
    expect(post.text.endsWith(FLOW_URL)).toBe(true);
  });

  it('uses the short Flow redirect for long percent-encoded Cyrillic slugs', () => {
    const id = '18933270-d9d5-45f8-8255-8e5fb84d3832';
    const longCanonical =
      'https://www.merkurov.love/flow/%D0%BF%D1%8C%D0%B5%D1%80%D0%BE-%D0%BC%D0%BE%D0%B8-%D0%B4%D0%BD%D0%BA-%D1%83-%D1%82%D0%B5%D0%B1%D1%8F-%D1%82%D0%B5%D0%BF%D0%B5%D1%80%D1%8C-%D1%82%D1%8B-%D0%B7%D0%BD%D0%B0%D0%B5%D1%88%D1%8C-%D0%BF%D1%80%D0%BE-%D0%BC%D0%B5%D0%BD%D1%8F-%D0%B2-xy143';

    expect(resolveBlueskyShareUrl({ canonicalUrl: FLOW_URL, id })).toBe(FLOW_URL);
    expect(resolveBlueskyShareUrl({ canonicalUrl: longCanonical, id })).toBe(
      `https://www.merkurov.love/flow/i/${id}`
    );
  });

  it('keeps the complete post within 300 graphemes with a short share URL', () => {
    const id = '18933270-d9d5-45f8-8255-8e5fb84d3832';
    const shareUrl = resolveBlueskyShareUrl({
      canonicalUrl:
        'https://www.merkurov.love/flow/%D0%BF%D1%8C%D0%B5%D1%80%D0%BE-%D0%BF%D1%80%D0%BE-%D0%B4%D0%BD%D0%BA',
      id,
    });
    const post = composeBlueskyPost({
      title: 'Пьетро и геном',
      bodyText: 'Длинный текст '.repeat(80),
      language: 'ru',
      flowUrl: shareUrl,
    });

    expect(post.text.endsWith(shareUrl)).toBe(true);
    expect(graphemeLength(post.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
  });

  it('never truncates the URL, including query parameters', () => {
    const post = composeBlueskyPost({
      title: 'Title',
      bodyText: 'Слово '.repeat(200),
      language: 'ru',
      flowUrl: FLOW_URL,
    });

    expect(post.text).toContain(FLOW_URL);
    expect(post.text).toContain('?ref=flow&x=1');
  });

  it('builds correct UTF-8 facets for Cyrillic and emoji text', () => {
    const post = composeBlueskyPost({
      title: 'Память 🙂',
      bodyText: 'Короткий текст с эмодзи 🙂 и кириллицей.',
      language: 'ru',
      flowUrl: FLOW_URL,
    });

    const { facets } = facetsFor(post.text);
    const bytes = Buffer.from(post.text, 'utf8');
    const linkFacet = facets.find((facet) =>
      facet.features.some((feature) => feature.$type === 'app.bsky.richtext.facet#link')
    );

    expect(linkFacet).toBeDefined();
    expect(linkFacet?.index.byteStart).toBeGreaterThan(post.text.indexOf(FLOW_URL));
    expect(
      bytes.subarray(linkFacet!.index.byteStart, linkFacet!.index.byteEnd).toString('utf8')
    ).toBe(FLOW_URL);
  });

  it('produces a neutral, linked post when there is no text', () => {
    const post = composeBlueskyPost({
      title: null,
      bodyText: '',
      language: 'en',
      flowUrl: FLOW_URL,
    });

    expect(post.body).toBe('A new publication on Anton Merkurov’s Flow.');
    expect(post.text.endsWith(FLOW_URL)).toBe(true);
  });

  it('falls back safely when summary generation fails', () => {
    const summary = fallbackBlueskySummary(
      'Первое предложение достаточно длинное. Второе предложение тоже важно. Третье уже лишнее.',
      80
    );

    expect(summary.length).toBeGreaterThan(10);
    expect(summary.length).toBeLessThanOrEqual(81);
  });
});
