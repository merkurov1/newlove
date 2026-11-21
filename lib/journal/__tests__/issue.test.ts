import {
  collectIssueMaterials,
  groupIssueMaterials,
  materialHref,
} from '../issue';
import type { IssueEntry, IssuePayload } from '@/lib/flow-issue/types';

function payload(overrides: Partial<IssuePayload> = {}): IssuePayload {
  return {
    schemaVersion: 2,
    lang: 'en',
    period: { start: '2026-11-13T00:00:00.000Z', end: '2026-11-20T00:00:00.000Z', timezone: 'UTC' },
    stats: {
      total: 4,
      published: 4,
      drafts: 0,
      days: 7,
      medianDelaySeconds: null,
      byType: { note: 1, link: 1, video: 1, photo: 1 },
      byKind: { about_flow: 0, world: 0, other: 4 },
      own: 2,
      external: 2,
      byUtcHour: [],
      perDay: [],
      delays: [],
      quality: { langFieldMismatch: 0, photoAltEqualsFilename: 0, emptyDrafts: 0 },
    },
    lead: null,
    latest: [],
    links: [],
    videos: [],
    photos: [],
    sourceIndex: [],
    templateVersion: 1,
    template: {} as IssuePayload['template'],
    design: { template: 'classic', tokens: { accent: '#000', paper: '#fff', ink: '#000' } },
    ...overrides,
  };
}

const items = [
  {
    id: 'note-1',
    type: 'note',
    title: 'A published note',
    body: 'Body of the note',
    url: 'https://www.merkurov.love/flow/a-published-note',
    publishedAt: '2026-11-18T10:00:00.000Z',
    createdAt: '2026-11-18T09:00:00.000Z',
    metadata: {},
    lang: 'en' as const,
    kind: 'other' as const,
    own: true,
  },
  {
    id: 'link-1',
    type: 'link',
    title: 'A good link',
    body: '',
    url: 'https://example.com/story',
    publishedAt: '2026-11-17T10:00:00.000Z',
    createdAt: '2026-11-17T09:00:00.000Z',
    metadata: { link_preview: { image: 'https://example.com/preview.jpg', domain: 'example.com' } },
    lang: 'ru' as const,
    kind: 'world' as const,
    own: false,
    description: 'What the link is about',
    image: 'https://example.com/preview.jpg',
  },
  {
    id: 'video-1',
    type: 'video',
    title: 'A video',
    body: '',
    url: 'https://www.youtube.com/watch?v=abc',
    publishedAt: '2026-11-16T10:00:00.000Z',
    createdAt: '2026-11-16T09:00:00.000Z',
    metadata: { youtube: { thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' } },
    lang: 'en' as const,
    kind: 'other' as const,
    own: false,
    image: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
  },
  {
    id: 'photo-1',
    type: 'photo',
    title: 'A photo',
    body: '',
    url: 'https://www.merkurov.love/flow/a-photo',
    publishedAt: '2026-11-15T10:00:00.000Z',
    createdAt: '2026-11-15T09:00:00.000Z',
    metadata: { public_url: 'https://cdn.example.com/photo.jpg', alt: 'A photo alt' },
    lang: 'ru' as const,
    kind: 'other' as const,
    own: true,
    image: 'https://cdn.example.com/photo.jpg',
    alt: 'A photo alt',
  },
] as unknown as IssueEntry[];

describe('journal issue materials', () => {
  it('uses the canonical payload items and keeps every language', () => {
    const result = collectIssueMaterials(payload({ items }));

    expect(result.map((item) => item.id)).toEqual(['note-1', 'link-1', 'video-1', 'photo-1']);
    expect(result.map((item) => item.lang)).toEqual(['en', 'ru', 'en', 'ru']);
    expect(result.find((item) => item.id === 'link-1')?.image).toBe(
      'https://example.com/preview.jpg'
    );
    expect(result.find((item) => item.id === 'photo-1')?.imageAlt).toBe('A photo alt');
  });

  it('marks the editorial lead without duplicating it', () => {
    const result = collectIssueMaterials(
      payload({ items, lead: { ...items[0], annotation: 'Opening' } })
    );

    expect(result).toHaveLength(4);
    expect(result.filter((item) => item.isLead).map((item) => item.id)).toEqual(['note-1']);
  });

  it('falls back to the legacy sections for old payloads and removes repeats', () => {
    const result = collectIssueMaterials(
      payload({
        lead: items[0],
        latest: [items[0], items[2]],
        links: [items[1] as any],
        photos: [items[3] as any],
        items: undefined,
      })
    );

    expect(result.map((item) => item.id)).toEqual(['note-1', 'video-1', 'link-1', 'photo-1']);
  });

  it('drops empty rows and duplicate content keys', () => {
    const empty = {
      ...items[0],
      id: 'empty',
      title: '',
      body: '',
      url: null,
      metadata: {},
    };
    const duplicate = { ...items[0], id: 'note-copy' };

    const result = collectIssueMaterials(
      payload({ items: [items[0], empty, duplicate] })
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('note-1');
  });

  it('groups only the types that actually exist, in editorial order', () => {
    const groups = groupIssueMaterials(collectIssueMaterials(payload({ items })));

    expect(groups.map((group) => group.kind)).toEqual(['note', 'link', 'video', 'photo']);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it('keeps articles as their own section and maps unknown types to Other', () => {
    const article = {
      ...items[0],
      id: 'article-1',
      type: 'article',
      title: 'An article',
    };
    const unknown = {
      ...items[0],
      id: 'quote-1',
      type: 'quote',
      title: 'A quote',
    };

    const groups = groupIssueMaterials(
      collectIssueMaterials(payload({ items: [article, unknown] }))
    );

    expect(groups.map((group) => group.kind)).toEqual(['article', 'other']);
    expect(groups[1].items[0].type).toBe('quote');
  });

  it('groups only notes when the issue only contains notes', () => {
    const groups = groupIssueMaterials(
      collectIssueMaterials(payload({ items: [items[0]] }))
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('note');
  });

  it('returns no materials for an issue without a payload', () => {
    expect(collectIssueMaterials(null)).toEqual([]);
  });

  it('keeps same-site material links local and external links absolute', () => {
    expect(materialHref('https://www.merkurov.love/flow/note?x=1')).toBe('/flow/note?x=1');
    expect(materialHref('https://example.com/story')).toBe('https://example.com/story');
    expect(materialHref(null)).toBeNull();
  });
});
