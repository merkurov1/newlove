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
    inLanguage: ['en', 'ru'],
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

export function profilePageJsonLd(input: { path: string; name: string; description: string }) {
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
    inLanguage: SITE_LANGUAGE,
  });
}

export function professionalServiceJsonLd(input: {
  path: string;
  name: string;
  description: string;
  serviceType: string[];
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
    inLanguage: SITE_LANGUAGE,
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
    inLanguage: SITE_LANGUAGE,
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
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    image: input.image ? [absoluteUrl(input.image)] : [DEFAULT_OG_IMAGE],
    author: {
      '@type': 'Person',
      name: input.authorName || PERSON_NAME,
      url: SITE_URL,
    },
    publisher: { '@id': personId },
    articleSection: input.section,
    inLanguage: input.inLanguage || SITE_LANGUAGE,
    citation: input.citation,
    isBasedOn: input.isBasedOn,
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
}) {
  const url = absoluteUrl(input.path);
  return compact({
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    '@id': `${url}#artwork`,
    name: input.name,
    description: input.description,
    url,
    image: input.image ? [absoluteUrl(input.image)] : undefined,
    creator: { '@id': personId },
    dateCreated: input.dateCreated,
    inLanguage: SITE_LANGUAGE,
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
