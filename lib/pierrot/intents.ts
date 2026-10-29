import {
  PIERROT_SECTION_IDS,
  PIERROT_SECTIONS,
  normalizePathname,
  type PierrotSectionId,
} from '@/lib/pierrot/navigation';
import { PIERROT_OFFERS, type PierrotOffer, type PierrotOfferId } from '@/lib/pierrot/offers';

export type PierrotIntentName =
  | 'navigation'
  | 'general_question'
  | 'offer_information'
  | 'purchase_intent'
  | 'subscription_intent'
  | 'service_inquiry'
  | 'book_inquiry'
  | 'handoff_request'
  | 'unknown'
  | 'uncertain';

/**
 * The specific question a visitor asked about a product. Only topics that have
 * a verified answer path are listed. Unknown topics are deliberately absent so
 * the model can answer without inventing commercial facts.
 */
export type PierrotCommercialTopic =
  | 'product'
  | 'price'
  | 'purchase'
  | 'recipient'
  | 'delivery'
  | 'materials'
  | 'availability'
  | 'price_objection';

export type PierrotIntent = {
  name: PierrotIntentName;
  confidence: number;
  uncertain: boolean;
  offerId?: PierrotOfferId;
  sectionId?: PierrotSectionId;
  topic: PierrotCommercialTopic | null;
  declined: boolean;
  unknownProduct: boolean;
  /** Closed Art Engine access, explicitly not a commercial service lead. */
  accessRequest: boolean;
  signals: string[];
};

type OfferMatch = {
  offer: PierrotOffer;
  score: number;
};

type SectionMatch = {
  sectionId: PierrotSectionId;
  score: number;
  exact: boolean;
};

const PURCHASE_TERMS = [
  'buy',
  'purchase',
  'order',
  'checkout',
  'pay for',
  'купить',
  'заказать',
  'оплатить',
  'покупа',
];

const PRICE_TERMS = ['how much', 'price', 'cost', 'costs', 'сколько стоит', 'цена', 'стоимость'];

const PRICE_OBJECTION_TERMS = [
  'too expensive',
  'expensive',
  'overpriced',
  'costs too much',
  'cheaper',
  'too much money',
  'дорого',
  'дороговато',
  'слишком дорого',
];

const RECIPIENT_TERMS = [
  'someone else',
  'another person',
  'recipient',
  'send it to',
  'send to a friend',
  'send to someone',
  'другому человеку',
  'другому',
  'кому-то',
  'получател',
  'отправить другу',
];

const DELIVERY_TERMS = [
  'delivery',
  'shipping',
  'postage',
  'how long',
  'when will it arrive',
  'when does it arrive',
  'delivered',
  'доставка',
  'доставк',
  'почтой',
  'почта',
  'сроки',
  'когда придёт',
  'когда придет',
];

const MATERIAL_TERMS = [
  'material',
  'materials',
  'paper',
  'cardstock',
  'dimensions',
  'size',
  'printed',
  'print quality',
  'материал',
  'бумага',
  'картон',
  'размер',
  'формат',
  'печать',
];

const AVAILABILITY_TERMS = [
  'available',
  'availability',
  'in stock',
  'stock',
  'sold out',
  'наличие',
  'в наличии',
  'доступна',
  'доступно',
  'распродано',
];

const DEMONSTRATIVE_TERMS = [
  'this',
  'it',
  'the card',
  'the postcard',
  'это',
  'эту',
  'эта',
  'открытк',
  'открытка',
];

const INFO_TERMS = [
  'what is',
  'what are',
  "what's",
  'tell me',
  'explain',
  'about',
  'details',
  'how does',
  'how do',
  'what does',
  'available',
  'availability',
  'included',
  'что такое',
  'расскажи',
  'подробнее',
  'как работает',
  'доступн',
  'что входит',
];

const SUBSCRIPTION_TERMS = [
  'subscribe',
  'subscription',
  'newsletter',
  'weekly',
  'digest',
  'email updates',
  'подписаться',
  'подписка',
  'рассылка',
  'еженедельн',
];

