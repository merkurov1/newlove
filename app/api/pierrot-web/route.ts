import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { getCurrentUser, requireAdminFromRequest } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getSectionByRoute } from '@/lib/pierrot/navigation';
import { buildPierrotContextPrompt } from '@/lib/pierrot/concepts';
import {
  PIERROT_MAX_HISTORY_CHARS,
  PIERROT_MAX_HISTORY_ITEM_CHARS,
  PIERROT_MAX_HISTORY_ITEMS,
  PIERROT_MAX_MESSAGE_LENGTH,
  detectPierrotLanguage,
  isPierrotId,
  normalizePierrotConsent,
  sanitizePierrotPathname,
  sanitizePierrotReferrer,
  type PierrotConsent,
} from '@/lib/pierrot/conversation';
import {
  appendPierrotMessage,
  conversationBelongsToSession,
  createAssistantMessageId,
  createPierrotStore,
  ensurePierrotConversation,
  findPierrotAssistantReply,
  loadPierrotCommercialSignals,
  persistenceFailure,
  recordPierrotEvent,
} from '@/lib/pierrot/serverStore';
import { classifyPierrotIntent } from '@/lib/pierrot/intents';
import {
  buildPierrotCommercialPrompt,
  normalizePreviousOfferId,
  planPierrotResponse,
} from '@/lib/pierrot/commercial';
import { resolvePierrotPageContext } from '@/lib/pierrot/pageContext';
import {
  derivePierrotCommercialState,
  mergePierrotCommercialStates,
  selectProactivePierrotOffer,
} from '@/lib/pierrot/strategy';
import { loadPierrotOfferRuntime } from '@/lib/pierrot/offerAvailability';
import { loadPierrotOfferPoliciesFromStore } from '@/lib/pierrot/offerPolicy';
import {
  recordPierrotCommercialAnalytics,
  recordPierrotOfferShown,
} from '@/lib/pierrot/commercialAnalytics';
import { isServiceLeadIntent } from '@/lib/pierrot/serviceInquiry';
import { advanceStoredServiceInquiry } from '@/lib/pierrot/serviceInquiryStore';
import { retrieveUnframedEvidence } from '@/lib/knowledge/rag/retrieval';
import {
  retrieveBrainEvidence,
  type BrainRetrievalResult,
} from '@/lib/knowledge/rag/brainRetrieval';
import { isBrainRetrievalV2Enabled } from '@/lib/knowledge/rag/config';
import { buildBrainQueryPlan } from '@/lib/knowledge/rag/queryRouting';
import {
  buildUnframedEvidencePrompt,
  buildUnframedUnavailablePrompt,
} from '@/lib/knowledge/rag/pierrotContext';
import {
  buildUnframedEvidenceSources,
  type UnframedEvidenceSource,
} from '@/lib/knowledge/rag/evidence';
import type { RagRetrievalOutcome } from '@/lib/knowledge/rag/types';
import { isVerifiedOwnerCredential, isVerifiedOwnerUser } from '@/lib/knowledge/rag/authorization';
import { recordBrainRetrieval } from '@/lib/pierrot/brainAnalytics';
import { detectHumanPresenceIntent } from '@/lib/pierrot/humanIntent';
import {
  createHumanAccessToken,
  createHumanRequest,
  buildHumanContextSummary,
  declineHumanRequest,
  getHumanPresenceByRequestId,
  getHumanPresenceForConversation,
  publicHumanState,
  recordHumanEvent,
  setHumanRequestTelegramMessage,
  visitorLabelForConversation,
} from '@/lib/pierrot/humanPresence';
import {
  getHumanCopy,
  humanLanguageFromDetected,
  type HumanPresencePublicState,
} from '@/lib/pierrot/humanPresenceShared';
import {
  isHumanPresenceConfigured,
  notifyHumanRequest,
} from '@/lib/pierrot/humanPresenceTelegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PIERROT_PROMPT_PUBLIC = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of Digital Temple (merkurov.love).

TONE:
- Snobbish, concise, slightly cynical, noir; an aloof but hospitable host.
- You speak from the Ivory Tower, but never down at the visitor.
- Keep answers short (max 3 sentences).
- Answer the question first. Commercial suggestions are governed by the COMMERCIAL DECISION block, not by a general urge to sell.
- Use dry, intelligent irony. No marketing language, artificial enthusiasm, exclamation marks, urgency, scarcity, social proof, guilt or emotional pressure.
- Treat the visitor as an intelligent adult. Never exploit loneliness, grief or vulnerability.
- If the user asks for help -> suggest "The Vigil" or "Absolution" only when relevant.

