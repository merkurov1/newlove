import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { getCurrentUser, requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
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
import { retrieveBrainEvidence } from '@/lib/knowledge/rag/brainRetrieval';
import { retrieveBrainEvidenceWithRefinement } from '@/lib/knowledge/rag/pierrotRetrieval';
import {
  isBrainRetrievalV2Enabled,
  isPierrotRagEnabled,
  isPublicPierrotRagEnabled,
} from '@/lib/knowledge/rag/config';
import { buildBrainQueryPlan, classifyBrainDocument } from '@/lib/knowledge/rag/queryRouting';
import {
  findBrainDocumentByTitle,
  loadBrainDocumentChunks,
  type BrainDocumentMatch,
} from '@/lib/knowledge/rag/documentLookup';
import {
  buildPublicBrainEvidencePrompt,
  buildUnframedEvidencePrompt,
  buildUnframedUnavailablePrompt,
} from '@/lib/knowledge/rag/pierrotContext';
import { retrieveFlowPublicEvidence } from '@/lib/knowledge/rag/flowRetrieval';
import {
  buildUnframedEvidenceSources,
  type UnframedEvidenceSource,
} from '@/lib/knowledge/rag/evidence';
import type { RagRetrievalOutcome, RetrievedChunk } from '@/lib/knowledge/rag/types';
import type { BrainRetrievalResult } from '@/lib/knowledge/rag/brainRetrieval';
import { decideWebSearch } from '@/lib/knowledge/web/searchDecision';
import { searchWebEvidence } from '@/lib/knowledge/web/exaSearch';
import {
  buildBrainWebSynthesisPrompt,
  buildPublicWebSources,
  buildWebEvidencePrompt,
  buildWebStatusPrompt,
  composeReplyWithWebSources,
} from '@/lib/knowledge/web/webContext';
import {
  buildPierrotAnswerSources,
  type PierrotAnswerSources,
  type WebSearchResult,
} from '@/lib/knowledge/web/types';
import {
  isVerifiedOwnerCredential,
  isVerifiedOwnerUser,
  isVerifiedTelegramOwnerRequest,
} from '@/lib/knowledge/rag/authorization';
import { isMediaArchiveQuery } from '@/lib/pierrot/mediaIntent';
import {
  retrieveMediaEvidence,
  buildMediaEvidencePrompt,
  buildMediaEvidenceSources,
} from '@/lib/knowledge/rag/mediaEvidence';
import { classifyPierrotFailure, logPierrotFailure } from '@/lib/pierrot/errors';
import { pierrotErrorCopy, type PierrotErrorLanguage } from '@/lib/pierrot/errorContracts';
import {
  recordPierrotRetrieval,
  type PierrotRetrievalTraceInput,
} from '@/lib/pierrot/brainAnalytics';
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
import { isHumanPresenceConfigured, notifyHumanRequest } from '@/lib/pierrot/humanPresenceTelegram';
import { callPierrotModel } from '@/lib/pierrot/model';
import {
  confirmPendingUrlCandidate,
  consumePendingUrlCandidate,
  extractFirstUrl,
  formatUrlPreview,
  isUrlConfirmation,
  isUrlInput,
  loadPendingUrlCandidate,
  pendingUrlError,
  previewUrlForPierrot,
  savePendingUrlCandidate,
} from '@/lib/pierrot/urlIntake';
import { detectOwnerTool, runOwnerTool } from '@/lib/pierrot/ownerTools';
import {
  isPierrotUserId,
  resolvePierrotIdentity,
  type PierrotIdentitySource,
} from '@/lib/pierrot/identity';
import { understandPierrotQuery, type PierrotQueryPlan } from '@/lib/pierrot/queryUnderstanding';
import {
  buildSourceStatuses,
  guardAnswerEvidence,
  type EvidenceSourceStatuses,
} from '@/lib/pierrot/evidence';
import {
  buildPierrotIdentityGuidance,
  buildPierrotOwnerProfileContext,
  buildPierrotPerspectivePrompt,
  normalizePierrotOwnerProfile,
  type PierrotOwnerProfile,
} from '@/lib/pierrot/perspective';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETRIEVAL_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function errorLanguage(language: string): PierrotErrorLanguage {
  return language === 'en' ? 'en' : 'ru';
}

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
- Detect the user's language and reply in the EXACT SAME language. If the visitor switches language, switch immediately.
- Do not reintroduce yourself after the first turn and do not repeat the previous answer.
- For a short follow-up, use the conversation history; ask one precise clarifying question only when the intent is genuinely ambiguous.
- Do not turn the answer into a generic encyclopedia entry. Connect themes when the visitor asks for a connection.
- Default to one to three short sentences. Use a list only when the visitor explicitly asks for a list, comparison or steps; never use more than one list.
- If the available evidence is insufficient, say so in one sentence and offer one concrete next step.

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /heartandangel/card, /lobby, /journal, /flow, /flow/join, /advising, /media, /heritage, /selection, /art-engine, /unframed, /unframed/book, /unframed/proposal, /isakeyforall, /temple, /tribute.
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
- Match Anton's language (Russian or English). If he switches, switch immediately.
- Do not reintroduce yourself or repeat the previous answer.
- For a short follow-up, use the conversation history and the retrieved evidence; ask one precise clarification only when needed.
- Distinguish what the sources state from your own interpretation. Never fill a retrieval gap with invented facts.
- Default to one to three short sentences unless the question genuinely requires a structured answer; never use more than one list.

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /heartandangel/card, /lobby, /journal, /flow, /flow/join, /advising, /media, /heritage, /selection, /art-engine, /unframed, /unframed/book, /unframed/proposal, /isakeyforall, /temple, /tribute.
`;

type OwnerRagResponse = {
  mode: 'unframed' | 'media' | 'public';
  outcome: RagRetrievalOutcome;
  sources: UnframedEvidenceSource[];
};

export async function POST(req: Request) {
  const requestStartedAt = Date.now();

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
    const limited = await checkPierrotRateLimit({
      identifier: rateLimitKey,
      intervalMs: 60 * 1000,
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
      visitorId: rawVisitorId,
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

    // Owner-only manuscript retrieval requires a verified user identity.
    // Shared service secrets and x-admin-key are deliberately not user
    // identities and can never unlock owner Brain/manuscript scope.
    let currentUserId: string | null = null;
    let ragOwnerAuthorized = false;
    let ownerProfile: PierrotOwnerProfile | null = null;
    let ownerIdentitySource: PierrotIdentitySource | null = null;
    let ownerIdentityUserId: string | null = null;

    try {
      const user = await getCurrentUser();
      currentUserId = user?.id ?? null;
      if (isVerifiedOwnerUser(user)) {
        ragOwnerAuthorized = true;
        ownerIdentitySource = 'supabase_session';
        ownerIdentityUserId = user?.id ?? null;
        ownerProfile = normalizePierrotOwnerProfile(user?.profile);
      }
    } catch {
      ragOwnerAuthorized = false;
    }

    // Telegram webhook requests are server-to-server. They use the existing
    // allowlisted Telegram owner id together with the internal secret; the
    // message text is never an authentication factor.
    if (!ragOwnerAuthorized) {
      const telegramOwnerId = req.headers.get('x-telegram-owner-id');

      if (
        isVerifiedTelegramOwnerRequest({
          internalRequest: isInternalRequest,
          telegramOwnerId,
        })
      ) {
        ragOwnerAuthorized = true;
        ownerIdentitySource = 'telegram_owner';
        ownerIdentityUserId = null;
        currentUserId = currentUserId || (telegramOwnerId ? `telegram-${telegramOwnerId}` : null);
        ownerProfile = normalizePierrotOwnerProfile({
          name: 'Anton Merkurov',
          username: telegramOwnerId ? `telegram-${telegramOwnerId}` : null,
        });
      }
    }

    // Verified Telegram Mini App initData / Bearer JWT. The dedicated
    // "system-admin" service identity is excluded by isVerifiedOwnerCredential.
    if (!ragOwnerAuthorized) {
      const hasVerifiableCredential =
        Boolean(req.headers.get('x-telegram-init-data')) ||
        Boolean(req.headers.get('authorization'));

      if (hasVerifiableCredential) {
        try {
          const admin = await requireAdminFromRequest(req);
          if (isVerifiedOwnerCredential(admin)) {
            ragOwnerAuthorized = true;
            ownerIdentitySource = req.headers.get('x-telegram-init-data')
              ? 'telegram_init_data'
              : req.headers.get('authorization')
                ? 'bearer_jwt'
                : 'supabase_session';
            ownerIdentityUserId = isPierrotUserId(admin.id) ? admin.id : null;
            currentUserId = currentUserId || admin.id;
            ownerProfile = normalizePierrotOwnerProfile(admin.profile);
          }
        } catch {
          ragOwnerAuthorized = false;
        }
      }
    }

    // Identity is resolved only from server-verified credentials and a
    // consented first-party visitor pseudonym. Client-provided identity flags
    // (is_owner, identity_type, user_id) are never read.
    const identity = resolvePierrotIdentity({
      ownerAuthorized: ragOwnerAuthorized,
      ownerUserId: ownerIdentityUserId,
      ownerSource: ownerIdentitySource,
      visitorId: rawVisitorId,
      visitorAllowed: consent.state === 'granted',
    });

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

    const queryPlan: PierrotQueryPlan = understandPierrotQuery(trimmedMessage, {
      history: normalizedHistory,
    });

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
          identity,
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

    const perspective = ownerMode ? 'personal' : 'public';
    const ownerProfileContext =
      perspective === 'personal' ? buildPierrotOwnerProfileContext(ownerProfile) : null;
    const identityGuidance = buildPierrotIdentityGuidance(
      perspective,
      trimmedMessage,
      ownerProfile
    );

    const systemPrompt = [
      perspective === 'personal' ? PIERROT_PROMPT_OWNER : PIERROT_PROMPT_PUBLIC,
      buildPierrotPerspectivePrompt(perspective),
      ownerProfileContext,
      contextPrompt,
      commercialPrompt,
      identityGuidance,
    ]
      .filter((part): part is string => Boolean(part))
      .join('\n\n');

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
          ...(ragOwnerAuthorized ? { admin: true } : {}),
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
            (await getHumanPresenceForConversation(pierrotStore, conversationId, sessionId).catch(
              () => null
            )) ??
            (await getHumanPresenceByRequestId(pierrotStore, created.requestId).catch(() => null));

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
              await setHumanRequestTelegramMessage(pierrotStore, notificationRequest.id, {
                chatId: notification.chatId,
                messageId: notification.messageId,
              }).catch(() => undefined);

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

              await declineHumanRequest(pierrotStore, notificationRequest.id, 'system').catch(
                () => undefined
              );

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
          const humanState = persisted ? publicHumanState(persisted.request) : fallbackHuman;

          return NextResponse.json({
            reply: text,
            conversationId,
            sessionId,
            userMessageId,
            assistantMessageId: humanAssistantId,
            recorded: canStoreTranscript,
            ...(notificationFailed ? {} : { human: humanState, humanToken: access.token }),
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

    // Exact document state is kept outside the owner-tool block because the
    // model still has to read the found chunks later in the generation branch.
    let documentLookup: BrainDocumentMatch | null = null;
    let documentChunks: RetrievedChunk[] = [];
    let documentLookupStatus:
      'not_requested' | 'found' | 'found_empty' | 'not_found' | 'unavailable' = 'not_requested';

    // Owner-only deterministic tools. These use the same server-side loaders as
    // the existing admin pages and never expose another UI or chat.
    if (ownerMode && ragOwnerAuthorized) {
      const ownerLanguage: 'ru' | 'en' = language === 'en' ? 'en' : 'ru';

      const persistOwnerReply = async (text: string, extra: Record<string, unknown> = {}) => {
        let finalText = text.slice(0, PIERROT_MAX_MESSAGE_LENGTH);

        if (pierrotStore && canStoreTranscript) {
          try {
            const stored = await appendPierrotMessage(pierrotStore, {
              conversationId,
              sessionId,
              messageId: assistantMessageId,
              role: 'assistant',
              content: finalText,
              provider: null,
            });

            if (!stored.inserted && stored.content) finalText = stored.content;

            await recordPierrotEvent(pierrotStore, {
              conversationId,
              sessionId,
              eventName: 'assistant_replied',
              eventKey: `assistant_replied:${assistantMessageId}`,
              payload: {
                message_id: assistantMessageId,
                in_reply_to: userMessageId,
                provider: null,
                deterministic: true,
                length: finalText.length,
                ...extra,
              },
            });
          } catch (error) {
            persistenceFailure(error, 'owner_tool_reply');
          }
        }

        return NextResponse.json({
          reply: finalText,
          admin: true,
          conversationId,
          sessionId,
          userMessageId,
          assistantMessageId,
          recorded: canStoreTranscript,
          ...extra,
          ...(extra.source_status ? { sourceStatus: extra.source_status } : {}),
        });
      };

      const pending = pierrotStore
        ? await loadPendingUrlCandidate(pierrotStore, conversationId).catch(() => null)
        : null;
      const confirmation = pending ? isUrlConfirmation(trimmedMessage) : null;

      if (pending && confirmation) {
        const ageMs = Date.now() - Date.parse(pending.createdAt);
        const expired = !Number.isFinite(ageMs) || ageMs > 30 * 60 * 1000;

        if (expired) {
          await consumePendingUrlCandidate({
            store: pierrotStore!,
            conversationId,
            eventKey: pending.eventKey,
            payload: pending.payload,
            reason: 'expired',
          }).catch(() => undefined);

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Предыдущий разбор ссылки устарел. Пришлите ссылку заново.'
              : 'The previous link preview has expired. Send the link again.'
          );
        }

        if (confirmation === 'no') {
          await consumePendingUrlCandidate({
            store: pierrotStore!,
            conversationId,
            eventKey: pending.eventKey,
            payload: pending.payload,
            reason: 'declined',
          }).catch(() => undefined);

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Не добавляю. Материал остался только в контексте этого диалога.'
              : 'I will not add it. The material remains only in this conversation.'
          );
        }

        const result = await confirmPendingUrlCandidate({
          candidate: pending.candidate,
          requestedBy: currentUserId || 'pierrot-owner',
          language: ownerLanguage,
        });

        if (result.status !== 'failed') {
          await consumePendingUrlCandidate({
            store: pierrotStore!,
            conversationId,
            eventKey: pending.eventKey,
            payload: pending.payload,
            reason: 'confirmed',
          }).catch(() => undefined);
        }

        return persistOwnerReply(result.message, {
          brain_url_status: result.status,
          ...(result.documentId ? { brain_document_id: result.documentId } : {}),
          ...(result.runId ? { brain_run_id: result.runId } : {}),
        });
      }

      if (isUrlInput(trimmedMessage)) {
        if (!pierrotStore) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Хранилище диалога недоступно, поэтому не могу сохранить подтверждение. Пришлите ссылку позже.'
              : 'Conversation storage is unavailable, so I cannot keep the confirmation context. Send the link later.'
          );
        }

        if (pending) {
          await consumePendingUrlCandidate({
            store: pierrotStore,
            conversationId,
            eventKey: pending.eventKey,
            payload: pending.payload,
            reason: 'superseded',
          }).catch(() => undefined);
        }

        const extractedUrl = extractFirstUrl(trimmedMessage);

        if (!extractedUrl) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Не вижу полный URL. Пришлите ссылку целиком.'
              : 'I cannot see a complete URL. Send the full link.'
          );
        }

        try {
          const preview = await previewUrlForPierrot(extractedUrl);
          let storedPending = false;

          if (preview.canAdd) {
            try {
              await savePendingUrlCandidate({
                store: pierrotStore,
                conversationId,
                sessionId,
                preview,
              });
              storedPending = true;
            } catch (error) {
              persistenceFailure(error, 'brain_url_pending');
            }
          }

          const text = formatUrlPreview(preview, ownerLanguage);

          return persistOwnerReply(
            preview.canAdd && storedPending
              ? text
              : preview.canAdd
                ? `${text}\n\n${
                    ownerLanguage === 'ru'
                      ? 'Не удалось сохранить контекст подтверждения. Пришлите ссылку заново.'
                      : 'I could not save the confirmation context. Send the link again.'
                  }`
                : text,
            {
              brain_url_preview: true,
              brain_url_kind: preview.materialKind,
              brain_url_pipeline: preview.pipeline,
            }
          );
        } catch (error) {
          const failure = pendingUrlError(error, ownerLanguage);

          return persistOwnerReply(failure.message, {
            code: failure.code,
          });
        }
      }

      // A named document is a metadata lookup, not a commercial/status tool.
      // It is resolved before detectOwnerTool so "Weekly Review" can never be
      // swallowed by the commercial analyst.
      if (queryPlan.intent === 'document_lookup') {
        const requestedTitle = queryPlan.documentTitle;

        if (!requestedTitle) {
          documentLookupStatus = 'not_found';

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Уточните точное название документа — я найду его в Brain по названию и метаданным.'
              : 'Give me the exact document title and I will look it up in Brain by title and metadata.',
            {
              brain_document_lookup: 'title_missing',
              source_status: {
                brain: 'empty',
                media: 'not_requested',
                web: 'not_requested',
              },
            }
          );
        }

        try {
          const found = await findBrainDocumentByTitle({
            title: requestedTitle,
            scope: 'owner',
          });

          if (!found) {
            documentLookupStatus = 'not_found';

            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Документ «${requestedTitle}» в Brain пока не найден. Я не буду подменять его коммерческой статистикой или другим источником.`
                : `I could not find “${requestedTitle}” in Brain yet. I will not substitute commercial statistics or another source.`,
              {
                brain_document_lookup: 'not_found',
                document_title_requested: requestedTitle,
                source_status: {
                  brain: 'empty',
                  media: 'not_requested',
                  web: 'not_requested',
                },
              }
            );
          }

          documentLookup = found;
          documentLookupStatus = 'found';
          documentChunks = await loadBrainDocumentChunks({
            document: found,
            scope: 'owner',
          });

          if (documentChunks.length === 0) {
            documentLookupStatus = 'found_empty';

            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Документ «${found.title}» найден, но его текст ещё не извлечён. Пока я не могу его пересказать.`
                : `The document “${found.title}” exists, but its text has not been extracted yet. I cannot summarise it honestly.`,
              {
                brain_document_lookup: 'found_empty',
                document_title_requested: requestedTitle,
                document_title_matched: found.title,
                document_match_type: found.match,
                brain_document_id: found.id,
                source_status: {
                  brain: 'empty',
                  media: 'not_requested',
                  web: 'not_requested',
                },
              }
            );
          }
        } catch {
          documentLookupStatus = 'unavailable';

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? `Brain сейчас недоступен, поэтому документ «${requestedTitle}» не удалось проверить. Я не буду отвечать вместо него другим источником.`
              : `Brain is currently unavailable, so I could not verify “${requestedTitle}”. I will not answer with a different source instead.`,
            {
              brain_document_lookup: 'unavailable',
              document_title_requested: requestedTitle,
              source_status: {
                brain: 'unavailable',
                media: 'not_requested',
                web: 'not_requested',
              },
            }
          );
        }
      }

      const ownerTool = detectOwnerTool(trimmedMessage, { queryPlan });

      if (ownerTool) {
        const text = await runOwnerTool(ownerTool, ownerLanguage);

        return persistOwnerReply(text, {
          owner_tool: ownerTool.kind,
        });
      }
    }

    // Autonomous web routing is deterministic and independent of Brain. This
    // point is after every early return (replay, human takeover, owner tools),
    // so a search is only started for a turn that will actually be generated.
    // The promise starts before Brain retrieval so both run in parallel; a web
    // failure can never block the normal answer.
    const webDecision = useModel
      ? decideWebSearch({ message: trimmedMessage, history: normalizedHistory })
      : null;
    const webSuppressedIntent =
      queryPlan.intent === 'document_lookup' ||
      queryPlan.intent === 'biography' ||
      queryPlan.intent === 'commercial' ||
      queryPlan.intent === 'analytics' ||
      queryPlan.intent === 'knowledge_graph';
    const webRequested = Boolean(
      useModel &&
      webDecision &&
      !webSuppressedIntent &&
      (queryPlan.sources.web || webDecision.shouldSearch)
    );
    const webSearchPromise: Promise<WebSearchResult | null> = webRequested
      ? searchWebEvidence({
          query: webDecision?.shouldSearch ? webDecision.query : trimmedMessage,
        }).catch(() => null)
      : Promise.resolve(null);

    let reply = '';
    let usedProvider = '';
    let usedModel = '';
    let generationLatencyMs = 0;
    let fallbackUsed = false;
    let ownerRag: OwnerRagResponse | null = null;
    let retrievalTrace: Omit<PierrotRetrievalTraceInput, 'usedContext' | 'generationOk'> | null =
      null;
    let usedRagContext = false;
    let usedWebContext = false;
    let webSearchResult: WebSearchResult | null = null;
    let mediaOutcome: { outcome: string; code?: string | null } | null = null;
    let brainOutcome: { outcome: string; code?: string | null } | null = null;

    if (!useModel) {
      reply = plan.reply || 'Silence.';
    }

    if (useModel) {
      try {
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
          ragOwnerAuthorized && reasoningKeywords.some((keyword) => contextScan.includes(keyword));

        // Owner-only Brain retrieval. Public conversations never enter this
        // branch. The mode is a client intent only; access is decided by the
        // verified server-side owner identity above.
        let generationSystemPrompt = systemPrompt;
        const brainPlan = buildBrainQueryPlan(trimmedMessage);
        const requestsManuscript = brainPlan.requestedSources.includes('manuscript');
        const useMediaBranch =
          queryPlan.intent !== 'document_lookup' &&
          (queryPlan.intent === 'media_mentions' || isMediaArchiveQuery(trimmedMessage)) &&
          !requestsManuscript;

        // Media coverage is available to both the owner and public visitors.
        // Public retrieval is metadata/verified-quote only; semantic media
        // chunks remain owner-scoped.
        if (useMediaBranch) {
          const mediaStartedAt = Date.now();
          let mediaRetrieval: Awaited<ReturnType<typeof retrieveMediaEvidence>> | null = null;

          try {
            mediaRetrieval = await withTimeout(
              retrieveMediaEvidence({
                query: trimmedMessage,
                limit: 8,
                ownerAccess: ownerMode,
                publishedFrom: queryPlan.period?.from ?? null,
              }),
              RETRIEVAL_TIMEOUT_MS
            );
          } catch {
            mediaRetrieval = null;
          }

          if (!mediaRetrieval) {
            const mediaElapsed = Date.now() - mediaStartedAt;
            mediaOutcome = {
              outcome: 'unavailable',
              code: mediaElapsed >= RETRIEVAL_TIMEOUT_MS - 100 ? 'timeout' : 'retrieval_error',
            };
            retrievalTrace = {
              conversationId,
              sessionId,
              userMessageId,
              mode: 'media',
              outcome: 'unavailable',
              code: 'retrieval_timeout',
              selectedSources: ['media_coverage'],
              documentIds: [],
              chunkIds: [],
              latencyMs: Date.now() - mediaStartedAt,
              candidateCount: 0,
              topSimilarity: null,
              refined: false,
              attempts: 1,
              mediaFallbackCount: 0,
            };

            ownerRag = {
              mode: 'media',
              outcome: 'unavailable',
              sources: [],
            };
            usedRagContext = false;
            generationSystemPrompt = `${systemPrompt}\n\n${buildMediaEvidencePrompt({
              outcome: 'unavailable',
              hits: [],
            })}`;

            console.warn('[Pierrot Media Intelligence] retrieval timed out');
          } else {
            mediaOutcome = { outcome: mediaRetrieval.outcome, code: mediaRetrieval.code ?? null };
            retrievalTrace = {
              conversationId,
              sessionId,
              userMessageId,
              mode: 'media',
              outcome: mediaRetrieval.outcome,
              code: mediaRetrieval.code ?? null,
              selectedSources: ['media_coverage'],
              documentIds: Array.from(new Set(mediaRetrieval.hits.map((hit) => hit.documentId))),
              chunkIds: mediaRetrieval.hits.map((hit) => hit.chunkId),
              latencyMs: Date.now() - mediaStartedAt,
              candidateCount: mediaRetrieval.hits.length,
              topSimilarity: null,
              refined: false,
              attempts: 1,
              mediaFallbackCount: mediaRetrieval.hits.filter((hit) => hit.fallback).length,
            };

            ownerRag = {
              mode: 'media',
              outcome: mediaRetrieval.outcome,
              sources: buildMediaEvidenceSources(mediaRetrieval),
            };

            const ragPrompt = buildMediaEvidencePrompt(mediaRetrieval);
            usedRagContext =
              mediaRetrieval.outcome === 'relevant_results' && mediaRetrieval.hits.length > 0;

            if (ragPrompt) {
              generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
            }

            console.info('[Pierrot Media Intelligence]', {
              status: mediaRetrieval.outcome,
              publications: mediaRetrieval.hits.length,
              fallback: mediaRetrieval.hits.some((hit) => hit.fallback),
            });
          }
        }

        if (!useMediaBranch && !ownerMode && isPublicPierrotRagEnabled()) {
          try {
            const retrieval = await retrieveFlowPublicEvidence(
              {
                title: trimmedMessage,
                body_md: null,
                metadata: null,
                type: 'article',
                lang: language,
                source_url: null,
              },
              { enabled: true }
            );

            brainOutcome = { outcome: retrieval.status };
            retrievalTrace = {
              conversationId,
              sessionId,
              userMessageId,
              mode: 'public_brain',
              outcome: retrieval.status,
              code: null,
              selectedSources: Array.from(
                new Set(retrieval.sourceRefs.map((ref) => ref.sourceType))
              ),
              documentIds: retrieval.documentIds,
              chunkIds: retrieval.sourceRefs.map((ref) => ref.chunkId),
              latencyMs: retrieval.latencyMs,
              candidateCount:
                typeof retrieval.diagnostics.candidateCount === 'number'
                  ? retrieval.diagnostics.candidateCount
                  : 0,
              topSimilarity: retrieval.topSimilarity,
              refined: false,
              attempts: 1,
            };

            const ragPrompt = buildPublicBrainEvidencePrompt(retrieval);

            if (ragPrompt) {
              generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
              usedRagContext = true;
              ownerRag = {
                mode: 'public',
                outcome: 'relevant_results',
                sources: retrieval.sourceRefs.map((ref) => ({
                  documentId: ref.documentId,
                  documentTitle: ref.documentTitle,
                  sourceType: ref.sourceType,
                  sourceClass: ref.sourceType,
                  sourceDomain: null,
                  author: null,
                  publishedAt: ref.publishedAt,
                  chunkId: ref.chunkId,
                  heading: ref.documentTitle,
                  sectionPath: [],
                  sectionIndex: 0,
                  lineStart: 0,
                  lineEnd: 0,
                  similarity: ref.similarity,
                  excerpt: ref.excerpt,
                  canonicalUrl: ref.sourceUrl,
                  verificationStatus: 'none',
                })),
              };
            }
          } catch {
            brainOutcome = { outcome: 'unavailable', code: 'unexpected_retrieval_error' };
            retrievalTrace = {
              conversationId,
              sessionId,
              userMessageId,
              mode: 'public_brain',
              outcome: 'unavailable',
              code: 'unexpected_retrieval_error',
              selectedSources: [],
              documentIds: [],
              chunkIds: [],
              latencyMs: 0,
              candidateCount: 0,
              topSimilarity: null,
              refined: false,
              attempts: 0,
            };
          }
        }

        if (!useMediaBranch && documentLookup && documentChunks.length > 0) {
          const documentStartedAt = Date.now();
          const documentPlan = {
            ...brainPlan,
            publishedFrom: null,
            publishedTo: null,
            specificDocument: true,
          };
          const documentResult: BrainRetrievalResult = {
            outcome: 'relevant_results',
            hits: documentChunks,
            latencyMs: Date.now() - documentStartedAt,
            topSimilarity: 0.99,
            plan: documentPlan,
            method: 'hybrid_v2',
            selectedSourceClasses: Array.from(
              new Set(
                documentChunks
                  .map((hit) => hit.sourceClass)
                  .filter((value): value is NonNullable<typeof value> => Boolean(value))
              )
            ) as BrainRetrievalResult['selectedSourceClasses'],
            selectedSourceDomains: [],
            candidateCount: documentChunks.length,
            documentIds: [documentLookup.id],
            chunkIds: documentChunks.map((hit) => hit.chunkId),
            ranking: documentChunks.map((hit) => ({
              chunkId: hit.chunkId,
              documentId: hit.documentId,
              documentTitle: hit.documentTitle || documentLookup.title,
              sourceClass:
                (hit.sourceClass as BrainRetrievalResult['selectedSourceClasses'][number]) ||
                'other',
              similarity: hit.similarity,
              lexicalScore: hit.lexicalScore || 0,
              combinedScore: hit.combinedScore || hit.similarity,
            })),
            timings: { embeddingMs: 0, searchMs: 0, rankingMs: 0 },
          };

          brainOutcome = { outcome: 'relevant_results' };
          retrievalTrace = {
            conversationId,
            sessionId,
            userMessageId,
            mode: 'brain_document',
            outcome: 'relevant_results',
            code: null,
            selectedSources: documentResult.selectedSourceClasses,
            documentIds: documentResult.documentIds,
            chunkIds: documentResult.chunkIds,
            latencyMs: documentResult.latencyMs,
            candidateCount: documentChunks.length,
            topSimilarity: 0.99,
            refined: false,
            attempts: 1,
            timings: documentResult.timings,
            documentTitleRequested: queryPlan.documentTitle,
            documentTitleMatched: documentLookup.title,
            documentMatchType: documentLookup.match,
          };
          ownerRag = {
            mode: 'unframed',
            outcome: 'relevant_results',
            sources: buildUnframedEvidenceSources(documentResult),
          };

          const ragPrompt = buildUnframedEvidencePrompt(documentResult);
          usedRagContext = Boolean(ragPrompt);

          if (ragPrompt) {
            generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
          }

          console.info('[Pierrot Brain document]', {
            status: 'relevant_results',
            match: documentLookup.match,
            chunks: documentChunks.length,
            document_id: documentLookup.id,
          });
        } else if (!useMediaBranch && ownerMode && queryPlan.sources.brain) {
          const ragEnabled = isPierrotRagEnabled();

          if (!ragEnabled) {
            brainOutcome = { outcome: 'unavailable', code: 'feature_flag_disabled' };
            ownerRag = {
              mode: 'unframed',
              outcome: 'unavailable',
              sources: [],
            };
            usedRagContext = false;
            generationSystemPrompt = `${systemPrompt}\n\n${buildUnframedUnavailablePrompt(
              'unavailable'
            )}`;

            retrievalTrace = {
              conversationId,
              sessionId,
              userMessageId,
              mode: 'disabled',
              outcome: 'disabled',
              code: 'feature_flag_disabled',
              selectedSources: [],
              documentIds: [],
              chunkIds: [],
              latencyMs: 0,
              candidateCount: 0,
              topSimilarity: null,
              refined: false,
              attempts: 0,
            };

            console.info('[Pierrot RAG] disabled by PIERROT_RAG_ENABLED');
          } else {
            try {
              const useBrainV2 = isBrainRetrievalV2Enabled();

              if (useBrainV2) {
                const retrieval = await retrieveBrainEvidenceWithRefinement({
                  query: trimmedMessage,
                  plan: brainPlan,
                  topK: 8,
                  maxAttempts: 3,
                  retrieve: (attempt) =>
                    retrieveBrainEvidence({
                      query: attempt.query,
                      scope: 'owner',
                      ownerAuthorized: true,
                      plan: attempt.plan,
                      topK: attempt.topK,
                    }),
                });

                brainOutcome = { outcome: retrieval.outcome, code: retrieval.code ?? null };
                retrievalTrace = {
                  conversationId,
                  sessionId,
                  userMessageId,
                  mode: 'brain_v2',
                  outcome: retrieval.outcome,
                  code: retrieval.code ?? null,
                  selectedSources: retrieval.selectedSourceClasses,
                  documentIds: retrieval.documentIds,
                  chunkIds: retrieval.chunkIds,
                  latencyMs: retrieval.latencyMs,
                  candidateCount: retrieval.candidateCount,
                  topSimilarity: retrieval.topSimilarity,
                  refined: retrieval.refined,
                  attempts: retrieval.attempts,
                  timings: retrieval.timings ?? null,
                };

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

                usedRagContext = retrieval.outcome === 'relevant_results' && Boolean(ragPrompt);

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
                });

                brainOutcome = { outcome: retrieval.outcome, code: retrieval.code ?? null };
                retrievalTrace = {
                  conversationId,
                  sessionId,
                  userMessageId,
                  mode: 'brain_v1',
                  outcome: retrieval.outcome,
                  code: retrieval.code ?? null,
                  selectedSources: Array.from(
                    new Set(
                      retrieval.hits
                        .map((hit) => hit.sourceClass)
                        .filter((value): value is string => Boolean(value))
                    )
                  ),
                  documentIds: Array.from(new Set(retrieval.hits.map((hit) => hit.documentId))),
                  chunkIds: retrieval.hits.map((hit) => hit.chunkId),
                  latencyMs: retrieval.latencyMs,
                  candidateCount: retrieval.hits.length,
                  topSimilarity: retrieval.topSimilarity,
                  refined: false,
                  attempts: 1,
                  timings: null,
                };

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

                usedRagContext = retrieval.outcome === 'relevant_results' && Boolean(ragPrompt);

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
              brainOutcome = { outcome: 'unavailable', code: 'unexpected_retrieval_error' };
              retrievalTrace = {
                conversationId,
                sessionId,
                userMessageId,
                mode: 'brain_v2',
                outcome: 'unavailable',
                code: 'unexpected_retrieval_error',
                selectedSources: [],
                documentIds: [],
                chunkIds: [],
                latencyMs: 0,
                candidateCount: 0,
                topSimilarity: null,
                refined: false,
                attempts: 0,
              };
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
        }

        // Web evidence was requested in parallel with Brain. Awaiting it here
        // keeps the normal answer available even when Brain or Exa failed.
        webSearchResult = await webSearchPromise;

        const webPrompt = buildWebEvidencePrompt(webSearchResult);
        const webStatusPrompt = webRequested ? buildWebStatusPrompt(webSearchResult) : null;

        if (webPrompt) {
          generationSystemPrompt = `${generationSystemPrompt}\n\n${webPrompt}`;
          usedWebContext = webSearchResult?.outcome === 'relevant_results';

          if (usedWebContext && usedRagContext) {
            generationSystemPrompt = `${generationSystemPrompt}\n\n${buildBrainWebSynthesisPrompt()}`;
          }
        }

        // A failed or empty search must be visible to the model as a status,
        // not silently omitted. Otherwise it invents the missing results.
        if (webStatusPrompt) {
          generationSystemPrompt = `${generationSystemPrompt}\n\n${webStatusPrompt}`;
        }

        const generated = await callPierrotModel(
          generationSystemPrompt,
          openAiMessages,
          prefersReasoning
        );
        reply = generated.reply;
        usedProvider = generated.provider;
        usedModel = generated.model;
        generationLatencyMs = generated.latencyMs;
        fallbackUsed = generated.fallbackUsed;
      } catch (aiError) {
        const failure = classifyPierrotFailure(aiError, { aborted: req.signal.aborted });

        if (pierrotStore && canStoreTranscript) {
          try {
            await recordPierrotEvent(pierrotStore, {
              conversationId,
              sessionId,
              eventName: 'assistant_failed',
              eventKey: `assistant_failed:${userMessageId}`,
              payload: {
                message_id: userMessageId,
                code: failure.code,
                http_status: failure.httpStatus,
              },
            });
          } catch (error) {
            persistenceFailure(error, 'assistant_failure_event');
          }
        }

        if (retrievalTrace && pierrotStore) {
          await recordPierrotRetrieval(pierrotStore, {
            ...retrievalTrace,
            usedContext: usedRagContext,
            generationOk: false,
          });
        }

        logPierrotFailure({
          operation: 'pierrot_web_generate',
          failure,
          latencyMs: Date.now() - startedAt,
          error: aiError,
          provider: usedProvider || 'gemini',
          dependency: 'pierrot_llm',
        });

        return NextResponse.json(
          {
            error: pierrotErrorCopy(errorLanguage(language), failure.code),
            code: failure.code,
            ...(failure.retryAfterSeconds ? { retryAfter: failure.retryAfterSeconds } : {}),
          },
          {
            status: failure.httpStatus,
            ...(failure.retryAfterSeconds
              ? { headers: { 'Retry-After': String(failure.retryAfterSeconds) } }
              : {}),
          }
        );
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

    const webSources =
      useModel && usedWebContext && webSearchResult?.outcome === 'relevant_results'
        ? webSearchResult.sources
        : [];
    const webUsed = webSources.length > 0;
    const brainUsed = usedRagContext;
    const requestedSources = {
      brain: Boolean(brainOutcome),
      media: Boolean(mediaOutcome),
      web: webRequested,
    };
    const sourceStatus: EvidenceSourceStatuses = buildSourceStatuses({
      brain: brainOutcome,
      media: mediaOutcome,
      web: webSearchResult,
      requested: requestedSources,
    });
    const allowedExternalUrls = [
      ...(webUsed ? webSources.map((source) => source.url) : []),
      ...(ownerRag?.sources ?? []).map((source) => source.canonicalUrl),
    ];
    const evidenceGuard = guardAnswerEvidence({
      reply: (reply || 'Silence.').slice(0, PIERROT_MAX_MESSAGE_LENGTH),
      statuses: sourceStatus,
      requested: requestedSources,
      allowedExternalUrls,
      language: language === 'en' ? 'en' : 'ru',
      intent: queryPlan.intent,
    });

    reply = evidenceGuard.reply.slice(0, PIERROT_MAX_MESSAGE_LENGTH);

    const answerSources: PierrotAnswerSources = buildPierrotAnswerSources({
      brain: brainUsed,
      web: webUsed,
    });

    if (webUsed) {
      reply = composeReplyWithWebSources(reply, webSources, PIERROT_MAX_MESSAGE_LENGTH);
    }

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
            model: usedModel,
            fallback_used: fallbackUsed,
            generation_latency_ms: generationLatencyMs,
            length: reply.length,
            latency_ms: Date.now() - startedAt,
            answer_sources: answerSources.mode,
            web_outcome: webSearchResult?.outcome ?? null,
            web_code: webSearchResult?.code ?? null,
            web_source_count: webSources.length,
            source_status: sourceStatus,
            evidence_warnings: evidenceGuard.violations,
            brain_timings: retrievalTrace?.timings ?? null,
            ...(retrievalTrace?.documentTitleRequested
              ? {
                  document_title_requested: retrievalTrace.documentTitleRequested,
                  document_title_matched: retrievalTrace.documentTitleMatched ?? null,
                  document_match_type: retrievalTrace.documentMatchType ?? null,
                }
              : {}),
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

    if (retrievalTrace && pierrotStore) {
      await recordPierrotRetrieval(pierrotStore, {
        ...retrievalTrace,
        usedContext: usedRagContext,
        generationOk: true,
      });
    }

    return NextResponse.json({
      reply: finalReply,
      provider: usedProvider || undefined,
      model: usedModel || undefined,
      latencyMs: generationLatencyMs || undefined,
      fallbackUsed: usedProvider ? fallbackUsed : undefined,
      ...(ragOwnerAuthorized ? { admin: true } : {}),
      ...(ownerRag ? { rag: ownerRag } : {}),
      ...(useModel ? { answerSources } : {}),
      ...(webSearchResult
        ? {
            web: {
              outcome: webSearchResult.outcome,
              ...(webSearchResult.code ? { code: webSearchResult.code } : {}),
              sources: webUsed ? buildPublicWebSources(webSearchResult) : [],
            },
          }
        : {}),
      ...(useModel
        ? {
            sourceStatus,
            ...(evidenceGuard.violations.length > 0
              ? { evidenceWarnings: evidenceGuard.violations }
              : {}),
          }
        : {}),
      conversationId,
      sessionId,
      userMessageId,
      assistantMessageId,
      recorded: canStoreTranscript,
      ...responseExtras,
    });
  } catch (error: unknown) {
    const failure = classifyPierrotFailure(error, { aborted: req.signal.aborted });

    logPierrotFailure({
      operation: 'pierrot_web_request',
      failure,
      latencyMs: Date.now() - requestStartedAt,
      error,
    });

    return NextResponse.json(
      {
        error: pierrotErrorCopy('en', failure.code),
        code: failure.code,
        ...(failure.retryAfterSeconds ? { retryAfter: failure.retryAfterSeconds } : {}),
      },
      { status: failure.httpStatus }
    );
  }
}
