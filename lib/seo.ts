import type { Metadata } from 'next';

/**
 * Single source of truth for public URLs and identity strings.
 *
 * Canonical host: the production redirect in next.config.js sends
 * merkurov.love -> www.merkurov.love, so every canonical/og:url must use www.
 */
export const SITE_URL = 'https://www.merkurov.love';
export const SITE_NAME = 'Anton Merkurov';
export const SITE_LOCALE = 'en_US';
export const SITE_LANGUAGE = 'en';

export const PERSON_NAME = 'Anton Merkurov';
export const PERSON_NAME_RU = 'Антон Меркуров';
export const ANCESTOR_NAME = 'Sergey Merkurov';
export const ANCESTOR_NAME_RU = 'Сергей Меркуров';
export const ANCESTOR_WIKIPEDIA = 'https://en.wikipedia.org/wiki/Sergey_Merkurov';

/** Default social image used only when a page has no dedicated artwork. */
export const DEFAULT_OG_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png';

export const DEFAULT_OG_ALT = 'Anton Merkurov — Art, Love & Money';

export const AI_DISCLOSURE = 'Made with AI. Potential hallucinations apply.';

/** Existing public profiles taken from the root layout / structured data. */
export const SAME_AS = [
  'https://twitter.com/merkurov',
  'https://x.com/merkurov',
  'https://t.me/merkurov',
  'https://bsky.app/profile/merkurov.love',
  'https://www.linkedin.com/in/merkurov',
  'https://www.facebook.com/merkurov',
  'https://github.com/merkurov1',
];

export const SOCIAL_HANDLE = '@merkurov';

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Page URLs are generated through the Next metadata `opengraph-image` route.
 * The route renders a 1200x630 PNG with next/og and accepts a title/subtitle.
 */
export function ogImageUrl(title: string, subtitle = SITE_NAME): string {
  const params = new URLSearchParams({ title, subtitle });
  return `${SITE_URL}/og?${params.toString()}`;
}