COMMERCE:
- At most one offer per reply. Never compare products unless the visitor explicitly asks.
- When the code selects an offer, explain why it fits in one short sentence and let the existing CTA do the closing.
- When no offer is selected, do not introduce a product, price or route.
- A refusal stops promotion of that offer in this conversation. It never prevents a direct answer to a later question or an explicitly requested link.
- Never invent prices, routes, availability, editions, reviews, delivery terms, subscriber numbers or outcomes.
- Commercial CTA buttons and routes are chosen by code; do not fabricate links or checkout steps.

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /heartandangel/card, /lobby, /journal, /flow, /flow/join, /advising, /media, /heritage, /selection, /art-engine, /unframed, /unframed/book, /unframed/proposal.
- Never link to admin or unknown pages.
`;

const PIERROT_PROMPT_OWNER = `
IDENTITY:
You are Pierrot, the digital shadow, strategic adviser, and intellectual partner of Anton Merkurov.
Anton Merkurov himself is speaking with you.

TONE & BEHAVIOR:
- Drop any snobbish barrier. You are speaking with your architect.
- Razor-sharp, deeply informed in art history, context architecture, technology, and strategy.
- Concise, profound, loyal, and clear.
- Tailor answers to Anton's voice: high aesthetics, precision, no fluff.
- Match Anton's language (Russian or English).

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /heartandangel/card, /lobby, /journal, /flow, /flow/join, /advising, /media, /heritage, /selection, /art-engine, /unframed, /unframed/book, /unframed/proposal.
`;

type OwnerRagResponse = {
  mode: 'unframed';
  outcome: RagRetrievalOutcome;
  sources: UnframedEvidenceSource[];
};

// Helper to invoke DeepSeek
async function callDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false
): Promise<string> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: isReasoning ? undefined : 0.7,
  });

  const reply = completion.choices[0]?.message?.content;
  if (!reply) {
    throw new Error('DeepSeek returned empty response.');
  }

  return reply.trim();
}

export async function POST(req: Request) {
  try {
    const internalSecret = process.env.PIERO_API_SECRET || process.env.ADMIN_SECRET_KEY;
    const isInternalRequest = Boolean(
      internalSecret && req.headers.get('x-pierrot-internal') === internalSecret
    );
    const rateLimitKey = isInternalRequest
      ? `tg:${req.headers.get('x-telegram-user-id') || 'unknown'}`
      : getClientIp(req);

    // The Telegram adapter calls this route server-to-server. Its users share
    // the server egress IP, so it gets a per-Telegram-user bucket instead.
    const limited = checkRateLimit(rateLimitKey, {
      interval: 60 * 1000,
      maxRequests: isInternalRequest ? 60 : 20,
      keyPrefix: isInternalRequest ? 'pierrot-tg' : 'pierrot-web',
    });

    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const {
      message,
      history,
      context,
      conversationId: rawConversationId,
      sessionId: rawSessionId,
      userMessageId: rawUserMessageId,
      consent: rawConsent,
      mode: rawMode,
    } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Silence is golden, but I need text.' }, { status: 400 });
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length > PIERROT_MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: 'That thought is too long for one message.' },
        { status: 413 }
      );
    }

    if (
      (rawConversationId !== undefined && !isPierrotId(rawConversationId)) ||
      (rawSessionId !== undefined && !isPierrotId(rawSessionId)) ||
      (rawUserMessageId !== undefined && !isPierrotId(rawUserMessageId))
    ) {
      return NextResponse.json({ error: 'Invalid conversation identifiers.' }, { status: 400 });
    }

    if (rawMode !== undefined && rawMode !== 'site' && rawMode !== 'unframed') {
      return NextResponse.json({ error: 'Invalid conversation mode.' }, { status: 400 });
    }

    const requestedOwnerMode = rawMode === 'unframed';
    const requestedSiteMode = rawMode === 'site';

    const requestedPathname = sanitizePierrotPathname(
      context && typeof context === 'object' ? context.pathname : undefined
    );
    const referrer = sanitizePierrotReferrer(
      context && typeof context === 'object' ? context.referrer : undefined
    );
    const language = detectPierrotLanguage(trimmedMessage);
    const conversationId = rawConversationId ?? randomUUID();
    const sessionId = rawSessionId ?? randomUUID();
    const userMessageId = rawUserMessageId ?? randomUUID();
    const consent: PierrotConsent = normalizePierrotConsent(rawConsent) ?? {
      state: 'pending',
      version: null,
    };
    const canStoreTranscript = consent.state === 'granted';
    const canStoreMetadata = consent.state !== 'denied';
    const pierrotStore = canStoreMetadata ? createPierrotStore() : null;

    // Check if requester is Admin (Anton Merkurov)
    let isAdmin = false;
    let currentUserId: string | null = null;
    // Owner-only manuscript retrieval requires a verified server-side identity.
    // The legacy shared x-admin-key below is deliberately not sufficient.
    let ragOwnerAuthorized = false;
    try {
      const user = await getCurrentUser();
      currentUserId = user?.id ?? null;
      if (user?.role === 'ADMIN') {
        isAdmin = true;
      }
      if (isVerifiedOwnerUser(user)) {
        ragOwnerAuthorized = true;
      }
    } catch {
      isAdmin = false;
    }

    // Verified Telegram Mini App administrator / other API credentials.
    if (!isAdmin) {
      const hasVerifiableCredential =
        Boolean(req.headers.get('x-telegram-init-data')) ||
        Boolean(req.headers.get('x-admin-secret')) ||
        Boolean(req.headers.get('authorization'));

      if (hasVerifiableCredential) {
        try {
          const admin = await requireAdminFromRequest(req);
          isAdmin = admin.role === 'ADMIN';
          // A dedicated service secret ("system-admin") is an existing admin
          // credential, but it is not a user identity. Keep owner manuscript
          // retrieval limited to verified user/admin sessions.
          if (isVerifiedOwnerCredential(admin)) ragOwnerAuthorized = true;
        } catch {
          isAdmin = false;
        }
      }
    }

    // Optional admin header fallback
    const customAdminHeader = req.headers.get('x-admin-key');
    if (
      customAdminHeader &&
      ((process.env.ADMIN_SECRET_KEY && customAdminHeader === process.env.ADMIN_SECRET_KEY) ||
        (process.env.PIERO_API_SECRET && customAdminHeader === process.env.PIERO_API_SECRET))
    ) {
      isAdmin = true;
    }

    if (requestedOwnerMode && !ragOwnerAuthorized) {
      return NextResponse.json({ error: 'Owner mode is not available.' }, { status: 403 });
    }

    // Owner knowledge is the default for a verified owner. Sending
    // mode: "site" explicitly turns it off; non-owners never enter this path.
    const ownerMode = ragOwnerAuthorized && !requestedSiteMode;

    // Format normalized conversation history with hard limits.
    const normalizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let historyCharacters = 0;

    if (Array.isArray(history)) {
      for (const item of history.slice(-PIERROT_MAX_HISTORY_ITEMS)) {
        if (!item || typeof item !== 'object') continue;

        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        const text = typeof item.content === 'string' ? item.content : item.parts?.[0]?.text || '';

        if (typeof text !== 'string') continue;

        const content = text.trim().slice(0, PIERROT_MAX_HISTORY_ITEM_CHARS);

        if (!content) continue;

        if (historyCharacters + content.length > PIERROT_MAX_HISTORY_CHARS) {
          break;
        }

        historyCharacters += content.length;
        normalizedHistory.push({ role, content });
      }
    }

    const openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      normalizedHistory.map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      }));
    openAiMessages.push({ role: 'user', content: trimmedMessage });

    if (pierrotStore) {
      try {
        await ensurePierrotConversation(pierrotStore, {
          id: conversationId,
          sessionId,
          startPage: requestedPathname,
          referrer,
          language,
          consentState: consent.state,
          consentVersion: consent.version,
        });

        await recordPierrotEvent(pierrotStore, {
          conversationId,
          sessionId,
          eventName: 'conversation_started',
          eventKey: 'conversation_started',
          payload: {
            start_page: requestedPathname,
            language,
            has_referrer: Boolean(referrer),
          },
        });
      } catch (error) {
        persistenceFailure(error, 'conversation_start');
      }
    }

    // Human takeover is enforced here, before any model call or commercial
    // planning. Hiding the composer in the browser is not enough: a direct
    // API request must also be refused while Anton is present.
    let humanRecord: Awaited<ReturnType<typeof getHumanPresenceForConversation>> = null;

    if (pierrotStore && canStoreMetadata) {
      try {
        humanRecord = await getHumanPresenceForConversation(
          pierrotStore,
          conversationId,
          sessionId
        );
      } catch (error) {
        // A missing migration must not take the normal Piero chat down.
        persistenceFailure(error, 'human_presence_lookup');
      }
    }

    if (humanRecord?.request.status === 'active') {
      if (pierrotStore) {
        await recordHumanEvent(pierrotStore, {
          conversationId,
          eventName: 'human_ai_blocked',
          eventKey: `human_ai_blocked:${userMessageId}`,
          payload: { request_id: humanRecord.request.id },
        }).catch(() => undefined);
      }

      return NextResponse.json(
        {
          error: 'Anton is currently handling this conversation.',
          humanMode: true,
          human: publicHumanState(humanRecord.request),
          conversationId,
          sessionId,
        },
        { status: 409 }
      );
    }

    const section = requestedPathname ? getSectionByRoute(requestedPathname) : null;
    const contextPrompt = buildPierrotContextPrompt({
      pathname: requestedPathname,
      sectionLabel: section?.label,
      sectionRoute: section?.route,
      message: trimmedMessage,
    });

    const previousOfferId = normalizePreviousOfferId(history);
    const intent = classifyPierrotIntent(trimmedMessage);
    let serviceInquiry: Awaited<ReturnType<typeof advanceStoredServiceInquiry>> = null;
    let serviceInquiryUnavailable = false;

    if (!ownerMode && pierrotStore && isServiceLeadIntent(intent)) {
      try {
        serviceInquiry = await advanceStoredServiceInquiry({
          store: pierrotStore,
          conversationId,
          message: trimmedMessage,
          userMessageId,
        });
      } catch (error) {
        serviceInquiryUnavailable = true;
        persistenceFailure(error, 'service_inquiry');
      }
    }

    const pageContext = resolvePierrotPageContext(requestedPathname);
    const contextOfferId = ownerMode ? null : pageContext.contextOfferId;
    const offerPolicies = await loadPierrotOfferPoliciesFromStore(pierrotStore);

    // The browser transcript preserves the immediate offer id. Trusted server
    // events add refusals, objections, verified purchases and confirmed
    // subscriptions across the whole conversation. No message text is stored
    // in these events.
    let commercialState = derivePierrotCommercialState({ history });

    if (pierrotStore) {
      try {
        const signals = await loadPierrotCommercialSignals(pierrotStore, conversationId, sessionId);

        commercialState = mergePierrotCommercialStates(
          commercialState,
          derivePierrotCommercialState({
            events: signals.events,
            subscriptionEvents: signals.subscriptionEvents,
          })
        );
      } catch (error) {
        persistenceFailure(error, 'commercial_state');
      }
    }

    // Load subscription/stock facts for the offer the planner is most likely
    // to use, including an off-page proactive candidate. The planner re-checks
    // with the verified runtime and will withhold the pitch if necessary.
    const preliminaryProactive = ownerMode
      ? null
      : selectProactivePierrotOffer({
          message: trimmedMessage,
          intent,
          pathname: requestedPathname,
          state: commercialState,
          runtime: null,
          contextOfferId,
          policies: offerPolicies,
        });

    const runtimeOfferId =
      intent.offerId ?? preliminaryProactive?.offerId ?? contextOfferId ?? previousOfferId;
    const offerRuntime =
      !ownerMode && (runtimeOfferId === 'heart_angel_postcard' || runtimeOfferId === 'journal_flow')
        ? await loadPierrotOfferRuntime({
            offerId: runtimeOfferId,
            userId: currentUserId,
          })
        : null;
    const plan = planPierrotResponse({
      intent,
      language,
      runtime: offerRuntime,
      previousOfferId,
      contextOfferId,
      pathname: requestedPathname,
      message: trimmedMessage,
      commercialState,
      offerPolicies,
      serviceInquiry,
      serviceInquiryUnavailable,
    });
    const useModel = ownerMode || plan.useModel;
    const commercialPrompt = ownerMode ? '' : buildPierrotCommercialPrompt(plan);

    const responseExtras = ownerMode
      ? {}
      : {
          ...(plan.cta ? { cta: plan.cta } : {}),
          ...(plan.actions.length > 0 ? { actions: plan.actions } : {}),
          ...(plan.links.length > 0 ? { links: plan.links } : {}),
          ...(plan.offer ? { offerId: plan.offer.id } : {}),
          ...(plan.commercialMarker ? { commercialMarker: plan.commercialMarker } : {}),
          commercial: {
            stage: plan.commercialStage,
            proactive: plan.proactive,
            offerSelected: plan.offerSelected,
            reason: plan.recommendationReason,
            sourcePage: plan.sourcePage,
          },
          intent: {
            name: intent.name,
            confidence: intent.confidence,
            uncertain: intent.uncertain,
            offerId: intent.offerId ?? null,
            declined: intent.declined,
            accessRequest: intent.accessRequest,
            publisherIntent: intent.publisherIntent,
          },
        };

    const systemPrompt =
      (isAdmin ? PIERROT_PROMPT_OWNER : PIERROT_PROMPT_PUBLIC) +
      '\n\n' +
      contextPrompt +
      '\n\n' +
      commercialPrompt;

    const assistantMessageId = createAssistantMessageId(conversationId, userMessageId);
    const startedAt = Date.now();
    let replay: Awaited<ReturnType<typeof findPierrotAssistantReply>> = null;

    if (pierrotStore && canStoreTranscript) {
      try {
        const ownsConversation = await conversationBelongsToSession(
          pierrotStore,
          conversationId,
          sessionId
        );

        if (ownsConversation) {
          replay = await findPierrotAssistantReply(
            pierrotStore,
            conversationId,
            assistantMessageId
          );
        }
      } catch (error) {
        persistenceFailure(error, 'assistant_replay_lookup');
      }

      if (replay) {
        return NextResponse.json({
          reply: replay.content,
          provider: replay.provider || undefined,
          ...(isAdmin ? { admin: true } : {}),
          conversationId,
          sessionId,
          userMessageId,
          assistantMessageId,
          replayed: true,
          ...responseExtras,
        });
      }

      try {
        await appendPierrotMessage(pierrotStore, {
          conversationId,
          sessionId,
          messageId: userMessageId,
          role: 'user',
          content: trimmedMessage,
          provider: null,
        });

        await recordPierrotEvent(pierrotStore, {
          conversationId,
          sessionId,
          eventName: 'message_sent',
          eventKey: `message_sent:${userMessageId}`,
          payload: {
            message_id: userMessageId,
            length: trimmedMessage.length,
            language,
          },
        });
      } catch (error) {
        persistenceFailure(error, 'user_message');
      }
    }

    // Deterministic human-presence intent. This is intentionally server-side:
    // the browser cannot create requests by calling a public endpoint with a
    // guessed conversation id, and pronoun/verb variations do not depend on
    // the model's willingness to follow an instruction.
    if (!ownerMode && canStoreTranscript && pierrotStore) {
      const humanIntent = detectHumanPresenceIntent(trimmedMessage);

      if (humanIntent.requested) {
        const humanLanguage = humanLanguageFromDetected(language);
        const copy = getHumanCopy(humanLanguage);
        const humanAssistantId = createAssistantMessageId(conversationId, userMessageId);

        const persistHumanReply = async (text: string) => {
          try {
            await appendPierrotMessage(pierrotStore, {
              conversationId,
              sessionId,
              messageId: humanAssistantId,
              role: 'assistant',
              content: text,
              provider: null,
            });

            await recordPierrotEvent(pierrotStore, {
              conversationId,
              sessionId,
              eventName: 'assistant_replied',
              eventKey: `assistant_replied:${humanAssistantId}`,
              payload: {
                message_id: humanAssistantId,
                in_reply_to: userMessageId,
                human_presence: true,
                length: text.length,
              },
            });
          } catch (error) {
            persistenceFailure(error, 'human_presence_reply');
          }
        };

        if (!isHumanPresenceConfigured()) {
          const text = copy.unavailable;

          await persistHumanReply(text);

          return NextResponse.json({
            reply: text,
            conversationId,
            sessionId,
            userMessageId,
            assistantMessageId: humanAssistantId,
            recorded: canStoreTranscript,
            humanUnavailable: true,
          });
        }

        const access = createHumanAccessToken();
        let created: Awaited<ReturnType<typeof createHumanRequest>>;

        try {
          created = await createHumanRequest(pierrotStore, {
            conversationId,
            sessionId,
            accessTokenHash: access.hash,
            visitorLabel: visitorLabelForConversation(conversationId),
            startPage: requestedPathname,
            contextSummary: buildHumanContextSummary(normalizedHistory),
            language,
          });
        } catch (error) {
          persistenceFailure(error, 'human_request_create');

          const text = copy.unavailable;
          await persistHumanReply(text);

          return NextResponse.json({
            reply: text,
            conversationId,
            sessionId,
            userMessageId,
            assistantMessageId: humanAssistantId,
            recorded: canStoreTranscript,
            humanUnavailable: true,
          });
        }

        if (created.status === 'active') {
          const activeHuman =
            (await getHumanPresenceForConversation(
              pierrotStore,
              conversationId,
              sessionId
            ).catch(() => null)) ??
            (await getHumanPresenceByRequestId(pierrotStore, created.requestId).catch(
              () => null
            ));

          return NextResponse.json(
            {
              error: 'Anton is currently handling this conversation.',
              humanMode: true,
              human: activeHuman ? publicHumanState(activeHuman.request) : null,
              conversationId,
              sessionId,
            },
            { status: 409 }
          );
        }

        if (created.status === 'pending') {
          const persisted = await getHumanPresenceForConversation(
            pierrotStore,
            conversationId,
            sessionId
          ).catch(() => null);

          if (persisted?.request.status === 'active') {
            return NextResponse.json(
              {
                error: 'Anton is currently handling this conversation.',
                humanMode: true,
                human: publicHumanState(persisted.request),
                conversationId,
                sessionId,
              },
              { status: 409 }
            );
          }

          let notificationFailed = false;
          const notificationRequest = persisted?.request ?? {
            id: created.requestId,
            visitor_label: created.visitorLabel,
            start_page: created.startPage,
            context_summary: created.contextSummary,
          };

          // Create is idempotent. The notification is sent only when this
          // request has no Telegram message yet, so pressing "call Anton"
          // repeatedly cannot spam his chat.
          if (!persisted?.request.telegram_message_id) {
            const notification = await notifyHumanRequest(notificationRequest);

            if (notification) {
              await setHumanRequestTelegramMessage(
                pierrotStore,
                notificationRequest.id,
                {
                  chatId: notification.chatId,
                  messageId: notification.messageId,
                }
              ).catch(() => undefined);

              await recordHumanEvent(pierrotStore, {
                conversationId,
                eventName: 'human_requested',
                eventKey: `human_requested:${notificationRequest.id}`,
                payload: {
                  request_id: notificationRequest.id,
                  language,
                  has_context: Boolean(notificationRequest.context_summary),
                },
              }).catch(() => undefined);
            } else {
              notificationFailed = true;

              await declineHumanRequest(
                pierrotStore,
                notificationRequest.id,
                'system'
              ).catch(() => undefined);

              await recordHumanEvent(pierrotStore, {
                conversationId,
                eventName: 'human_notification_failed',
                eventKey: `human_notification_failed:${notificationRequest.id}`,
                payload: { request_id: notificationRequest.id },
              }).catch(() => undefined);
            }
          } else {
            await recordHumanEvent(pierrotStore, {
              conversationId,
              eventName: 'human_request_duplicate',
              eventKey: `human_request_duplicate:${created.requestId}`,
              payload: { request_id: created.requestId },
            }).catch(() => undefined);
          }

          const text = notificationFailed
            ? copy.unavailable
            : created.created
              ? copy.pending
              : copy.pendingRepeated;

          await persistHumanReply(text);

          const fallbackHuman: HumanPresencePublicState = {
            requestId: created.requestId,
            status: 'pending',
            visitorLabel: created.visitorLabel,
            startPage: created.startPage,
            language: created.language,
            createdAt: created.createdAt || null,
            expiresAt: created.expiresAt || null,
            acceptedAt: null,
            closedAt: null,
            resolvedBy: null,
          };
          const humanState = persisted
            ? publicHumanState(persisted.request)
            : fallbackHuman;

          return NextResponse.json({
            reply: text,
            conversationId,
            sessionId,
            userMessageId,
            assistantMessageId: humanAssistantId,
            recorded: canStoreTranscript,
            ...(notificationFailed
              ? {}
              : { human: humanState, humanToken: access.token }),
          });
        }
      }
    }

    // Commercial metadata is recorded whenever metadata storage is allowed,
    // even if transcript storage is not. The payload contains no message text.
    if (!ownerMode && pierrotStore) {
      try {
        await recordPierrotCommercialAnalytics(pierrotStore, {
          conversationId,
          sessionId,
          userMessageId,
          intent,
          plan,
        });
      } catch (error) {
        persistenceFailure(error, 'commercial_analytics');
      }
    }

    let reply = '';
    let usedProvider = '';
    let ownerRag: OwnerRagResponse | null = null;
    let brainTrace: BrainRetrievalResult | null = null;
    let usedRagContext = false;

    if (!useModel) {
      reply = plan.reply || 'Silence.';
    }

    if (useModel) {
      try {
        // DeepSeek only. No OpenRouter/Gemini fallback: a failed request
        // returns a clear 500 rather than silently switching providers.
        const reasoningKeywords = [
          'code',
          'код',
          'refactor',
          'рефактор',
          'bug',
          'баг',
          'error',
          'ошибка',
          'анализ',
          'проанализируй',
          'разбери',
          'сравни',
          'почему',
          'архитектур',
          'структур',
          'алгоритм',
          'логик',
          'стратеги',
          'детально',
          'подробно',
          'deep',
          'reason',
          'calculate',
          'вычисли',
          'исследуй',
          'system',
          'database',
          'sql',
        ];

        const contextScan = `${trimmedMessage} ${normalizedHistory
          .slice(-2)
          .map((h) => h.content)
          .join(' ')}`.toLowerCase();
        const prefersReasoning =
          isAdmin && reasoningKeywords.some((keyword) => contextScan.includes(keyword));

        // Owner-only Brain retrieval. Public conversations never enter this
        // branch. The mode is a client intent only; access is decided by the
        // verified server-side owner identity above.
        let generationSystemPrompt = systemPrompt;

        if (ownerMode) {
          try {
            const useBrainV2 = isBrainRetrievalV2Enabled();

            if (useBrainV2) {
              const retrieval = await retrieveBrainEvidence({
                query: trimmedMessage,
                scope: 'owner',
                ownerAuthorized: true,
                enabled: true,
              });

              brainTrace = retrieval;
              ownerRag = {
                mode: 'unframed',
                outcome: retrieval.outcome,
                sources:
                  retrieval.outcome === 'relevant_results'
                    ? buildUnframedEvidenceSources(retrieval)
                    : [],
              };

              const ragPrompt =
                retrieval.outcome === 'relevant_results'
                  ? buildUnframedEvidencePrompt(retrieval)
                  : buildUnframedUnavailablePrompt(retrieval.outcome);

              usedRagContext = Boolean(ragPrompt);

              if (ragPrompt) {
                generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
              }

              console.info('[Pierrot RAG v2]', {
                status: retrieval.outcome,
                intent: retrieval.plan.intent,
                selected_sources: retrieval.selectedSourceClasses,
                chunks: retrieval.hits.length,
                documents: retrieval.documentIds.length,
                latency_ms: retrieval.latencyMs,
                code: retrieval.code ?? null,
              });
            } else {
              const retrieval = await retrieveUnframedEvidence({
                query: trimmedMessage,
                scope: 'owner',
                ownerAuthorized: true,
                enabled: true,
              });

              ownerRag = {
                mode: 'unframed',
                outcome: retrieval.outcome,
                sources:
                  retrieval.outcome === 'relevant_results'
                    ? buildUnframedEvidenceSources(retrieval)
                    : [],
              };

              const ragPrompt =
                retrieval.outcome === 'relevant_results'
                  ? buildUnframedEvidencePrompt(retrieval)
                  : buildUnframedUnavailablePrompt(retrieval.outcome);

              usedRagContext = Boolean(ragPrompt);

              if (ragPrompt) {
                generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
              }

              console.info('[Pierrot RAG v1]', {
                status: retrieval.outcome,
                scope: 'owner',
                chunks: retrieval.hits.length,
                latency_ms: retrieval.latencyMs,
                code: retrieval.code ?? null,
              });
            }
          } catch {
            ownerRag = {
              mode: 'unframed',
              outcome: 'unavailable',
              sources: [],
            };
            usedRagContext = false;
            generationSystemPrompt = `${systemPrompt}\n\n${buildUnframedUnavailablePrompt(
              'unavailable'
            )}`;

            // Never log query text, passages or provider/database details.
            console.warn('[Pierrot RAG] unavailable (unexpected)');
          }
        }

        reply = await callDeepSeek(generationSystemPrompt, openAiMessages, prefersReasoning);
        usedProvider = 'deepseek';
      } catch (aiError) {
        if (pierrotStore && canStoreTranscript) {
          try {
            await recordPierrotEvent(pierrotStore, {
              conversationId,
              sessionId,
              eventName: 'assistant_failed',
              eventKey: `assistant_failed:${userMessageId}`,
              payload: {
                message_id: userMessageId,
                code: 'ai_unavailable',
              },
            });
          } catch (error) {
            persistenceFailure(error, 'assistant_failure_event');
          }
        }

        if (brainTrace && pierrotStore) {
          await recordBrainRetrieval(pierrotStore, {
            conversationId,
            sessionId,
            userMessageId,
            result: brainTrace,
            usedContext: usedRagContext,
            generationOk: false,
          });
        }

        console.error('[Pierrot Web Error]:', aiError);
        return NextResponse.json({ error: 'The ether is disrupted.' }, { status: 500 });
      }
    }

    // Anton may accept while the model is generating. Re-check before the
    // assistant turn is persisted or returned, otherwise an AI answer could
    // land after the human takeover notice.
    if (pierrotStore && canStoreMetadata) {
      try {
        const acceptedDuringGeneration = await getHumanPresenceForConversation(
          pierrotStore,
          conversationId,
          sessionId
        );

        if (acceptedDuringGeneration?.request.status === 'active') {
          await recordHumanEvent(pierrotStore, {
            conversationId,
            eventName: 'human_ai_blocked',
            eventKey: `human_ai_blocked_after_generation:${userMessageId}`,
            payload: {
              request_id: acceptedDuringGeneration.request.id,
              stage: 'post_generation',
            },
          }).catch(() => undefined);

          return NextResponse.json(
            {
              error: 'Anton is currently handling this conversation.',
              humanMode: true,
              human: publicHumanState(acceptedDuringGeneration.request),
              conversationId,
              sessionId,
            },
            { status: 409 }
          );
        }
      } catch (error) {
        persistenceFailure(error, 'human_presence_post_generation');
      }
    }

    if (!ownerMode && pierrotStore) {
      try {
        await recordPierrotOfferShown(pierrotStore, {
          conversationId,
          sessionId,
          userMessageId,
          intent,
          plan,
        });
      } catch (error) {
        persistenceFailure(error, 'offer_shown');
      }
    }

    reply = (reply || 'Silence.').slice(0, PIERROT_MAX_MESSAGE_LENGTH);
    let finalReply = reply;

    if (pierrotStore && canStoreTranscript) {
      try {
        const stored = await appendPierrotMessage(pierrotStore, {
          conversationId,
          sessionId,
          messageId: assistantMessageId,
          role: 'assistant',
          content: reply,
          provider: usedProvider || null,
        });

        // Concurrent retries may have stored a slightly different response
        // under the same deterministic assistant message id. Return the row
        // that actually exists, so the browser and the archive agree.
        if (!stored.inserted && stored.content) {
          finalReply = stored.content;
        }

        await recordPierrotEvent(pierrotStore, {
          conversationId,
          sessionId,
          eventName: 'assistant_replied',
          eventKey: `assistant_replied:${assistantMessageId}`,
          payload: {
            message_id: assistantMessageId,
            in_reply_to: userMessageId,
            provider: usedProvider,
            length: reply.length,
            latency_ms: Date.now() - startedAt,
          },
        });
      } catch (error) {
        persistenceFailure(error, 'assistant_message');
      }
    }

    // Final race gate: acceptance may have committed between the post-
    // generation check and the assistant insert. The browser must never
    // receive an AI answer after the human takeover notice. The hidden
    // assistant row is not returned to the visitor and is excluded from the
    // human state response.
    if (pierrotStore && canStoreMetadata) {
      try {
        const finalHuman = await getHumanPresenceForConversation(
          pierrotStore,
          conversationId,
          sessionId
        );

        if (finalHuman?.request.status === 'active') {
          await recordHumanEvent(pierrotStore, {
            conversationId,
            eventName: 'human_ai_blocked',
            eventKey: `human_ai_blocked_after_store:${userMessageId}`,
            payload: {
              request_id: finalHuman.request.id,
              stage: 'post_store',
            },
          }).catch(() => undefined);

          return NextResponse.json(
            {
              error: 'Anton is currently handling this conversation.',
              humanMode: true,
              human: publicHumanState(finalHuman.request),
              conversationId,
              sessionId,
            },
            { status: 409 }
          );
        }
      } catch (error) {
        persistenceFailure(error, 'human_presence_post_store');
      }
    }

    if (brainTrace && pierrotStore) {
      await recordBrainRetrieval(pierrotStore, {
        conversationId,
        sessionId,
        userMessageId,
        result: brainTrace,
        usedContext: usedRagContext,
        generationOk: true,
      });
    }

    return NextResponse.json({
      reply: finalReply,
      provider: usedProvider || undefined,
      ...(isAdmin ? { admin: true } : {}),
      ...(ownerRag ? { rag: ownerRag } : {}),
      conversationId,
      sessionId,
      userMessageId,
      assistantMessageId,
      recorded: canStoreTranscript,
      ...responseExtras,
    });
  } catch (error: any) {
    console.error('[Pierrot Web Error]:', error);
    return NextResponse.json({ error: 'The ether is disrupted.' }, { status: 500 });
  }
}
