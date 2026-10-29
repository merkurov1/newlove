import {
  PIERROT_SECTIONS,
  getPierrotSection,
  type PierrotChatAction,
  type PierrotMessageLink,
  type PierrotSectionId,
} from '@/lib/pierrot/navigation';
import {
  PIERROT_OFFERS,
  findPierrotOfferById,
  getVerifiedOfferCta,
  isPierrotOfferId,
  type PierrotOffer,
  type PierrotOfferCta,
  type PierrotOfferId,
} from '@/lib/pierrot/offers';
import type { PierrotIntent } from '@/lib/pierrot/intents';
import type { PierrotOfferRuntime } from '@/lib/pierrot/offerAvailability';
import { renderServiceInquiry, type ServiceInquiryState } from '@/lib/pierrot/serviceInquiry';

export type PierrotPlanMode =
  'model' | 'offer' | 'navigation' | 'decline' | 'unknown_product' | 'clarify' | 'handoff';

export type PierrotCommercialPlan = {
  mode: PierrotPlanMode;
  intent: PierrotIntent;
  offer: PierrotOffer | null;
  reply?: string;
  cta: PierrotOfferCta | null;
  actions: PierrotChatAction[];
  links: PierrotMessageLink[];
  useModel: boolean;
  offerViewed: boolean;
  ctaShown: boolean;
  commercialDeclined: boolean;
  offerUnavailable: boolean;
  commercialReturned?: {
    fromOfferId: PierrotOfferId;
    sectionId: PierrotSectionId;
  };
};

type PlanInput = {
  intent: PierrotIntent;
  language: 'ru' | 'en' | 'und';
  runtime?: PierrotOfferRuntime | null;
  previousOfferId?: string | null;
  /**
   * The offer page the visitor is currently reading. Used only to resolve a
   * demonstrative question ("how much is this?") to the page's offer. It never
   * supplies a price or a fact.
   */
  contextOfferId?: PierrotOfferId | null;
  serviceInquiry?: ServiceInquiryState | null;
  serviceInquiryUnavailable?: boolean;
};

function isRu(language: 'ru' | 'en' | 'und'): boolean {
  return language === 'ru';
}

