import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/commercialIntelligence');

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectCommercialQuestion,
  type CommercialQuestion,
} from '@/lib/pierrot/commercialQuestion';
import type {
  CommercialMoneyTotal,
  CommercialPeriodSummary,
  CommercialSummary,
} from '@/lib/pierrot/commercialSummary';
import {
  formatPreviousPeriod,
  formatReportingPeriod,
  parseCalendarDate,
  resolveReportingPeriod,
  type ReportingPeriod,
} from '@/lib/pierrot/reportingPeriod';

export type CommercialLanguage = 'ru' | 'en';

type EventRow = {
  event_name?: string | null;
  source_event_name?: string | null;
  offer_id?: string | null;
  product_id?: string | null;
  conversation_id?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

type PurchaseRow = {
  conversation_id?: string | null;
  offer_id?: string | null;
  order_id?: string | null;
  provider_session_id?: string | null;
  amount_total?: number | string | null;
  currency?: string | null;
  source_event?: string | null;
  created_at?: string | null;
};

type DonationRow = {
  conversation_id?: string | null;
  offer_id?: string | null;
  provider_session_id?: string | null;
  amount_total?: number | string | null;
  currency?: string | null;
  source?: string | null;
  created_at?: string | null;
};

type SubscriptionRow = {
  subscriber_id?: string | null;
  conversation_id?: string | null;
  confirmed_at?: string | null;
  is_first_confirmation?: boolean | null;
  subscriber_created_at?: string | null;
};

type PostcardSaleRow = {
  order_id?: string | null;
  offer_id?: string | null;
  amount_minor?: number | string | null;
  currency?: string | null;
  status?: string | null;
  occurred_at?: string | null;
};

type TributeDonationRow = {
  stripe_session_id?: string | null;
  amount_minor?: number | string | null;
  currency?: string | null;
  occurred_at?: string | null;
};

type LoadError = { source: string; code: string };

type PeriodData = {
  start: Date;
  conversations: number;
  events: EventRow[];
  purchases: PurchaseRow[];
  donations: DonationRow[];
  subscriptions: SubscriptionRow[];
  postcards: PostcardSaleRow[];
  tributes: TributeDonationRow[];
  errors: LoadError[];
  viewsAvailable: boolean;
  postcardsAvailable: boolean;
  tributesAvailable: boolean;
  subscriptionsAvailable: boolean;
};

type OfferMetrics = {
  offerId: string;
  interest: Set<string>;
  eligible: Set<string>;
  selected: Set<string>;
  shown: Set<string>;
  viewed: Set<string>;
  cta: Set<string>;
  clicked: Set<string>;
  checkout: Set<string>;
  purchase: Set<string>;
  donation: Set<string>;
  subscription: Set<string>;
};

export type CommercialSnapshot = {
  period: ReportingPeriod;
  current: PeriodData;
  previous: PeriodData;
};

const DEFAULT_TIMEZONE = 'Europe/London';
const DEFAULT_EXPERIMENT_START = '2026-11-02';
const PAGE_SIZE = 1000;

const EMPTY_OFFER_METRICS = (offerId: string): OfferMetrics => ({
  offerId,
  interest: new Set(),
  eligible: new Set(),
  selected: new Set(),
  shown: new Set(),
  viewed: new Set(),
  cta: new Set(),
  clicked: new Set(),
  checkout: new Set(),
  purchase: new Set(),
  donation: new Set(),
  subscription: new Set(),
});

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'unknown';
}

