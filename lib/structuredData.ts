import {
  ANCESTOR_NAME,
  ANCESTOR_WIKIPEDIA,
  DEFAULT_OG_IMAGE,
  PERSON_NAME,
  PERSON_NAME_RU,
  SAME_AS,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from '@/lib/seo';

type Json = Record<string, unknown>;

/** Removes undefined/null/empty-string fields recursively; schema.org dislikes empty values. */
export function compact<T extends Json>(value: T): T {
  const out: Json = {};

  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null || raw === '') continue;

    if (Array.isArray(raw)) {
      const arr = raw.map((item) => (item && typeof item === 'object' ? compact(item as Json) : item)).filter((item) => {
        if (item === undefined || item === null || item === '') return false;
        if (Array.isArray(item)) return item.length > 0;
        return true;
      });
      if (arr.length > 0) out[key] = arr;
      continue;
    }

    if (typeof raw === 'object') {
      const nested = compact(raw as Json);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }

    out[key] = raw;
  }

  return out as T;
}

export const personId = `${SITE_URL}/#person`;
export const websiteId = `${SITE_URL}/#website`;
export const organizationId = `${SITE_URL}/#organization`;

export function personJsonLd() {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId,
    name: PERSON_NAME,
    alternateName: [PERSON_NAME_RU, 'Merkurov'],
    url: SITE_URL,
    image: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#person-image`,
      url: DEFAULT_OG_IMAGE,
      caption: PERSON_NAME,
    },
    jobTitle: 'Digital Strategist, Art Dealer & Heritage Architect',
    description:
      'Digital strategist, art dealer and heritage architect. Great-grandson of sculptor Sergey Merkurov; works across art, technology and cultural heritage.',
    knowsAbout: [
      'Art market',
      'Digital heritage',
      'Soviet monumental sculpture',
      'Contemporary art',
      'Blockchain technology',
      'Digital strategy',
      'Media and internet policy',
    ],
    sameAs: SAME_AS,
    worksFor: { '@id': organizationId },
    relatedTo: {
      '@type': 'Person',
      name: ANCESTOR_NAME,
      alternateName: 'Sergey Dmitrievich Merkurov',
      birthDate: '1881-11-07',
      deathDate: '1952-06-08',
      jobTitle: 'Monumental sculptor, People’s Artist of the USSR',
      sameAs: ANCESTOR_WIKIPEDIA,
    },
    mainEntityOfPage: SITE_URL,
  });
}

export function websiteJsonLd() {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: [PERSON_NAME_RU, 'Merkurov.love'],
    description:
      'The official website of Anton Merkurov: art, heritage, advising, publishing and digital projects.',
    publisher: { '@id': personId },
    inLanguage: ['en', 'ru', 'de', 'fr', 'ar'],
  });
}

export function organizationJsonLd() {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Anton Merkurov Studio',
    alternateName: ['Merkurov Studio', 'merkurov.love'],
    url: SITE_URL,
    founder: { '@id': personId },
    sameAs: ['https://twitter.com/merkurov', 'https://t.me/merkurov'],
  });
}

export function profilePageJsonLd(input: {
  path: string;
  name: string;
  description: string;
  inLanguage?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#profilepage`,
    url,
    name: input.name,
    description: input.description,
    mainEntity: { '@id': personId },
    about: { '@id': personId },
    isPartOf: { '@id': websiteId },
    inLanguage: input.inLanguage || SITE_LANGUAGE,
  });
}

export function professionalServiceJsonLd(input: {
  path: string;
  name: string;
  description: string;
  serviceType: string[];
  inLanguage?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${url}#service`,
    name: input.name,
    description: input.description,
    url,
    image: DEFAULT_OG_IMAGE,
    founder: { '@id': personId },
    provider: { '@id': personId },
    areaServed: 'Worldwide',
    serviceType: input.serviceType,
    inLanguage: input.inLanguage || SITE_LANGUAGE,
  });
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  });
}

