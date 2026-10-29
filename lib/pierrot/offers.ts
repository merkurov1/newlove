/**
 * Verified offer catalogue for Pierrot.
 *
 * This file is the single source of truth for commercial facts. It contains
 * only statements that exist in the current repository/pages or are checked at
 * runtime against an existing data source. Unverified details belong in
 * `unknowns`, not in a generated answer.
 */

import { normalizePathname } from '@/lib/pierrot/navigation';

export const PIERROT_OFFER_IDS = [
  'heart_angel_postcard',
  'journal_flow',
  'art_engine',
  'advising',
  'unframed',
] as const;

export type PierrotOfferId = (typeof PIERROT_OFFER_IDS)[number];

export type PierrotOfferKind = 'product' | 'subscription' | 'access' | 'service' | 'publication';

export type PierrotOfferCtaPurpose =
  'order' | 'subscribe' | 'request_access' | 'learn_more' | 'contact';

export type PierrotOfferCta = {
  offerId: PierrotOfferId;
  label: string;
  href: string;
  kind: 'internal' | 'external';
  purpose: PierrotOfferCtaPurpose;
};

export type PierrotOfferFact = {
  key: string;
  value: string;
  source: string;
};

export type PierrotOfferAvailability = {
  status: 'verify_live' | 'public' | 'access_request' | 'inquiry' | 'conditional';
  note: string;
  verifier?: 'postcards' | 'subscription' | 'none';
};

export type PierrotOffer = {
  id: PierrotOfferId;
  title: string;
  kind: PierrotOfferKind;
  route: string;
  aliases: string[];
  summary: string;
  facts: PierrotOfferFact[];
  availability: PierrotOfferAvailability;
  cta: PierrotOfferCta;
  unknowns: string[];
};

/**
 * Existing destinations only. A model cannot add to this list at runtime.
 */
export const PIERROT_VERIFIED_INTERNAL_ROUTES = new Set<string>(
  [
    '/',
    '/heartandangel',
    '/heartandangel/world',
    '/heartandangel/calm',
    '/heartandangel/card',
    '/lobby',
    '/selection',
    '/journal',
    '/flow',
    '/flow/join',
    '/letters',
    '/advising',
    '/advising/request',
    '/media',
    '/heritage',
    '/research',
    '/art-engine',
    '/unframed',
    '/unframed/book',
    '/unframed/proposal',
    '/temple',
  ].map((route) => normalizePathname(route))
);

export const PIERROT_VERIFIED_EXTERNAL_CTAS = new Set<string>(['https://wa.me/16467270865']);

export function isPierrotOfferId(value: unknown): value is PierrotOfferId {
  return typeof value === 'string' && (PIERROT_OFFER_IDS as readonly string[]).includes(value);
}

