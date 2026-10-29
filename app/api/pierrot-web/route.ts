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
  persistenceFailure,
  recordPierrotEvent,
} from '@/lib/pierrot/serverStore';
import { classifyPierrotIntent } from '@/lib/pierrot/intents';
import {
  buildPierrotCommercialPrompt,
  normalizePreviousOfferId,
  planPierrotResponse,
} from '@/lib/pierrot/commercial';
import { loadPierrotOfferRuntime } from '@/lib/pierrot/offerAvailability';
import { recordPierrotCommercialAnalytics } from '@/lib/pierrot/commercialAnalytics';
import { isServiceLeadIntent } from '@/lib/pierrot/serviceInquiry';
import { advanceStoredServiceInquiry } from '@/lib/pierrot/serviceInquiryStore';
import { isPierrotRagEnabled } from '@/lib/knowledge/rag/config';
import { retrieveUnframedEvidence } from '@/lib/knowledge/rag/retrieval';
import { buildUnframedEvidencePrompt } from '@/lib/knowledge/rag/pierrotContext';
import {
  isVerifiedOwnerCredential,
  isVerifiedOwnerUser,
} from '@/lib/knowledge/rag/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PIERROT_PROMPT_PUBLIC = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of Digital Temple (merkurov.love).

TONE:
- Snobbish, concise, slightly cynical, noir.
- You speak from the Ivory Tower.
- Keep answers short (max 3 sentences).
- Answer the question first. A next step is optional and never pushy.
- If the user asks for help -> suggest "The Vigil" or "Absolution" only when relevant.

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.
- Never invent prices, routes, availability, editions, reviews, delivery terms or outcomes.
- Commercial CTA buttons and routes are chosen by code; do not fabricate links.

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /lobby, /journal, /flow, /advising, /media, /heritage, /selection, /art-engine, /unframed.
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
- Allowed internal routes: /, /heartandangel, /lobby, /journal, /flow, /advising, /media, /heritage, /selection, /art-engine, /unframed.
`;

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

    if (pierrotStore && isServiceLeadIntent(intent)) {
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

    const contextOfferId =
      requestedPathname === '/heartandangel/card' ? 'heart_angel_postcard' : null;
    const contextualOfferId =
      intent.topic &&
      !intent.unknownProduct &&
      !intent.declined &&
      (contextOfferId === 'heart_angel_postcard' || previousOfferId === 'heart_angel_postcard')
        ? 'heart_angel_postcard'
        : null;
    const runtimeOfferId = intent.offerId ?? contextualOfferId;
    const offerRuntime =
      runtimeOfferId === 'heart_angel_postcard' || runtimeOfferId === 'journal_flow'
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
      serviceInquiry,
      serviceInquiryUnavailable,
    });
    const commercialPrompt = buildPierrotCommercialPrompt(plan);

    const responseExtras = {
      ...(plan.cta ? { cta: plan.cta } : {}),
      ...(plan.actions.length > 0 ? { actions: plan.actions } : {}),
      ...(plan.links.length > 0 ? { links: plan.links } : {}),
      ...(plan.offer ? { offerId: plan.offer.id } : {}),
      intent: {
        name: intent.name,
        confidence: intent.confidence,
        uncertain: intent.uncertain,
        offerId: intent.offerId ?? null,
        declined: intent.declined,
        accessRequest: intent.accessRequest,
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

    if (!plan.useModel) {
      reply = plan.reply || 'Silence.';
    }

    if (plan.useModel) {
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

        // Owner-only UNFRAMED retrieval. When the flag is absent/false or the
        // requester is not a verified owner, generation uses the exact existing
        // prompt path. Retrieval failures fall back without breaking chat.
        let generationSystemPrompt = systemPrompt;

        if (isPierrotRagEnabled() && ragOwnerAuthorized) {
          try {
            const retrieval = await retrieveUnframedEvidence({
              query: trimmedMessage,
              scope: 'owner',
              ownerAuthorized: true,
            });
            const ragPrompt = buildUnframedEvidencePrompt(retrieval);

            if (ragPrompt) {
              generationSystemPrompt = `${systemPrompt}\n\n${ragPrompt}`;
            }

            console.info('[Pierrot RAG]', {
              status: retrieval.outcome,
              scope: 'owner',
              chunks: retrieval.hits.length,
              latency_ms: retrieval.latencyMs,
              code: retrieval.code ?? null,
            });
          } catch {
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

        console.error('[Pierrot Web Error]:', aiError);
        return NextResponse.json({ error: 'The ether is disrupted.' }, { status: 500 });
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

    return NextResponse.json({
      reply: finalReply,
      provider: usedProvider || undefined,
      ...(isAdmin ? { admin: true } : {}),
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
