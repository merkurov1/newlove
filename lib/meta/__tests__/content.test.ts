/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { graphemeLength, normalizeFlowItem } from '@/lib/flow/content';
import { composeFacebookPost, composeThreadsPost, THREADS_TEXT_LIMIT } from '../content';

describe('Meta content adaptation', () => {
  it('keeps the full Facebook text and the canonical Flow link', () => {
    const content = normalizeFlowItem({
      id: 'item-1',
      slug: 'facebook-item',
      title: 'A title',
      body_md: 'First paragraph.\n\nSecond paragraph with **formatting**.',
      type: 'article',
      lang: 'ru',
      metadata: { images: ['https://cdn.example.com/a.jpg'] },
    });

    const post = composeFacebookPost(content);
    expect(post.message).toContain('A title');
    expect(post.message).toContain('First paragraph.');
    expect(post.message).toContain('Second paragraph with formatting.');
    expect(post.message).toContain('https://www.merkurov.love/flow/facebook-item');
    expect(post.imageUrl).toBe('https://cdn.example.com/a.jpg');
    expect(post.link).toBeNull();
  });

  it('truncates long Threads text at a natural boundary without losing the URL', () => {
    const content = normalizeFlowItem({
      id: 'item-2',
      slug: 'threads-item',
      title: 'Threads title',
      body_md: 'Sentence one. '.repeat(120),
      type: 'article',
      lang: 'ru',
    });

    const post = composeThreadsPost(content);
    expect(graphemeLength(post.text)).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
    expect(post.text).toContain('https://www.merkurov.love/flow/threads-item');
    expect(post.text.endsWith('https://www.merkurov.love/flow/threads-item')).toBe(true);
    expect(post.text).not.toMatch(/#[A-Za-zА-Яа-я0-9_]+/);
  });

  it('does not duplicate a URL already present in the source text', () => {
    const content = normalizeFlowItem({
      id: 'item-3',
      slug: 'duplicate-url',
      title: '',
      body_md:
        'Read the original at https://www.merkurov.love/flow/duplicate-url before it disappears.',
      type: 'note',
      lang: 'en',
    });

    const post = composeThreadsPost(content);
    const matches = post.text.match(/https:\/\/www\.merkurov\.love\/flow\/duplicate-url/g);
    expect(matches).toHaveLength(1);
  });
});