const SERVICE_TERMS = [
  'consult',
  'consulting',
  'consultation',
  'advisory',
  'advising',
  'retainer',
  'strategy session',
  'private session',
  'work with you',
  'service',
  'acquir',
  'buy a work',
  'buy art',
  'purchase a work',
  'purchase art',
  'collection',
  'collector',
  'valuation',
  'apprais',
  'provenance',
  'due diligence',
  'analys',
  'analyze',
  'art advisory',
  'market intelligence',
  'услуг',
  'консультац',
  'совет',
  'стратег',
  'сессия',
  'приобрет',
  'купить работу',
  'купить искусство',
  'подбор',
  'оценк',
  'провенанс',
  'экспертиз',
  'анализ',
];

const BOOK_TERMS = [
  'book',
  'memoir',
  'manuscript',
  'ebook',
  'e-book',
  'kindle',
  'apple books',
  'barnes',
  'книг',
  'мемуар',
  'рукопис',
  'электронн',
];

const HANDOFF_TERMS = [
  'talk to',
  'speak to',
  'contact',
  'whatsapp',
  'call you',
  'human',
  'email anton',
  'связаться',
  'написать вам',
  'поговорить',
  'человек',
  'whatsapp',
];

const REFUSAL_TERMS = [
  'no thanks',
  'no thank you',
  'not interested',
  "don't want",
  'do not want',
  'not buying',
  'just browsing',
  'нет спасибо',
  'не интерес',
  'не хочу',
  'не надо',
  'просто смотр',
];

const NAVIGATION_TERMS = [
  'take me',
  'go to',
  'open',
  'show me',
  'navigate',
  'where is',
  'перейди',
  'открой',
  'покажи',
  'перейти',
  'где находится',
];

const ACCESS_TERMS = ['access', 'request access', 'accreditation', 'доступ', 'заявк'];