export function isVerifiedPierrotInternalDestination(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;

  const path = trimmed.split(/[?#]/, 1)[0];

  return PIERROT_VERIFIED_INTERNAL_ROUTES.has(normalizePathname(path));
}

export function getPierrotOfferById(id: PierrotOfferId): PierrotOffer {
  const offer = PIERROT_OFFERS.find((candidate) => candidate.id === id);

  if (!offer) throw new Error(`Unknown Pierrot offer: ${id}`);

  return offer;
}

export function findPierrotOfferById(value: unknown): PierrotOffer | null {
  return isPierrotOfferId(value) ? getPierrotOfferById(value) : null;
}

export function getVerifiedOfferCta(offerId: PierrotOfferId): PierrotOfferCta | null {
  const offer = getPierrotOfferById(offerId);
  const cta = offer.cta;

  if (cta.offerId !== offer.id || typeof cta.label !== 'string' || !cta.label.trim()) {
    return null;
  }

  if (cta.kind === 'internal') {
    if (!isVerifiedPierrotInternalDestination(cta.href)) return null;
  } else if (cta.kind === 'external') {
    if (!PIERROT_VERIFIED_EXTERNAL_CTAS.has(cta.href)) return null;
  } else {
    return null;
  }

  return cta;
}

/**
 * Canonicalises CTA data from session storage or an API response. Unknown or
 * tampered destinations are rejected rather than rendered.
 */
export function normalizePierrotOfferCta(value: unknown): PierrotOfferCta | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;

  if (!isPierrotOfferId(raw.offerId)) return null;

  const canonical = getVerifiedOfferCta(raw.offerId);

  if (!canonical) return null;

  if (
    raw.label !== canonical.label ||
    raw.href !== canonical.href ||
    raw.kind !== canonical.kind ||
    raw.purpose !== canonical.purpose
  ) {
    return null;
  }

  return canonical;
}

export const PIERROT_OFFERS: PierrotOffer[] = [
  {
    id: 'heart_angel_postcard',
    title: 'Heart & Angel postcard',
    kind: 'product',
    route: '/heartandangel/card',
    aliases: [
      'heart & angel postcard',
      'heart and angel postcard',
      'postcard',
      'открытка',
      'открытку',
      'открытки',
    ],
    summary:
      'A physical Heart & Angel postcard with a personal message, sent to a recipient address.',
    facts: [
      {
        key: 'public_price',
        value: '£29',
        source: '/heartandangel/card',
      },
      {
        key: 'postage',
        value: 'Postage included, as stated on the public page and order form.',
        source: '/heartandangel/card',
      },
      {
        key: 'format',
        value: 'Physical postcard with a personal message for the recipient.',
        source: '/heartandangel/card and /components/heartandangel/PostcardOrderForm.tsx',
      },
      {
        key: 'gesture',
        value:
          'The card is a physical artwork with a personal message, sent to a recipient address; the page frames it as a gesture rather than a digital file.',
        source: '/heartandangel/card',
      },
      {
        key: 'recipient_fields',
        value:
          'The existing order form asks for the recipient name, delivery address and an optional personal message of up to 500 characters.',
        source: '/components/heartandangel/PostcardOrderForm.tsx',
      },
      {
        key: 'checkout',
        value: 'Existing Stripe order flow at /api/postcards/order.',
        source: '/components/heartandangel/PostcardOrderForm.tsx and /api/postcards/order',
      },
      {
        key: 'live_availability',
        value:
          'Actual availability and price are read from the postcards catalogue before an order.',
        source: '/api/postcards and /api/postcards/order',
      },
    ],
    availability: {
      status: 'verify_live',
      note: 'The public copy says £29 with postage included, but stock and the final catalogue price must be checked through the existing postcards source.',
      verifier: 'postcards',
    },
    cta: {
      offerId: 'heart_angel_postcard',
      label: 'Open the postcard order form',
      href: '/heartandangel/card#order',
      kind: 'internal',
      purpose: 'order',
    },
    unknowns: [
      'Delivery time',
      'Countries served',
      'Material, dimensions and print run',
      'Signed or limited editions',
      'Live stock outside the postcards catalogue',
    ],
  },
  {
    id: 'journal_flow',
    title: 'Journal / Flow',
    kind: 'subscription',
    route: '/journal',
    aliases: [
      'journal',
      'flow',
      'weekly dispatch',
      'weekly digest',
      'newsletter',
      'еженедельная рассылка',
      'журнал',
      'флоу',
    ],
    summary:
      'The Journal is the editorial record; Flow is a stream of short posts assembled into a weekly issue.',
    facts: [
      {
        key: 'journal_format',
        value:
          'The Journal holds issues and longer authored texts; Flow is the shorter stream of notes, links, videos and photographs.',
        source: '/journal and /flow',
      },
      {
        key: 'flow_issue',
        value:
          'The Flow subscription page describes a weekly issue assembled from the stream; the Journal remains the longer editorial record.',
        source: '/flow/join and /journal',
      },
      {
        key: 'subscription_form',
        value:
          'Existing public subscription form at /journal#subscribe, with an additional form at /flow/join.',
        source: '/components/journal/SubscribeFormClient.tsx and /app/flow/join/FlowJoinClient.tsx',
      },
      {
        key: 'subscription_terms',
        value:
          'The repository does not state whether the subscription is free or paid; the existing form and configuration are the source for current terms.',
        source: '/components/journal/SubscribeFormClient.tsx and /app/flow/join/FlowJoinClient.tsx',
      },
      {
        key: 'subscription_endpoint',
        value: 'The forms use the existing /api/subscribe endpoint.',
        source: '/api/subscribe',
      },
      {
        key: 'subscription_status',
        value:
          'Authenticated subscribers can be checked through the existing subscription-status endpoint.',
        source: '/api/subscription-status',
      },
    ],
    availability: {
      status: 'public',
      note: 'The form and endpoint exist. Actual delivery cadence and confirmation-email operation must be confirmed by the live newsletter pipeline.',
      verifier: 'subscription',
    },
    cta: {
      offerId: 'journal_flow',
      label: 'Open the Journal subscription form',
      href: '/journal#subscribe',
      kind: 'internal',
      purpose: 'subscribe',
    },
    unknowns: [
      'Current live sending status',
      'Exact next issue date',
      'Subscriber count',
      'Whether every confirmation email is currently delivered',
    ],
  },
  {
    id: 'art_engine',
    title: 'Art Engine',
    kind: 'access',
    route: '/art-engine',
    aliases: [
      'art engine',
      'art-engine',
      'intelligence terminal',
      'terminal',
      'арт-инжин',
      'арт engine',
    ],
    summary:
      'An access-controlled institutional art intelligence terminal; it is not a public subscription or a published-price product.',
    facts: [
      {
        key: 'format',
        value:
          'Access-controlled terminal for institutional art advisory and market intelligence, including an accreditation request form.',
        source: '/art-engine',
      },
      {
        key: 'access',
        value:
          'Access is requested through the existing Request Access flow; approval is not automatic.',
        source: '/art-engine and /api/admin/request-access',
      },
      {
        key: 'price',
        value: 'No public price is listed for Art Engine.',
        source: '/art-engine',
      },
      {
        key: 'advisory_separation',
        value:
          'Direct advisory is a separate track documented at /advising, not the same thing as Art Engine access.',
        source: '/advising',
      },
    ],
    availability: {
      status: 'access_request',
      note: 'Use the existing Request Access flow. Do not describe Art Engine as a purchasable subscription.',
      verifier: 'none',
    },
    cta: {
      offerId: 'art_engine',
      label: 'Open Art Engine access',
      href: '/art-engine',
      kind: 'internal',
      purpose: 'request_access',
    },
    unknowns: [
      'Approval criteria and timeline',
      'Pricing and commercial terms',
      'Current seat availability',
      'Exact service scope for accredited users',
    ],
  },
  {
    id: 'advising',
    title: 'Advising / The Office',
    kind: 'service',
    route: '/advising',
    aliases: [
      'advising',
      'advisory',
      'consulting',
      'consultation',
      'private strategy session',
      'office',
      'адвайзинг',
      'консультация',
      'консультации',
      'советник',
    ],
    summary:
      'Direct, confidential advisory across technology, culture and capital, with retainer, project and private-session formats.',
    facts: [
      {
        key: 'formats',
        value: 'Board & Advisory retainer, Special Projects, and Private Strategy Sessions.',
        source: '/advising',
      },
      {
        key: 'contact',
        value: 'Existing direct contact link on the Advising page.',
        source: '/advising',
      },
      {
        key: 'price',
        value: 'No public price is listed.',
        source: '/advising',
      },
    ],
    availability: {
      status: 'inquiry',
      note: 'Inquiry-only. Do not invent a fee, availability window or guaranteed response time.',
      verifier: 'none',
    },
    cta: {
      offerId: 'advising',
      label: 'Start an advising conversation',
      href: 'https://wa.me/16467270865',
      kind: 'external',
      purpose: 'contact',
    },
    unknowns: [
      'Fees and minimum engagement',
      'Availability and response time',
      'Exact scope of a private session',
    ],
  },
  {
    id: 'unframed',
    title: 'UNFRAMED',
    kind: 'publication',
    route: '/unframed',
    aliases: [
      'unframed',
      'memoir',
      'memoirs',
      'manuscript',
      'digital edition',
      'мемуар',
      'рукопись',
      'цифровое издание',
    ],
    summary:
      'A memoir by Anton Merkurov with a digital edition, a private manuscript reader, and a publisher proposal.',
    facts: [
      {
        key: 'format',
        value:
          'Memoir; the page lists a digital edition, a private reader and a publisher proposal.',
        source: '/unframed',
      },
      {
        key: 'themes',
        value:
          'The public page frames the memoir as a return to the boy on the floor, the closing of a loop and a return to the line, moving from the Soviet past to the digital ether.',
        source: '/unframed',
      },
      {
        key: 'length',
        value: 'The public page states approximately 60,000 words; genre Memoir / Noir; English.',
        source: '/unframed',
      },
      {
        key: 'apple_books',
        value: 'Apple Books listing shown at £3.99, English, 215 pages.',
        source: '/unframed',
      },
      {
        key: 'barnes_noble',
        value: 'Barnes & Noble eBook listing shown at $4.99.',
        source: '/unframed',
      },
      {
        key: 'retailer_price_status',
        value:
          'Retailer prices are catalogue listings shown on /unframed, not live quotes; the retailer page must confirm current price and availability.',
        source: '/unframed',
      },
      {
        key: 'private_reader',
        value:
          'A private manuscript reader exists at /unframed/book and uses the existing Stripe checkout shown there for digital access.',
        source: '/unframed/book and /app/unframed/book/Paywall.tsx',
      },
      {
        key: 'publisher_form',
        value:
          'The /unframed form asks for name, agency and email for literary agents and publishers; it is a proposal request, not a book purchase.',
        source: '/unframed and /api/unframed/telegram',
      },
      {
        key: 'publisher_proposal',
        value: 'Publisher proposal is available at /unframed/proposal.',
        source: '/unframed/proposal',
      },
    ],
    availability: {
      status: 'conditional',
      note: 'Retailer listings are linked from /unframed but their live price and stock must be checked at the retailer. The private manuscript reader has its own existing Stripe access checkout; the publisher form is an interest/contact request, not an order.',
      verifier: 'none',
    },
    cta: {
      offerId: 'unframed',
      label: 'Open UNFRAMED',
      href: '/unframed',
      kind: 'internal',
      purpose: 'learn_more',
    },
    unknowns: [
      'Live retailer stock and current price',
      'Print, signed or limited editions',
      'Shipping and delivery terms',
      'Whether the private reader checkout is fully operational end-to-end',
    ],
  },
];