function formatMoney(amountMinor: number, currency: 'GBP' | 'USD' | 'EUR'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function postcardPublicPrice(): string {
  return (
    findPierrotOfferById('heart_angel_postcard')?.facts.find((fact) => fact.key === 'public_price')
      ?.value || '£29'
  );
}

function postcardPrice(
  language: 'ru' | 'en' | 'und',
  runtime?: PierrotOfferRuntime | null
): { text: string; verified: boolean } {
  const ru = isRu(language);
  const livePrice =
    runtime?.source === 'postcards' &&
    runtime.priceMinorUnits !== null &&
    runtime.priceMinorUnits > 0
      ? formatMoney(runtime.priceMinorUnits, runtime.currency)
      : null;

  if (livePrice) {
    return {
      text: ri(ru, `каталог подтверждает ${livePrice}`, `the catalogue confirms ${livePrice}`),
      verified: true,
    };
  }

  const publicPrice = postcardPublicPrice();

  return {
    text: ri(
      ru,
      `актуальную цену каталога сейчас прочитать не удалось; публичная страница указывает ${publicPrice}, доставка включена, а форма заказа подтвердит итоговую цену до оплаты`,
      `I cannot read the live catalogue price right now; the public page lists ${publicPrice} with postage included, and the order form confirms the final price before payment`
    ),
    verified: false,
  };
}

function ri(ru: boolean, russian: string, english: string): string {
  return ru ? russian : english;
}

function sentenceCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function postcardReply(
  intent: PierrotIntent,
  language: 'ru' | 'en' | 'und',
  runtime?: PierrotOfferRuntime | null
): { reply: string; unavailable: boolean; allowCta: boolean } {
  const ru = isRu(language);
  const price = postcardPrice(language, runtime);
  const unavailable = runtime?.available === false;
  const liveAvailable = runtime?.available === true;

  if (intent.topic === 'price_objection') {
    return {
      reply: ri(
        ru,
        `Это физическая открытка Heart & Angel с личным сообщением. ${sentenceCase(price.text)}. Если это не для тебя — совершенно нормально, без давления.`,
        `It is a physical Heart & Angel postcard with a personal message. ${sentenceCase(price.text)}. If it is not right for you, that is completely fine — no pressure.`
      ),
      unavailable,
      allowCta: false,
    };
  }

  if (unavailable) {
    return {
      reply: ri(
        ru,
        'Сейчас каталог помечает открытку как недоступную. Оплату не начинаю — сначала проверь страницу заказа.',
        'The catalogue currently marks the postcard as unavailable. I will not start a payment; check the order page first.'
      ),
      unavailable: true,
      allowCta: false,
    };
  }

  if (intent.topic === 'recipient') {
    return {
      reply: ri(
        ru,
        'Да. Существующая форма заказа спрашивает имя получателя, адрес доставки и необязательное личное сообщение (до 500 символов). Так открытку можно отправить другому человеку; оплату проводит Stripe.',
        'Yes. The existing order form asks for the recipient’s name, the delivery address and an optional personal message (up to 500 characters). That is how you send it to someone else; Stripe handles payment.'
      ),
      unavailable,
      allowCta: true,
    };
  }

  if (intent.topic === 'delivery') {
    return {
      reply: ri(
        ru,
        'Доставка включена в цену. Подтверждённого срока доставки и списка стран у меня нет, поэтому не буду их придумывать; актуальные условия покажет форма заказа.',
        'Postage is included in the price. I do not have a confirmed delivery time or list of countries, so I will not invent them; the order form shows the current terms.'
      ),
      unavailable,
      allowCta: true,
    };
  }

  if (intent.topic === 'materials') {
    return {
      reply: ri(
        ru,
        'Подтверждённых данных о материале, размере или тираже у меня нет. На странице есть фотография физической открытки, но я не буду выдумывать характеристики.',
        'I do not have confirmed details about the material, size or print run. The page shows a photograph of the physical card, but I will not invent specifications.'
      ),
      unavailable,
      allowCta: true,
    };
  }

  if (intent.topic === 'availability') {
    return {
      reply: liveAvailable
        ? ri(
            ru,
            `Каталог сейчас подтверждает наличие. ${sentenceCase(price.text)}.`,
            `The catalogue currently confirms it is in stock. ${sentenceCase(price.text)}.`
          )
        : ri(
            ru,
            'Живую доступность сейчас подтвердить не удалось. Форма заказа проверит каталог перед оплатой и покажет актуальный статус.',
            'I cannot confirm live stock right now. The order form checks the catalogue before payment and shows the current status.'
          ),
      unavailable,
      allowCta: true,
    };
  }

  if (intent.topic === 'price') {
    return {
      reply: ri(
        ru,
        `${sentenceCase(price.text)}. Доставка включена. Наличие и итоговую цену подтверждает существующая форма заказа до оплаты.`,
        `${sentenceCase(price.text)}. Postage included. The existing order form confirms availability and the final price before payment.`
      ),
      unavailable,
      allowCta: true,
    };
  }

  if (intent.name === 'purchase_intent') {
    return {
      reply: ri(
        ru,
        liveAvailable && price.verified
          ? `${sentenceCase(price.text)}, доставка включена. Заказ идёт через существующую форму, оплата — Stripe.`
          : `Публичная страница указывает ${postcardPublicPrice()}, доставка включена. Живую доступность сейчас подтвердить не удалось; заказ идёт через существующую форму, которая проверяет актуальную цену и наличие перед оплатой Stripe.`,
        liveAvailable && price.verified
          ? `${sentenceCase(price.text)}, postage included. The existing order form handles the order and Stripe handles payment.`
          : `The public page lists ${postcardPublicPrice()} with postage included. I cannot confirm live stock right now; the existing order form checks the current price and availability before Stripe payment.`
      ),
      unavailable,
      allowCta: true,
    };
  }

  return {
    reply: ri(
      ru,
      `Heart & Angel postcard — физическая открытка с работой Heart & Angel и личным сообщением, которую можно отправить другому человеку. ${sentenceCase(price.text)}.`,
      `The Heart & Angel postcard is a physical card with a Heart & Angel artwork and a personal message, sent to someone you choose. ${sentenceCase(price.text)}.`
    ),
    unavailable,
    allowCta: true,
  };
}

function journalReply(
  intent: PierrotIntent,
  language: 'ru' | 'en' | 'und',
  runtime?: PierrotOfferRuntime | null
): string {
  const ru = isRu(language);
  const reading = ru
    ? 'Journal — выпуски и более развёрнутые авторские тексты; Flow — короткие заметки, ссылки, видео и фотографии. Читать можно на /journal и /flow, а подписка оформляется через существующую форму на /journal#subscribe (или /flow/join).'
    : 'The Journal holds issues and longer authored texts; Flow is the shorter stream of notes, links, videos and photographs. You can read at /journal and /flow, and the existing subscription form is at /journal#subscribe (or /flow/join).';

  if (runtime?.subscribed === true) {
    return ru
      ? `${reading} По текущей сессии видно, что подписка уже активна; управление — через существующую форму.`
      : `${reading} The current session shows an active subscription; manage it through the existing form.`;
  }

  return ru
    ? `${reading} В коде и конфигурации нет подтверждения, бесплатная ли подписка или платная, поэтому я не буду это утверждать: актуальные условия показывает существующая форма.`
    : `${reading} The code and configuration do not confirm whether the subscription is free or paid, so I will not claim either: the existing form shows the current terms.`;
}

function artEngineReply(intent: PierrotIntent, language: 'ru' | 'en' | 'und'): string {
  const ru = isRu(language);
  const advisory = intent.name === 'service_inquiry' && intent.offerId === 'advising';

  if (advisory) {
    return ru
      ? 'Art Engine — закрытый инструмент с доступом по заявке. Консультация — отдельный трек Advising; публичной цены нет.'
      : 'Art Engine is an access-controlled terminal. Consulting is a separate Advising track; no public price is listed.';
  }

  return ru
    ? 'Art Engine — закрытый инструмент с доступом по заявке, не публичная подписка. Публичной цены нет; доступ не выдаётся автоматически.'
    : 'Art Engine is an access-controlled terminal, not a public subscription. No public price is listed, and access is not granted automatically.';
}

function advisingReply(language: 'ru' | 'en' | 'und'): string {
  return isRu(language)
    ? 'Консультации — отдельный трек. Форматы: retainer, special projects и private sessions. Публичной цены нет; контакт — существующая ссылка Advising.'
    : 'Advising is a separate track. Formats are a retainer, special projects and private sessions. No public price is listed; use the existing Advising contact.';
}

function unframedReply(intent: PierrotIntent, language: 'ru' | 'en' | 'und'): string {
  const ru = isRu(language);

  if (intent.name === 'purchase_intent' || intent.name === 'book_inquiry') {
    return ru
      ? 'UNFRAMED — мемуар. На /unframed есть ссылки на цифровые издания в Apple Books (£3.99) и Barnes & Noble ($4.99); это магазины, поэтому наличие и цену проверяй там. Отдельно на /unframed/book есть существующий Stripe-доступ к приватной рукописи. Форма с name/agency/email — это запрос proposal для агентов и издателей, а не покупка книги.'
      : 'UNFRAMED is a memoir. The /unframed page links to digital editions on Apple Books (£3.99) and Barnes & Noble ($4.99); those are retailers, so check price and stock there. Separately, /unframed/book has an existing Stripe checkout for digital manuscript access. The name/agency/email form is a proposal request for agents and publishers, not a book purchase.';
  }

  return ru
    ? 'UNFRAMED — мемуар с цифровыми изданиями у ретейлеров, приватной рукописью на /unframed/book и publisher proposal. Форма на /unframed предназначена для агентов и издателей; это не оформление покупки.'
    : 'UNFRAMED is a memoir with retailer digital editions, a private manuscript at /unframed/book and a publisher proposal. The /unframed form is for agents and publishers; it is not a purchase flow.';
}

function declineReply(language: 'ru' | 'en' | 'und'): string {
  return isRu(language)
    ? 'Понял. Продажу останавливаю. Могу ответить на вопрос или вернуть к разделам.'
    : 'Understood. I will stop selling. I can answer a question or return you to the sections.';
}

function unknownProductReply(language: 'ru' | 'en' | 'und'): string {
  return isRu(language)
    ? 'У меня нет подтверждённого предложения с таким названием. Не буду придумывать цену, наличие или условия.'
    : 'I do not have a verified offer under that name. I will not invent a price, availability or terms.';
}

function clarifyReply(language: 'ru' | 'en' | 'und'): string {
  return isRu(language)
    ? 'Не уверен, что именно ты имеешь в виду. Уточни: навигация, обычный вопрос или конкретное предложение?'
    : 'I am not certain what you mean. Clarify whether this is navigation, a general question, or a specific offer.';
}

function navigationReply(sectionId: PierrotSectionId, language: 'ru' | 'en' | 'und'): string {
  const section = PIERROT_SECTIONS[sectionId];

  return isRu(language)
    ? `${section.label}. Подтверди переход кнопкой ниже.`
    : `${section.label}. Use the button below to confirm the transition.`;
}

function offerReply(
  offerId: PierrotOfferId,
  intent: PierrotIntent,
  language: 'ru' | 'en' | 'und',
  runtime?: PierrotOfferRuntime | null
): { reply: string; unavailable: boolean; cta: PierrotOfferCta | null } {
  const cta = getVerifiedOfferCta(offerId);

  if (offerId === 'heart_angel_postcard') {
    const result = postcardReply(intent, language, runtime);
    return { ...result, cta: result.unavailable || !result.allowCta ? null : cta };
  }

  if (offerId === 'journal_flow') {
    return {
      reply: journalReply(intent, language, runtime),
      unavailable: false,
      cta: runtime?.subscribed === true ? null : cta,
    };
  }

  if (offerId === 'art_engine') {
    return { reply: artEngineReply(intent, language), unavailable: false, cta };
  }

  if (offerId === 'advising') {
    return { reply: advisingReply(language), unavailable: false, cta };
  }

  return {
    reply: unframedReply(intent, language),
    unavailable: false,
    cta,
  };
}

/**
 * Chooses an action from the catalogue. The model is only allowed to write prose
 * on the `model` path; every offer, route, price and CTA on the other paths is
 * selected here.
 */
export function planPierrotResponse({
  intent,
  language,
  runtime,
  previousOfferId,
  contextOfferId,
  serviceInquiry,
  serviceInquiryUnavailable,
}: PlanInput): PierrotCommercialPlan {
  const previousOffer = findPierrotOfferById(previousOfferId);
  const explicitOffer = findPierrotOfferById(intent.offerId);

  // A demonstrative or topic question on a postcard page (or immediately after
  // a postcard answer) resolves to the postcard offer. This only selects the
  // catalogue entry; the facts and price still come from the verified runtime.
  const contextualPostcard =
    !explicitOffer &&
    !intent.unknownProduct &&
    !intent.declined &&
    intent.name !== 'navigation' &&
    Boolean(intent.topic) &&
    (contextOfferId === 'heart_angel_postcard' || previousOfferId === 'heart_angel_postcard')
      ? findPierrotOfferById('heart_angel_postcard')
      : null;

  const offer = explicitOffer ?? contextualPostcard;

  const base: PierrotCommercialPlan = {
    mode: 'model',
    intent,
    offer,
    cta: null,
    actions: [],
    links: [],
    useModel: false,
    offerViewed: false,
    ctaShown: false,
    commercialDeclined: false,
    offerUnavailable: false,
  };

  if (intent.declined) {
    // An explicit navigation request after a refusal is honoured, but no
    // commercial CTA or offer is attached to it.
    if (intent.name === 'navigation' && intent.sectionId) {
      const section = getPierrotSection(intent.sectionId);

      return {
        ...base,
        mode: 'navigation',
        offer: null,
        reply: navigationReply(intent.sectionId, language),
        actions: [
          {
            kind: 'navigate',
            label: section.actionLabel,
            sectionId: intent.sectionId,
          },
        ],
        commercialDeclined: true,
      };
    }

    return {
      ...base,
      mode: 'decline',
      offer: null,
      reply: declineReply(language),
      commercialDeclined: true,
      actions: [
        {
          kind: 'navigate',
          label: isRu(language) ? 'Вернуться к разделам' : 'Return to navigation',
          sectionId: 'lobby',
        },
      ],
    };
  }

  if (intent.name === 'navigation') {
    const sectionId = intent.sectionId;

    if (!sectionId) {
      return {
        ...base,
        mode: 'clarify',
        reply: clarifyReply(language),
      };
    }

    const section = getPierrotSection(sectionId);
    const commercialReturned =
      previousOffer && sectionId ? { fromOfferId: previousOffer.id, sectionId } : undefined;

    return {
      ...base,
      mode: 'navigation',
      reply: navigationReply(sectionId, language),
      actions: [
        {
          kind: 'navigate',
          label: section.actionLabel,
          sectionId,
        },
      ],
      commercialReturned,
    };
  }

  if (intent.name === 'uncertain') {
    return {
      ...base,
      mode: 'clarify',
      reply: clarifyReply(language),
    };
  }

  if (intent.unknownProduct || (intent.name === 'unknown' && intent.offerId === undefined)) {
    if (intent.unknownProduct) {
      return {
        ...base,
        mode: 'unknown_product',
        reply: unknownProductReply(language),
      };
    }
  }

  if (intent.name === 'handoff_request') {
    const advising = findPierrotOfferById('advising');
    const cta = getVerifiedOfferCta('advising');

    return {
      ...base,
      mode: 'handoff',
      offer: advising,
      reply: isRu(language)
        ? 'Связаться напрямую — через существующий контакт Advising. Новых форм не создаю.'
        : 'Direct contact is through the existing Advising contact. I am not creating a new form.',
      cta,
      offerViewed: Boolean(advising),
      ctaShown: Boolean(cta),
    };
  }

  if (intent.name === 'service_inquiry') {
    if (intent.accessRequest) {
      const artEngine = findPierrotOfferById('art_engine');
      const cta = getVerifiedOfferCta('art_engine');

      return {
        ...base,
        mode: 'offer',
        offer: artEngine,
        reply: artEngineReply(intent, language),
        cta,
        offerViewed: true,
        ctaShown: Boolean(cta),
      };
    }

    if (serviceInquiryUnavailable) {
      const advising = findPierrotOfferById('advising');
      const cta = getVerifiedOfferCta('advising');

      return {
        ...base,
        mode: 'offer',
        offer: advising,
        reply: isRu(language)
          ? 'Сейчас не удалось сохранить квалификацию запроса, поэтому я не буду делать вид, что она принята. Продолжить можно через существующий контакт Advising.'
          : 'I could not save the qualification right now, so I will not pretend it was accepted. The existing Advising contact can continue directly.',
        cta,
        offerViewed: true,
        ctaShown: Boolean(cta),
      };
    }

    if (serviceInquiry) {
      const rendered = renderServiceInquiry(serviceInquiry, language);
      const externalCta = rendered.useExternalContact ? getVerifiedOfferCta('advising') : null;

      return {
        ...base,
        mode: 'offer',
        offer: findPierrotOfferById('advising'),
        reply: rendered.reply,
        actions: rendered.actions,
        links: rendered.links,
        cta: externalCta,
        offerViewed: true,
        ctaShown: Boolean(externalCta),
      };
    }

    const advising = findPierrotOfferById('advising');
    const cta = getVerifiedOfferCta('advising');

    return {
      ...base,
      mode: 'offer',
      offer: advising,
      reply: advisingReply(language),
      cta,
      offerViewed: true,
      ctaShown: Boolean(cta),
    };
  }

  if (offer) {
    const rendered = offerReply(offer.id, intent, language, runtime);
    const unframedLinks =
      offer.id === 'unframed' &&
      (intent.name === 'purchase_intent' || intent.name === 'book_inquiry')
        ? [
            {
              label: isRu(language) ? 'Открыть приватную рукопись' : 'Open the private manuscript',
              href: '/unframed/book',
            },
          ]
        : [];

    return {
      ...base,
      mode: 'offer',
      reply: rendered.reply,
      offer,
      cta: rendered.cta,
      links: unframedLinks,
      offerViewed: true,
      ctaShown: Boolean(rendered.cta),
      offerUnavailable: rendered.unavailable,
    };
  }

  if (intent.name === 'book_inquiry') {
    const unframed = findPierrotOfferById('unframed');
    const rendered = offerReply('unframed', intent, language, runtime);

    return {
      ...base,
      mode: 'offer',
      offer: unframed,
      reply: rendered.reply,
      cta: rendered.cta,
      offerViewed: true,
      ctaShown: Boolean(rendered.cta),
    };
  }

  if (intent.name === 'general_question' || intent.name === 'unknown') {
    return {
      ...base,
      mode: 'model',
      useModel: true,
    };
  }

  return {
    ...base,
    mode: 'clarify',
    reply: clarifyReply(language),
  };
}

export function buildPierrotCommercialPrompt(plan: PierrotCommercialPlan): string {
  const lines = [
    'COMMERCIAL GROUNDING (do not contradict):',
    '- CTA buttons, internal routes and checkout links are chosen by code, never by you.',
    '- Never invent a route, price, delivery time, edition size, material, review or availability.',
    `- Known offers: ${PIERROT_OFFERS.map((offer) => offer.title).join(', ')}.`,
  ];

  if (plan.offer) {
    lines.push(`RELEVANT OFFER: ${plan.offer.title} (${plan.offer.route})`);
    plan.offer.facts.forEach((fact) => {
      lines.push(`- ${fact.key}: ${fact.value} [source: ${fact.source}]`);
    });

    if (plan.offer.unknowns.length > 0) {
      lines.push(`- Unknown: ${plan.offer.unknowns.join('; ')}.`);
    }
  }

  return lines.join('\n');
}

export function normalizePreviousOfferId(history: unknown): PierrotOfferId | null {
  if (!Array.isArray(history)) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];

    if (!item || typeof item !== 'object') continue;

    const value = item as Record<string, unknown>;

    if (value.role !== 'assistant') continue;

    if (isPierrotOfferId(value.offerId)) return value.offerId;
  }

  return null;
}
