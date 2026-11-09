import {
  aboutPageJsonLd,
  blogPostingJsonLd,
  flowContentJsonLd,
  newsArticleJsonLd,
  organizationId,
  personId,
  visualArtworkJsonLd,
  webPageJsonLd,
  websiteId,
} from '../structuredData';
import { SITE_URL } from '../seo';

describe('shared Schema.org helpers', () => {
  it('builds BlogPosting with the existing Person and Organization entities', () => {
    const data = blogPostingJsonLd({
      path: '/journal/example',
      headline: 'Example',
      description: 'Description',
      datePublished: '2026-11-01T10:00:00Z',
      dateModified: '2026-11-02T10:00:00Z',
      image: '/image.jpg',
      inLanguage: 'en',
    });

    expect(data['@type']).toBe('BlogPosting');
    expect(data.headline).toBe('Example');
    expect(data.author).toEqual({ '@id': personId });
    expect(data.publisher).toEqual({ '@id': organizationId });
    expect(data.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': `${SITE_URL}/journal/example`,
    });
    expect(data.datePublished).toBe('2026-11-01T10:00:00Z');
    expect(data.dateModified).toBe('2026-11-02T10:00:00Z');
    expect(data.image).toEqual([`${SITE_URL}/image.jpg`]);
    expect(data.inLanguage).toBe('en');
  });

  it('builds NewsArticle only when explicitly requested', () => {
    const data = newsArticleJsonLd({
      path: '/journal/news',
      headline: 'News',
      description: 'Description',
      datePublished: '2026-11-01T10:00:00Z',
    });
    expect(data['@type']).toBe('NewsArticle');
  });

  it('does not leave empty optional fields', () => {
    const data = blogPostingJsonLd({
      path: '/journal/empty',
      headline: 'Headline',
      description: 'Description',
    });
    expect(data).not.toHaveProperty('datePublished');
    expect(data).not.toHaveProperty('citation');
    expect(Object.values(data).every((value) => value !== undefined && value !== '')).toBe(
      true
    );
  });

  it('builds AboutPage linked to the site entity', () => {
    const data = aboutPageJsonLd({
      path: '/heartandangel/about',
      name: 'About Heart & Angel',
      description: 'Description',
      mainEntityId: `${SITE_URL}/heartandangel#project`,
      about: { '@type': 'CreativeWork', name: 'Heart & Angel' },
    });
    expect(data['@type']).toBe('AboutPage');
    expect(data.mainEntity).toEqual({ '@id': `${SITE_URL}/heartandangel#project` });
    expect(data.about).toMatchObject({ '@type': 'CreativeWork', name: 'Heart & Angel' });
    expect(data.isPartOf).toEqual({ '@id': websiteId });
  });

  it('builds WebPage with isPartOf and about links', () => {
    const data = webPageJsonLd({
      path: '/art-engine',
      name: 'Art Engine',
      description: 'Description',
    });
    expect(data['@type']).toBe('WebPage');
    expect(data.isPartOf).toEqual({ '@id': websiteId });
    expect(data.about).toEqual({ '@id': personId });
  });

  it('uses the existing Person for Anton Merkurov artworks', () => {
    const data = visualArtworkJsonLd({
      path: '/heartandangel/world',
      name: 'World',
      description: 'Description',
      image: '/world.png',
    });
    expect(data['@type']).toBe('VisualArtwork');
    expect(data.creator).toEqual({ '@id': personId });
  });

  it('attributes a lot to its real artist instead of Anton', () => {
    const data = visualArtworkJsonLd({
      path: '/lots/1',
      name: 'Lot',
      description: 'Description',
      creator: { name: 'Lucio Fontana' },
    });
    expect(data.creator).toMatchObject({ '@type': 'Person', name: 'Lucio Fontana' });
    expect(JSON.stringify(data.creator)).not.toContain(personId);
  });

  it('omits creator when the artist is unknown', () => {
    const data = visualArtworkJsonLd({
      path: '/lots/2',
      name: 'Unknown lot',
      description: 'Description',
      creator: null,
    });
    expect(data).not.toHaveProperty('creator');
  });
});

describe('Flow structured data mapping', () => {
  const base = {
    path: '/flow/example',
    name: 'Example',
    description: 'Description',
    datePublished: '2026-11-01T10:00:00Z',
    dateModified: '2026-11-02T10:00:00Z',
    inLanguage: 'en',
  };

  it('uses BlogPosting for an article', () => {
    expect(flowContentJsonLd({ ...base, contentType: 'article' })['@type']).toBe(
      'BlogPosting'
    );
  });

  it('uses NewsArticle only when the item is explicitly news', () => {
    expect(
      flowContentJsonLd({ ...base, contentType: 'article', isNews: true })['@type']
    ).toBe('NewsArticle');
    expect(
      flowContentJsonLd({ ...base, contentType: 'photo', isNews: true })['@type']
    ).not.toBe('NewsArticle');
  });

  it('keeps a short note as WebPage', () => {
    expect(
      flowContentJsonLd({
        ...base,
        contentType: 'note',
        bodyText: 'Short note.',
      })['@type']
    ).toBe('WebPage');
  });

  it('uses CreativeWork for quotes and WebPage for links', () => {
    expect(flowContentJsonLd({ ...base, contentType: 'quote' })['@type']).toBe(
      'CreativeWork'
    );
    expect(flowContentJsonLd({ ...base, contentType: 'link' })['@type']).toBe('WebPage');
  });
});
