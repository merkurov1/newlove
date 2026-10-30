import type { PierrotIntent } from '@/lib/pierrot/intents';
import type { PierrotOfferRuntime } from '@/lib/pierrot/offerAvailability';
import { isPierrotOfferId, type PierrotOfferId } from '@/lib/pierrot/offers';
import { getPierrotOfferPolicy, type PierrotOfferPolicyMap } from '@/lib/pierrot/offerPolicy';
import { resolvePierrotPageContext } from '@/lib/pierrot/pageContext';

/**
 * Deterministic commercial state and proactive selection for Pierrot.
 *
 * The model never decides what to sell. This module decides whether a
 * conversational signal, a page context and the visitor's history justify one
 * offer, and which argument to use next. Code also owns every route and price.
 */

export type PierrotCommercialStage = 'exploration' | 'interest' | 'consideration' | 'conversion';

export type PierrotCommercialMarkerAction =
  'introduced' | 'objection' | 'declined' | 'purchased' | 'subscribed';

export type PierrotCommercialMarker = {
  offerId: PierrotOfferId;
  action: PierrotCommercialMarkerAction;
};

export type PierrotCommercialEventLike = {
  eventName?: unknown;
  event_name?: unknown;
  payload?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

export type PierrotCommercialState = {
  introducedOfferIds: PierrotOfferId[];
  displayedOfferIds: PierrotOfferId[];
  declinedOfferIds: PierrotOfferId[];
  objectionOfferIds: PierrotOfferId[];
  purchasedOfferIds: PierrotOfferId[];
  subscribedOfferIds: PierrotOfferId[];
  /** How many times each offer has been introduced in this conversation. */
  offerIntroductions: Partial<Record<PierrotOfferId, number>>;
  lastOfferId: PierrotOfferId | null;
  /** One means the current message is the first turn after that offer. */
  turnsSinceLastOffer: number;
  /** ISO timestamp of the most recent trusted offer event, when available. */
  lastOfferAt: string | null;
  returnedFromOfferId: PierrotOfferId | null;
};

export type PierrotProactiveOffer = {
  offerId: PierrotOfferId;
  stage: Extract<PierrotCommercialStage, 'interest' | 'consideration'>;
  reason: string;
  angle: string;
  score: number;
};

const PROACTIVE_OFFER_IDS: PierrotOfferId[] = ['heart_angel_postcard', 'unframed', 'journal_flow'];

type WeightedTerm = { term: string; weight: number };

const POSTCARD_TERMS: WeightedTerm[] = [
  { term: 'love', weight: 1.5 },
  { term: 'heart', weight: 1 },
  { term: 'angel', weight: 1 },
  { term: 'relationship', weight: 1.5 },
  { term: 'partner', weight: 1 },
  { term: 'wife', weight: 1 },
  { term: 'husband', weight: 1 },
  { term: 'girlfriend', weight: 1 },
  { term: 'boyfriend', weight: 1 },
  { term: 'distance', weight: 1.25 },
  { term: 'far away', weight: 2 },
  { term: 'apart', weight: 1.25 },
  { term: 'gift', weight: 1.5 },
  { term: 'anniversary', weight: 1.5 },
  { term: 'valentine', weight: 1.5 },
  { term: 'romantic', weight: 1.25 },
  { term: 'postcard', weight: 2 },
  { term: 'meaning', weight: 1.5 },
  { term: 'history', weight: 1.25 },
  { term: 'artwork', weight: 1.5 },
  { term: 'symbol', weight: 1.25 },
  { term: 'смысл', weight: 1.5 },
  { term: 'истори', weight: 1.25 },
  { term: 'работ', weight: 1 },
  { term: 'send', weight: 1 },
  { term: 'send a card', weight: 2 },
  { term: 'send a postcard', weight: 2 },
  { term: 'someone i love', weight: 2 },
  { term: 'someone i care', weight: 2 },
  { term: 'want to send', weight: 1.5 },
  { term: 'someone', weight: 0.75 },
  { term: 'miss', weight: 1 },
  { term: 'любов', weight: 1.5 },
  { term: 'сердц', weight: 1 },
  { term: 'ангел', weight: 1 },
  { term: 'отношен', weight: 1.5 },
  { term: 'подар', weight: 1.5 },
  { term: 'подарить', weight: 1.5 },
  { term: 'расстоян', weight: 1.25 },
  { term: 'скуча', weight: 1 },
  { term: 'открытк', weight: 2 },
  { term: 'отправ', weight: 1 },
  { term: 'близк', weight: 1 },
];

const UNFRAMED_TERMS: WeightedTerm[] = [
  { term: 'memoir', weight: 2 },
  { term: 'book', weight: 1.5 },
  { term: 'manuscript', weight: 2 },
  { term: 'identity', weight: 1.5 },
  { term: 'freedom', weight: 1.25 },
  { term: 'reinvent', weight: 1.5 },
  { term: 'personal history', weight: 2 },
  { term: 'life story', weight: 2 },
  { term: 'father', weight: 1.25 },
  { term: 'mother', weight: 1.25 },
  { term: 'family', weight: 1 },
  { term: 'childhood', weight: 1.25 },
  { term: 'soviet', weight: 1.25 },
  { term: 'moscow', weight: 1 },
  { term: 'emigrat', weight: 1.25 },
  { term: 'artist', weight: 0.75 },
  { term: 'writing', weight: 1 },
  { term: 'read', weight: 0.75 },
  { term: 'read your book', weight: 2 },
  { term: 'want to read', weight: 1.25 },
  { term: 'your story', weight: 1.5 },
  { term: 'your memoir', weight: 2 },
  { term: 'author', weight: 0.75 },
  { term: 'unframed', weight: 2 },
  { term: 'loop', weight: 1 },
  { term: 'past', weight: 0.75 },
  { term: 'мемуар', weight: 2 },
  { term: 'книг', weight: 1.5 },
  { term: 'рукопис', weight: 2 },
  { term: 'идентич', weight: 1.5 },
  { term: 'свобод', weight: 1.25 },
  { term: 'переизобр', weight: 1.5 },
  { term: 'истори', weight: 1 },
  { term: 'отец', weight: 1.25 },
  { term: 'семь', weight: 1 },
  { term: 'ссср', weight: 1.25 },
  { term: 'москв', weight: 1 },
  { term: 'эмигр', weight: 1.25 },
  { term: 'автор', weight: 0.75 },
  { term: 'писат', weight: 1 },
  { term: 'читать', weight: 0.75 },
  { term: 'прошл', weight: 0.75 },
];

const JOURNAL_TERMS: WeightedTerm[] = [
  { term: 'journal', weight: 2 },
  { term: 'flow', weight: 1.75 },
  { term: 'essay', weight: 1.5 },
  { term: 'text', weight: 1 },
  { term: 'writing', weight: 1.25 },
  { term: 'read', weight: 0.75 },
  { term: 'read more', weight: 1.5 },
  { term: 'more of your writing', weight: 2 },
  { term: 'your writing', weight: 2 },
  { term: 'your essays', weight: 2 },
  { term: 'love your work', weight: 2.5 },
  { term: 'love what you do', weight: 2.5 },
  { term: 'like your work', weight: 2.5 },
  { term: 'like what you do', weight: 2.5 },
  { term: 'admire your work', weight: 2.5 },
  { term: 'follow', weight: 1 },
  { term: 'follow your work', weight: 2 },
  { term: 'support your work', weight: 1.5 },
  { term: 'new work', weight: 1.75 },
  { term: 'new writing', weight: 1.5 },
  { term: 'what should i read', weight: 2 },
  { term: 'where should i start reading', weight: 2 },
  { term: 'publish', weight: 1.25 },
  { term: 'newsletter', weight: 2 },
  { term: 'subscribe', weight: 2 },
  { term: 'issue', weight: 1 },
  { term: 'notes', weight: 0.75 },
  { term: 'dispatch', weight: 1.25 },
  { term: 'column', weight: 1 },
  { term: 'журнал', weight: 2 },
  { term: 'флоу', weight: 1.75 },
  { term: 'текст', weight: 1 },
  { term: 'стать', weight: 1.25 },
  { term: 'писат', weight: 1.25 },
  { term: 'читать', weight: 0.75 },
  { term: 'читать дальше', weight: 1.5 },
  { term: 'ваши тексты', weight: 2 },
  { term: 'твои тексты', weight: 2 },
  { term: 'люблю вашу работу', weight: 2.5 },
  { term: 'люблю твои работы', weight: 2.5 },
  { term: 'нравится ваша работа', weight: 2.5 },
  { term: 'восхищаюсь', weight: 2 },
  { term: 'следить', weight: 1 },
  { term: 'следить за', weight: 1.5 },
  { term: 'подпис', weight: 2 },
  { term: 'выпуск', weight: 1 },
  { term: 'заметк', weight: 0.75 },
  { term: 'рассылк', weight: 1.5 },
];

const REASONS: Record<PierrotOfferId, Array<{ angle: string; reason: string }>> = {
  heart_angel_postcard: [
    {
      angle: 'gesture',
      reason:
        'A physical card can carry a written message to a specific person; that gesture is the point, not the object alone.',
    },
    {
      angle: 'object',
      reason:
        'The postcard is a physical piece of the Heart & Angel work, with a personal message written on it; it is not another file to open.',
    },
    {
      angle: 'practical',
      reason:
        'There is one existing order form for it: it asks for the recipient and message, postage is included in the listed price, and Stripe handles payment.',
    },
  ],
  unframed: [
    {
      angle: 'reading',
      reason:
        'UNFRAMED is a sustained first-person memoir, not a portfolio caption; the public page frames it as closing the loop and returning to the line.',
    },
    {
      angle: 'perspective',
      reason:
        'The memoir connects a personal history to the wider questions on the page: the Soviet past, the digital ether, and what remains of the boy on the floor.',
    },
    {
      angle: 'access',
      reason:
        'The existing routes are distinct: retailer editions, the private manuscript reader at /unframed/book, and the separate publisher proposal.',
    },
  ],
  journal_flow: [
    {
      angle: 'continuity',
      reason:
        'The Journal collects authored issues and longer texts; Flow is the shorter stream of notes, links, videos and photographs assembled into issues.',
    },
    {
      angle: 'practice',
      reason:
        'The existing subscription form is how a reader follows the work as it appears; it is not a different publication.',
    },
    {
      angle: 'archive',
      reason:
        'The Journal, Flow and the issue archive are readable now; the form only adds the ongoing relationship.',
    },
  ],
  art_engine: [],
  advising: [],
};

const EVENT_NAMES = new Set([
  'interest_detected',
  'offer_eligible',
  'offer_selected',
  'offer_shown',
  'offer_viewed',
  'cta_shown',
  'commercial_declined',
  'commercial_returned',
  'intent_classified',
  'order_paid',
  'purchase_completed',
  'unframed_purchase_confirmed',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  const normalized = term.toLowerCase();

  if (!normalized) return false;

  if (/^[a-z0-9 -]+$/i.test(normalized) && normalized.length <= 7) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}`, 'i').test(text);
  }

  return text.includes(normalized);
}

function uniqueOfferIds(values: unknown[]): PierrotOfferId[] {
  const seen = new Set<PierrotOfferId>();

  for (const value of values) {
    if (isPierrotOfferId(value)) seen.add(value);
  }

  return Array.from(seen);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function markerFrom(value: unknown): PierrotCommercialMarker | null {
  const marker = asRecord(value);

  if (!isPierrotOfferId(marker.offerId)) return null;

  const actions: PierrotCommercialMarkerAction[] = [
    'introduced',
    'objection',
    'declined',
    'purchased',
    'subscribed',
  ];

  if (typeof marker.action !== 'string') return null;

  if (!(actions as string[]).includes(marker.action)) return null;

  return {
    offerId: marker.offerId,
    action: marker.action as PierrotCommercialMarkerAction,
  };
}

export function emptyPierrotCommercialState(): PierrotCommercialState {
  return {
    introducedOfferIds: [],
    displayedOfferIds: [],
    declinedOfferIds: [],
    objectionOfferIds: [],
    purchasedOfferIds: [],
    subscribedOfferIds: [],
    offerIntroductions: {},
    lastOfferId: null,
    turnsSinceLastOffer: Number.POSITIVE_INFINITY,
    lastOfferAt: null,
    returnedFromOfferId: null,
  };
}

function bumpIntroduction(
  introductions: Partial<Record<PierrotOfferId, number>>,
  offerId: PierrotOfferId
): void {
  introductions[offerId] = (introductions[offerId] ?? 0) + 1;
}

/**
 * Builds commercial context from the browser transcript and, when available,
 * trusted server-side events. Message text is used only for aggregate theme
 * scoring and is never copied into analytics.
 */
export function derivePierrotCommercialState({
  history,
  events = [],
  subscriptionEvents = [],
}: {
  history?: unknown;
  events?: PierrotCommercialEventLike[];
  subscriptionEvents?: PierrotCommercialEventLike[];
}): PierrotCommercialState {
  const introduced = new Set<PierrotOfferId>();
  const displayed = new Set<PierrotOfferId>();
  const declined = new Set<PierrotOfferId>();
  const objections = new Set<PierrotOfferId>();
  const purchased = new Set<PierrotOfferId>();
  const subscribed = new Set<PierrotOfferId>();
  const introductions: Partial<Record<PierrotOfferId, number>> = {};
  const historyIntroductions: Partial<Record<PierrotOfferId, number>> = {};
  const shownIntroductions: Partial<Record<PierrotOfferId, number>> = {};
  const viewedIntroductions: Partial<Record<PierrotOfferId, number>> = {};
  const selectedIntroductions: Partial<Record<PierrotOfferId, number>> = {};
  let lastOfferId: PierrotOfferId | null = null;
  let lastOfferIndex: number | null = null;
  let lastOfferAt: string | null = null;
  let returnedFromOfferId: PierrotOfferId | null = null;

  const items = Array.isArray(history) ? history : [];

  items.forEach((item, index) => {
    const entry = asRecord(item);
    const marker = markerFrom(entry.commercialMarker ?? entry.commercial);
    let introducedInThisItem: PierrotOfferId | null = null;

    if (entry.role === 'assistant' && isPierrotOfferId(entry.offerId)) {
      introduced.add(entry.offerId);
      displayed.add(entry.offerId);
      bumpIntroduction(historyIntroductions, entry.offerId);
      introducedInThisItem = entry.offerId;
      lastOfferId = entry.offerId;
      lastOfferIndex = index;
    }

    if (!marker) return;

    if (marker.action === 'introduced') {
      introduced.add(marker.offerId);
      displayed.add(marker.offerId);
      if (introducedInThisItem !== marker.offerId) {
        bumpIntroduction(historyIntroductions, marker.offerId);
      }
      lastOfferId = marker.offerId;
      lastOfferIndex = index;
    } else if (marker.action === 'objection') {
      objections.add(marker.offerId);
    } else if (marker.action === 'declined') {
      declined.add(marker.offerId);
    } else if (marker.action === 'purchased') {
      purchased.add(marker.offerId);
    } else if (marker.action === 'subscribed') {
      subscribed.add(marker.offerId);
    }
  });

  for (const event of [...events, ...subscriptionEvents]) {
    const name =
      typeof event.eventName === 'string'
        ? event.eventName
        : typeof event.event_name === 'string'
          ? event.event_name
          : '';
    const payload = asRecord(event.payload);
    const offerId = payload.offer_id;

    if (name === 'subscription_confirmed') {
      subscribed.add('journal_flow');
      continue;
    }

    if (!EVENT_NAMES.has(name)) continue;

    if (
      name === 'offer_selected' ||
      name === 'offer_shown' ||
      name === 'offer_viewed' ||
      name === 'cta_shown'
    ) {
      if (isPierrotOfferId(offerId)) {
        introduced.add(offerId);
        displayed.add(offerId);

        if (name === 'offer_shown') {
          bumpIntroduction(shownIntroductions, offerId);
        } else if (name === 'offer_viewed') {
          // Actual client view. Kept separate from `offer_shown` so a display
          // and its later view never double-count the same turn.
          bumpIntroduction(viewedIntroductions, offerId);
        } else if (name === 'offer_selected') {
          bumpIntroduction(selectedIntroductions, offerId);
        }

        lastOfferId = offerId;

        const createdAt =
          typeof event.createdAt === 'string'
            ? event.createdAt
            : typeof event.created_at === 'string'
              ? event.created_at
              : null;

        if (createdAt && (!lastOfferAt || createdAt > lastOfferAt)) {
          lastOfferAt = createdAt;
        }
      }
      continue;
    }

    if (name === 'commercial_declined' && isPierrotOfferId(offerId)) {
      declined.add(offerId);
      continue;
    }

    if (
      name === 'intent_classified' &&
      payload.topic === 'price_objection' &&
      isPierrotOfferId(offerId)
    ) {
      objections.add(offerId);
      continue;
    }

    if (name === 'commercial_returned' && isPierrotOfferId(payload.from_offer_id)) {
      returnedFromOfferId = payload.from_offer_id;
      continue;
    }

    if (name === 'order_paid') {
      purchased.add(isPierrotOfferId(offerId) ? offerId : 'heart_angel_postcard');
      continue;
    }

    if (name === 'purchase_completed' && isPierrotOfferId(offerId)) {
      purchased.add(offerId);
      continue;
    }

    if (name === 'unframed_purchase_confirmed') {
      purchased.add('unframed');
    }
  }

  const turnsSinceLastOffer =
    lastOfferIndex === null ? Number.POSITIVE_INFINITY : items.length - lastOfferIndex;

  for (const offerId of PROACTIVE_OFFER_IDS) {
    introductions[offerId] = Math.max(
      historyIntroductions[offerId] ?? 0,
      shownIntroductions[offerId] ?? 0,
      viewedIntroductions[offerId] ?? 0,
      selectedIntroductions[offerId] ?? 0
    );
  }

  return {
    introducedOfferIds: uniqueOfferIds(Array.from(introduced)),
    displayedOfferIds: uniqueOfferIds(Array.from(displayed)),
    declinedOfferIds: uniqueOfferIds(Array.from(declined)),
    objectionOfferIds: uniqueOfferIds(Array.from(objections)),
    purchasedOfferIds: uniqueOfferIds(Array.from(purchased)),
    subscribedOfferIds: uniqueOfferIds(Array.from(subscribed)),
    offerIntroductions: introductions,
    lastOfferId,
    turnsSinceLastOffer,
    lastOfferAt,
    returnedFromOfferId,
  };
}

export function mergePierrotCommercialStates(
  ...states: Array<PierrotCommercialState | null | undefined>
): PierrotCommercialState {
  const merged = emptyPierrotCommercialState();
  const introductions: Partial<Record<PierrotOfferId, number>> = {};
  let lastOfferId: PierrotOfferId | null = null;
  let turns = Number.POSITIVE_INFINITY;
  let lastOfferAt: string | null = null;
  let returned: PierrotOfferId | null = null;

  for (const state of states) {
    if (!state) continue;

    merged.introducedOfferIds = uniqueOfferIds([
      ...merged.introducedOfferIds,
      ...state.introducedOfferIds,
    ]);
    merged.displayedOfferIds = uniqueOfferIds([
      ...merged.displayedOfferIds,
      ...state.displayedOfferIds,
    ]);
    merged.declinedOfferIds = uniqueOfferIds([
      ...merged.declinedOfferIds,
      ...state.declinedOfferIds,
    ]);
    merged.objectionOfferIds = uniqueOfferIds([
      ...merged.objectionOfferIds,
      ...state.objectionOfferIds,
    ]);
    merged.purchasedOfferIds = uniqueOfferIds([
      ...merged.purchasedOfferIds,
      ...state.purchasedOfferIds,
    ]);
    merged.subscribedOfferIds = uniqueOfferIds([
      ...merged.subscribedOfferIds,
      ...state.subscribedOfferIds,
    ]);

    for (const offerId of PROACTIVE_OFFER_IDS) {
      introductions[offerId] = Math.max(
        introductions[offerId] ?? 0,
        state.offerIntroductions[offerId] ?? 0
      );
    }

    lastOfferId = state.lastOfferId ?? lastOfferId;
    turns = Math.min(turns, state.turnsSinceLastOffer);
    if (state.lastOfferAt && (!lastOfferAt || state.lastOfferAt > lastOfferAt)) {
      lastOfferAt = state.lastOfferAt;
    }
    returned = state.returnedFromOfferId ?? returned;
  }

  merged.offerIntroductions = introductions;
  merged.lastOfferId = lastOfferId;
  merged.turnsSinceLastOffer = turns;
  merged.lastOfferAt = lastOfferAt;
  merged.returnedFromOfferId = returned;

  return merged;
}

export function scorePierrotOfferInterest(
  message: string,
  offerId: PierrotOfferId
): { score: number; terms: string[] } {
  const terms =
    offerId === 'heart_angel_postcard'
      ? POSTCARD_TERMS
      : offerId === 'unframed'
        ? UNFRAMED_TERMS
        : offerId === 'journal_flow'
          ? JOURNAL_TERMS
          : [];

  const text = message.trim().toLowerCase();
  const matched: string[] = [];
  let score = 0;

  for (const entry of terms) {
    if (!containsTerm(text, entry.term)) continue;
    if (matched.includes(entry.term)) continue;

    matched.push(entry.term);
    score += entry.weight;
  }

  return { score: Number(score.toFixed(2)), terms: matched };
}

function isEligibleIntent(intent: PierrotIntent): boolean {
  if (intent.declined || intent.unknownProduct || intent.publisherIntent) return false;

  return (
    intent.name === 'general_question' ||
    intent.name === 'unknown' ||
    intent.name === 'uncertain' ||
    (intent.name === 'offer_information' && !intent.offerId)
  );
}

function chooseCandidate({
  message,
  intent,
  contextOfferId,
  state,
  pageEngagement,
  policies,
}: {
  message: string;
  intent: PierrotIntent;
  contextOfferId: PierrotOfferId | null;
  state: PierrotCommercialState;
  pageEngagement: boolean;
  policies?: PierrotOfferPolicyMap | null;
}): { offerId: PierrotOfferId; score: number } | null {
  const scored = PROACTIVE_OFFER_IDS.map((offerId) => ({
    offerId,
    ...scorePierrotOfferInterest(message, offerId),
    priority: getPierrotOfferPolicy(offerId, policies).priority,
  })).sort((a, b) => b.score + b.priority / 1000 - (a.score + a.priority / 1000));

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score <= 0) {
    // A genuine question about the page itself is a conversational signal,
    // not a page view: "what is this?", "tell me more", "how does it work?".
    if (pageEngagement && contextOfferId) {
      return { offerId: contextOfferId, score: 0.5 };
    }

    return null;
  }

  if (contextOfferId && best.offerId !== contextOfferId) {
    const contextual = scored.find((candidate) => candidate.offerId === contextOfferId);

    // On a relevant page, a clear signal for that page's offer wins. If the
    // page is the only concrete context and the visitor asked about it, prefer
    // it over an unrelated catalogue match.
    if (contextual && contextual.score > 0) {
      return { offerId: contextual.offerId, score: contextual.score };
    }

    if (pageEngagement) {
      return { offerId: contextOfferId, score: 0.5 };
    }
  }

  if (contextOfferId === best.offerId) {
    return { offerId: best.offerId, score: best.score };
  }

  // Off the offer's page, one ambiguous word is not enough. A returned visitor
  // may re-open the offer that brought them here.
  if (state.returnedFromOfferId === best.offerId && best.score > 0) {
    return { offerId: best.offerId, score: best.score };
  }

  if (best.score < 2 || (second && best.score - second.score < 1)) {
    return null;
  }

  return { offerId: best.offerId, score: best.score };
}

const PAGE_ENGAGEMENT_PHRASES = [
  'tell me more',
  'what is this',
  "what's this",
  'what am i looking at',
  'how does this work',
  'how does it work',
  'how do this',
  'why should i',
  'should i',
  'i like this',
  'i like it',
  'i want one',
  'i need one',
  "i'll take it",
  'can i get it',
  'i am interested',
  "i'm interested",
  'tell me about this',
  'tell me about it',
  'show me',
  'worth it',
  'what do i get',
  'с чего начать',
  'что это',
  'что здесь',
  'что тут',
  'как это работает',
  'как работает',
  'расскажи подробнее',
  'расскажи',
  'подробнее',
  'интересно',
  'нравится',
  'мне нравится',
  'хочу такую',
  'хочу такой',
  'хочу это',
  'стоит ли',
  'хочу узнать',
];

const NEGATIVE_ENGAGEMENT_TERMS = [
  "don't like",
  'do not like',
  'not really',
  'not for me',
  'no thanks',
  'не нравится',
  'не интересно',
  'не надо',
  'нет спасибо',
];

/**
 * A page-aware question or expression of curiosity. This is deliberately
 * narrower than "asked anything while on the page": the message must point at
 * the thing in front of the visitor (this/it/here) or explicitly ask to know
 * more.
 */
export function hasPierrotPageEngagementSignal(message: string, intent: PierrotIntent): boolean {
  const text = message.trim().toLowerCase();

  if (!text) return false;
  if (intent.declined) return false;
  if (NEGATIVE_ENGAGEMENT_TERMS.some((term) => text.includes(term))) return false;

  if (intent.topic === 'product') return true;

  return PAGE_ENGAGEMENT_PHRASES.some((phrase) => text.includes(phrase));
}

export function selectProactivePierrotOffer({
  message,
  intent,
  pathname,
  state,
  runtime,
  contextOfferId,
  policies,
}: {
  message: string;
  intent: PierrotIntent;
  pathname?: string | null;
  state: PierrotCommercialState;
  runtime?: PierrotOfferRuntime | null;
  contextOfferId?: PierrotOfferId | null;
  policies?: PierrotOfferPolicyMap | null;
}): PierrotProactiveOffer | null {
  if (!isEligibleIntent(intent)) return null;

  const page = resolvePierrotPageContext(pathname);

  // These surfaces must not receive an unprompted consumer pitch. Explicit
  // product questions still work through the normal intent path.
  if (page.surface === 'unframed_proposal' || page.surface === 'flow_join') return null;

  const pageEngagement = hasPierrotPageEngagementSignal(message, intent);

  const candidate = chooseCandidate({
    message,
    intent,
    contextOfferId: contextOfferId ?? page.contextOfferId,
    state,
    pageEngagement,
    policies,
  });

  if (!candidate) return null;

  const { offerId } = candidate;

  if (state.declinedOfferIds.includes(offerId)) return null;
  if (state.purchasedOfferIds.includes(offerId)) return null;
  if (state.objectionOfferIds.includes(offerId)) return null;

  if (offerId === 'journal_flow') {
    if (runtime?.subscribed === true || state.subscribedOfferIds.includes('journal_flow')) {
      return null;
    }
  }

  if (offerId === 'heart_angel_postcard' && runtime?.available === false) {
    return null;
  }

  const policy = getPierrotOfferPolicy(offerId, policies);

  if (!policy.enabled || !policy.allowProactive) return null;

  const introductions = state.offerIntroductions[offerId] ?? 0;

  if (introductions >= policy.maxShowsPerConversation) return null;

  // Product-specific relevance. The first page-aware introduction may use the
  // lower page-engagement score; later pitches need a fresh message signal.
  if (introductions > 0 && candidate.score < policy.minInterestScore) {
    return null;
  }

  if (
    policy.requiresRepeatedEngagement &&
    introductions === 0 &&
    !pageEngagement &&
    candidate.score < policy.minInterestScore
  ) {
    return null;
  }

  // A different offer immediately after the previous pitch is noise. This
  // does not block a direct answer to the visitor's new question.
  if (
    state.lastOfferId &&
    state.lastOfferId !== offerId &&
    state.turnsSinceLastOffer < policy.cooldownTurns
  ) {
    return null;
  }

  if (state.lastOfferAt && policy.cooldownSeconds > 0) {
    const elapsedMs = Date.now() - new Date(state.lastOfferAt).getTime();

    if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < policy.cooldownSeconds * 1000) {
      return null;
    }
  }

  const reasons = REASONS[offerId];

  if (reasons.length === 0) return null;

  const reason = reasons[Math.min(introductions, reasons.length - 1)];

  return {
    offerId,
    stage: introductions === 0 ? 'interest' : 'consideration',
    reason: policy.recommendationCopy || reason.reason,
    angle: reason.angle,
    score: candidate.score,
  };
}

export function commercialStageForIntent(intent: PierrotIntent): PierrotCommercialStage {
  if (intent.name === 'purchase_intent' || intent.name === 'subscription_intent') {
    return 'conversion';
  }

  if (
    intent.topic === 'price' ||
    intent.topic === 'price_objection' ||
    intent.topic === 'delivery' ||
    intent.topic === 'materials' ||
    intent.topic === 'availability' ||
    intent.topic === 'recipient'
  ) {
    return 'consideration';
  }

  if (intent.name === 'book_inquiry' || intent.name === 'offer_information') {
    return 'interest';
  }

  return 'exploration';
}