const QUESTION_TERMS = [
  'what',
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can',
  'could',
  'is ',
  'are ',
  'do ',
  'does ',
  'что',
  'как',
  'почему',
  'когда',
  'где',
  'кто',
  'можно',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  const normalizedTerm = term.toLowerCase();

  if (!normalizedTerm) return false;

  if (/^[a-zа-я0-9 -]+$/i.test(normalizedTerm) && normalizedTerm.length <= 6) {
    const pattern = new RegExp(
      `(^|[^a-zа-я0-9])${escapeRegExp(normalizedTerm)}([^a-zа-я0-9]|$)`,
      'i'
    );
    return pattern.test(text);
  }

  return text.includes(normalizedTerm);
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

function findOfferMatches(text: string): OfferMatch[] {
  const byOffer = new Map<PierrotOfferId, number>();

  for (const offer of PIERROT_OFFERS) {
    for (const alias of offer.aliases) {
      if (!containsTerm(text, alias)) continue;

      const weight = alias.includes(' ') || alias.length >= 8 ? 2.5 : 2;
      byOffer.set(offer.id, Math.min(4, (byOffer.get(offer.id) ?? 0) + weight));
    }
  }

  return PIERROT_OFFERS.filter((offer) => byOffer.has(offer.id))
    .map((offer) => ({ offer, score: byOffer.get(offer.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

function findSectionMatches(text: string): SectionMatch[] {
  const trimmed = text.trim();
  const matches: SectionMatch[] = [];

  for (const sectionId of PIERROT_SECTION_IDS) {
    const section = PIERROT_SECTIONS[sectionId];
    const candidates = [section.triggerText, ...(section.aliases ?? [])];
    const matched = candidates.filter((candidate) => containsTerm(trimmed, candidate));

    if (matched.length === 0) continue;

    const exact = candidates.some(
      (candidate) => candidate.trim().toLowerCase() === trimmed.toLowerCase()
    );

    matches.push({
      sectionId,
      score: exact ? 4.5 : 2.5 + (matched.length > 1 ? 0.5 : 0),
      exact,
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}

function normalizeText(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rule-based first pass. It intentionally requires combinations of signals
 * (offer + verbal intent, section + navigation verb, etc.) rather than acting
 * on a single keyword.
 */
export function classifyPierrotIntent(message: string): PierrotIntent {
  const text = normalizeText(message);

  const scores: Record<PierrotIntentName, number> = {
    navigation: 0,
    general_question: 0,
    offer_information: 0,
    purchase_intent: 0,
    subscription_intent: 0,
    service_inquiry: 0,
    book_inquiry: 0,
    handoff_request: 0,
    unknown: 0,
    uncertain: 0,
  };

  const signals = new Set<string>();

  const add = (name: PierrotIntentName, amount: number, signal: string) => {
    scores[name] += amount;
    signals.add(signal);
  };

  const offerMatches = findOfferMatches(text);
  const sectionMatches = findSectionMatches(text);
  const primaryOffer = offerMatches[0]?.offer ?? null;
  const secondOffer = offerMatches[1] ?? null;
  const primarySection = sectionMatches[0]?.sectionId;

  const purchase = hasAny(text, PURCHASE_TERMS);
  const price = hasAny(text, PRICE_TERMS);
  const priceObjection = hasAny(text, PRICE_OBJECTION_TERMS);
  const recipient = hasAny(text, RECIPIENT_TERMS);
  const delivery = hasAny(text, DELIVERY_TERMS);
  const materials = hasAny(text, MATERIAL_TERMS);
  const availability = hasAny(text, AVAILABILITY_TERMS);
  const demonstrative = hasAny(text, DEMONSTRATIVE_TERMS);
  const info = hasAny(text, INFO_TERMS);
  const subscription = hasAny(text, SUBSCRIPTION_TERMS);
  const service = hasAny(text, SERVICE_TERMS);
  const book = hasAny(text, BOOK_TERMS);
  const handoff = hasAny(text, HANDOFF_TERMS);
  const refusal = hasAny(text, REFUSAL_TERMS);
  const navigationVerb = hasAny(text, NAVIGATION_TERMS);
  const access = hasAny(text, ACCESS_TERMS);
  const question = text.includes('?') || hasAny(text, QUESTION_TERMS);

  if (primaryOffer) {
    const offerClear = !secondOffer || offerMatches[0].score - secondOffer.score >= 0.75;

    if (!offerClear) {
      add('uncertain', 3, 'multiple_offers');
    } else {
      add('offer_information', 2 + offerMatches[0].score * 0.3, `offer:${primaryOffer.id}`);

      if (primarySection && navigationVerb) {
        const sectionRoute = PIERROT_SECTIONS[primarySection].route;
        const sameDestination =
          normalizePathname(sectionRoute) === normalizePathname(primaryOffer.route);

        if (sameDestination) {
          add('navigation', 5, `section:${primarySection}`);
        }
      }

      if (book && primaryOffer.id === 'unframed') {
        add('book_inquiry', 4, 'book_offer');
      }

      if (subscription && primaryOffer.id === 'journal_flow') {
        add('subscription_intent', 5.2, 'subscription_offer');
      }

      if (service && (primaryOffer.id === 'advising' || primaryOffer.id === 'art_engine')) {
        add('service_inquiry', 5.2, 'service_offer');
      }

      if (access && primaryOffer.id === 'art_engine') {
        add('service_inquiry', 5.4, 'access_request');
      }

      if (purchase) {
        if (primaryOffer.id === 'unframed') {
          add('book_inquiry', 3.5, 'purchase_book');
        } else if (primaryOffer.id === 'journal_flow') {
          add('subscription_intent', 2.5, 'purchase_subscription');
        } else if (primaryOffer.id === 'art_engine') {
          add('service_inquiry', 2.5, 'purchase_access_notice');
        } else {
          add('purchase_intent', 4.5, 'purchase_offer');
        }
      }

      if (price || info || question) {
        add('offer_information', 1.2, 'offer_question');
      }
    }
  } else {
    if (
      subscription &&
      (containsTerm(text, 'newsletter') ||
        containsTerm(text, 'weekly') ||
        containsTerm(text, 'рассылк') ||
        containsTerm(text, 'подписк') ||
        containsTerm(text, 'subscribe'))
    ) {
      add('subscription_intent', 3.5, 'subscription_terms');
    }

    if (book && !handoff) {
      if (purchase) add('book_inquiry', 3.2, 'book_purchase');
      else if (info || question || containsTerm(text, 'book')) {
        add('book_inquiry', 2.2, 'book_terms');
      }
    }

    if (service) {
      add('service_inquiry', 3.2, 'service_terms');
    }

    if (handoff) {
      add('handoff_request', 4, 'handoff_terms');
    }

    if (primarySection) {
      if (navigationVerb) {
        add('navigation', 4, `section:${primarySection}`);
      } else if (sectionMatches[0].exact) {
        add('navigation', sectionMatches[0].score, `section:${primarySection}`);
      } else if (question) {
        add('offer_information', 1, `section:${primarySection}`);
      }
    }

    if (purchase || price) {
      add('unknown', 2.8, 'commercial_signal_without_offer');
    } else if (question) {
      add('general_question', 2.5, 'question');
    }

    if (
      scores.subscription_intent === 0 &&
      scores.book_inquiry === 0 &&
      scores.service_inquiry === 0 &&
      scores.handoff_request === 0 &&
      scores.navigation === 0 &&
      scores.general_question === 0
    ) {
      add('unknown', 1.2, 'low_signal');
    }

    const vague = hasAny(text, [
      'help me with this',
      'help with this',
      'something',
      'anything',
      'this',
      'что-то',
      'это',
    ]);

    if (
      vague &&
      !primaryOffer &&
      !primarySection &&
      !service &&
      !book &&
      !handoff &&
      !subscription &&
      !purchase &&
      !price
    ) {
      scores.general_question *= 0.3;
      add('unknown', 3, 'vague_request');
    }
  }

  if (refusal) {
    const commercial: PierrotIntentName[] = [
      'offer_information',
      'purchase_intent',
      'subscription_intent',
      'service_inquiry',
      'book_inquiry',
      'handoff_request',
    ];

    for (const name of commercial) {
      scores[name] *= 0.15;
    }

    add('unknown', 3.5, 'declined');
  }

  const ranked = (Object.entries(scores) as Array<[PierrotIntentName, number]>).sort(
    (a, b) => b[1] - a[1]
  );

  const [topName, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = topScore - secondScore;

  let name: PierrotIntentName = topName;

  if (topScore < 2.2) {
    name = 'unknown';
  } else if (name !== 'navigation' && topScore >= 2.5 && margin < 0.6) {
    name = 'uncertain';
  }

  if (refusal && scores.navigation < 3.5 && name !== 'navigation') {
    name = 'unknown';
  }

  let confidence = Math.min(
    0.95,
    Math.max(0.2, 0.32 + topScore * 0.085 + Math.max(0, margin) * 0.03)
  );

  if (name === 'unknown' || name === 'uncertain') {
    confidence = Math.min(confidence, 0.55);
  }

  let offerId: PierrotOfferId | undefined;

  if (name === 'purchase_intent' || name === 'offer_information') {
    offerId = primaryOffer?.id;
  } else if (name === 'book_inquiry') {
    offerId = primaryOffer?.id === 'unframed' ? 'unframed' : primaryOffer ? undefined : 'unframed';
  } else if (name === 'subscription_intent') {
    offerId = primaryOffer?.id === 'journal_flow' ? 'journal_flow' : 'journal_flow';
  } else if (name === 'service_inquiry') {
    offerId =
      primaryOffer?.id === 'art_engine' || primaryOffer?.id === 'advising'
        ? primaryOffer.id
        : 'advising';
  } else if (name === 'handoff_request') {
    offerId = 'advising';
  }

  const sectionId = name === 'navigation' ? primarySection : undefined;

  // Commercial topics are only meaningful for a concrete offer or for a
  // demonstrative question ("what is this?") on an offer page. The planner
  // remains the authority on which offer, if any, is in scope.
  const productTopic = Boolean(primaryOffer) || demonstrative;

  let topic: PierrotCommercialTopic | null = null;

  if (priceObjection) {
    topic = 'price_objection';
  } else if (price) {
    topic = 'price';
  } else if (purchase) {
    topic = 'purchase';
  } else if (recipient) {
    topic = 'recipient';
  } else if (delivery) {
    topic = 'delivery';
  } else if (materials) {
    topic = 'materials';
  } else if (availability) {
    topic = 'availability';
  } else if (productTopic && (info || question)) {
    topic = 'product';
  }

  const accessRequest =
    access &&
    (primaryOffer?.id === 'art_engine' ||
      containsTerm(text, 'art engine') ||
      containsTerm(text, 'terminal') ||
      containsTerm(text, 'арт-инжин'));

  return {
    name,
    confidence: Number(confidence.toFixed(2)),
    uncertain: name === 'unknown' || name === 'uncertain' || confidence < 0.55,
    offerId: accessRequest ? 'art_engine' : offerId,
    sectionId,
    topic,
    declined: refusal,
    unknownProduct:
      !primaryOffer &&
      !demonstrative &&
      (purchase || price) &&
      name !== 'navigation' &&
      name !== 'subscription_intent' &&
      name !== 'service_inquiry' &&
      name !== 'handoff_request',
    accessRequest,
    signals: Array.from(signals).slice(0, 8),
  };
}