export function collectionPageJsonLd(input: {
  path: string;
  name: string;
  description: string;
  items?: { name: string; url: string; type?: string }[];
  inLanguage?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { '@id': websiteId },
    inLanguage: input.inLanguage || SITE_LANGUAGE,
    ...(input.items?.length
      ? {
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: input.items.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: item.name,
              url: absoluteUrl(item.url),
            })),
          },
        }
      : {}),
  });
}

export type ArticleSchemaType = 'Article' | 'BlogPosting' | 'NewsArticle';

export function articleJsonLd(input: {
  path: string;
  headline: string;
  description: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
  authorName?: string;
  section?: string;
  inLanguage?: string;
  citation?: string;
  isBasedOn?: string;
  /** Defaults to Article for backwards compatibility. */
  type?: ArticleSchemaType;
  wordCount?: number;
}) {
  const url = absoluteUrl(input.path);
  const type = input.type || 'Article';
  const idSuffix =
    type === 'BlogPosting' ? 'blogposting' : type === 'NewsArticle' ? 'newsarticle' : 'article';

  return compact({
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#${idSuffix}`,
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    image: input.image ? [absoluteUrl(input.image)] : [DEFAULT_OG_IMAGE],
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName, url: SITE_URL }
      : { '@id': personId },
    publisher: { '@id': organizationId },
    articleSection: input.section,
    inLanguage: input.inLanguage || SITE_LANGUAGE,
    citation: input.citation,
    isBasedOn: input.isBasedOn,
    wordCount: input.wordCount,
  });
}

export function blogPostingJsonLd(input: Omit<Parameters<typeof articleJsonLd>[0], 'type'>) {
  return articleJsonLd({ ...input, type: 'BlogPosting' });
}

export function newsArticleJsonLd(input: Omit<Parameters<typeof articleJsonLd>[0], 'type'>) {
  return articleJsonLd({ ...input, type: 'NewsArticle' });
}

export function webPageJsonLd(input: {
  path: string;
  name: string;
  description: string;
  inLanguage?: string;
  datePublished?: string;
  dateModified?: string;
  aboutId?: string;
  mainEntityId?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { '@id': websiteId },
    about: { '@id': input.aboutId || personId },
    mainEntity: { '@id': input.mainEntityId || personId },
    inLanguage: input.inLanguage || SITE_LANGUAGE,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
  });
}

export function aboutPageJsonLd(input: {
  path: string;
  name: string;
  description: string;
  inLanguage?: string;
  mainEntityId?: string;
  about?: Record<string, unknown>;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${url}#aboutpage`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { '@id': websiteId },
    mainEntity: { '@id': input.mainEntityId || personId },
    about: input.about || { '@id': personId },
    inLanguage: input.inLanguage || SITE_LANGUAGE,
  });
}

export type FlowSchemaContentType =
  | 'note'
  | 'article'
  | 'link'
  | 'photo'
  | 'video'
  | 'quote'
  | 'mixed';

/**
 * Maps a real Flow item to one Schema.org entity. NewsArticle is used only when
 * the item is explicitly marked as news; a photo, link or short note is never
 * promoted to news automatically.
 */