export function truncate(value: string, max: number): string {
  const clean = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Keeps meta descriptions in the 120–160 character band when the source text
 * allows it. Short source text is left intact rather than padded with invented
 * claims; the check script reports any remaining outliers.
 */
export function description(value: string, fallback = ''): string {
  const source = truncate(value || fallback, 160);
  if (source.length >= 120) return source;

  const suffix =
    ' Anton Merkurov — digital strategist, art dealer and heritage architect.';
  const combined = truncate(`${source}${suffix}`, 160);
  return combined.length >= 120 ? combined : source;
}

type PageMetadataInput = {
  /** Full page title, already composed with the brand where appropriate. */
  title: string;
  description: string;
  /** Path beginning with "/" (or an absolute URL). */
  path: string;
  /** Absolute or root-relative image URL. */
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: 'website' | 'article' | 'profile' | 'book';
  locale?: string;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  keywords?: string[];
  noindex?: boolean;
  languages?: Record<string, string>;
  /** RSS feed for this page's content. Defaults to the canonical Journal feed. */
  rssPath?: string;
  /** JSON Feed mirror, used by Flow pages. */
  jsonFeedPath?: string;
};

/**
 * Builds complete, self-referencing metadata. No value is inherited from the
 * root layout (canonical, og:url and title are always computed here).
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const url = absoluteUrl(input.path);
  const image = input.image ? absoluteUrl(input.image) : ogImageUrl(input.title);
  const imageAlt = input.imageAlt || input.title;
  const width = input.imageWidth || 1200;
  const height = input.imageHeight || 630;

  const languages = input.languages
    ? Object.fromEntries(
        Object.entries(input.languages).map(([key, value]) => [key, absoluteUrl(value)]),
      )
    : undefined;

  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: {
      canonical: url,
      ...(languages ? { languages } : {}),
      types: {
        'application/rss+xml': absoluteUrl(input.rssPath || '/feed.xml'),
        ...(input.jsonFeedPath ? { 'application/feed+json': absoluteUrl(input.jsonFeedPath) } : {}),
      },
    },
    authors: input.authors?.map((name) => ({ name, url: SITE_URL })),
    keywords: input.keywords,
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      locale: input.locale || SITE_LOCALE,
      type: input.type === 'profile' ? 'profile' : input.type === 'book' ? 'book' : input.type || 'website',
      images: [{ url: image, width, height, alt: imageAlt }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
      ...(input.authors?.length ? { authors: input.authors } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
      creator: SOCIAL_HANDLE,
      site: SOCIAL_HANDLE,
    },
    ...(input.noindex
      ? { robots: { index: false, follow: false } }
      : {
          robots: {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-video-preview': -1,
              'max-image-preview': 'large' as const,
              'max-snippet': -1,
            },
          },
        }),
  };
}

/** Static, indexable routes used by the sitemap and the link graph checks. */
export const PUBLIC_ROUTES = [
  '/',
  '/lobby',
  '/advising',
  '/journal',
  '/heritage',
  '/media',
  '/heartandangel',
  '/heartandangel/about',
  '/heartandangel/world',
  '/heartandangel/calm',
  '/heartandangel/letitgo',
  '/heartandangel/NFT',
  '/heartandangel/card',
  '/unframed',
  '/unframed/book',
  '/flow',
  '/flow/join',
  '/selection',
  '/isakeyforall',
  '/research',
  '/research/novayagazeta2025',
  '/silence',
  '/tags',
  '/lots',
  '/art-engine',
  '/case-study/fontana',
  '/case-study/garcia',
  '/case-study/pivovarov',
  '/communications',
  '/2025',
  '/all',
  '/cast',
  '/temple',
  '/tribute',
  '/vigil',
  '/absolution',
  '/quiz/guess-estimate',
  '/liveheart',
  '/liveheart/stat',
  '/liveheart/tv',
  '/letters',
] as const;

/**
 * Editorial copy for the main static routes. Kept next to the URL constants so
 * new pages cannot silently inherit another page's description.
 */
export const ROUTE_COPY: Record<
  string,
  { title: string; description: string; image?: string; imageAlt?: string }
> = {
  '/': {
    title: 'Anton Merkurov — Art, Love & Money',
    description:
      'Anton Merkurov is a digital strategist, art dealer and heritage architect working where technology, culture and capital meet.',
    image: DEFAULT_OG_IMAGE,
    imageAlt: DEFAULT_OG_ALT,
  },
  '/lobby': {
    title: 'Private Office & Access | Anton Merkurov',
    description:
      'The private office of Anton Merkurov: heritage architecture, art-market counsel and access to selected cultural projects.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
    imageAlt: 'Anton Merkurov — Private Office & Access',
  },
  '/advising': {
    title: 'Advising & High-Stakes Counsel | Anton Merkurov',
    description:
      'Direct peer-to-peer counsel for founders, collectors and institutions at the intersection of technology, culture and capital.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Advising/IMG_1526.jpeg',
    imageAlt: 'Anton Merkurov — advising and high-stakes counsel',
  },
  '/journal': {
    title: 'Journal — Chronicles of the Unframed | Anton Merkurov',
    description:
      'Essays, dispatches and market intelligence on art, digital heritage, technology and the shifting value of cultural capital.',
  },
  '/heritage': {
    title: 'Heritage Archive — Sergey & Anton Merkurov',
    description:
      'The documented legacy of sculptor Sergey Merkurov and the archival, museum, print and digital-art initiatives of his great-grandson Anton Merkurov.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Heritage/TheThinker.jpg',
    imageAlt: 'Sergey Merkurov Heritage Archive — The Thinker',
  },
  '/media': {
    title: 'Media Archive — Interviews & Commentary | Anton Merkurov',
    description:
      'A chronological archive of interviews, expert commentary, author columns and media citations featuring Anton Merkurov, with links to originals.',
  },
  '/heartandangel': {
    title: 'Heart & Angel — A Living Digital Mythology',
    description:
      'Heart & Angel is an ongoing art project exploring the angel, the devil and the heart through painting, digital graphics, AR and code.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
    imageAlt: 'Heart & Angel — the living digital mythology',
  },
  '/unframed': {
    title: 'UNFRAMED — A Memoir by Anton Merkurov',
    description:
      'UNFRAMED is Anton Merkurov’s memoir of migration, media and digital frontiers — the transition from granite to ether.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
    imageAlt: 'UNFRAMED — cover artwork',
  },
  '/flow': {
    title: 'Flow — Notes, Signals & Artifacts | Anton Merkurov',
    description:
      'A stream of notes, links, images, video and signals selected by Anton Merkurov — an unfiltered feed of what holds his attention.',
  },
  '/selection': {
    title: 'Selection — Curated Art & Chronicles | Anton Merkurov',
    description:
      'A curated selection of artworks, artist dossiers and non-conformist masterworks from the archive of Anton Merkurov.',
  },
};

export function routeMetadata(path: keyof typeof ROUTE_COPY | string): Metadata {
  const copy = ROUTE_COPY[path];
  if (!copy) {
    throw new Error(`Missing SEO copy for route: ${path}`);
  }
  return pageMetadata({ ...copy, path });
}