async function readRows<T>(
  store: SupabaseClient,
  table: string,
  columns: string,
  start: Date,
  end: Date,
  timeColumn: string
): Promise<{ rows: T[]; error: unknown | null }> {
  const rows: T[] = [];
  let offset = 0;

  try {
    while (offset < 20_000) {
      const { data, error } = await store
        .from(table)
        .select(columns)
        .gte(timeColumn, start.toISOString())
        .lt(timeColumn, end.toISOString())
        .order(timeColumn, { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) return { rows, error };

      if (!Array.isArray(data) || data.length === 0) break;

      rows.push(...(data as T[]));

      if (data.length < PAGE_SIZE) break;

      offset += PAGE_SIZE;
    }

    return { rows, error: null };
  } catch (error) {
    return { rows, error };
  }
}

async function countConversations(
  store: SupabaseClient,
  start: Date,
  end: Date
): Promise<number> {
  try {
    const { count, error } = await store
      .from('pierrot_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', start.toISOString())
      .lt('started_at', end.toISOString());

    if (error) return 0;

    return count ?? 0;
  } catch {
    return 0;
  }
}

function offerIdOf(row: {
  offer_id?: string | null;
  product_id?: string | null;
  payload?: Record<string, unknown> | null;
}): string | null {
  const payload = row.payload || {};
  const value =
    row.offer_id ||
    row.product_id ||
    (typeof payload.offer_id === 'string' ? payload.offer_id : null) ||
    (typeof payload.product_id === 'string' ? payload.product_id : null);

  return value && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function currencyValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

async function loadPeriodData(
  store: SupabaseClient,
  period: ReportingPeriod
): Promise<PeriodData> {
  const errors: LoadError[] = [];

  const [
    conversations,
    eventResult,
    purchaseResult,
    donationResult,
    subscriptionResult,
    postcardResult,
    tributeResult,
  ] = await Promise.all([
    countConversations(store, period.start, period.end),
    readRows<EventRow>(
      store,
      'pierrot_v_events',
      'event_name,offer_id,product_id,conversation_id,payload,created_at',
      period.start,
      period.end,
      'created_at'
    ),
    readRows<PurchaseRow>(
      store,
      'pierrot_v_purchases',
      'conversation_id,offer_id,order_id,provider_session_id,amount_total,currency,source_event,created_at',
      period.start,
      period.end,
      'created_at'
    ),
    readRows<DonationRow>(
      store,
      'pierrot_v_donations',
      'conversation_id,offer_id,provider_session_id,amount_total,currency,source,created_at',
      period.start,
      period.end,
      'created_at'
    ),
    readRows<SubscriptionRow>(
      store,
      'pierrot_v_subscription_conversions',
      'subscriber_id,conversation_id,confirmed_at,is_first_confirmation,subscriber_created_at',
      period.start,
      period.end,
      'confirmed_at'
    ),
    readRows<PostcardSaleRow>(
      store,
      'pierrot_v_postcard_sales',
      'order_id,offer_id,amount_minor,currency,status,occurred_at',
      period.start,
      period.end,
      'occurred_at'
    ),
    readRows<TributeDonationRow>(
      store,
      'pierrot_v_tribute_donations',
      'stripe_session_id,amount_minor,currency,occurred_at',
      period.start,
      period.end,
      'occurred_at'
    ),
  ]);

  let events = eventResult.rows;
  let viewsAvailable = !eventResult.error;

  if (eventResult.error) {
    errors.push({ source: 'pierrot_v_events', code: errorCode(eventResult.error) });
    // Fall back to the raw private event table. The payload shape is the same.
    const fallback = await readRows<EventRow>(
      store,
      'pierrot_events',
      'event_name,payload,created_at',
      period.start,
      period.end,
      'created_at'
    );

    if (fallback.error) {
      errors.push({ source: 'pierrot_events', code: errorCode(fallback.error) });
      events = [];
    } else {
      viewsAvailable = false;
      events = fallback.rows;
    }
  }

  const purchases = purchaseResult.error ? [] : purchaseResult.rows;
  const donations = donationResult.error ? [] : donationResult.rows;
  const subscriptions = subscriptionResult.error ? [] : subscriptionResult.rows;

  if (purchaseResult.error) {
    errors.push({ source: 'pierrot_v_purchases', code: errorCode(purchaseResult.error) });
  }
  if (donationResult.error) {
    errors.push({ source: 'pierrot_v_donations', code: errorCode(donationResult.error) });
  }
  if (subscriptionResult.error) {
    errors.push({
      source: 'pierrot_v_subscription_conversions',
      code: errorCode(subscriptionResult.error),
    });
  }

  if (postcardResult.error) {
    errors.push({ source: 'pierrot_v_postcard_sales', code: errorCode(postcardResult.error) });
  }
  if (tributeResult.error) {
    errors.push({ source: 'pierrot_v_tribute_donations', code: errorCode(tributeResult.error) });
  }

  return {
    start: period.start,
    conversations,
    events,
    purchases,
    donations,
    subscriptions,
    postcards: postcardResult.error ? [] : postcardResult.rows,
    tributes: tributeResult.error ? [] : tributeResult.rows,
    errors,
    viewsAvailable,
    postcardsAvailable: !postcardResult.error,
    tributesAvailable: !tributeResult.error,
    subscriptionsAvailable: !subscriptionResult.error,
  };
}

function addToSet(
  metrics: Map<string, OfferMetrics>,
  offerId: string,
  key: keyof Omit<OfferMetrics, 'offerId'>,
  conversationId: string | null | undefined
): void {
  if (!conversationId) return;

  const current = metrics.get(offerId) ?? EMPTY_OFFER_METRICS(offerId);
  current[key].add(conversationId);
  metrics.set(offerId, current);
}

function buildOfferMetrics(data: PeriodData): Map<string, OfferMetrics> {
  const metrics = new Map<string, OfferMetrics>();

  for (const row of data.events) {
    const offerId = offerIdOf(row);
    const eventName = row.event_name || row.source_event_name;

    if (!offerId || !eventName) continue;

    const key =
      eventName === 'interest_detected'
        ? 'interest'
        : eventName === 'offer_eligible'
          ? 'eligible'
          : eventName === 'offer_selected'
            ? 'selected'
            : eventName === 'offer_shown'
              ? 'shown'
              : eventName === 'offer_viewed'
                ? 'viewed'
                : eventName === 'cta_shown'
                  ? 'cta'
                  : eventName === 'offer_action_clicked'
                    ? 'clicked'
                    : eventName === 'checkout_started'
                      ? 'checkout'
                      : eventName === 'donation_completed'
                        ? 'donation'
                        : null;

    if (key) addToSet(metrics, offerId, key, row.conversation_id);
  }

  for (const row of data.purchases) {
    const offerId = row.offer_id;
    if (offerId) addToSet(metrics, offerId, 'purchase', row.conversation_id);
  }

  for (const row of data.donations) {
    const offerId = row.offer_id || 'temple_tribute';
    addToSet(metrics, offerId, 'donation', row.conversation_id);
  }

  for (const row of newSubscriptions(data).attributed) {
    addToSet(metrics, 'journal_flow', 'subscription', row.conversation_id);
  }

  return metrics;
}

function union(...sets: Array<Set<string>>): Set<string> {
  const result = new Set<string>();
  for (const set of sets) for (const value of set) result.add(value);
  return result;
}

function stageSets(metrics: Map<string, OfferMetrics>) {
  const all = Array.from(metrics.values());

  return {
    interest: union(...all.map((entry) => entry.interest)),
    eligible: union(...all.map((entry) => entry.eligible)),
    selected: union(...all.map((entry) => entry.selected)),
    shown: union(...all.map((entry) => entry.shown)),
    viewed: union(...all.map((entry) => entry.viewed)),
    cta: union(...all.map((entry) => entry.cta)),
    clicked: union(...all.map((entry) => entry.clicked)),
    checkout: union(...all.map((entry) => entry.checkout)),
    purchase: union(...all.map((entry) => entry.purchase)),
    donation: union(...all.map((entry) => entry.donation)),
    subscription: union(...all.map((entry) => entry.subscription)),
  };
}

type MoneyTotal = { currency: string; amountMinor: number; count: number };

function addMoney(map: Map<string, MoneyTotal>, currency: string | null, amount: number | null) {
  if (!currency || amount === null || !Number.isFinite(amount)) return;

  const current = map.get(currency) ?? { currency, amountMinor: 0, count: 0 };
  current.amountMinor += amount;
  current.count += 1;
  map.set(currency, current);
}

function moneyFromPurchases(rows: PurchaseRow[]): MoneyTotal[] {
  const map = new Map<string, MoneyTotal>();

  for (const row of rows) {
    addMoney(
      map,
      currencyValue(row.currency),
      numberValue(row.amount_total)
    );
  }

  return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function moneyFromDonations(rows: DonationRow[]): MoneyTotal[] {
  const map = new Map<string, MoneyTotal>();

  for (const row of rows) {
    addMoney(
      map,
      currencyValue(row.currency),
      numberValue(row.amount_total)
    );
  }

  return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function moneyFromPostcards(rows: PostcardSaleRow[]): MoneyTotal[] {
  const map = new Map<string, MoneyTotal>();

  for (const row of rows) {
    addMoney(
      map,
      currencyValue(row.currency),
      numberValue(row.amount_minor)
    );
  }

  return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function moneyFromTributes(rows: TributeDonationRow[]): MoneyTotal[] {
  const map = new Map<string, MoneyTotal>();

  for (const row of rows) {
    addMoney(
      map,
      currencyValue(row.currency),
      numberValue(row.amount_minor)
    );
  }

  return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function formatMoney(amountMinor: number, currency: string, language: CommercialLanguage): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

function formatMoneyTotals(
  totals: MoneyTotal[],
  language: CommercialLanguage
): string {
  if (totals.length === 0) return language === 'ru' ? 'нет' : 'none';

  return totals
    .map((total) => formatMoney(total.amountMinor, total.currency, language))
    .join(' + ');
}

function offerLabel(offerId: string, language: CommercialLanguage): string {
  const labels: Record<string, { ru: string; en: string }> = {
    unframed: { ru: 'UNFRAMED', en: 'UNFRAMED' },
    heart_angel_postcard: { ru: 'Открытки Heart & Angel', en: 'Heart & Angel postcards' },
    temple_tribute: { ru: 'Temple Tribute (пожертвования)', en: 'Temple Tribute (donations)' },
    journal_flow: { ru: 'Flow', en: 'Flow' },
    art_engine: { ru: 'Art Engine', en: 'Art Engine' },
    advising: { ru: 'Advising', en: 'Advising' },
  };

  return labels[offerId]?.[language] ?? offerId;
}

function capitalized(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function attributedByOffer(data: PeriodData, offerId: string): {
  purchases: PurchaseRow[];
  donations: DonationRow[];
  subscriptions: SubscriptionRow[];
} {
  return {
    purchases: data.purchases.filter((row) => row.offer_id === offerId),
    donations:
      offerId === 'temple_tribute'
        ? data.donations.filter((row) => (row.offer_id || 'temple_tribute') === offerId)
        : [],
    subscriptions:
      offerId === 'journal_flow'
        ? newSubscriptions(data).attributed
        : [],
  };
}

function confirmedConversions(data: PeriodData): number {
  return (
    data.purchases.length +
    data.donations.length +
    newSubscriptions(data).attributed.length
  );
}

function unknownPostcards(data: PeriodData): {
  count: number;
  totals: MoneyTotal[];
  available: boolean;
} {
  if (!data.postcardsAvailable) return { count: 0, totals: [], available: false };

  const attributedOrderIds = new Set(
    data.purchases
      .filter((row) => row.offer_id === 'heart_angel_postcard' && row.order_id)
      .map((row) => row.order_id as string)
  );

  const unknown = data.postcards.filter(
    (row) => !row.order_id || !attributedOrderIds.has(row.order_id)
  );

  return {
    count: unknown.length,
    totals: moneyFromPostcards(unknown),
    available: true,
  };
}

function unknownTributes(data: PeriodData): {
  count: number;
  totals: MoneyTotal[];
  available: boolean;
} {
  if (!data.tributesAvailable) return { count: 0, totals: [], available: false };

  const attributedSessions = new Set(
    data.donations
      .filter((row) => (row.offer_id || 'temple_tribute') === 'temple_tribute' && row.provider_session_id)
      .map((row) => row.provider_session_id as string)
  );

  const unknown = data.tributes.filter(
    (row) => !row.stripe_session_id || !attributedSessions.has(row.stripe_session_id)
  );

  return {
    count: unknown.length,
    totals: moneyFromTributes(unknown),
    available: true,
  };
}

function newSubscriptions(data: PeriodData): {
  all: SubscriptionRow[];
  attributed: SubscriptionRow[];
} {
  // A subscriber row that predates the period is not new, even if a later
  // confirmation event exists. This prevents a returning subscriber from
  // being counted as a new confirmed subscription.
  const all = data.subscriptions.filter((row) => {
    if (row.is_first_confirmation !== true) return false;
    if (!row.subscriber_created_at) return false;

    const createdAt = Date.parse(row.subscriber_created_at);

    return Number.isFinite(createdAt) && createdAt >= data.start.getTime();
  });

  return {
    all,
    attributed: all.filter((row) => Boolean(row.conversation_id)),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

type Diagnosis = {
  key:
    | 'instrumentation'
    | 'traffic_or_interest'
    | 'not_selected'
    | 'not_shown'
    | 'not_viewed'
    | 'no_cta_click'
    | 'no_checkout'
    | 'no_payment'
    | 'working';
  ratio: number | null;
  evidenceRu: string;
  evidenceEn: string;
  caveatRu: string;
  caveatEn: string;
};

function diagnose(data: PeriodData): Diagnosis {
  if (!data.viewsAvailable && data.events.length === 0) {
    return {
      key: 'instrumentation',
      ratio: null,
      evidenceRu:
        'События воронки недоступны. Нельзя определить слабый переход, не выдумывая данные.',
      evidenceEn:
        'The funnel events are unavailable. The weakest transition cannot be identified without inventing data.',
      caveatRu: 'Это ограничение сбора данных, а не доказательство отсутствия спроса.',
      caveatEn: 'This is a measurement limitation, not evidence that demand is absent.',
    };
  }

  const metrics = buildOfferMetrics(data);
  const stages = stageSets(metrics);

  const interest = stages.interest.size;
  const selected = stages.selected.size;
  const shown = stages.shown.size;
  const viewed = stages.viewed.size;
  const clicked = stages.clicked.size;
  const checkout = stages.checkout.size;
  const paid = union(stages.purchase, stages.donation).size;

  const paymentCaveatRu =
    'Начатый checkout и незавершённая оплата не различают отказ, сбой Stripe и потерю атрибуции: отдельного события неуспешной оплаты нет.';
  const paymentCaveatEn =
    'A started checkout followed by no confirmation cannot distinguish abandonment, a Stripe failure and lost attribution: there is no failed-payment event.';

  if (interest < 3) {
    return {
      key: 'traffic_or_interest',
      ratio: ratio(interest, data.conversations),
      evidenceRu: `Коммерческий интерес зафиксирован только в ${interest} диалог(ах) при ${data.conversations} диалогах за период. Этого мало, чтобы отделить недостаток трафика от недостатка релевантного интереса.`,
      evidenceEn: `Commercial interest was recorded in only ${interest} conversation(s) across ${data.conversations} conversations in the period. That is too little to separate low traffic from low relevant interest.`,
      caveatRu:
        'Число диалогов включает сессии владельца: в исторических данных нет отдельного признака owner-сессии. Это не доказательство того, что виновата цена.',
      caveatEn:
        'The conversation count includes owner sessions: historical data has no owner-session flag. This is not evidence that price is the cause.',
    };
  }

  const transitions: Array<{
    key: Diagnosis['key'];
    from: string;
    to: string;
    numerator: number;
    denominator: number;
    ru: string;
    en: string;
  }> = [
    {
      key: 'not_selected',
      from: 'interest',
      to: 'selection',
      numerator: selected,
      denominator: interest,
      ru: 'интерес есть, но предложение не выбирается планировщиком',
      en: 'interest exists, but the planner does not select an offer',
    },
    {
      key: 'not_shown',
      from: 'selection',
      to: 'display',
      numerator: shown,
      denominator: selected,
      ru: 'предложение выбрано, но не доходит до ответа',
      en: 'an offer is selected but never reaches the reply',
    },
    {
      key: 'not_viewed',
      from: 'display',
      to: 'view',
      numerator: viewed,
      denominator: shown,
      ru: 'показанное предложение не фиксируется как увиденное',
      en: 'a shown offer is not recorded as viewed',
    },
    {
      key: 'no_cta_click',
      from: 'view',
      to: 'click',
      numerator: clicked,
      denominator: viewed,
      ru: 'после просмотра предложения нет клика по CTA',
      en: 'viewing the offer does not lead to a CTA click',
    },
    {
      key: 'no_checkout',
      from: 'click',
      to: 'checkout',
      numerator: checkout,
      denominator: clicked,
      ru: 'после клика по CTA не начинается checkout',
      en: 'a CTA click does not start checkout',
    },
    {
      key: 'no_payment',
      from: 'checkout',
      to: 'confirmation',
      numerator: paid,
      denominator: checkout,
      ru: 'checkout начинается, но подтверждённой оплаты нет',
      en: 'checkout starts but no payment is confirmed',
    },
  ];

  const measurable = transitions.filter(
    (transition) => transition.denominator >= 3
  );

  if (measurable.length === 0) {
    return {
      key: 'traffic_or_interest',
      ratio: null,
      evidenceRu:
        'На каждом переходе воронки меньше трёх наблюдений. Слабейший переход статистически не определяется; это вопрос объёма данных.',
      evidenceEn:
        'Every funnel transition has fewer than three observations. The weakest transition cannot be identified statistically; this is a data-volume problem.',
      caveatRu:
        'Нельзя утверждать, что причина — цена, сценарий или трафик. Нужно накопить больше коммерческих диалогов.',
      caveatEn:
        'It cannot be claimed that price, copy or traffic is the cause. More commercial conversations are needed.',
    };
  }

  const weakest = measurable.sort(
    (a, b) => (ratio(a.numerator, a.denominator) ?? 1) - (ratio(b.numerator, b.denominator) ?? 1)
  )[0];

  return {
    key: weakest.key,
    ratio: ratio(weakest.numerator, weakest.denominator),
    evidenceRu: `Слабейший измеримый переход — ${weakest.from} → ${weakest.to}: ${weakest.numerator} из ${weakest.denominator}. Похоже, ${weakest.ru}.`,
    evidenceEn: `The weakest measurable transition is ${weakest.from} → ${weakest.to}: ${weakest.numerator} of ${weakest.denominator}. This suggests that ${weakest.en}.`,
    caveatRu: paymentCaveatRu,
    caveatEn: paymentCaveatEn,
  };
}

type Recommendation = {
  ru: { what: string; why: string; measure: string; keep: string };
  en: { what: string; why: string; measure: string; keep: string };
};

function recommendations(
  data: PeriodData,
  diagnosis: Diagnosis,
  weekly: boolean
): Recommendation[] {
  const result: Recommendation[] = [];

  const instrumentation: Recommendation = {
    ru: {
      what: 'Проверить и включить существующую воронку событий на всех четырёх путях: показ, просмотр, CTA, checkout, подтверждение.',
      why: `В данных есть пробел: ${diagnosis.evidenceRu}`,
      measure: 'На следующей неделе — наличие событий offer_shown, offer_viewed, cta_shown, checkout_started и подтверждений по каждому пути.',
      keep: 'Цены, checkout, email-подтверждение и существующие страницы не менять.',
    },
    en: {
      what: 'Verify and enable the existing event funnel on all four paths: display, view, CTA, checkout and confirmation.',
      why: `There is a measurement gap: ${diagnosis.evidenceEn}`,
      measure: 'Next week: presence of offer_shown, offer_viewed, cta_shown, checkout_started and confirmations on every path.',
      keep: 'Do not change prices, checkout, email confirmation or existing pages.',
    },
  };

  if (diagnosis.key === 'instrumentation') {
    result.push(instrumentation);
  } else if (diagnosis.key === 'traffic_or_interest') {
    result.push({
      ru: {
        what: 'Выбрать одну существующую страницу (UNFRAMED или Heart & Angel) и один сценарий приглашения к разговору; остальные оставить как есть.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — число диалогов с interest_detected и offer_shown на этой странице.',
        keep: 'Цены, checkout, каталог, остальные предложения и всю навигацию не менять.',
      },
      en: {
        what: 'Choose one existing page (UNFRAMED or Heart & Angel) and one conversation entry point; leave the others unchanged.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: conversations with interest_detected and offer_shown on that page.',
        keep: 'Do not change prices, checkout, catalogue, other offers or navigation.',
      },
    });
  } else if (diagnosis.key === 'not_selected' || diagnosis.key === 'not_shown') {
    result.push({
      ru: {
        what: 'Проверить политику показа одного предложения: порог интереса, cooldown и фактическое включение в ответ. Не менять текст всех предложений сразу.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — offer_selected → offer_shown на выбранном предложении.',
        keep: 'Цены, checkout и остальные предложения не менять.',
      },
      en: {
        what: 'Review the display policy for one offer: interest threshold, cooldown and whether it actually enters the reply. Do not rewrite every offer at once.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: offer_selected → offer_shown for that one offer.',
        keep: 'Do not change prices, checkout or other offers.',
      },
    });
  } else if (diagnosis.key === 'not_viewed' || diagnosis.key === 'no_cta_click') {
    result.push({
      ru: {
        what: 'Переписать один вводный абзац и одну подпись CTA на существующей странице выбранного предложения.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — offer_viewed → offer_action_clicked на этом предложении.',
        keep: 'Цену, checkout и другие страницы не менять.',
      },
      en: {
        what: 'Rewrite one introductory paragraph and one CTA label on the existing page for one chosen offer.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: offer_viewed → offer_action_clicked for that offer.',
        keep: 'Do not change the price, checkout or other pages.',
      },
    });
  } else if (diagnosis.key === 'no_checkout') {
    result.push({
      ru: {
        what: 'Убрать одно измеримое трение между CTA и существующим checkout на одном пути.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — checkout_started на этом пути.',
        keep: 'Цену, Stripe-конфигурацию и остальные пути не менять.',
      },
      en: {
        what: 'Remove one measurable friction point between the CTA and the existing checkout on one path.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: checkout_started on that path.',
        keep: 'Do not change the price, Stripe configuration or other paths.',
      },
    });
  } else if (diagnosis.key === 'no_payment') {
    result.push({
      ru: {
        what: 'Проверить один существующий checkout и журнал Stripe на ошибки и незавершённые сессии; не менять цену.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — checkout_started → подтверждённая оплата на этом пути.',
        keep: 'Цену, продукт и остальные пути не менять.',
      },
      en: {
        what: 'Inspect one existing checkout and the Stripe log for failures and incomplete sessions; do not change the price.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: checkout_started → confirmed payment on that path.',
        keep: 'Do not change the price, product or other paths.',
      },
    });
  } else {
    result.push({
      ru: {
        what: 'Повторить один и тот же рабочий сценарий ещё на одну неделю, не добавляя новых изменений.',
        why: diagnosis.evidenceRu,
        measure: 'На следующей неделе — число подтверждённых оплат и подписок по этому сценарию.',
        keep: 'Всё остальное не менять, чтобы результат был сравнимым.',
      },
      en: {
        what: 'Repeat the same working scenario for one more week without adding new changes.',
        why: diagnosis.evidenceEn,
        measure: 'Next week: confirmed payments and subscriptions from that scenario.',
        keep: 'Leave everything else unchanged so the result remains comparable.',
      },
    });
  }

  return weekly ? result.slice(0, 2) : result.slice(0, 3);
}

function formatAttributedRevenue(
  data: PeriodData,
  language: CommercialLanguage
): string[] {
  const lines: string[] = [];
  const postcard = attributedByOffer(data, 'heart_angel_postcard');
  const unframed = attributedByOffer(data, 'unframed');
  const tribute = attributedByOffer(data, 'temple_tribute');
  const flow = attributedByOffer(data, 'journal_flow');

  if (postcard.purchases.length === 0) {
    lines.push(
      language === 'ru'
        ? '- Открытки: подтверждённых продаж нет.'
        : '- Postcards: no confirmed sales.'
    );
  } else {
    lines.push(
      language === 'ru'
        ? `- Открытки: ${postcard.purchases.length} · ${formatMoneyTotals(
            moneyFromPurchases(postcard.purchases),
            language
          )}.`
        : `- Postcards: ${postcard.purchases.length} · ${formatMoneyTotals(
            moneyFromPurchases(postcard.purchases),
            language
          )}.`
    );
  }

  if (unframed.purchases.length === 0) {
    lines.push(
      language === 'ru'
        ? '- UNFRAMED: подтверждённых покупок нет.'
        : '- UNFRAMED: no confirmed purchases.'
    );
  } else {
    lines.push(
      language === 'ru'
        ? `- UNFRAMED: ${unframed.purchases.length} · ${formatMoneyTotals(
            moneyFromPurchases(unframed.purchases),
            language
          )}.`
        : `- UNFRAMED: ${unframed.purchases.length} · ${formatMoneyTotals(
            moneyFromPurchases(unframed.purchases),
            language
          )}.`
    );
  }

  if (tribute.donations.length === 0) {
    lines.push(
      language === 'ru'
        ? '- Temple: подтверждённых пожертвований нет.'
        : '- Temple: no confirmed donations.'
    );
  } else {
    lines.push(
      language === 'ru'
        ? `- Temple: ${tribute.donations.length} пожертвований · ${formatMoneyTotals(
            moneyFromDonations(tribute.donations),
            language
          )}.`
        : `- Temple: ${tribute.donations.length} donations · ${formatMoneyTotals(
            moneyFromDonations(tribute.donations),
            language
          )}.`
    );
  }

  lines.push(
    language === 'ru'
      ? `- Flow: ${flow.subscriptions.length} новых подтверждённых подписок.`
      : `- Flow: ${flow.subscriptions.length} new confirmed subscriptions.`
  );

  return lines;
}

function formatOverallRevenue(
  data: PeriodData,
  language: CommercialLanguage
): string[] {
  const lines: string[] = [];
  const subscriptions = newSubscriptions(data);

  if (data.postcardsAvailable) {
    lines.push(
      language === 'ru'
        ? `- Все оплаченные открытки на сайте: ${data.postcards.length}${
            data.postcards.length > 0
              ? ` · ${formatMoneyTotals(moneyFromPostcards(data.postcards), language)}`
              : '; выручки нет'
          }.`
        : `- All paid postcard orders on the site: ${data.postcards.length}${
            data.postcards.length > 0
              ? ` · ${formatMoneyTotals(moneyFromPostcards(data.postcards), language)}`
              : '; no revenue'
          }.`
    );
  } else {
    lines.push(
      language === 'ru'
        ? '- Все оплаченные открытки: источник недоступен.'
        : '- All paid postcards: source unavailable.'
    );
  }

  if (data.tributesAvailable) {
    lines.push(
      language === 'ru'
        ? `- Все подтверждённые Temple Tributes: ${data.tributes.length}${
            data.tributes.length > 0
              ? ` · ${formatMoneyTotals(moneyFromTributes(data.tributes), language)}`
              : '; поступлений нет'
          }.`
        : `- All confirmed Temple Tributes: ${data.tributes.length}${
            data.tributes.length > 0
              ? ` · ${formatMoneyTotals(moneyFromTributes(data.tributes), language)}`
              : '; no donations'
          }.`
    );
  } else {
    lines.push(
      language === 'ru'
        ? '- Все Temple Tributes: источник недоступен.'
        : '- All Temple Tributes: source unavailable.'
    );
  }

  lines.push(
    language === 'ru'
      ? '- UNFRAMED на уровне всего сайта: авторитетного журнала продаж нет; известны только атрибутированные события Stripe.'
      : '- UNFRAMED site-wide: no authoritative sales ledger exists; only attributed Stripe events are known.'
  );

  if (data.subscriptionsAvailable) {
    lines.push(
      language === 'ru'
        ? `- Все новые подтверждённые подписки Flow: ${subscriptions.all.length}.`
        : `- All new confirmed Flow subscriptions: ${subscriptions.all.length}.`
    );
  } else {
    lines.push(
      language === 'ru'
        ? '- Новые подписки Flow: источник недоступен.'
        : '- New Flow subscriptions: source unavailable.'
    );
  }

  return lines;
}

function formatUnknownAttribution(
  data: PeriodData,
  language: CommercialLanguage
): string[] {
  const lines: string[] = [];
  const postcards = unknownPostcards(data);
  const tributes = unknownTributes(data);
  const subscriptions = newSubscriptions(data);

  if (postcards.available) {
    lines.push(
      language === 'ru'
        ? `- Открытки без подтверждённой связи с Пьеро: ${postcards.count}${
            postcards.count > 0
              ? ` · ${formatMoneyTotals(postcards.totals, language)}`
              : ''
          }.`
        : `- Postcards with no confirmed Pierrot link: ${postcards.count}${
            postcards.count > 0
              ? ` · ${formatMoneyTotals(postcards.totals, language)}`
              : ''
          }.`
    );
  }

  if (tributes.available) {
    lines.push(
      language === 'ru'
        ? `- Temple без подтверждённой связи с Пьеро: ${tributes.count}${
            tributes.count > 0
              ? ` · ${formatMoneyTotals(tributes.totals, language)}`
              : ''
          }.`
        : `- Temple with no confirmed Pierrot link: ${tributes.count}${
            tributes.count > 0
              ? ` · ${formatMoneyTotals(tributes.totals, language)}`
              : ''
          }.`
    );
  }

  if (data.subscriptionsAvailable) {
    lines.push(
      language === 'ru'
        ? `- Подписки без подтверждённой связи с Пьеро: ${Math.max(
            0,
            subscriptions.all.length - subscriptions.attributed.length
          )}.`
        : `- Subscriptions with no confirmed Pierrot link: ${Math.max(
            0,
            subscriptions.all.length - subscriptions.attributed.length
          )}.`
    );
  }

  return lines;
}

function comparisonLine(
  current: PeriodData,
  previous: PeriodData,
  language: CommercialLanguage
): string {
  const currentConversions = confirmedConversions(current);
  const previousConversions = confirmedConversions(previous);
  const currentPurchases = current.purchases.length;
  const previousPurchases = previous.purchases.length;
  const currentDonations = current.donations.length;
  const previousDonations = previous.donations.length;
  const currentSubs = newSubscriptions(current).attributed.length;
  const previousSubs = newSubscriptions(previous).attributed.length;

  if (
    currentConversions === 0 &&
    previousConversions === 0 &&
    current.events.length === 0 &&
    previous.events.length === 0
  ) {
    return language === 'ru'
      ? 'Для сравнения недостаточно данных: в обоих периодах нет подтверждённых результатов и событий воронки.'
      : 'There is not enough data to compare: neither period has confirmed results or funnel events.';
  }

  return language === 'ru'
    ? `Подтверждённые результаты, атрибутированные Пьеро: сейчас ${currentPurchases} покупок, ${currentDonations} пожертвований, ${currentSubs} подписок; в предыдущем периоде — ${previousPurchases}, ${previousDonations}, ${previousSubs} соответственно.`
    : `Confirmed Pierrot-attributed results: now ${currentPurchases} purchases, ${currentDonations} donations, ${currentSubs} subscriptions; previous period — ${previousPurchases}, ${previousDonations}, ${previousSubs}.`;
}

function assessment(
  current: PeriodData,
  previous: PeriodData,
  language: CommercialLanguage
): string {
  const currentConversions = confirmedConversions(current);
  const previousConversions = confirmedConversions(previous);

  if (currentConversions === 0 && previousConversions === 0) {
    return language === 'ru'
      ? 'Оценка: данных недостаточно. Нулевые продажи в двух периодах не доказывают, что спрос отсутствует; они показывают, что коммерческий путь ещё не дал подтверждённого результата.'
      : 'Assessment: insufficient data. Zero sales in two periods do not prove that demand is absent; they show that the commercial path has not yet produced a confirmed result.';
  }

  if (currentConversions > previousConversions) {
    return language === 'ru'
      ? 'Оценка: улучшение по числу подтверждённых коммерческих результатов.'
      : 'Assessment: improving on the number of confirmed commercial results.';
  }

  if (currentConversions < previousConversions) {
    return language === 'ru'
      ? 'Оценка: ухудшение по числу подтверждённых коммерческих результатов.'
      : 'Assessment: declining on the number of confirmed commercial results.';
  }

  return language === 'ru'
    ? 'Оценка: без изменений по числу подтверждённых результатов. Для вывода о причине данных недостаточно.'
    : 'Assessment: unchanged in confirmed results. There is not enough data to infer a cause.';
}

function periodForExperimentStart(now: Date, timezone: string): ReportingPeriod {
  const configured = (process.env.PIERROT_EXPERIMENT_START_DATE || '').trim();
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : DEFAULT_EXPERIMENT_START;
  const start =
    parseCalendarDate(candidate, timezone) ??
    parseCalendarDate(DEFAULT_EXPERIMENT_START, timezone) ??
    new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return {
    key: 'custom',
    timezone,
    start,
    end: new Date(now.getTime() + 1),
    previous: { start, end: start },
  };
}

function goalsText(
  experiment: PeriodData,
  now: Date,
  language: CommercialLanguage,
  timezone: string
): string[] {
  const postcards = experiment.purchases.filter(
    (row) => row.offer_id === 'heart_angel_postcard'
  ).length;
  const unframed = experiment.purchases.filter((row) => row.offer_id === 'unframed').length;
  const flow = newSubscriptions(experiment).attributed.length;
  const donations = experiment.donations.length;
  const donationTotals = moneyFromDonations(experiment.donations);

  const configured = (process.env.PIERROT_EXPERIMENT_START_DATE || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : DEFAULT_EXPERIMENT_START;
  const start = parseCalendarDate(date, timezone);
  const day = start
    ? Math.max(1, Math.min(90, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1))
    : 1;

  if (language === 'ru') {
    return [
      `Цели 90-дневного эксперимента (день ${day} из 90, атрибуция Пьеро):`,
      `- UNFRAMED: ${unframed} / 1 подтверждённая продажа.`,
      `- Heart & Angel postcard: ${postcards} / 1 подтверждённая продажа.`,
      `- Flow: ${flow} / 10 новых подтверждённых подписок.`,
      `- Temple Tributes: ${donations} пожертвований${
        donations > 0 ? ` · ${formatMoneyTotals(donationTotals, language)}` : '; поступлений нет'
      } — отдельная категория без числовой цели.`,
    ];
  }

  return [
    `90-day experiment goals (day ${day} of 90, Pierrot-attributed):`,
    `- UNFRAMED: ${unframed} / 1 confirmed sale.`,
    `- Heart & Angel postcard: ${postcards} / 1 confirmed sale.`,
    `- Flow: ${flow} / 10 new confirmed subscriptions.`,
    `- Temple Tributes: ${donations} donations${
      donations > 0 ? ` · ${formatMoneyTotals(donationTotals, language)}` : '; no donations'
    } — a separate category with no numerical target.`,
  ];
}

function bestOfferText(data: PeriodData, language: CommercialLanguage): string {
  const metrics = buildOfferMetrics(data);

  const ranked = Array.from(metrics.values())
    .map((entry) => ({
      offerId: entry.offerId,
      purchases: entry.purchase.size,
      donations: entry.donation.size,
      interest: entry.interest.size,
      shown: entry.shown.size,
    }))
    .sort(
      (a, b) =>
        b.purchases + b.donations - (a.purchases + a.donations) ||
        b.interest - a.interest
    );

  if (ranked.length === 0) {
    return language === 'ru'
      ? 'Сравнивать предложения не по чему: за период нет коммерческих событий.'
      : 'There is nothing to compare: no commercial events in the period.';
  }

  const best = ranked[0];
  const confirmed = best.purchases + best.donations;

  if (confirmed === 0) {
    return language === 'ru'
      ? `Подтверждённых продаж нет. По интересу впереди ${offerLabel(
          best.offerId,
          language
        )}: ${best.interest} диалог(ов) с интересом и ${best.shown} с показанным предложением. Это интерес, а не продажа.`
      : `There are no confirmed sales. By interest, ${offerLabel(
          best.offerId,
          language
        )} leads: ${best.interest} conversation(s) with interest and ${best.shown} with a shown offer. That is interest, not a sale.`;
  }

  return language === 'ru'
    ? `Лучше всего по подтверждённым результатам: ${offerLabel(
        best.offerId,
        language
      )} — ${best.purchases} покупок и ${best.donations} пожертвований.`
    : `Best by confirmed results: ${offerLabel(
        best.offerId,
        language
      )} — ${best.purchases} purchases and ${best.donations} donations.`;
}

function abandonmentText(data: PeriodData, language: CommercialLanguage): string[] {
  const metrics = buildOfferMetrics(data);
  const lines: string[] = [];

  for (const entry of Array.from(metrics.values()).sort((a, b) =>
    a.offerId.localeCompare(b.offerId)
  )) {
    if (entry.checkout.size === 0) continue;

    const confirmed = union(entry.purchase, entry.donation).size;
    const incomplete = Math.max(0, entry.checkout.size - confirmed);

    lines.push(
      language === 'ru'
        ? `- ${offerLabel(entry.offerId, language)}: начали checkout ${entry.checkout.size}, подтвердили оплату ${confirmed}, не завершили ${incomplete}.`
        : `- ${offerLabel(entry.offerId, language)}: started checkout ${entry.checkout.size}, confirmed payment ${confirmed}, did not complete ${incomplete}.`
    );
  }

  if (lines.length === 0) {
    lines.push(
      language === 'ru'
        ? 'За период не зафиксировано ни одного начала checkout. Это не позволяет отличить отсутствие намерения от потери события.'
        : 'No checkout was started in the period. This cannot distinguish absence of intent from a lost event.'
    );
  }

  return lines;
}

function interestText(data: PeriodData, language: CommercialLanguage): string[] {
  const metrics = buildOfferMetrics(data);
  const unframed = metrics.get('unframed');
  const shown = unframed?.shown.size ?? 0;
  const interest = unframed?.interest.size ?? 0;
  const purchases = unframed?.purchase.size ?? 0;

  return [
    language === 'ru'
      ? `UNFRAMED: ${interest} диалог(ов) с коммерческим интересом, ${shown} с показанным предложением, ${purchases} с подтверждённой покупкой.`
      : `UNFRAMED: ${interest} conversation(s) with commercial interest, ${shown} with a shown offer, ${purchases} with a confirmed purchase.`,
  ];
}

function coverageText(data: PeriodData, language: CommercialLanguage): string[] {
  const lines: string[] = [];

  if (data.viewsAvailable) {
    lines.push(
      language === 'ru'
        ? '- Источник: приватные Pierrot views; только подтверждённые оплаты, без checkout-попыток.'
        : '- Source: private Pierrot views; confirmed payments only, not checkout attempts.'
    );
  } else {
    lines.push(
      language === 'ru'
        ? '- Часть Pierrot views недоступна; финансовые итоги по этим источникам не рассчитаны.'
        : '- Some Pierrot views are unavailable; financial totals from those sources were not calculated.'
    );
  }

  lines.push(
    language === 'ru'
      ? '- GBP и USD показаны раздельно; курсы не применяются и валюты не суммируются.'
      : '- GBP and USD are shown separately; no exchange rates are applied and currencies are not combined.'
  );

  lines.push(
    language === 'ru'
      ? '- Возвраты и комиссии Stripe не вычитаются: авторитетного источника возвратов и фактических fee в этих данных нет.'
      : '- Refunds and Stripe fees are not deducted: no authoritative refund or actual-fee source is present in this data.'
  );

  lines.push(
    language === 'ru'
      ? '- Историческая атрибуция неполная. Транзакции без проверяемой ссылки на диалог показаны как «без связи с Пьеро», а не приписаны ему.'
      : '- Historical attribution is incomplete. Transactions without a verified conversation link are shown as “no confirmed Pierrot link”, not assigned to Pierrot.'
  );

  if (data.errors.length > 0) {
    const sources = Array.from(new Set(data.errors.map((error) => error.source))).join(', ');
    lines.push(
      language === 'ru'
        ? `- Технический пробел выборки: ${sources}.`
        : `- Measurement gap: ${sources}.`
    );
  }

  return lines;
}

function recommendationText(
  items: Recommendation[],
  language: CommercialLanguage
): string[] {
  if (items.length === 0) return [];

  const lines: string[] = [language === 'ru' ? 'Что я предлагаю:' : 'What I propose:'];

  items.forEach((item, index) => {
    const copy = item[language];

    lines.push(
      `${index + 1}. ${language === 'ru' ? 'Что изменить' : 'What to change'}: ${copy.what}`,
      `   ${language === 'ru' ? 'Почему' : 'Why'}: ${copy.why}`,
      `   ${language === 'ru' ? 'Что измерять' : 'What to measure'}: ${copy.measure}`,
      `   ${language === 'ru' ? 'Что не менять' : 'What to keep unchanged'}: ${copy.keep}`
    );
  });

  return lines;
}

function renderAnswer(
  question: CommercialQuestion,
  snapshot: CommercialSnapshot,
  experiment: PeriodData | null,
  language: CommercialLanguage,
  now: Date
): string {
  const { current, previous, period } = snapshot;
  const weekly = question.weeklyReview;
  const lines: string[] = [];
  const periodLabel = formatReportingPeriod(period, language);

  lines.push(
    language === 'ru'
      ? `За период: ${periodLabel}.`
      : `Period: ${periodLabel}.`
  );

  const wantsMoney =
    question.wantsRevenue ||
    question.wantsSales ||
    question.wantsDonations ||
    question.wantsSubscriptions ||
    question.wantsAttribution ||
    question.wantsWhy ||
    question.wantsComparison ||
    weekly;

  if (wantsMoney) {
    lines.push(
      '',
      language === 'ru'
        ? 'Атрибутировано Пьеро (подтверждённые результаты):'
        : 'Attributed to Pierrot (confirmed results):'
    );
    lines.push(...formatAttributedRevenue(current, language));

    lines.push(
      '',
      language === 'ru' ? 'Итоги всего сайта:' : 'Overall site results:'
    );
    lines.push(...formatOverallRevenue(current, language));

    lines.push(
      '',
      language === 'ru' ? 'Без подтверждённой атрибуции:' : 'Without confirmed attribution:'
    );
    lines.push(...formatUnknownAttribution(current, language));
  }

  if (question.wantsInterest || weekly) {
    lines.push('', ...interestText(current, language));
  }

  if (question.wantsAbandonment) {
    lines.push(
      '',
      language === 'ru'
        ? 'Начатое оформление (checkout — не выручка):'
        : 'Checkout starts (not revenue):'
    );
    lines.push(...abandonmentText(current, language));
  }

  if (question.wantsBestOffer || weekly) {
    lines.push('', language === 'ru' ? 'Что продаётся лучше:' : 'What is selling best:');
    lines.push(bestOfferText(current, language));
  }

  const diagnosis = diagnose(current);
  const showDiagnosis = question.wantsWhy || weekly || question.wantsRecommendations;

  if (showDiagnosis) {
    lines.push(
      '',
      language === 'ru' ? 'Что происходит:' : 'What is happening:',
      language === 'ru' ? diagnosis.evidenceRu : diagnosis.evidenceEn,
      language === 'ru' ? `Ограничение вывода: ${diagnosis.caveatRu}` : `Limit of the inference: ${diagnosis.caveatEn}`
    );
  }

  if (question.wantsComparison || weekly) {
    lines.push(
      '',
      language === 'ru' ? 'Сравнение с предыдущим периодом:' : 'Comparison with the previous period:',
      `${capitalized(formatPreviousPeriod(period, language))}.`,
      comparisonLine(current, previous, language)
    );
  }

  if (weekly) {
    if (experiment) {
      lines.push('', ...goalsText(experiment, now, language, period.timezone));
    }
    lines.push('', assessment(current, previous, language));
  }

  if (question.wantsRecommendations || weekly) {
    lines.push('', ...recommendationText(recommendations(current, diagnosis, weekly), language));
  }

  lines.push(
    '',
    language === 'ru' ? 'Ограничения данных:' : 'Data limitations:',
    ...coverageText(current, language)
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function moneyFromConfirmedPeriod(data: PeriodData): CommercialMoneyTotal[] {
  const map = new Map<string, MoneyTotal>();

  for (const row of data.purchases) {
    addMoney(map, currencyValue(row.currency), numberValue(row.amount_total));
  }

  for (const row of data.donations) {
    addMoney(map, currencyValue(row.currency), numberValue(row.amount_total));
  }

  return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function summarizeCommercialPeriod(data: PeriodData): CommercialPeriodSummary {
  const postcard = attributedByOffer(data, 'heart_angel_postcard');
  const unframed = attributedByOffer(data, 'unframed');
  const tribute = attributedByOffer(data, 'temple_tribute');
  const flow = attributedByOffer(data, 'journal_flow');
  const errorSources = new Set(data.errors.map((error) => error.source));

  return {
    paidCount:
      postcard.purchases.length + unframed.purchases.length + tribute.donations.length,
    money: moneyFromConfirmedPeriod(data),
    postcards: {
      count: postcard.purchases.length,
      money: moneyFromPurchases(postcard.purchases),
    },
    unframed: {
      count: unframed.purchases.length,
      money: moneyFromPurchases(unframed.purchases),
    },
    tributes: {
      count: tribute.donations.length,
      money: moneyFromDonations(tribute.donations),
    },
    flowSubscriptions: flow.subscriptions.length,
    purchasesAvailable: !errorSources.has('pierrot_v_purchases'),
    donationsAvailable: !errorSources.has('pierrot_v_donations'),
    subscriptionsAvailable: data.subscriptionsAvailable,
  };
}

/**
 * Structured commercial report for the owner workspace.
 *
 * Only confirmed purchases, donations and confirmed Flow subscriptions are
 * counted. Checkout starts, offer interest and shown CTAs are deliberately
 * excluded. GBP and USD remain separate; no exchange rate is applied.
 */
export async function loadCommercialSummary({
  store,
  periodKey,
  now = new Date(),
  timezone = process.env.PIERROT_OWNER_TIMEZONE || DEFAULT_TIMEZONE,
}: {
  store: SupabaseClient;
  periodKey: 'last_7_days' | 'last_30_days';
  now?: Date;
  timezone?: string;
}): Promise<CommercialSummary> {
  const period = resolveReportingPeriod(periodKey, now, timezone);
  const previousPeriod: ReportingPeriod = {
    ...period,
    key: 'custom',
    start: period.previous.start,
    end: period.previous.end,
    previous: period.previous,
  };

  const [currentData, previousData] = await Promise.all([
    loadPeriodData(store, period),
    loadPeriodData(store, previousPeriod),
  ]);

  const errors = Array.from(
    new Set(
      [...currentData.errors, ...previousData.errors]
        .filter(
          (error) =>
            error.source !== 'pierrot_v_events' && error.source !== 'pierrot_events'
        )
        .map((error) => `${error.source}:${error.code}`)
    )
  );

  return {
    periodKey,
    periodLabel: periodKey === 'last_7_days' ? '7 дней' : '30 дней',
    start: period.start.toISOString(),
    end: period.end.toISOString(),
    timezone,
    current: summarizeCommercialPeriod(currentData),
    previous: summarizeCommercialPeriod(previousData),
    overall: {
      postcards: {
        count: currentData.postcards.length,
        money: moneyFromPostcards(currentData.postcards),
      },
      tributes: {
        count: currentData.tributes.length,
        money: moneyFromTributes(currentData.tributes),
      },
      flowSubscriptions: newSubscriptions(currentData).all.length,
      postcardsAvailable: currentData.postcardsAvailable,
      tributesAvailable: currentData.tributesAvailable,
      subscriptionsAvailable: currentData.subscriptionsAvailable,
    },
    complete: errors.length === 0,
    errors,
  };
}

export async function answerPierrotCommercialQuestion({
  question,
  language,
  store,
  now = new Date(),
  timezone = process.env.PIERROT_OWNER_TIMEZONE || DEFAULT_TIMEZONE,
}: {
  question: string;
  language: CommercialLanguage;
  store: SupabaseClient;
  now?: Date;
  timezone?: string;
}): Promise<string | null> {
  const parsed = detectCommercialQuestion(question, { now, timezone });

  if (!parsed) return null;

  const period = resolveReportingPeriod(
    parsed.periodKey,
    now,
    timezone,
    parsed.customPeriod
  );

  const previousPeriod: ReportingPeriod = {
    ...period,
    key: 'custom',
    start: period.previous.start,
    end: period.previous.end,
    previous: period.previous,
  };

  const [current, previous] = await Promise.all([
    loadPeriodData(store, period),
    loadPeriodData(store, previousPeriod),
  ]);

  let experiment: PeriodData | null = null;

  if (parsed.weeklyReview) {
    const experimentPeriod = periodForExperimentStart(now, timezone);
    experiment = await loadPeriodData(store, experimentPeriod);
  }

  return renderAnswer(
    parsed,
    { period, current, previous },
    experiment,
    language,
    now
  );
}