export function flowContentJsonLd(input: {
  path: string;
  name: string;
  description: string;
  contentType: FlowSchemaContentType;
  datePublished?: string | null;
  dateModified?: string | null;
  image?: string | null;
  inLanguage?: string;
  isNews?: boolean;
  bodyText?: string | null;
}) {
  const bodyLength = (input.bodyText || '').trim().length;
  const isNews = input.isNews === true && (input.contentType === 'article' || input.contentType === 'note');

  if (input.contentType === 'article' || (input.contentType === 'note' && bodyLength >= 280)) {
    const articleInput = {
      path: input.path,
      headline: input.name,
      description: input.description,
      datePublished: input.datePublished || undefined,
      dateModified: input.dateModified || input.datePublished || undefined,
      image: input.image || undefined,
      inLanguage: input.inLanguage,
      wordCount: bodyLength > 0 ? Math.max(1, Math.ceil(bodyLength / 6)) : undefined,
    };
    return isNews ? newsArticleJsonLd(articleInput) : blogPostingJsonLd(articleInput);
  }

  if (input.contentType === 'quote' || input.contentType === 'video') {
    return creativeWorkJsonLd({
      path: input.path,
      name: input.name,
      description: input.description,
      datePublished: input.datePublished || undefined,
      image: input.image || undefined,
      genre: input.contentType === 'quote' ? 'Quote' : 'Video',
      inLanguage: input.inLanguage,
    });
  }

  return webPageJsonLd({
    path: input.path,
    name: input.name,
    description: input.description,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || input.datePublished || undefined,
    inLanguage: input.inLanguage,
  });
}

export function creativeWorkJsonLd(input: {
  path: string;
  name: string;
  description: string;
  datePublished?: string;
  image?: string;
  citation?: string;
  isBasedOn?: string;
  genre?: string;
  inLanguage?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${url}#creativework`,
    name: input.name,
    description: input.description,
    url,
    datePublished: input.datePublished,
    image: input.image ? [absoluteUrl(input.image)] : [DEFAULT_OG_IMAGE],
    creator: { '@id': personId },
    citation: input.citation,
    isBasedOn: input.isBasedOn,
    genre: input.genre,
    inLanguage: input.inLanguage || SITE_LANGUAGE,
  });
}

export function visualArtworkJsonLd(input: {
  path: string;
  name: string;
  description: string;
  image?: string;
  dateCreated?: string;
  /**
   * Only pass this when the work is by someone other than Anton Merkurov
   * (for example an auction lot). Omitting it links to the existing Person.
   */
  creator?: { name: string; url?: string; id?: string } | null;
}) {
  const url = absoluteUrl(input.path);
  const creator =
    input.creator === null
      ? undefined
      : input.creator
        ? input.creator.id
          ? { '@id': input.creator.id }
          : { '@type': 'Person', name: input.creator.name, url: input.creator.url }
        : { '@id': personId };

  return compact({
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    '@id': `${url}#artwork`,
    name: input.name,
    description: input.description,
    url,
    image: input.image ? [absoluteUrl(input.image)] : undefined,
    creator,
    dateCreated: input.dateCreated,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { '@id': websiteId },
  });
}

export function bookJsonLd(input: {
  path: string;
  name: string;
  description: string;
  image?: string;
  sameAs?: string[];
  isbn?: string;
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Book',
    '@id': `${url}#book`,
    name: input.name,
    description: input.description,
    url,
    image: input.image ? [absoluteUrl(input.image)] : [DEFAULT_OG_IMAGE],
    author: { '@id': personId },
    publisher: { '@id': personId },
    inLanguage: SITE_LANGUAGE,
    sameAs: input.sameAs,
    isbn: input.isbn,
  });
}

export function personHeritageJsonLd() {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${SITE_URL}/heritage#sergey-merkurov`,
    name: ANCESTOR_NAME,
    alternateName: ['Sergey Dmitrievich Merkurov', 'Сергей Дмитриевич Меркуров'],
    birthDate: '1881-11-07',
    deathDate: '1952-06-08',
    birthPlace: { '@type': 'Place', name: 'Alexandropol (Gyumri), Russian Empire' },
    deathPlace: { '@type': 'Place', name: 'Moscow, USSR' },
    jobTitle: 'Monumental sculptor, People’s Artist of the USSR',
    description:
      'Soviet monumental sculptor known for the Lenin mausoleum masks, the Dynamo Stadium reliefs and the Gyumri house-museum.',
    sameAs: [ANCESTOR_WIKIPEDIA],
    url: `${SITE_URL}/heritage`,
  });
}
