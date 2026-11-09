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
  loadLastPierrotAssistantTrace,
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
  BRAIN_RAG_TOTAL_TIMEOUT_MS,
  isBrainRetrievalV2Enabled,
  isPierrotRagEnabled,
  isPublicPierrotRagEnabled,
} from '@/lib/knowledge/rag/config';
import { buildBrainQueryPlan, isFoodQuery } from '@/lib/knowledge/rag/queryRouting';
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
import {
  callPierrotModel,
  streamPierrotModel,
  PierrotStreamInterruptedError,
} from '@/lib/pierrot/model';
import { createPierrotStreamResponse } from '@/lib/pierrot/streamResponse';
import { PIERROT_STREAM_VERSION } from '@/lib/pierrot/streamProtocol';
import { detectMemoryIntent, type PierrotMemoryAction } from '@/lib/pierrot/memory/intent';
import {
  createDevTaskFromChat,
  detectDevTaskIntent,
  looksLikeEngineeringTask,
  transferMemoryRecordToDev,
} from '@/lib/pierrot/memory/devBridge';
import { loadLatestMemoryListRecords, loadPendingMemoryDelete } from '@/lib/pierrot/memory/context';
import {
  buildMemoryContext,
  createMemoryRecord,
  deleteMemoryRecord,
  getMemoryRecord,
  listMemoryRecords,
  listMemoryRecordsByIds,
  restoreMemoryRecord,
  searchMemory,
  updateMemoryRecord,
} from '@/lib/pierrot/memory/store';
import { runMemorySteward } from '@/lib/pierrot/memory/steward';
import {
  createPendingMemoryOperation,
  executeMemoryOperation,
  formatMemoryOperationOutcome,
  isMemoryOperationCancellation,
  isMemoryOperationConfirmation,
  loadPendingMemoryOperation,
  memoryOperationAction,
  resolveMemoryOperation,
  type MemoryOperationOutcome,
} from '@/lib/pierrot/memory/operations';
import { buildSkillsContext } from '@/lib/pierrot/skills/store';
import { loadOwnerHistoryContext } from '@/lib/pierrot/memory/historyContext';
import {
  formatSkillAnalysisChatReply,
  parseSkillAnalysisCommand,
} from '@/lib/pierrot/skills/analysis/reply';
import { runOwnerSkillAnalysis } from '@/lib/pierrot/skills/analysis/run';
import type {
  PierrotMemoryKind,
  PierrotMemoryRecord,
  PierrotMemoryStatus,
} from '@/lib/pierrot/memory/types';
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
import { runOwnerTool } from '@/lib/pierrot/ownerTools';
import { buildPierrotExecutionPlan } from '@/lib/pierrot/executionPlan';
import {
  isPierrotUserId,
  resolvePierrotIdentity,
  type PierrotIdentitySource,
} from '@/lib/pierrot/identity';
import type { PierrotQueryPlan } from '@/lib/pierrot/queryUnderstanding';
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
import {
  createPierrotProject,
  deletePierrotProject,
  getPierrotProject,
  getPierrotProjectForConversation,
  getPierrotProjectSnapshot,
  listPierrotProjects,
  linkConversationToProject,
  updatePierrotProject,
} from '@/lib/pierrot/projects/store';
import { detectProjectCommand } from '@/lib/pierrot/projects/commands';
import {
  listProjectTasks,
  moveDecisionToProject,
  resolveExactProject,
} from '@/lib/pierrot/projects/links';
import { ensureProjectConversation } from '@/lib/pierrot/projects/conversation';
import { buildProjectChatContext } from '@/lib/pierrot/projects/history';
import {
  loadHistoryContextMessages,
  resolveHistoryScope,
  type PierrotHistoryScope,
} from '@/lib/pierrot/history/store';
import { runProjectReview } from '@/lib/pierrot/projects/review/service';
import { createOwnerTask, type OwnerTaskCreationResult } from '@/lib/pierrot/memory/taskCreation';
import { listDevTasks, updateDevTask } from '@/lib/pierrot/dev/tasks';
import { resolvePierrotProject } from '@/lib/pierrot/projects/resolver';
import { formatPierrotAnswerTrace } from '@/lib/pierrot/diagnostics';
import { detectUnifiedSearchIntent } from '@/lib/pierrot/search/intent';
import { formatUnifiedSearchReport } from '@/lib/pierrot/search/format';
import { searchUnifiedOwnerContext } from '@/lib/pierrot/search/unified';
import {
  detectGroomingCommand,
  parseGroomingApproval,
  resolveGroomingTarget,
} from '@/lib/pierrot/grooming/commands';
import {
  approvePendingGroomingPlan,
  prepareWorkspaceAudit,
  showPendingGroomingPlan,
} from '@/lib/pierrot/grooming/service';
import { recordTaskExperience } from '@/lib/pierrot/learning/store';
import { isGroomingStorageUnavailable, loadPendingAudit } from '@/lib/pierrot/grooming/store';
import {
  loadLatestContextSummary,
  maybeRefreshContextSummary,
} from '@/lib/pierrot/grooming/context';
import { getDevRepositoryConfigs } from '@/lib/pierrot/dev/repositories';
import {
  buildPendingDraft,
  detectGitHubChatIntent,
  formatGitHubWriteResult,
  formatPendingOperationPreview,
  isGitHubCancellation,
  isGitHubConfirmation,
  resolveGitHubRepository,
  runGitHubReadIntent,
} from '@/lib/pierrot/dev/chatBridge';
import {
  closePendingGitHubOperation,
  isPendingOperationTableMissing,
  loadPendingGitHubOperation,
  savePendingGitHubOperation,
  type PendingGitHubOperation,
  type PendingGitHubOperationKind,
} from '@/lib/pierrot/dev/pendingOperations';

import {
  deleteIntakeLog,
  detectIntakeMutation,
  detectIntakeQuery,
  formatIntakeAnswer,
  formatIntakeCorrected,
  formatIntakeDeleted,
  formatIntakeSaved,
  getLastIntakeLog,
  intakeRangeForQuery,
  isIntakeModelEnabled,
  isIntakeStorageUnavailable,
  listIntakeLogs,
  parseIntakeMessage,
  parseIntakeWithModel,
  resolveOwnerTimeZone,
  saveIntakeItems,
  updateIntakeLog,
} from '@/lib/pierrot/intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETRIEVAL_TIMEOUT_MS = 12_000;

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
- Default to one to four short sentences for a simple question. Never add headings, tables or lists to a simple answer.
- For a genuinely analytical question, answer first, then use two to four H2 sections with short paragraphs. Use H3 only for a real sub-topic.
- For comparisons, use a table when it genuinely helps; otherwise use prose.
- For a sequence of actions, use a numbered list. For parallel points, a short bullet list. Never turn every paragraph into a list.
- Use code blocks for code or technical examples; inline code for identifiers, commands and field names.
- Do not start with a preamble such as “Вот…”, “Конечно…”, “Давайте разберёмся…”. Do not repeat the question.
- Do not use decorative emoji or excessive bold. Avoid a wall of text: short paragraphs, clear transitions, no artificial headings.
- A short answer can still be well composed; a complex answer can be detailed without becoming a presentation.

OWNER MEMORY:
- The OWNER MEMORY block contains records Anton explicitly created with “Запомни”, “Сохрани” or “Напомни”. Use them as durable context, preferences and open reminders.
- Never describe a saved note as a permanent fact about Anton unless the record says so. Never invent memory records or claim to remember something that is not in the supplied memory or retrieved evidence.
- Memory writes are performed and confirmed by the server before generation. Do not say “запомнил” or “сохранил” unless the system has already confirmed the write.
- When the owner asks what is remembered, saved or pending, use the supplied records and clearly distinguish the three categories. If the list is unavailable, say so.

LINKS:
- When mentioning a page of this site, use a markdown link, e.g. [Lobby](/lobby).
- Allowed internal routes: /, /heartandangel, /heartandangel/card, /lobby, /journal, /flow, /flow/join, /advising, /media, /heritage, /selection, /art-engine, /unframed, /unframed/book, /unframed/proposal, /isakeyforall, /temple, /tribute.
`;

const MEMORY_MUTATION_ACTIONS = new Set<PierrotMemoryAction>([
  'complete',
  'archive',
  'forget',
  'restore',
  'delete',
]);

function isMemoryMutationAction(action: PierrotMemoryAction): boolean {
  return MEMORY_MUTATION_ACTIONS.has(action);
}

function memoryMutationKinds(
  message: string,
  action: PierrotMemoryAction
): PierrotMemoryKind[] | undefined {
  if (action === 'complete') return ['task', 'reminder'];

  const text = message.toLowerCase().replace(/ё/g, 'е');

  if (/напоминани|reminder/.test(text)) return ['reminder'];
  if (/задач|task/.test(text)) return ['task', 'reminder'];
  if (/заметк|note/.test(text)) return ['saved'];
  if (/памят|memory/.test(text)) return ['memory'];
  return undefined;
}

function isMemoryListPlaceholder(query: string | null | undefined): boolean {
  if (!query) return true;
  return /^(?:всё|все|всё\s+перечисленное|все\s+перечисленное|перечисленное|это|эту|эти|последние\s+две(?:\s+(?:задачи|задач|записи|записей))?|последних\s+двух(?:\s+(?:задач|записей))?|these|this\s+list|all\s+listed|listed\s+tasks|last\s+two(?:\s+tasks?)?)$/i.test(
    query.trim()
  );
}

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
      historyId: rawHistoryId,
      episodeId: rawEpisodeId,
      userMessageId: rawUserMessageId,
      visitorId: rawVisitorId,
      consent: rawConsent,
      mode: rawMode,
      stream: rawStream,
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
      (rawHistoryId !== undefined && !isPierrotId(rawHistoryId)) ||
      (rawEpisodeId !== undefined && !isPierrotId(rawEpisodeId)) ||
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
    const requestedProject =
      context && typeof context === 'object' && typeof context.project === 'string'
        ? context.project.slice(0, 120)
        : null;
    const language = detectPierrotLanguage(trimmedMessage);
    let conversationId = rawConversationId ?? randomUUID();
    let sessionId = rawSessionId ?? randomUUID();
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

    // A caller that brings only a legacy conversation id (Telegram, old
    // bookmarks) must have that source row before history resolution so the
    // session can keep its provenance. Requests that already name a permanent
    // history skip this and use the canonical conversation directly.
    if (
      identity.type === 'owner' &&
      pierrotStore &&
      rawConversationId &&
      !rawHistoryId &&
      !rawEpisodeId
    ) {
      try {
        await ensurePierrotConversation(pierrotStore, {
          id: rawConversationId,
          sessionId,
          startPage: requestedPathname,
          referrer,
          language,
          consentState: consent.state,
          consentVersion: consent.version,
          identity,
        });
      } catch (error) {
        persistenceFailure(error, 'legacy_conversation_prepare');
      }
    }

    if (requestedOwnerMode && !ragOwnerAuthorized) {
      return NextResponse.json({ error: 'Owner mode is not available.' }, { status: 403 });
    }

    // A project conversation remains personal even when an older client sends
    // mode: "site". The surface flag must not discard a verified project's
    // context, while an explicitly public owner turn keeps its legacy public
    // perspective.
    let conversationProject: Awaited<ReturnType<typeof getPierrotProjectForConversation>> = null;
    // Project inferred from this turn only. It can label extracted artifacts
    // without converting the whole conversation into a project chat.
    let turnProject: Awaited<ReturnType<typeof resolvePierrotProject>>['project'] = null;
    if (ragOwnerAuthorized && isPierrotUserId(ownerIdentityUserId) && rawConversationId) {
      try {
        conversationProject = await getPierrotProjectForConversation(
          ownerIdentityUserId,
          rawConversationId
        );
      } catch {
        conversationProject = null;
      }
    }
    const ownerMode =
      ragOwnerAuthorized &&
      (!requestedSiteMode || Boolean(requestedProject) || Boolean(conversationProject));
    // Memory is independent of transcript-storage consent: an explicit
    // “Запомни/Сохрани/Напомни” command is its own permission for that record.
    const memoryStore = ownerMode ? createPierrotStore() : null;

    // Resolve the permanent owner history before any write. MAIN and project
    // histories are separate; a new session never creates a new history.
    let historyScope: PierrotHistoryScope | null = null;
    let ownerEpisodeId: string | null = null;
    if (ownerMode && memoryStore && isPierrotUserId(ownerIdentityUserId)) {
      try {
        historyScope = await resolveHistoryScope(memoryStore, ownerIdentityUserId, {
          historyId: rawHistoryId || null,
          episodeId: rawEpisodeId || null,
          conversationId: rawConversationId || null,
          projectId: requestedProject || null,
          createSession: true,
        });
        if (historyScope) {
          conversationId = historyScope.conversationId;
          sessionId = historyScope.conversationSessionId;
          ownerEpisodeId = historyScope.session?.id || null;
          if (historyScope.project) conversationProject = historyScope.project;
        }
      } catch (error) {
        // The old conversation path remains usable before the additive
        // history migration is applied.
        historyScope = null;
        ownerEpisodeId = null;
        persistenceFailure(error, 'history_scope_resolution');
      }
    }

    // A project has exactly one canonical conversation. This is enforced
    // server-side so an old link, a refreshed browser or a client that still
    // holds a historical conversation id cannot create a second project chat.
    let canonicalProjectNote: string | null = null;
    if (ownerMode && memoryStore && isPierrotUserId(ownerIdentityUserId)) {
      try {
        const targetProject =
          historyScope?.history.type === 'main'
            ? null
            : conversationProject ||
              (requestedProject
                ? (
                    await resolvePierrotProject({
                      ownerUserId: ownerIdentityUserId,
                      explicitProjectId: requestedProject,
                    })
                  ).project
                : null);

        if (targetProject) {
          const canonical = await ensureProjectConversation(
            memoryStore,
            ownerIdentityUserId,
            targetProject.id
          );
          if (canonical) {
            if (canonical.conversationId !== conversationId) {
              conversationId = canonical.conversationId;
              sessionId = canonical.sessionId;
              canonicalProjectNote =
                'This is the project’s single permanent chat. Continue from the latest saved message; do not announce a new conversation.';
            }
            conversationProject =
              (await getPierrotProject(ownerIdentityUserId, targetProject.id)) || targetProject;
            await linkConversationToProject(
              ownerIdentityUserId,
              targetProject.id,
              canonical.conversationId
            ).catch(() => undefined);
          }
        }
      } catch (error) {
        // A partially migrated database must not break ordinary owner chat.
        // Project context remains available; canonical persistence is retried
        // when the reviewed migration is present.
        canonicalProjectNote =
          'PROJECT CHAT STORAGE NOTE: the canonical project conversation could not be resolved. Do not claim that a second chat was created.';
        persistenceFailure(error, 'project_canonical_conversation');
      }
    }

    // Streaming is an explicit transport choice. It is safe for public
    // visitors because owner-only retrieval, tools and memory are gated by the
    // server-verified ownerMode above, not by the response format. Telegram and
    // other JSON consumers keep the existing contract by omitting `stream`.
    const streaming = rawStream === true;
    const historyResponseFields: { historyId?: string; episodeId?: string } = historyScope
      ? {
          historyId: historyScope.history.id,
          ...(ownerEpisodeId ? { episodeId: ownerEpisodeId } : {}),
        }
      : {};

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

    // For a verified owner, the server-side permanent history is authoritative.
    // It cannot be replaced by a stale browser transcript from MAIN or another
    // project. Only a bounded window is sent to the model; retrieval still
    // searches the full history.
    let ownerHistoryScopeContext: string | null = null;
    if (historyScope && memoryStore && isPierrotUserId(ownerIdentityUserId)) {
      try {
        const storedHistory = await loadHistoryContextMessages(
          memoryStore,
          ownerIdentityUserId,
          historyScope.history.id,
          PIERROT_MAX_HISTORY_ITEMS
        );

        normalizedHistory.length = 0;
        historyCharacters = 0;
        for (const item of storedHistory.slice(-PIERROT_MAX_HISTORY_ITEMS)) {
          const content = item.content.trim().slice(0, PIERROT_MAX_HISTORY_ITEM_CHARS);
          if (!content) continue;
          if (historyCharacters + content.length > PIERROT_MAX_HISTORY_CHARS) break;
          historyCharacters += content.length;
          normalizedHistory.push({ role: item.role, content });
        }

        const currentSession = historyScope.session;
        ownerHistoryScopeContext = [
          `PERMANENT OWNER HISTORY: ${historyScope.history.title} (${historyScope.history.type.toUpperCase()}).`,
          currentSession
            ? `CURRENT SESSION: ${currentSession.title}${
                currentSession.startedAt ? `, started ${currentSession.startedAt.slice(0, 10)}` : ''
              }.`
            : null,
          historyScope.project
            ? `PROJECT SCOPE: ${historyScope.project.name}. Do not use MAIN-only context or another project as if it were this project.`
            : 'MAIN SCOPE: do not present project-only context as if it were this history.',
          'The bounded transcript below comes only from this history. Older episodes remain searchable through retrieval and explicit history search; do not invent missing turns.',
        ]
          .filter(Boolean)
          .join('\n');
      } catch (error) {
        persistenceFailure(error, 'history_context_load');
      }
    }

    const executionPlan = buildPierrotExecutionPlan(trimmedMessage, {
      history: normalizedHistory,
      ownerMode,
    });
    const queryPlan: PierrotQueryPlan = executionPlan.queryPlan;
    const previousUserMessage = [...normalizedHistory]
      .reverse()
      .find((item) => item.role === 'user')?.content;
    // A short follow-up ("А за 2025 год?", "А теперь все рецепты недели")
    // inherits the topic but not the old intent verbatim. Give retrieval the
    // previous user turn plus the current sanitized request, capped so history
    // cannot grow the query without bound.
    const retrievalQuery =
      executionPlan.requiresConversationContext && previousUserMessage
        ? `${previousUserMessage} ${executionPlan.searchQuery}`.trim().slice(0, 1_000)
        : trimmedMessage;

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

        if (
          ownerMode &&
          isPierrotUserId(ownerIdentityUserId) &&
          requestedProject &&
          !conversationProject
        ) {
          const selected = await resolvePierrotProject({
            ownerUserId: ownerIdentityUserId,
            explicitProjectId: requestedProject,
          });
          if (selected.project) {
            await linkConversationToProject(
              ownerIdentityUserId,
              selected.project.id,
              conversationId
            );
            // Carry the project into this same first turn. Conversation lookup
            // happened before the new conversation existed, so without this
            // the opening message would miss its project context.
            conversationProject = selected.project;
          }
        }

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
    const foodQuery = isFoodQuery(buildBrainQueryPlan(trimmedMessage));

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

    let ownerMemoryContext: string | null = null;
    let ownerProjectContext: string | null = null;
    let ownerConversationSummaryContext: string | null = null;
    let ownerHistoryContext: string | null = null;
    let projectResolutionNote: string | null = null;
    let ownerMemoryUnavailable = false;
    let skillsContext: string | null = null;

    if (perspective === 'personal' && isPierrotUserId(ownerIdentityUserId) && memoryStore) {
      let resolvedProjectRef = requestedProject;
      try {
        const resolved = await resolvePierrotProject({
          ownerUserId: ownerIdentityUserId,
          explicitProjectId: rawConversationId ? null : requestedProject,
          conversationProject,
          message: trimmedMessage,
        });
        turnProject = resolved.project || null;
        resolvedProjectRef = resolved.project?.slug || resolvedProjectRef;
        if (resolved.ambiguous)
          projectResolutionNote =
            'PROJECT CONTEXT AMBIGUOUS: ask the owner which project they mean before using project-specific context.';
      } catch {
        // Project context is an enhancement; a missing migration must not break chat.
      }
      if (resolvedProjectRef) {
        try {
          const project = await getPierrotProjectSnapshot(ownerIdentityUserId, resolvedProjectRef);
          if (project) {
            const wantsHistory =
              /(?:что\s+(?:я|мы)\s+(?:вчера\s+)?(?:обсуждал|говорил|решали|обсуждали)|истори[яю]\s+(?:диалогов|разговоров|нашего|проекта)|что\s+было\s+в\s+прошлом\s+разговоре|обсуждал[\p{L}]*\s+ли|помнишь\s+ли|what\s+did\s+(?:i|we)\s+(?:discuss|talk about)|was\s+(?:it|this)\s+discussed|conversation history|project history|did\s+we\s+discuss)/iu.test(
                trimmedMessage
              );
            const conversationContext = await buildProjectChatContext({
              store: memoryStore,
              ownerUserId: ownerIdentityUserId,
              project,
              conversationId,
              query: trimmedMessage,
              wantsHistory,
              recentLimit: 12,
            }).catch(() => null);
            ownerProjectContext = [
              `PROJECT CONTEXT: ${project.name} (${project.status})`,
              `Brief revision ${project.briefRevision}: ${project.projectBrief || 'No reviewed brief yet.'}`,
              project.objective ? `Objective: ${project.objective}` : null,
              project.ownerRating
                ? `Owner rating: ${project.ownerRating}/10 (explicit owner value; not model importance).`
                : null,
              project.decisions.length
                ? `Recent decisions: ${project.decisions.map((item) => `${item.title} [${item.status}]`).join('; ')}`
                : null,
              project.tasks.length
                ? `Open/project tasks: ${project.tasks
                    .filter(
                      (item) =>
                        !['verified', 'archived', 'completed', 'cancelled'].includes(item.status)
                    )
                    .map((item) => `${item.title} [${item.status}]`)
                    .join('; ')}`
                : null,
              project.knowledge.length
                ? `Project knowledge: ${project.knowledge.map((item) => item.title || item.id).join('; ')}`
                : null,
              project.artifacts.length
                ? `Project materials: ${project.artifacts
                    .map((item) => `${item.title} (${item.artifactType})`)
                    .join('; ')}`
                : null,
              project.latestReview?.summary
                ? `Latest project review summary: ${project.latestReview.summary}`
                : null,
              conversationContext,
            ]
              .filter(Boolean)
              .join('\n');
          }
        } catch {
          ownerProjectContext = null;
        }
      }
      try {
        ownerMemoryContext = await buildMemoryContext(memoryStore, ownerIdentityUserId, {
          query: retrievalQuery,
          limit: 8,
        });
      } catch {
        // Memory failure must not block the main answer. The model is told
        // below that memory is unavailable rather than inventing records.
        ownerMemoryContext = null;
        ownerMemoryUnavailable = true;
      }

      try {
        // Automatic compression is local to this conversation. It creates a
        // versioned summary but never changes tasks, Brain or GitHub.
        await maybeRefreshContextSummary(memoryStore, {
          userId: ownerIdentityUserId,
          conversationId,
        });
        const summary = await loadLatestContextSummary(
          memoryStore,
          ownerIdentityUserId,
          conversationId
        );
        if (summary) {
          ownerConversationSummaryContext = [
            `VERSIONED CONVERSATION SUMMARY (v${summary.version}; original messages are preserved):`,
            summary.summary,
          ].join('\n');
        }
      } catch {
        ownerConversationSummaryContext = null;
      }

      try {
        // Approved skills are a separate concept from memory. Ranking is
        // deterministic; nothing is executed here.
        skillsContext = await buildSkillsContext(memoryStore, ownerIdentityUserId, trimmedMessage);
      } catch {
        skillsContext = null;
      }

      const asksConversationHistory =
        /(?:что\s+(?:я|мы)\s+(?:вчера\s+)?(?:обсуждал|говорил|решали|обсуждали)|истори[яю]\s+(?:диалогов|разговоров|нашего)|что\s+было\s+в\s+прошлом\s+разговоре|what\s+did\s+(?:i|we)\s+(?:discuss|talk about)|conversation history|previous conversation)/i.test(
          trimmedMessage
        );

      if (asksConversationHistory && !conversationProject) {
        try {
          ownerHistoryContext = await loadOwnerHistoryContext(memoryStore, ownerIdentityUserId, {
            excludeConversationId: conversationId,
            historyId: historyScope?.history.id || null,
            query: retrievalQuery,
            limit: 5,
          });
        } catch {
          ownerHistoryContext = null;
        }
      }
    }

    const systemPrompt = [
      perspective === 'personal' ? PIERROT_PROMPT_OWNER : PIERROT_PROMPT_PUBLIC,
      buildPierrotPerspectivePrompt(perspective),
      ownerProfileContext,
      ownerHistoryScopeContext,
      ownerMemoryContext,
      ownerConversationSummaryContext,
      ownerHistoryContext,
      !ownerHistoryContext &&
      !conversationProject &&
      /(?:что\s+(?:я|мы)\s+(?:вчера\s+)?(?:обсуждал|говорил|решали|обсуждали)|истори[яю]\s+(?:диалогов|разговоров|нашего)|what\s+did\s+(?:i|we)\s+(?:discuss|talk about))/i.test(
        trimmedMessage
      )
        ? 'CONVERSATION HISTORY UNAVAILABLE: no recent saved transcript could be read. Say so instead of reconstructing the conversation from guesses.'
        : null,
      ownerProjectContext,
      projectResolutionNote,
      canonicalProjectNote,
      skillsContext,
      ownerMemoryUnavailable
        ? 'OWNER MEMORY UNAVAILABLE: the owner memory store could not be read. Do not claim that a record exists or does not exist. If asked about memory, say that the memory store is temporarily unavailable.'
        : null,
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
          historyId: historyScope?.history.id ?? null,
          episodeId: ownerEpisodeId,
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
              historyId: historyScope?.history.id ?? null,
              episodeId: ownerEpisodeId,
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
    // Owner-only deterministic tools. These use the same server-side loaders as
    // the existing admin pages and never expose another UI or chat.
    if (ownerMode && ragOwnerAuthorized) {
      const ownerLanguage: 'ru' | 'en' = language === 'en' ? 'en' : 'ru';
      const groomingOwnerId = isPierrotUserId(ownerIdentityUserId) ? ownerIdentityUserId : null;

      const persistOwnerReply = async (text: string, extra: Record<string, unknown> = {}) => {
        let finalText = text.slice(0, PIERROT_MAX_MESSAGE_LENGTH);

        if (pierrotStore && canStoreTranscript) {
          try {
            const stored = await appendPierrotMessage(pierrotStore, {
              conversationId,
              sessionId,
              historyId: historyScope?.history.id ?? null,
              episodeId: ownerEpisodeId,
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

        const payload = {
          reply: finalText,
          admin: true,
          conversationId,
          sessionId,
          ...historyResponseFields,
          userMessageId,
          assistantMessageId,
          recorded: canStoreTranscript,
          ...extra,
          ...(extra.source_status ? { sourceStatus: extra.source_status } : {}),
        };

        if (streaming) {
          return createPierrotStreamResponse({
            request: req,
            run: async (emit) => {
              emit({
                type: 'accepted',
                version: PIERROT_STREAM_VERSION,
                conversationId,
                sessionId,
                ...historyResponseFields,
                userMessageId,
                assistantMessageId,
              });
              emit({
                type: 'completed',
                version: PIERROT_STREAM_VERSION,
                payload,
              });
            },
          });
        }

        return NextResponse.json(payload);
      };

      const diagnosticQuestion =
        /(?:почему|зачем)\s+ты\s+так\s+(?:ответил|ответила|сказал|сказала|решил|решила)|(?:откуда|на\s+ч[её]м)\s+(?:такой\s+)?ответ|какие\s+(?:контекст|инструменты)\s+ты\s+использовал|why\s+did\s+you\s+(?:answer|say|reply)|explain\s+your\s+answer|what\s+(?:context|tools)\s+did\s+you\s+use/i.test(
          trimmedMessage
        );

      if (diagnosticQuestion) {
        const trace =
          pierrotStore && canStoreMetadata
            ? await loadLastPierrotAssistantTrace(pierrotStore, conversationId).catch(() => null)
            : null;
        return persistOwnerReply(formatPierrotAnswerTrace(trace, ownerLanguage), {
          deterministic: true,
          diagnostic_trace: trace
            ? {
                provider: trace.provider ?? null,
                web_requested: trace.web_requested ?? false,
                web_reason: trace.web_reason ?? null,
                answer_sources: trace.answer_sources ?? null,
              }
            : null,
        });
      }

      const projectCorrection =
        /^(?:нет|не\s+то|это\s+не|я\s+(?:имел|имела|имею)\s+в\s+виду|это\s+касается|относится\s+к|это\s+про|нет[,!]?\s+это)(?=\s|[,!?.]|$)/i.test(
          trimmedMessage.trim()
        );

      if (projectCorrection && memoryStore && isPierrotUserId(ownerIdentityUserId)) {
        const corrected = await resolvePierrotProject({
          ownerUserId: ownerIdentityUserId,
          conversationProject,
          message: trimmedMessage,
        }).catch(() => ({ project: null, ambiguous: false }));

        if (corrected.project) {
          const candidates = (
            await loadLatestMemoryListRecords(
              memoryStore,
              ownerIdentityUserId,
              conversationId
            ).catch(() => [])
          ).filter(
            (record) =>
              (record.kind === 'task' || record.kind === 'reminder') && record.status === 'current'
          );

          if (candidates.length === 1) {
            try {
              await moveDecisionToProject(
                memoryStore,
                ownerIdentityUserId,
                candidates[0].id,
                corrected.project
              );
              const linked = await listProjectTasks(
                memoryStore,
                ownerIdentityUserId,
                corrected.project.id,
                { statuses: ['current'], limit: 500 }
              );
              if (!linked.some((record) => record.id === candidates[0].id)) {
                throw new Error('PROJECT_CORRECTION_NOT_CONFIRMED');
              }
              await recordTaskExperience(memoryStore, {
                userId: ownerIdentityUserId,
                conversationId,
                sourceMessageId: userMessageId,
                sourceText: trimmedMessage,
                proposedKind: 'task',
                confirmedKind: 'task',
                proposedProjectId: null,
                confirmedProjectId: corrected.project.id,
                outcome: 'wrong_project',
                reason: `Owner corrected the task project to ${corrected.project.name}.`,
                source: 'chat_correction',
                analyzerVersion: 'chat-correction-v1',
                metadata: {
                  taskId: candidates[0].id,
                  taskTitle: candidates[0].title,
                  correctedProjectSlug: corrected.project.slug,
                },
              }).catch(() => null);
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Исправил связь: задача «${candidates[0].title}» теперь в проекте «${corrected.project.name}». Дубликат проекта не создавался.`
                  : `Corrected the link: “${candidates[0].title}” now belongs to “${corrected.project.name}”. No duplicate project was created.`,
                {
                  project_command: 'reclassify_task',
                  project_status: 'moved',
                  project_id: corrected.project.id,
                  memory_id: candidates[0].id,
                  memory_list_ids: [candidates[0].id],
                  operation_log: {
                    intent: 'project_reclassification',
                    project_id: corrected.project.id,
                    object_id: candidates[0].id,
                    result: 'confirmed',
                  },
                }
              );
            } catch {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Понял правильный проект, но не смог подтвердить перенос задачи «${candidates[0].title}». Ничего не утверждаю.`
                  : `I understood the correct project, but could not confirm moving “${candidates[0].title}”. I am not claiming it changed.`,
                { project_command: 'reclassify_task', project_status: 'failed' }
              );
            }
          }

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? `Понял: правильный проект — «${corrected.project.name}». Не вижу ровно одну недавнюю задачу для переноса. Уточни её заголовок, и я исправлю связь без создания дубликата проекта.`
              : `Understood: the correct project is “${corrected.project.name}”. I cannot identify exactly one recent task to move. Name its title and I will fix the link without creating a duplicate project.`,
            {
              project_command: 'reclassify_task',
              project_status: 'clarification_required',
              project_id: corrected.project.id,
            }
          );
        }
      }

      let pendingGrooming: Awaited<ReturnType<typeof loadPendingAudit>> = null;
      if (memoryStore && groomingOwnerId) {
        try {
          pendingGrooming = await loadPendingAudit(memoryStore, groomingOwnerId, conversationId);
        } catch (error) {
          if (!isGroomingStorageUnavailable(error)) {
            persistenceFailure(error, 'grooming_pending_lookup');
          }
        }
      }

      const groomingCommand = detectGroomingCommand(trimmedMessage);
      const groomingApproval = pendingGrooming ? parseGroomingApproval(trimmedMessage) : null;

      if (pendingGrooming && groomingApproval) {
        if (!groomingOwnerId || !memoryStore) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Хранилище аудита недоступно. Ничего не изменено.'
              : 'Grooming storage is unavailable. Nothing changed.',
            { grooming_status: 'storage_unavailable' }
          );
        }

        if (groomingApproval.kind === 'show') {
          const shown = await showPendingGroomingPlan({
            store: memoryStore,
            userId: groomingOwnerId,
            conversationId,
            language: ownerLanguage,
          }).catch(() => null);
          if (shown) {
            return persistOwnerReply(shown.reply, {
              grooming_status: 'prepared',
              grooming_audit_id: shown.audit.id,
              grooming_proposal_count: shown.audit.proposals.length,
              grooming_plan: shown.planView,
            });
          }
        } else if (groomingApproval.kind === 'repeat') {
          // "Повтори аудит" re-reads the current state. It never replays the
          // old proposal list and never approves anything.
          try {
            const repeatProjectId = pendingGrooming.projectId;
            const repeatSnapshot =
              repeatProjectId && repeatProjectId === conversationProject?.id
                ? await getPierrotProjectSnapshot(groomingOwnerId, repeatProjectId).catch(
                    () => null
                  )
                : null;
            if (repeatSnapshot) {
              const review = await runProjectReview({
                store: memoryStore,
                ownerUserId: groomingOwnerId,
                project: repeatSnapshot,
                conversationId,
                requestMessageId: userMessageId,
                language: ownerLanguage,
              });
              return persistOwnerReply(review.reply, {
                project_command: 'review',
                project_status: review.status,
                project_id: repeatSnapshot.id,
                project_review_id: review.runId || null,
                project_review_status: review.status,
                grooming_status: 'prepared',
                grooming_audit_id: review.runId || null,
                grooming_proposal_count: Number(review.report?.proposalCount || 0),
                grooming_plan: review.planView,
              });
            }

            const prepared = await prepareWorkspaceAudit({
              store: memoryStore,
              userId: groomingOwnerId,
              conversationId,
              requestMessageId: userMessageId,
              scope: pendingGrooming.scope,
              projectId: repeatProjectId,
              language: ownerLanguage,
            });
            return persistOwnerReply(prepared.reply, {
              grooming_status: 'prepared',
              grooming_audit_id: prepared.audit.id,
              grooming_scope: prepared.audit.scope,
              grooming_proposal_count: prepared.audit.proposals.length,
              grooming_health: prepared.health,
              grooming_plan: prepared.planView,
            });
          } catch (error) {
            if (isGroomingStorageUnavailable(error)) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Журнал grooming-операций недоступен: нужна миграция 2026-11-26_pierrot_workspace_grooming.sql. Ничего не изменено.'
                  : 'The grooming journal is unavailable: apply 2026-11-26_pierrot_workspace_grooming.sql. Nothing changed.',
                { grooming_status: 'migration_required' }
              );
            }
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code)
                : 'GROOMING_AUDIT_FAILED';
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Повторный аудит не завершился (${code}). Ничего не изменено.`
                : `The repeated audit did not complete (${code}). Nothing changed.`,
              { grooming_status: 'failed', grooming_error: code }
            );
          }
        } else {
          const mode =
            groomingApproval.kind === 'reject'
              ? 'reject_all'
              : groomingApproval.mode === 'safe'
                ? 'safe'
                : groomingApproval.mode === 'selected'
                  ? 'selected'
                  : 'all';
          try {
            const execution = await approvePendingGroomingPlan({
              store: memoryStore,
              userId: groomingOwnerId,
              conversationId,
              mode,
              ordinals: groomingApproval.kind === 'approve' ? groomingApproval.ordinals : undefined,
              language: ownerLanguage,
            });
            if (execution) {
              return persistOwnerReply(execution.reply, {
                grooming_status: execution.report.status,
                grooming_audit_id: execution.audit.id,
                grooming_executed: execution.report.executed,
                grooming_skipped: execution.report.skipped,
                grooming_failed: execution.report.failed,
                grooming_stale: execution.report.stale,
                operation_log: {
                  intent: 'workspace_grooming',
                  audit_id: execution.audit.id,
                  result: execution.report.status,
                },
              });
            }
          } catch (error) {
            if (isGroomingStorageUnavailable(error)) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Журнал grooming-операций недоступен: нужна миграция 2026-11-26_pierrot_workspace_grooming.sql. Ничего не изменено.'
                  : 'The grooming journal is unavailable: apply 2026-11-26_pierrot_workspace_grooming.sql. Nothing changed.',
                { grooming_status: 'migration_required' }
              );
            }
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code)
                : 'GROOMING_EXECUTION_FAILED';
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `План не выполнен (${code}). Успешные операции не отменяются, журнал сохранён. Повтори аудит, если объекты изменились.`
                : `The plan was not executed (${code}). Successful operations remain and the journal is kept. Re-run the audit if objects changed.`,
              { grooming_status: 'failed', grooming_error: code }
            );
          }
        }
      }

      if (groomingCommand) {
        if (!groomingOwnerId || !memoryStore) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Хранилище аудита недоступно. Ничего не изменено.'
              : 'Grooming storage is unavailable. Nothing changed.',
            { grooming_status: 'storage_unavailable' }
          );
        }

        const target = resolveGroomingTarget({
          command: groomingCommand,
          conversationProject,
        });
        let projectId: string | null = target.projectId;
        if (target.projectName) {
          const resolved = await resolveExactProject(
            memoryStore,
            groomingOwnerId,
            target.projectName
          ).catch(() => ({ project: null, ambiguous: false }));
          if (!resolved.project) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? resolved.ambiguous
                  ? `Несколько проектов совпадают с «${target.projectName}». Аудит не запущен.`
                  : `Не нашёл проект «${target.projectName}». Аудит не запущен.`
                : 'The project could not be resolved uniquely. Audit not started.',
              { grooming_status: 'clarification_required' }
            );
          }
          projectId = resolved.project.id;
        }

        // In a project chat, a bare "наведи порядок" means this project, not
        // the whole workspace. Use the project review pipeline so the full
        // project history is analysed, not only the latest messages.
        if (
          conversationProject &&
          projectId === conversationProject.id &&
          groomingCommand.scope === 'all' &&
          !groomingCommand.projectName
        ) {
          const snapshot = await getPierrotProjectSnapshot(
            groomingOwnerId,
            conversationProject.id
          ).catch(() => null);
          if (!snapshot) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось прочитать состояние проекта. Ревизия не запущена, ничего не изменено.'
                : 'The project state could not be read. The review was not started and nothing changed.',
              { project_command: 'review', project_status: 'failed' }
            );
          }
          try {
            const review = await runProjectReview({
              store: memoryStore,
              ownerUserId: groomingOwnerId,
              project: snapshot,
              conversationId,
              requestMessageId: userMessageId,
              language: ownerLanguage,
            });
            return persistOwnerReply(review.reply, {
              project_command: 'review',
              project_status: review.status,
              project_id: snapshot.id,
              project_review_id: review.runId || null,
              project_review_status: review.status,
              grooming_status: 'prepared',
              grooming_audit_id: review.runId || null,
              grooming_proposal_count: Number(review.report?.proposalCount || 0),
              grooming_plan: review.planView,
            });
          } catch (error) {
            if (isGroomingStorageUnavailable(error)) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Журнал аудита недоступен: нужна миграция 2026-11-26_pierrot_workspace_grooming.sql. Ничего не изменено.'
                  : 'The audit journal is unavailable: apply 2026-11-26_pierrot_workspace_grooming.sql. Nothing changed.',
                { grooming_status: 'migration_required' }
              );
            }
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code)
                : 'PROJECT_REVIEW_FAILED';
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Ревизия проекта не завершилась (${code}). Ничего не изменено.`
                : `The project review did not complete (${code}). Nothing changed.`,
              { project_command: 'review', project_status: 'failed', grooming_error: code }
            );
          }
        }

        try {
          const prepared = await prepareWorkspaceAudit({
            store: memoryStore,
            userId: groomingOwnerId,
            conversationId,
            requestMessageId: userMessageId,
            scope: groomingCommand.scope,
            projectId,
            language: ownerLanguage,
          });

          return persistOwnerReply(prepared.reply, {
            grooming_status: 'prepared',
            grooming_audit_id: prepared.audit.id,
            grooming_scope: prepared.audit.scope,
            grooming_proposal_count: prepared.audit.proposals.length,
            grooming_health: prepared.health,
            grooming_plan: prepared.planView,
          });
        } catch (error) {
          if (isGroomingStorageUnavailable(error)) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Аудит рабочей среды ещё не включён: нужна миграция 2026-11-26_pierrot_workspace_grooming.sql. Ничего не изменено.'
                : 'Workspace audit is not enabled: apply 2026-11-26_pierrot_workspace_grooming.sql. Nothing changed.',
              { grooming_status: 'migration_required' }
            );
          }
          const code =
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code?: unknown }).code)
              : 'GROOMING_AUDIT_FAILED';
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? `Аудит не завершился (${code}). Ничего не изменено; задачи, память и GitHub не тронуты.`
              : `The audit did not complete (${code}). Nothing changed; tasks, memory and GitHub were not modified.`,
            { grooming_status: 'failed', grooming_error: code }
          );
        }
      }

      const projectCommand = detectProjectCommand(trimmedMessage);
      if (projectCommand.action !== 'none') {
        if (!isPierrotUserId(ownerIdentityUserId)) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Команды управления проектами доступны только владельцу.'
              : 'Project management commands are available to the owner only.',
            { project_command: projectCommand.action, project_status: 'unauthorized' }
          );
        }

        if (projectCommand.action === 'review') {
          if (!memoryStore) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Хранилище проекта недоступно. Ревизия не запущена, ничего не изменено.'
                : 'Project storage is unavailable. The review was not started.',
              { project_command: 'review', project_status: 'storage_unavailable' }
            );
          }

          const target =
            conversationProject ||
            (projectCommand.projectName
              ? (
                  await resolveExactProject(
                    memoryStore,
                    ownerIdentityUserId,
                    projectCommand.projectName
                  )
                ).project
              : null);

          if (!target) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? projectCommand.projectName
                  ? `Не нашёл ровно один проект «${projectCommand.projectName}». Ничего не изменено. Открой нужный проект или уточни название.`
                  : 'Ревизия выполняется внутри проекта. Открой проект и повтори «Наведи порядок в проекте».'
                : projectCommand.projectName
                  ? `I could not find exactly one project named “${projectCommand.projectName}”. Nothing changed.`
                  : 'A project review runs inside a project. Open the project and repeat the command.',
              { project_command: 'review', project_status: 'clarification_required' }
            );
          }

          const snapshot = await getPierrotProjectSnapshot(ownerIdentityUserId, target.id).catch(
            () => null
          );

          if (!snapshot) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось прочитать состояние проекта. Ревизия не запущена, ничего не изменено.'
                : 'The project state could not be read. The review was not started and nothing changed.',
              { project_command: 'review', project_status: 'failed' }
            );
          }

          const review = await runProjectReview({
            store: memoryStore,
            ownerUserId: ownerIdentityUserId,
            project: snapshot,
            conversationId,
            requestMessageId: userMessageId,
            language: ownerLanguage,
          });

          return persistOwnerReply(review.reply, {
            project_command: 'review',
            project_status: review.status,
            project_id: snapshot.id,
            project_review_id: review.runId || null,
            project_review_status: review.status,
            grooming_status: 'prepared',
            grooming_audit_id: review.runId || null,
            grooming_proposal_count: Number(review.report?.proposalCount || 0),
            grooming_plan: review.planView,
            operation_log: review.report
              ? {
                  intent: 'project_review',
                  project_id: snapshot.id,
                  result: review.status,
                }
              : null,
          });
        }

        if (projectCommand.action === 'create') {
          if (!projectCommand.name) {
            return persistOwnerReply('Назови проект: «создай проект Art Engine».', {
              project_command: 'create',
              project_status: 'invalid',
            });
          }
          try {
            const existing = memoryStore
              ? await resolveExactProject(
                  memoryStore,
                  ownerIdentityUserId,
                  projectCommand.name
                ).catch(() => ({ project: null, ambiguous: false }))
              : { project: null, ambiguous: false };

            if (existing.ambiguous) {
              return persistOwnerReply(
                `Несколько проектов совпадают с «${projectCommand.name}». Новый проект не создан. Уточни точное название.`,
                { project_command: 'create', project_status: 'ambiguous' }
              );
            }

            if (existing.project) {
              if (!projectCommand.task) {
                return persistOwnerReply(
                  `Проект «${existing.project.name}» уже существует. Дубликат не создан.`,
                  {
                    project_command: 'create',
                    project_status: 'already_exists',
                    project_id: existing.project.id,
                    project_slug: existing.project.slug,
                  }
                );
              }

              if (!memoryStore) {
                return persistOwnerReply(
                  `Проект «${existing.project.name}» уже есть, но хранилище задач недоступно. Задача не сохранена.`,
                  {
                    project_command: 'create',
                    project_status: 'partial',
                    project_id: existing.project.id,
                  }
                );
              }

              const taskResult = await createOwnerTask({
                store: memoryStore,
                userId: ownerIdentityUserId,
                content: projectCommand.task,
                projectRef: existing.project.id,
                conversationId,
                messageId: userMessageId,
                originalMessage: trimmedMessage,
              });

              if (taskResult.status === 'created' || taskResult.status === 'already_exists') {
                return persistOwnerReply(
                  `Проект «${existing.project.name}» уже существовал — дубликат не создан. Задача «${taskResult.task.title}» (${taskResult.task.id.slice(0, 8)}) сохранена и связана с проектом.`,
                  {
                    project_command: 'create',
                    project_status: 'existing_with_task',
                    project_id: existing.project.id,
                    memory_id: taskResult.task.id,
                    memory_list_ids: [taskResult.task.id],
                    memory_status: 'saved',
                  }
                );
              }

              return persistOwnerReply(
                `Проект «${existing.project.name}» уже есть, но задачу сохранить и проверить не удалось. Я не буду утверждать, что она создана.`,
                {
                  project_command: 'create',
                  project_status: 'partial',
                  project_id: existing.project.id,
                }
              );
            }

            const created = await createPierrotProject(ownerIdentityUserId, {
              name: projectCommand.name,
              projectBrief: '',
            });

            if (projectCommand.task) {
              if (!memoryStore) {
                return persistOwnerReply(
                  `Проект «${created.name}» создан, но хранилище задач недоступно. Задача не сохранена.`,
                  {
                    project_command: 'create',
                    project_status: 'partial',
                    project_id: created.id,
                  }
                );
              }
              const taskResult = await createOwnerTask({
                store: memoryStore,
                userId: ownerIdentityUserId,
                content: projectCommand.task,
                projectRef: created.id,
                conversationId,
                messageId: userMessageId,
                originalMessage: trimmedMessage,
              });

              if (taskResult.status === 'created' || taskResult.status === 'already_exists') {
                return persistOwnerReply(
                  `Создал проект «${created.name}» и задачу «${taskResult.task.title}» (${taskResult.task.id.slice(0, 8)}). Проверил запись и связь с проектом.`,
                  {
                    project_command: 'create',
                    project_status: 'created',
                    project_id: created.id,
                    project_slug: created.slug,
                    memory_id: taskResult.task.id,
                    memory_list_ids: [taskResult.task.id],
                    memory_status: 'saved',
                    operation_log: {
                      intent: 'create_project_with_task',
                      project_id: created.id,
                      object_id: taskResult.task.id,
                      result: 'confirmed',
                    },
                  }
                );
              }

              return persistOwnerReply(
                `Проект «${created.name}» создан, но задачу сохранить и проверить не удалось. Я не буду утверждать, что она существует.`,
                {
                  project_command: 'create',
                  project_status: 'partial',
                  project_id: created.id,
                  task_status: taskResult.status,
                }
              );
            }

            return persistOwnerReply(
              `Создал проект «${created.name}». Теперь можно сказать: «перенеси эту задачу в проект ${created.name}».`,
              {
                project_command: 'create',
                project_status: 'created',
                project_id: created.id,
                project_slug: created.slug,
              }
            );
          } catch {
            return persistOwnerReply('Не удалось создать проект. Название не сохранено.', {
              project_command: 'create',
              project_status: 'failed',
            });
          }
        }

        if (projectCommand.action === 'rate') {
          const resolved = await resolveExactProject(
            memoryStore || createPierrotStore()!,
            ownerIdentityUserId,
            projectCommand.name
          );
          if (!resolved.project) {
            return persistOwnerReply(
              resolved.ambiguous
                ? 'Несколько проектов совпадают с этим названием. Уточни точный проект. Оценка не сохранена.'
                : `Не нашёл проект «${projectCommand.name}». Оценка не сохранена.`,
              { project_command: 'rate', project_status: 'not_found' }
            );
          }

          try {
            const updated = await updatePierrotProject(ownerIdentityUserId, resolved.project.id, {
              ownerRating: projectCommand.rating,
            });
            const verified = updated
              ? await getPierrotProject(ownerIdentityUserId, resolved.project.id)
              : null;
            if (!verified || verified.ownerRating !== projectCommand.rating) {
              throw new Error('PROJECT_RATING_NOT_CONFIRMED');
            }
            return persistOwnerReply(
              `Сохранил оценку проекта «${verified.name}»: ${projectCommand.rating}/10. Это твоя оценка; она не меняет внутреннюю важность или уверенность модели.`,
              {
                project_command: 'rate',
                project_status: 'saved',
                project_id: verified.id,
                owner_rating: projectCommand.rating,
                operation_log: {
                  intent: 'project_rating',
                  project_id: verified.id,
                  object_id: verified.id,
                  new_value: projectCommand.rating,
                  result: 'confirmed',
                },
              }
            );
          } catch (error) {
            const code = error instanceof Error ? error.message : 'rating_failed';
            if (code === 'PROJECT_RATING_MIGRATION_REQUIRED') {
              return persistOwnerReply(
                'Оценка не сохранена: в базе ещё нет отдельного поля пользовательской оценки. Подготовь миграцию owner_rating; importance и priority не подменяют её.',
                { project_command: 'rate', project_status: 'migration_required' }
              );
            }
            return persistOwnerReply(
              `Не удалось подтвердить сохранение оценки проекта «${resolved.project.name}». Я не буду утверждать, что она записана.`,
              { project_command: 'rate', project_status: 'failed' }
            );
          }
        }

        if (projectCommand.action === 'update_brief') {
          const resolved = await resolveExactProject(
            memoryStore || createPierrotStore()!,
            ownerIdentityUserId,
            projectCommand.name
          );
          const project = resolved.project;
          if (!project) {
            return persistOwnerReply(
              resolved.ambiguous
                ? 'Несколько проектов совпадают с этим названием. Уточни точный проект. Бриф не изменён.'
                : `Не нашёл проект «${projectCommand.name}». Бриф не изменён.`,
              {
                project_command: 'update_brief',
                project_status: resolved.ambiguous ? 'ambiguous' : 'not_found',
              }
            );
          }
          try {
            const updated = await updatePierrotProject(ownerIdentityUserId, project.id, {
              projectBrief: projectCommand.brief,
              briefChangeNote: projectCommand.note,
            });
            const verified = updated
              ? await getPierrotProject(ownerIdentityUserId, project.id)
              : null;
            if (!verified || verified.projectBrief !== projectCommand.brief) {
              throw new Error('PROJECT_BRIEF_NOT_CONFIRMED');
            }
            return persistOwnerReply(
              `Обновил бриф проекта «${verified.name}» до ревизии ${verified.briefRevision}. Предыдущая ревизия сохранена в истории.`,
              {
                project_command: 'update_brief',
                project_status: 'saved',
                project_id: verified.id,
                brief_revision: verified.briefRevision,
                operation_log: {
                  intent: 'project_brief_update',
                  project_id: verified.id,
                  old_value: project.projectBrief.slice(0, 500),
                  new_value: verified.projectBrief.slice(0, 500),
                  result: 'confirmed',
                },
              }
            );
          } catch {
            return persistOwnerReply(
              `Не удалось подтвердить обновление брифа проекта «${project.name}». Предыдущий бриф не считается изменённым.`,
              { project_command: 'update_brief', project_status: 'failed' }
            );
          }
        }

        if (projectCommand.action === 'delete') {
          const resolvedDelete = await resolveExactProject(
            memoryStore || createPierrotStore()!,
            ownerIdentityUserId,
            projectCommand.name
          );
          const project = resolvedDelete.project;
          if (!project) {
            return persistOwnerReply(
              resolvedDelete.ambiguous
                ? 'Несколько проектов совпадают с этим названием. Уточни точный проект. Ничего не удалено.'
                : `Не нашёл проект «${projectCommand.name}». Ничего не удалено.`,
              {
                project_command: 'delete',
                project_status: resolvedDelete.ambiguous ? 'ambiguous' : 'not_found',
              }
            );
          }
          if (!projectCommand.confirmed) {
            return persistOwnerReply(
              `Удаление проекта «${project.name}» необратимо и удалит его связи с разговорами и материалами. Подтверди фразой «да, удалить проект ${project.name}».`,
              {
                project_command: 'delete',
                project_status: 'confirmation_required',
                project_id: project.id,
              }
            );
          }
          await deletePierrotProject(ownerIdentityUserId, project.id);
          return persistOwnerReply(`Удалил проект «${project.name}».`, {
            project_command: 'delete',
            project_status: 'deleted',
            project_id: project.id,
          });
        }

        const projects = await listPierrotProjects(ownerIdentityUserId);
        const matches = projects.filter(
          (item) =>
            item.name.toLocaleLowerCase() === projectCommand.projectName.toLocaleLowerCase() ||
            item.slug === projectCommand.projectName.toLowerCase()
        );
        if (matches.length !== 1) {
          return persistOwnerReply(
            matches.length > 1
              ? 'Нашёл несколько проектов с таким названием. Уточни точное имя.'
              : `Не нашёл проект «${projectCommand.projectName}».`,
            { project_command: 'move_task', project_status: 'project_not_found' }
          );
        }
        const targetProject = matches[0];

        if (memoryStore && isPierrotUserId(ownerIdentityUserId)) {
          const normalizeTitle = (value: string) =>
            value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

          let memoryCandidates: PierrotMemoryRecord[] = [];

          if (projectCommand.taskQuery) {
            const found = await searchMemory(memoryStore, {
              userId: ownerIdentityUserId,
              query: projectCommand.taskQuery,
              statuses: ['current'],
              kinds: ['task', 'reminder'],
              limit: 20,
            });
            memoryCandidates = found.records;
          } else {
            const listed = await loadLatestMemoryListRecords(
              memoryStore,
              ownerIdentityUserId,
              conversationId
            ).catch(() => [] as PierrotMemoryRecord[]);
            const last = [...listed]
              .reverse()
              .find(
                (record) =>
                  record.status === 'current' &&
                  (record.kind === 'task' || record.kind === 'reminder')
              );
            memoryCandidates = last ? [last] : [];
          }

          memoryCandidates = Array.from(
            new Map(memoryCandidates.map((record) => [record.id, record])).values()
          );

          if (projectCommand.taskQuery && memoryCandidates.length > 1) {
            const exact = memoryCandidates.filter(
              (record) =>
                normalizeTitle(record.title) === normalizeTitle(projectCommand.taskQuery || '')
            );
            if (exact.length === 1) memoryCandidates = exact;
          }

          if (memoryCandidates.length > 1) {
            return persistOwnerReply(
              'Нашёл несколько задач памяти. Уточни точный заголовок, чтобы я не перенёс не ту. Ничего не изменено.',
              {
                project_command: 'move_task',
                project_status: 'task_not_unique',
                memory_candidates: memoryCandidates.slice(0, 10).map((record) => ({
                  id: record.id,
                  title: record.title,
                })),
              }
            );
          }

          if (memoryCandidates.length === 1) {
            const memoryTask = memoryCandidates[0];

            try {
              await moveDecisionToProject(
                memoryStore,
                ownerIdentityUserId,
                memoryTask.id,
                targetProject
              );

              const linked = await listProjectTasks(
                memoryStore,
                ownerIdentityUserId,
                targetProject.id,
                { statuses: ['current'], limit: 500 }
              );
              if (!linked.some((record) => record.id === memoryTask.id)) {
                throw new Error('PROJECT_TASK_LINK_NOT_CONFIRMED');
              }
            } catch {
              return persistOwnerReply(
                `Не удалось сохранить связь задачи «${memoryTask.title}» с проектом «${targetProject.name}». Я не буду утверждать, что перенос выполнен.`,
                {
                  project_command: 'move_task',
                  project_status: 'failed',
                  project_id: targetProject.id,
                  memory_id: memoryTask.id,
                }
              );
            }

            return persistOwnerReply(
              `Перенёс задачу «${memoryTask.title}» в проект «${targetProject.name}».`,
              {
                project_command: 'move_task',
                project_status: 'moved',
                project_id: targetProject.id,
                memory_id: memoryTask.id,
              }
            );
          }
        }

        const taskResult = await listDevTasks(ownerIdentityUserId, 100);
        const taskCandidates = taskResult.tasks.filter((task) =>
          projectCommand.taskQuery
            ? `${task.title} ${task.objective}`
                .toLocaleLowerCase()
                .includes(projectCommand.taskQuery.toLocaleLowerCase())
            : task.conversationId === conversationId
        );
        if (taskCandidates.length !== 1) {
          return persistOwnerReply(
            taskCandidates.length === 0
              ? 'Не нашёл задачу для переноса. Назови её точнее или сначала создай Dev-задачу в этом разговоре.'
              : `Нашёл ${taskCandidates.length} задачи. Назови точный заголовок, чтобы я не перенёс не ту.`,
            { project_command: 'move_task', project_status: 'task_not_unique' }
          );
        }
        const moved = await updateDevTask(ownerIdentityUserId, taskCandidates[0].id, {
          projectId: targetProject.id,
        });
        if (!moved) throw new Error('PROJECT_TASK_MOVE_FAILED');
        return persistOwnerReply(
          `Перенёс задачу «${moved.title}» в проект «${targetProject.name}».`,
          {
            project_command: 'move_task',
            project_status: 'moved',
            project_id: targetProject.id,
            dev_task_id: moved.id,
          }
        );
      }

      // Explicit owner-only Skill Foundry analysis. The command must be
      // unmistakable; ordinary questions about skills or work do not trigger a
      // full scan. The work itself is bounded and deterministic, with no model
      // call, cron, worker or automatic retry.
      const analysisCommand = parseSkillAnalysisCommand(trimmedMessage);

      if (analysisCommand) {
        if (!pierrotStore || !isPierrotUserId(ownerIdentityUserId)) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Полный анализ доступен владельцу с подтверждённым Supabase-профилем. Открой [Skill Foundry](/admin/skills) в админке.'
              : 'Full analysis is available to the owner with a verified Supabase profile. Open [Skill Foundry](/admin/skills) in the admin area.'
          );
        }

        try {
          const result = await runOwnerSkillAnalysis({
            store: pierrotStore,
            userId: ownerIdentityUserId,
            days: 60,
          });
          return persistOwnerReply(
            formatSkillAnalysisChatReply(result.analysis, analysisCommand, result.persisted),
            {
              skill_analysis: result.analysis.id,
              skill_analysis_status: result.status,
              skill_analysis_persisted: result.persisted,
            }
          );
        } catch {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Не удалось собрать анализ работы. Я не буду выдавать это за успешный результат. Подробности доступны в [Skill Foundry](/admin/skills).'
              : 'I could not assemble the work analysis. I will not present that as a successful result. Details are available in [Skill Foundry](/admin/skills).'
          );
        }
      }

      // Private Food & Beverage Tracker. It is owner-only, uses its own table
      // and never enters Brain/RAG. Questions are answered from intake_logs,
      // while only actual completed consumption creates new rows.
      if (pierrotStore && isPierrotUserId(ownerIdentityUserId)) {
        const intakeZone = resolveOwnerTimeZone();

        const intakeUnavailable = () =>
          persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Журнал еды и напитков недоступен: нужна миграция 2026-11-25_pierrot_intake_logs.sql. Я ничего не записал.'
              : 'The food and drink log is unavailable: apply migration 2026-11-25_pierrot_intake_logs.sql. Nothing was recorded.',
            { intake_status: 'migration_required' }
          );

        const intakeQuery = detectIntakeQuery(trimmedMessage);

        if (intakeQuery) {
          try {
            const range = intakeRangeForQuery(intakeQuery, {
              timezone: intakeZone.timezone,
            });
            const rows = await listIntakeLogs(pierrotStore, {
              userId: ownerIdentityUserId,
              from: range.from,
              to: range.to,
              type: intakeQuery.kind === 'water' ? 'drink' : null,
              limit: 500,
            });

            return persistOwnerReply(
              formatIntakeAnswer({
                rows,
                query: intakeQuery,
                language: ownerLanguage,
                timezone: intakeZone.timezone,
                timezoneKnown: intakeZone.known,
              }),
              {
                intake_query: intakeQuery.kind,
                intake_period: intakeQuery.period,
                intake_status: 'answered',
                intake_rows: rows.length,
                intake_timezone_known: intakeZone.known,
              }
            );
          } catch (error) {
            if (isIntakeStorageUnavailable(error)) return intakeUnavailable();
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось прочитать журнал еды и напитков. Я не буду придумывать записи.'
                : 'Could not read the food and drink log. I will not invent records.',
              { intake_query: intakeQuery.kind, intake_status: 'failed' }
            );
          }
        }

        const intakeMutation = detectIntakeMutation(trimmedMessage);

        if (intakeMutation) {
          try {
            const latest = await getLastIntakeLog(pierrotStore, ownerIdentityUserId);

            if (!latest) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Не вижу записей о еде или напитках, которые можно изменить.'
                  : 'I cannot see any food or drink records to change.',
                { intake_mutation: intakeMutation.kind, intake_status: 'not_found' }
              );
            }

            if (intakeMutation.kind === 'delete_last') {
              const deleted = await deleteIntakeLog(pierrotStore, ownerIdentityUserId, latest.id);
              return persistOwnerReply(
                deleted > 0
                  ? formatIntakeDeleted(ownerLanguage)
                  : ownerLanguage === 'ru'
                    ? 'Запись не найдена; ничего не удалено.'
                    : 'The record was not found; nothing was deleted.',
                {
                  intake_mutation: 'delete_last',
                  intake_status: deleted > 0 ? 'deleted' : 'not_found',
                  intake_id: latest.id,
                }
              );
            }

            if (!intakeMutation.replacement) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Уточни правильное содержание записи, например: «исправь последнюю запись: это был чай».'
                  : 'Give the corrected content, for example: “correct the last record: it was tea”.',
                { intake_mutation: 'correct_last', intake_status: 'clarification_required' }
              );
            }

            const correctedParse = parseIntakeMessage(`съел ${intakeMutation.replacement}`, {
              timezone: intakeZone.timezone,
              timezoneKnown: intakeZone.known,
            });
            const parsedItem = correctedParse.items[0] || null;
            const drinkHint =
              /(?:вода|кофе|чай|вино|сок|молоко|пиво|water|coffee|tea|wine|juice|milk|beer)/i.test(
                intakeMutation.replacement
              );
            const updated = await updateIntakeLog(pierrotStore, ownerIdentityUserId, latest.id, {
              itemName: parsedItem?.itemName || intakeMutation.replacement,
              type: parsedItem?.type || (drinkHint ? 'drink' : 'food'),
              ...(parsedItem ? { quantity: parsedItem.quantity, unit: parsedItem.unit } : {}),
            });

            if (!updated) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Не удалось подтвердить исправление. Я не буду утверждать, что запись изменена.'
                  : 'The correction could not be confirmed. I will not claim the record changed.',
                { intake_mutation: 'correct_last', intake_status: 'failed', intake_id: latest.id }
              );
            }

            return persistOwnerReply(formatIntakeCorrected(updated, ownerLanguage), {
              intake_mutation: 'correct_last',
              intake_status: 'updated',
              intake_id: updated.id,
            });
          } catch (error) {
            if (isIntakeStorageUnavailable(error)) return intakeUnavailable();
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось изменить журнал еды и напитков. Я ничего не утверждаю.'
                : 'Could not change the food and drink log. I am not claiming any change.',
              { intake_mutation: intakeMutation.kind, intake_status: 'failed' }
            );
          }
        }

        let intakeResult = parseIntakeMessage(trimmedMessage, {
          timezone: intakeZone.timezone,
          timezoneKnown: intakeZone.known,
        });

        const foodHint =
          /(?:съел|съела|выпил|выпила|ел|ела|пил|пила|завтрак|обед|ужин|перекус|кофе|чай|вода|вино|яблок|паст|тост|яйц|ate|drank|eaten|breakfast|lunch|dinner|coffee|tea|water|wine|food|meal)/i.test(
            trimmedMessage
          );

        if (
          isIntakeModelEnabled() &&
          foodHint &&
          (!intakeResult.detected || intakeResult.confidence < 0.65)
        ) {
          const modeled = await parseIntakeWithModel(trimmedMessage, {
            timezone: intakeZone.timezone,
            timezoneKnown: intakeZone.known,
          });
          if (modeled) intakeResult = modeled;
        }

        if (intakeResult.detected && intakeResult.confidence >= 0.65) {
          try {
            const saved = await saveIntakeItems(pierrotStore, {
              userId: ownerIdentityUserId,
              items: intakeResult.items,
              rawText: trimmedMessage,
              sourceMessageId: userMessageId,
              confidence: intakeResult.confidence,
            });

            return persistOwnerReply(
              [
                saved.duplicate
                  ? ownerLanguage === 'ru'
                    ? 'Эта запись уже была сохранена ранее.'
                    : 'This record was already saved.'
                  : formatIntakeSaved(intakeResult.items, ownerLanguage),
                intakeResult.timezoneKnown
                  ? null
                  : ownerLanguage === 'ru'
                    ? 'Часовой пояс не настроен; время сохранено в UTC.'
                    : 'The timezone is not configured; the time is stored in UTC.',
              ]
                .filter(Boolean)
                .join('\n\n'),
              {
                intake_status: saved.duplicate ? 'duplicate' : 'saved',
                intake_items: saved.items.map((item) => ({
                  id: item.id,
                  type: item.type,
                  item: item.itemName,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
                intake_confidence: intakeResult.confidence,
                intake_source: intakeResult.usedModel ? 'model' : 'rules',
                intake_timezone_known: intakeResult.timezoneKnown,
              }
            );
          } catch (error) {
            if (isIntakeStorageUnavailable(error)) return intakeUnavailable();
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Распознал приём пищи, но запись не сохранилась. Я не буду утверждать, что она записана.'
                : 'I recognised the intake, but the record was not saved. I will not claim it was recorded.',
              { intake_status: 'failed' }
            );
          }
        }
      }

      // GitHub integration is available in owner CHAT as well as DEV. The
      // implementation is shared: deterministic reads use the same repository
      // adapter as Dev Mode, complex research uses the existing read-only Dev
      // model, and every write requires a stored proposal plus explicit
      // confirmation on a later turn.
      if (pierrotStore && isPierrotUserId(ownerIdentityUserId)) {
        const executePendingGitHubOperation = async (
          pendingOperation: PendingGitHubOperation
        ): Promise<Response> => {
          try {
            const write = await import('@/lib/pierrot/dev/write');
            const payload = pendingOperation.payload;
            let result: Record<string, unknown>;

            if (pendingOperation.operation === 'create_issue') {
              result = await write.createDevIssue({
                repository: pendingOperation.repository,
                title: payload.title,
                body: payload.body,
                confirmed: true,
              });
            } else if (pendingOperation.operation === 'create_branch') {
              result = await write.createDevBranch({
                repository: pendingOperation.repository,
                branch: payload.branch,
                fromRef: payload.fromRef,
                confirmed: true,
              });
            } else if (pendingOperation.operation === 'create_pull_request') {
              result = await write.createDevPullRequest({
                repository: pendingOperation.repository,
                title: payload.title,
                head: payload.head,
                base: payload.base,
                body: payload.body,
                confirmed: true,
              });
            } else if (pendingOperation.operation === 'create_or_update_file') {
              result = await write.createOrUpdateDevFile({
                repository: pendingOperation.repository,
                path: payload.path,
                content: payload.content,
                message: payload.message,
                branch: payload.branch,
                confirmed: true,
              });
            } else if (pendingOperation.operation === 'add_issue_comment') {
              result = await write.addDevIssueComment({
                repository: pendingOperation.repository,
                number: payload.number,
                body: payload.body,
                confirmed: true,
              });
            } else {
              result = await write.updateDevIssueState({
                repository: pendingOperation.repository,
                number: payload.number,
                state: payload.state,
                confirmed: true,
              });
            }

            await closePendingGitHubOperation(pierrotStore, {
              id: pendingOperation.id,
              status: 'executed',
              result,
            }).catch(() => undefined);

            return persistOwnerReply(
              formatGitHubWriteResult({
                operation: pendingOperation.operation,
                result,
                language: ownerLanguage,
              }),
              {
                github_operation: pendingOperation.operation,
                github_repository: pendingOperation.repository,
                github_status: 'executed',
                github_link: typeof result.url === 'string' ? result.url : null,
              }
            );
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code || 'GITHUB_WRITE_FAILED')
                : 'GITHUB_WRITE_FAILED';
            await closePendingGitHubOperation(pierrotStore, {
              id: pendingOperation.id,
              status: 'cancelled',
            }).catch(() => undefined);

            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `GitHub: операция не выполнена (${code}). Я не буду утверждать, что изменение создано.${error instanceof Error && error.message ? ` Причина: ${error.message}` : ''}`
                : `GitHub: the operation was not completed (${code}). I will not claim the change exists.${error instanceof Error && error.message ? ` Reason: ${error.message}` : ''}`,
              {
                github_operation: pendingOperation.operation,
                github_repository: pendingOperation.repository,
                github_status: 'failed',
                github_error: code,
              }
            );
          }
        };

        const pendingGitHub = await loadPendingGitHubOperation(pierrotStore, {
          userId: ownerIdentityUserId,
          conversationId,
        }).catch(() => null);

        if (pendingGitHub && isGitHubCancellation(trimmedMessage)) {
          await closePendingGitHubOperation(pierrotStore, {
            id: pendingGitHub.id,
            status: 'cancelled',
          }).catch(() => undefined);
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'GitHub: операция отменена. Ничего не изменено.'
              : 'GitHub: the operation was cancelled. Nothing changed.',
            { github_status: 'cancelled', github_operation: pendingGitHub.operation }
          );
        }

        if (pendingGitHub && isGitHubConfirmation(trimmedMessage)) {
          return executePendingGitHubOperation(pendingGitHub);
        }

        const githubIntent = detectGitHubChatIntent(trimmedMessage);

        if (githubIntent) {
          if (githubIntent.requiresConfirmation) {
            const previousAssistant = [...normalizedHistory]
              .reverse()
              .find((item) => item.role === 'assistant' && item.content.trim())?.content;
            const draft = buildPendingDraft({
              intent: githubIntent,
              message: trimmedMessage,
              previousAssistant,
            });

            if (!draft.payload) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Для операции GitHub нужно уточнить: ${draft.missing.join(', ')}. Ничего не изменено.`
                  : `The GitHub operation needs: ${draft.missing.join(', ')}. Nothing changed.`,
                {
                  github_operation: githubIntent.operation,
                  github_status: 'clarification_required',
                  github_missing: draft.missing,
                }
              );
            }

            try {
              const pendingOperation = await savePendingGitHubOperation(pierrotStore, {
                userId: ownerIdentityUserId,
                conversationId,
                repository: resolveGitHubRepository(githubIntent),
                operation: githubIntent.operation as PendingGitHubOperationKind,
                payload: draft.payload,
              });

              return persistOwnerReply(
                formatPendingOperationPreview({
                  operation: pendingOperation.operation,
                  repository:
                    getDevRepositoryConfigs().find(
                      (repo) => repo.key === pendingOperation.repository
                    )?.fullName || pendingOperation.repository,
                  payload: pendingOperation.payload,
                  language: ownerLanguage,
                }),
                {
                  github_operation: pendingOperation.operation,
                  github_repository: pendingOperation.repository,
                  github_status: 'confirmation_required',
                  github_pending_id: pendingOperation.id,
                }
              );
            } catch (error) {
              if (isPendingOperationTableMissing(error)) {
                return persistOwnerReply(
                  ownerLanguage === 'ru'
                    ? 'GitHub-запись отключена: нужна миграция 2026-11-25_pierrot_github_operations.sql. Ничего не изменено.'
                    : 'GitHub writes are unavailable: apply migration 2026-11-25_pierrot_github_operations.sql. Nothing changed.',
                  {
                    github_operation: githubIntent.operation,
                    github_status: 'migration_required',
                  }
                );
              }
              throw error;
            }
          }

          try {
            const deterministic = await runGitHubReadIntent(githubIntent);
            if (deterministic) {
              return persistOwnerReply(deterministic.text, {
                github_operation: deterministic.operation,
                github_repository: deterministic.repository,
                github_branch: deterministic.branch,
                github_commit: deterministic.commitSha,
                github_status: 'completed',
                github_links: deterministic.links.slice(0, 10),
              });
            }
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: unknown }).code)
                : 'GITHUB_READ_FAILED';
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `GitHub недоступен или вернул ошибку (${code}). Я не буду выдумывать содержимое репозитория.`
                : `GitHub is unavailable or returned an error (${code}). I will not invent repository content.`,
              {
                github_operation: githubIntent.operation,
                github_status: 'failed',
                github_error: code,
              }
            );
          }

          // A natural-language repository investigation is routed to the
          // existing read-only Dev model. Prompt, tools and security policy are
          // identical to Dev Mode; only the answer surface differs.
          const devLlm = await import('@/lib/pierrot/dev/llm').catch(() => null);

          if (devLlm?.isDevModelConfigured()) {
            try {
              const devResult = await devLlm.callDevModel({
                history: [...normalizedHistory, { role: 'user', content: trimmedMessage }],
                requestId: userMessageId,
                signal: req.signal,
                repository: resolveGitHubRepository(githubIntent),
                deadlineMs: 45_000,
              });
              const trace = devResult.toolTrace;
              const repository =
                trace.find((entry) => entry.repository)?.repository ||
                resolveGitHubRepository(githubIntent);
              const commitSha =
                trace.find((entry) => entry.meta?.commitSha)?.meta?.commitSha || null;
              const paths = Array.from(
                new Set(trace.flatMap((entry) => entry.meta?.paths || []))
              ).slice(0, 12);
              const links = paths.map(
                (path) =>
                  `https://github.com/${repository}/blob/${commitSha || 'main'}/${path.replace(/^\/+/, '')}`
              );
              const text = [
                devResult.reply,
                '',
                `GitHub: ${repository} · ${commitSha ? commitSha.slice(0, 7) : 'ref unknown'}`,
                ...links.map((url) => `- ${url}`),
              ].join('\n');

              return persistOwnerReply(text, {
                github_operation: githubIntent.operation,
                github_repository: repository,
                github_commit: commitSha,
                github_status: devResult.status,
                github_links: links,
                github_tool_trace: trace.map((entry) => ({
                  name: entry.name,
                  ok: entry.ok,
                  summary: entry.summary,
                })),
              });
            } catch (error) {
              const code =
                error && typeof error === 'object' && 'code' in error
                  ? String((error as { code?: unknown }).code)
                  : 'GITHUB_RESEARCH_FAILED';
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Не удалось завершить исследование GitHub (${code}). Частичные результаты сохранены в trace; я не буду выдумывать вывод.`
                  : `The GitHub investigation did not complete (${code}). Partial results are kept in the trace; I will not invent a conclusion.`,
                {
                  github_operation: githubIntent.operation,
                  github_status: 'failed',
                  github_error: code,
                }
              );
            }
          }

          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'GitHub-инструменты доступны, но для этого вопроса нужен Dev model provider. Настрой DEEPSEEK_API_KEY или OPENROUTER_API_KEY; я не буду выдумывать ответ по репозиторию.'
              : 'GitHub tools are available, but this question needs the Dev model provider. Configure DEEPSEEK_API_KEY or OPENROUTER_API_KEY; I will not invent a repository answer.',
            {
              github_operation: githubIntent.operation,
              github_status: 'not_configured',
            }
          );
        }
      }

      // One owner-wide search across the single conversation stream, memory,
      // project knowledge and GitHub Issues. It returns source-labelled
      // excerpts and links; it never copies whole transcripts into the answer.
      const unifiedSearchIntent = detectUnifiedSearchIntent(trimmedMessage);

      if (unifiedSearchIntent && memoryStore && isPierrotUserId(ownerIdentityUserId)) {
        let searchProject: Awaited<ReturnType<typeof resolvePierrotProject>>['project'] = null;

        try {
          const resolved = await resolvePierrotProject({
            ownerUserId: ownerIdentityUserId,
            conversationProject,
            message: trimmedMessage,
          });
          searchProject = resolved.project;
        } catch {
          searchProject = conversationProject || null;
        }

        const result = await searchUnifiedOwnerContext({
          store: memoryStore,
          ownerUserId: ownerIdentityUserId,
          query: unifiedSearchIntent.query,
          scope: unifiedSearchIntent.scope,
          project: searchProject,
        }).catch(() => ({
          query: unifiedSearchIntent.query,
          project: searchProject
            ? { id: searchProject.id, name: searchProject.name, slug: searchProject.slug }
            : null,
          hits: [],
          notes: ['Поиск сейчас недоступен. Я не буду выдумывать результаты.'],
        }));

        return persistOwnerReply(formatUnifiedSearchReport(result, ownerLanguage), {
          unified_search: true,
          unified_search_scope: unifiedSearchIntent.scope,
          unified_search_project_id: result.project?.id || null,
          unified_search_hits: result.hits.length,
          unified_search_sources: Array.from(new Set(result.hits.map((hit) => hit.source))),
        });
      }

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
          documentChunks = await loadBrainDocumentChunks({
            document: found,
            scope: 'owner',
          });

          if (documentChunks.length === 0) {
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

      const memoryIntent = detectMemoryIntent(trimmedMessage, {
        history: normalizedHistory,
      });

      // Dev task bridge: ordinary memory stays in pierrot_decisions; an
      // explicit or clearly engineering request is routed to Task Studio.
      // The source memory record is preserved and never marked completed here.
      const devTaskIntent = detectDevTaskIntent(trimmedMessage, {
        history: normalizedHistory,
      });

      if (devTaskIntent.action !== 'none') {
        if (!memoryStore || !isPierrotUserId(ownerIdentityUserId)) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Dev-задачи доступны только владельцу. Ничего не создано.'
              : 'Dev tasks are available to the owner only. Nothing was created.',
            { dev_task_status: 'unavailable' }
          );
        }

        const repositoryKey = devTaskIntent.repository || 'newlove';

        if (devTaskIntent.action === 'transfer') {
          let candidates: PierrotMemoryRecord[] = [];

          try {
            if (devTaskIntent.query) {
              const found = await searchMemory(memoryStore, {
                userId: ownerIdentityUserId,
                query: devTaskIntent.query,
                includeArchive: false,
                limit: 10,
              });
              candidates = found.records;
            } else {
              const listed = await loadLatestMemoryListRecords(
                memoryStore,
                ownerIdentityUserId,
                conversationId
              ).catch(() => [] as PierrotMemoryRecord[]);
              candidates =
                listed.length > 0
                  ? listed
                  : await listMemoryRecords(memoryStore, {
                      userId: ownerIdentityUserId,
                      status: 'active',
                      limit: 60,
                    });

              if (candidates.length > 1) {
                const engineering = candidates.filter(
                  (record) =>
                    looksLikeEngineeringTask(`${record.title} ${record.content}`) ||
                    record.tags.some((tag) => /dev/i.test(tag))
                );
                if (engineering.length === 1) candidates = engineering;
              }
            }
          } catch {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось прочитать память, поэтому Dev-задача не создана. Ничего не подтверждаю.'
                : 'I could not read memory, so no Dev task was created. I am not claiming success.',
              { dev_task_status: 'failed' }
            );
          }

          const seen = new Set<string>();
          candidates = candidates.filter((record) => {
            if (seen.has(record.id)) return false;
            seen.add(record.id);
            return true;
          });

          if (candidates.length === 0) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не вижу запись памяти, которую нужно перенести в Dev. Назови заголовок или сначала сохрани задачу.'
                : 'I cannot identify the memory record to transfer. Name its title or save it first.',
              { dev_task_status: 'not_found' }
            );
          }

          if (candidates.length > 1) {
            return persistOwnerReply(
              `${ownerLanguage === 'ru' ? 'Нашёл несколько записей:' : 'I found several records:'}\n\n${candidates
                .slice(0, 10)
                .map(
                  (record, index) =>
                    `${index + 1}. ${record.title} · ${record.kind} · ${record.status}`
                )
                .join('\n')}\n\n${
                ownerLanguage === 'ru'
                  ? 'Уточни заголовок. Ничего не создано.'
                  : 'Give me the exact title. Nothing was created.'
              }`,
              { dev_task_status: 'clarification_required', memory_candidates: candidates.length }
            );
          }

          try {
            const transferred = await transferMemoryRecordToDev({
              store: memoryStore,
              userId: ownerIdentityUserId,
              record: candidates[0],
              repository: repositoryKey,
            });
            const task = transferred.task;
            const prefix = transferred.created
              ? ownerLanguage === 'ru'
                ? 'Перенёс в Dev'
                : 'Transferred to Dev'
              : ownerLanguage === 'ru'
                ? 'Эта запись уже перенесена в Dev'
                : 'This record is already in Dev';
            const linkWarning =
              transferred.created && !transferred.linkPersisted
                ? ownerLanguage === 'ru'
                  ? ' Ссылка в исходной записи памяти не сохранилась, но Dev-задача хранит её ID и повторный перенос не создаст дубль.'
                  : ' The source-memory link could not be saved, but the Dev task stores its ID, so a retry will not duplicate it.'
                : '';

            return persistOwnerReply(
              `${prefix}: «${task.title}».\n${ownerLanguage === 'ru' ? 'Репозиторий' : 'Repository'}: ${repositoryKey} · ${ownerLanguage === 'ru' ? 'статус' : 'status'}: ${task.status} · Dev ID: ${task.id.slice(0, 8)}\n${
                ownerLanguage === 'ru'
                  ? 'Исходная запись памяти сохранена и не отмечена выполненной.'
                  : 'The source memory record is preserved and was not marked completed.'
              }${linkWarning}`,
              {
                dev_task_status: task.status,
                dev_task_id: task.id,
                dev_task_repository: repositoryKey,
                dev_task_created: transferred.created,
                dev_task_already_linked: transferred.alreadyLinked,
                dev_task_link_persisted: transferred.linkPersisted,
                memory_id: candidates[0].id,
                memory_status: candidates[0].status,
              }
            );
          } catch {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось создать Dev-задачу. Исходная запись памяти не изменена, и я не буду утверждать, что задача создана.'
                : 'I could not create the Dev task. The source memory record is unchanged, and I will not claim the task exists.',
              { dev_task_status: 'failed', memory_id: candidates[0].id }
            );
          }
        }

        const lastAssistant = [...normalizedHistory]
          .reverse()
          .find((item) => item.role === 'assistant' && item.content.trim())?.content;
        const content =
          devTaskIntent.content?.trim() ||
          (devTaskIntent.explicit ? lastAssistant?.trim() : trimmedMessage.trim()) ||
          trimmedMessage.trim();

        if (!content || content.length < 3) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Что именно поставить в Dev-задачу? Сформулируй цель или название.'
              : 'What should the Dev task contain? Give me a goal or a title.',
            { dev_task_status: 'clarification_required' }
          );
        }

        try {
          const task = await createDevTaskFromChat({
            userId: ownerIdentityUserId,
            content,
            repository: repositoryKey,
            conversationId,
            originalMessage: trimmedMessage,
          });

          return persistOwnerReply(
            `${ownerLanguage === 'ru' ? 'Создал Dev-задачу' : 'Created a Dev task'}: «${task.title}».\n${ownerLanguage === 'ru' ? 'Репозиторий' : 'Repository'}: ${repositoryKey} · ${ownerLanguage === 'ru' ? 'статус' : 'status'}: ${task.status} · Dev ID: ${task.id.slice(0, 8)}\n${
              ownerLanguage === 'ru'
                ? 'Задача не отмечена выполненной. Её можно открыть в Task Studio и скопировать prompt для OpenCode.'
                : 'The task is not marked completed. Open it in Task Studio to copy the OpenCode prompt.'
            }`,
            {
              dev_task_status: task.status,
              dev_task_id: task.id,
              dev_task_repository: repositoryKey,
              dev_task_created: true,
            }
          );
        } catch {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Не удалось создать Dev-задачу. Я не буду говорить, что она сохранена. Проверь миграцию Task Studio и попробуй ещё раз.'
              : 'I could not create the Dev task. I will not claim it was saved. Check the Task Studio migration and try again.',
            { dev_task_status: 'failed' }
          );
        }
      }

      const permanentDeleteConfirmation =
        /^(?:да(?:[,\s]+(?:удали|удалить|delete|подтверждаю))?|подтверждаю|confirm|yes(?:[,\s]+delete)?)[.!]?$/i.test(
          trimmedMessage.trim()
        );
      const permanentDeleteCancellation = /^(?:нет|отмена|no|cancel|не\s+удаляй)[.!]?$/i.test(
        trimmedMessage.trim()
      );

      if (
        memoryStore &&
        isPierrotUserId(ownerIdentityUserId) &&
        (permanentDeleteConfirmation || permanentDeleteCancellation)
      ) {
        const pendingDelete = await loadPendingMemoryDelete(memoryStore, conversationId).catch(
          () => null
        );

        if (pendingDelete) {
          if (permanentDeleteCancellation) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Отменил безвозвратное удаление «${pendingDelete.title}». Ничего не изменено.`
                : `Cancelled permanent deletion of “${pendingDelete.title}”. Nothing was changed.`,
              {
                memory_status: 'cancelled',
                memory_id: pendingDelete.id,
                memory_delete_pending: {
                  id: pendingDelete.id,
                  title: pendingDelete.title,
                  requestedAt: pendingDelete.requestedAt,
                  expiresAt: new Date(0).toISOString(),
                },
              }
            );
          }

          try {
            const deleted = await deleteMemoryRecord(
              memoryStore,
              ownerIdentityUserId,
              pendingDelete.id
            );
            if (!deleted) throw new Error('memory_not_found');

            const stillExists = await getMemoryRecord(
              memoryStore,
              ownerIdentityUserId,
              pendingDelete.id
            );
            if (stillExists) throw new Error('memory_delete_not_applied');

            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Удалил навсегда запись «${pendingDelete.title}» и её поисковый индекс.`
                : `Permanently deleted “${pendingDelete.title}” and its search embedding.`,
              {
                memory_status: 'deleted',
                memory_id: pendingDelete.id,
                permanent: true,
                memory_delete_pending: {
                  id: pendingDelete.id,
                  title: pendingDelete.title,
                  requestedAt: pendingDelete.requestedAt,
                  expiresAt: new Date(0).toISOString(),
                },
              }
            );
          } catch {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Не удалось безвозвратно удалить «${pendingDelete.title}». Я не буду утверждать, что запись удалена.`
                : `I could not permanently delete “${pendingDelete.title}”. I will not claim it was deleted.`,
              { memory_status: 'write_failed', memory_id: pendingDelete.id }
            );
          }
        }
      }

      const memoryOperationConfirmation = isMemoryOperationConfirmation(trimmedMessage);
      const memoryOperationCancellation = isMemoryOperationCancellation(trimmedMessage);

      if (
        memoryStore &&
        isPierrotUserId(ownerIdentityUserId) &&
        (memoryOperationConfirmation || memoryOperationCancellation)
      ) {
        const pendingOperation = await loadPendingMemoryOperation(
          memoryStore,
          conversationId
        ).catch(() => null);

        if (pendingOperation) {
          if (memoryOperationCancellation) {
            const outcome: MemoryOperationOutcome = {
              status: 'cancelled',
              action: pendingOperation.action,
              scope: pendingOperation.scope,
              changed: 0,
              already: 0,
              failed: 0,
              targets: pendingOperation.titles.map((item) => ({
                id: item.id,
                title: item.title,
                status: 'unchanged',
              })),
              candidates: [],
              projectName: pendingOperation.projectName,
              pending: null,
              engine: null,
            };

            return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
              memory_status: 'cancelled',
              memory_operation_id: pendingOperation.operationId,
              memory_operation_scope: pendingOperation.scope,
              memory_operation_pending: null,
            });
          }

          const records = await listMemoryRecordsByIds(
            memoryStore,
            ownerIdentityUserId,
            pendingOperation.targetIds
          ).catch(() => []);
          const byId = new Map(records.map((record) => [record.id, record]));
          const missing = pendingOperation.targetIds.some((id) => !byId.has(id));
          let changedComposition = records.some((record) => record.status !== 'current');

          if (!changedComposition && pendingOperation.projectId) {
            const linked = await listProjectTasks(
              memoryStore,
              ownerIdentityUserId,
              pendingOperation.projectId,
              { statuses: ['current'], limit: 500 }
            ).catch(() => []);
            const linkedIds = new Set(linked.map((record) => record.id));
            changedComposition = pendingOperation.targetIds.some((id) => !linkedIds.has(id));
          }

          if (missing || changedComposition) {
            const outcome: MemoryOperationOutcome = {
              status: 'composition_changed',
              action: pendingOperation.action,
              scope: pendingOperation.scope,
              changed: 0,
              already: 0,
              failed: 0,
              targets: [],
              candidates: records,
              projectName: pendingOperation.projectName,
              pending: null,
              engine: null,
            };

            return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
              memory_status: 'clarification_required',
              memory_operation_id: pendingOperation.operationId,
              memory_operation_pending: null,
            });
          }

          const executed = await executeMemoryOperation({
            store: memoryStore,
            userId: ownerIdentityUserId,
            action: pendingOperation.action,
            targets: records,
          });

          const outcome: MemoryOperationOutcome = {
            ...executed.outcome,
            status:
              executed.outcome.failed > 0
                ? 'partial'
                : executed.outcome.changed === 0
                  ? 'already'
                  : 'completed',
            action: pendingOperation.action,
            scope: pendingOperation.scope,
            candidates: [],
            projectName: pendingOperation.projectName,
            pending: null,
          };

          return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
            memory_status:
              outcome.status === 'partial'
                ? outcome.changed > 0
                  ? 'partial'
                  : 'write_failed'
                : pendingOperation.action === 'complete'
                  ? 'completed'
                  : pendingOperation.action === 'forget'
                    ? 'forgotten'
                    : 'archived',
            memory_ids: outcome.targets.map((target) => target.id),
            memory_count: outcome.changed,
            memory_already: outcome.already,
            memory_failed: outcome.failed,
            memory_operation_id: pendingOperation.operationId,
            memory_operation_scope: pendingOperation.scope,
            memory_operation_engine: outcome.engine,
            memory_operation_pending: null,
            // Keep the exact changed IDs available for a following
            // “restore this task” turn.
            memory_list_ids: outcome.targets.map((target) => target.id),
            operation_log: {
              intent: `memory_operation:${pendingOperation.action}`,
              project_id: pendingOperation.projectId,
              object_ids: outcome.targets.map((target) => target.id),
              target_titles: pendingOperation.titles.map((item) => item.title),
              new_statuses: outcome.targets.map((target) => target.status),
              changed: outcome.changed,
              failed: outcome.failed,
              result: outcome.status,
            },
          });
        }
      }

      let memoryListContext: PierrotMemoryRecord[] | null = null;
      let skipMemoryHandling = false;

      if (
        isMemoryMutationAction(memoryIntent.action) &&
        (memoryIntent.listReference !== 'none' || isMemoryListPlaceholder(memoryIntent.query))
      ) {
        if (memoryStore && isPierrotUserId(ownerIdentityUserId)) {
          memoryListContext = await loadLatestMemoryListRecords(
            memoryStore,
            ownerIdentityUserId,
            conversationId
          ).catch(() => []);
        } else {
          memoryListContext = [];
        }

        if (
          memoryListContext.length === 0 &&
          memoryIntent.listReference === 'none' &&
          memoryIntent.scope !== 'project' &&
          memoryIntent.scope !== 'all' &&
          !memoryIntent.permanent &&
          (memoryIntent.action === 'archive' ||
            memoryIntent.action === 'forget' ||
            memoryIntent.action === 'delete')
        ) {
          // A bare “удали” in an unrelated conversation must not hijack the
          // answer. Without a recent memory list, it is not a memory command.
          skipMemoryHandling = true;
        }
      }

      if (memoryIntent.action !== 'none' && !skipMemoryHandling) {
        const memoryUnavailable = () =>
          persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Память сейчас недоступна: не удалось подключиться к хранилищу. Я ничего не сохранил и не буду выдумывать записи. Попробуй ещё раз.'
              : 'Memory is currently unavailable: I could not reach the store. I did not save anything and will not invent records. Try again.',
            { memory_status: 'unavailable' }
          );

        if (!memoryStore || !isPierrotUserId(ownerIdentityUserId)) return memoryUnavailable();

        const formatRecord = (record: PierrotMemoryRecord, index?: number) => {
          const marker = index === undefined ? '- ' : `${index + 1}. `;
          const date = (record.validFrom || record.updatedAt || record.createdAt || '').slice(
            0,
            10
          );
          const status =
            record.status === 'current'
              ? ''
              : record.status === 'uncertain'
                ? ' · под вопросом'
                : ` · ${record.status}`;
          const archive = ['archived', 'completed', 'superseded', 'rejected'].includes(
            record.status
          )
            ? ' · архив'
            : '';
          const content =
            record.content.length > 240 ? `${record.content.slice(0, 237)}…` : record.content;
          const supersession = record.supersededBy
            ? ` · заменено записью ${record.supersededBy.slice(0, 8)}`
            : '';
          const rating = record.ownerRating ? ` · оценка ${record.ownerRating}/10` : '';
          return `${marker}${record.title}${date ? ` · ${date}` : ''}${status}${archive}${rating}${supersession} — ${content}`;
        };

        const formatGroup = (title: string, records: PierrotMemoryRecord[]) => {
          if (records.length === 0) return null;
          return `${title}\n${records.map((record) => formatRecord(record)).join('\n')}`;
        };

        const formatSearchResults = (
          records: PierrotMemoryRecord[],
          options: { archive: boolean }
        ) => {
          if (records.length === 0) {
            return ownerLanguage === 'ru'
              ? 'В памяти нет подходящей записи. Я не буду придумывать её.'
              : 'I found no matching memory record. I will not invent one.';
          }

          return `${ownerLanguage === 'ru' ? 'Нашёл в памяти:' : 'Found in memory:'}\n\n${records
            .map((record) => formatRecord(record))
            .join('\n')}${
            options.archive
              ? `\n\n${
                  ownerLanguage === 'ru'
                    ? 'Архив показан только как исторический контекст; он не считается текущей договорённостью.'
                    : 'Archive entries are historical context only; they are not current agreements.'
                }`
              : ''
          }`;
        };

        if (memoryIntent.action === 'create_task') {
          const content = memoryIntent.content?.trim();
          if (!content) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Что записать в задачу? Дай формулировку — я сохраню её и покажу точный ID после проверки.'
                : 'What should the task say? Give me the wording; I will save it and show the exact ID after verification.',
              { memory_status: 'clarification_required', task_intent: 'create_task' }
            );
          }

          const result = await createOwnerTask({
            store: memoryStore,
            userId: ownerIdentityUserId,
            content,
            projectRef:
              memoryIntent.projectRef || conversationProject?.slug || turnProject?.slug || null,
            conversationId,
            messageId: userMessageId,
            originalMessage: trimmedMessage,
          });

          if (result.status === 'project_not_found' || result.status === 'project_ambiguous') {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? result.status === 'project_ambiguous'
                  ? `Несколько проектов совпадают с «${result.projectRef}». Задача не создана. Уточни точный проект.`
                  : `Не нашёл проект «${result.projectRef}». Задача не создана, чтобы не привязать её к чужому проекту.`
                : result.status === 'project_ambiguous'
                  ? `Several projects match “${result.projectRef}”. Nothing was created. Name the exact project.`
                  : `I could not find “${result.projectRef}”. Nothing was created so the task cannot land in the wrong project.`,
              {
                memory_status: 'clarification_required',
                task_intent: 'create_task',
                project_status: result.status,
              }
            );
          }

          if (result.status === 'existing_in_other_project') {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Такая задача уже существует${result.existingProjectName ? ` в проекте «${result.existingProjectName}»` : ' в другом проекте'} и не была перенесена в «${result.project?.name}». Дубликат не создан, чужая связь не изменена.`
                : `This task already exists${result.existingProjectName ? ` in “${result.existingProjectName}”` : ' in another project'} and was not moved to “${result.project?.name}”. Nothing was duplicated or relinked.`,
              {
                memory_status: 'clarification_required',
                task_intent: 'create_task',
                task_status: result.status,
                memory_id: result.task.id,
                project_id: result.project?.id,
              }
            );
          }

          if (result.status === 'invalid_content') {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Формулировка слишком короткая. Задача не создана.'
                : 'The wording is too short. Nothing was created.',
              { memory_status: 'clarification_required', task_intent: 'create_task' }
            );
          }

          if (result.status === 'write_failed' || result.status === 'verification_failed') {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось сохранить и перечитать задачу. Я не буду утверждать, что она создана.'
                : 'I could not save and read back the task. I will not claim it exists.',
              {
                memory_status: 'write_failed',
                task_intent: 'create_task',
                task_status: result.status,
              }
            );
          }

          if (result.status === 'link_failed') {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Задача «${result.task?.title || content}» сохранена (${result.task?.id.slice(0, 8)}), но связь с проектом «${result.project?.name}» не подтвердилась. Я не буду утверждать, что она в проекте.`
                : `The task “${result.task?.title || content}” was saved (${result.task?.id.slice(0, 8)}), but the link to “${result.project?.name}” was not confirmed. I will not claim it belongs to the project.`,
              {
                memory_status: 'partial',
                task_intent: 'create_task',
                task_status: 'link_failed',
                memory_id: result.task?.id,
                project_id: result.project?.id,
              }
            );
          }

          const createdResult = result as Extract<
            OwnerTaskCreationResult,
            { status: 'created' | 'already_exists' }
          >;
          const projectLine = createdResult.project
            ? ` в проект «${createdResult.project.name}»`
            : '';
          const already = createdResult.status === 'already_exists';
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? already
                ? `Такая задача уже есть: «${createdResult.task.title}» (${createdResult.task.id.slice(0, 8)})${projectLine}. Ничего не дублировал.`
                : `Создал задачу «${createdResult.task.title}»${projectLine}. ID: ${createdResult.task.id.slice(0, 8)}. Прочитал запись обратно — статус ${createdResult.task.status}.`
              : already
                ? `This task already exists: “${createdResult.task.title}” (${createdResult.task.id.slice(0, 8)})${projectLine}. Nothing was duplicated.`
                : `Created “${createdResult.task.title}”${projectLine}. ID: ${createdResult.task.id.slice(0, 8)}. Read-back status: ${createdResult.task.status}.`,
            {
              memory_status: already ? 'deduplicated' : 'saved',
              memory_kind: 'task',
              memory_id: createdResult.task.id,
              memory_list_ids: [createdResult.task.id],
              project_id: createdResult.project?.id,
              task_intent: 'create_task',
              task_status: createdResult.status,
              operation_log: {
                intent: 'create_task',
                project_id: createdResult.project?.id || null,
                object_id: createdResult.task.id,
                new_value: createdResult.task.title,
                result:
                  createdResult.linkPersisted || !createdResult.project ? 'confirmed' : 'partial',
              },
            }
          );
        }

        if (memoryIntent.action === 'rate') {
          if (!memoryIntent.rating || !memoryIntent.ratingTarget) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Уточни оценку от 1 до 10 и объект: проект или задача.'
                : 'Give a rating from 1 to 10 and the target: project or task.',
              { memory_status: 'clarification_required', task_intent: 'rate' }
            );
          }

          if (memoryIntent.ratingTarget === 'project') {
            const ref = memoryIntent.projectRef || '';
            const resolved = await resolveExactProject(memoryStore, ownerIdentityUserId, ref);
            if (!resolved.project) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? resolved.ambiguous
                    ? 'Несколько проектов совпадают с этим названием. Оценка не сохранена.'
                    : `Не нашёл проект «${ref}». Оценка не сохранена.`
                  : resolved.ambiguous
                    ? 'Several projects match that name. Nothing was saved.'
                    : `I could not find “${ref}”. Nothing was saved.`,
                { memory_status: 'clarification_required', task_intent: 'rate' }
              );
            }

            try {
              await updatePierrotProject(ownerIdentityUserId, resolved.project.id, {
                ownerRating: memoryIntent.rating,
              });
              const verified = await getPierrotProject(ownerIdentityUserId, resolved.project.id);
              if (!verified || verified.ownerRating !== memoryIntent.rating) {
                throw new Error('PROJECT_RATING_NOT_CONFIRMED');
              }
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Сохранил оценку проекта «${verified.name}»: ${memoryIntent.rating}/10. Это твоя оценка, отдельно от importance и приоритета модели.`
                  : `Saved the owner rating for “${verified.name}”: ${memoryIntent.rating}/10. It is separate from model importance and priority.`,
                {
                  memory_status: 'saved',
                  task_intent: 'rate',
                  project_id: verified.id,
                  owner_rating: memoryIntent.rating,
                  operation_log: {
                    intent: 'task_or_project_rating',
                    project_id: verified.id,
                    new_value: memoryIntent.rating,
                    result: 'confirmed',
                  },
                }
              );
            } catch (error) {
              const code = error instanceof Error ? error.message : '';
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? code === 'PROJECT_RATING_MIGRATION_REQUIRED'
                    ? 'Оценка не сохранена: нужно добавить отдельное поле owner_rating. Приоритет и importance его не заменяют.'
                    : 'Не удалось подтвердить сохранение оценки. Я не буду утверждать, что она записана.'
                  : 'I could not confirm the rating. I will not claim it was saved.',
                {
                  memory_status:
                    code === 'PROJECT_RATING_MIGRATION_REQUIRED'
                      ? 'migration_required'
                      : 'write_failed',
                  task_intent: 'rate',
                }
              );
            }
          }

          const query = memoryIntent.query || '';
          const found = await searchMemory(memoryStore, {
            userId: ownerIdentityUserId,
            query,
            includeArchive: false,
            limit: 20,
          });
          const exact = found.records.filter(
            (record) => record.title.toLowerCase().trim() === query.toLowerCase().trim()
          );
          const candidates = exact.length > 0 ? exact : found.records;
          if (candidates.length !== 1) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? candidates.length === 0
                  ? `Не нашёл задачу «${query}». Оценка не сохранена.`
                  : `Нашёл несколько записей. Уточни точный заголовок, чтобы я не поставил оценку не той задаче:\n\n${candidates
                      .slice(0, 10)
                      .map((record, index) => `${index + 1}. ${record.title}`)
                      .join('\n')}`
                : 'I did not find exactly one task. Nothing was rated.',
              { memory_status: 'clarification_required', task_intent: 'rate' }
            );
          }

          const target = candidates[0];
          try {
            const updated = await updateMemoryRecord(memoryStore, ownerIdentityUserId, target.id, {
              ownerRating: memoryIntent.rating,
              eventReason: 'owner_rating',
              eventSource: 'owner_chat',
            });
            const verified = await getMemoryRecord(memoryStore, ownerIdentityUserId, target.id);
            if (!verified || verified.ownerRating !== memoryIntent.rating) {
              throw new Error('TASK_RATING_NOT_CONFIRMED');
            }
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? `Сохранил оценку задачи «${verified.title}»: ${memoryIntent.rating}/10. Важность модели не изменена.`
                : `Saved the owner rating for “${verified.title}”: ${memoryIntent.rating}/10. Model importance was not changed.`,
              {
                memory_status: 'saved',
                task_intent: 'rate',
                memory_id: verified.id,
                owner_rating: memoryIntent.rating,
                operation_log: {
                  intent: 'task_or_project_rating',
                  object_id: verified.id,
                  new_value: memoryIntent.rating,
                  result: 'confirmed',
                },
              }
            );
          } catch (error) {
            const code = error instanceof Error ? error.message : '';
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? code === 'memory_rating_migration_required'
                  ? 'Оценка задачи не сохранена: нужно добавить отдельное поле owner_rating. Importance её не заменяет.'
                  : 'Не удалось подтвердить сохранение оценки задачи. Я не буду утверждать, что она записана.'
                : 'I could not confirm the task rating. I will not claim it was saved.',
              {
                memory_status:
                  code === 'memory_rating_migration_required'
                    ? 'migration_required'
                    : 'write_failed',
                task_intent: 'rate',
                memory_id: target.id,
              }
            );
          }
        }

        if (memoryIntent.action === 'clarify' && memoryIntent.reason === 'project_scope_missing') {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Уточни точное название проекта. Фраза «все задачи по проекту» без имени не даёт права затрагивать задачи других проектов. Ничего не изменено.'
              : 'Name the exact project. “All tasks in the project” without a name does not permit touching other projects. Nothing was changed.',
            { memory_status: 'clarification_required', task_intent: 'project_scope_missing' }
          );
        }

        if (
          memoryIntent.action === 'clarify' &&
          memoryIntent.reason === 'task_reference_ambiguous'
        ) {
          return persistOwnerReply(
            ownerLanguage === 'ru'
              ? 'Уточни, какие именно задачи создать и в каком проекте. Я не буду превращать «это всё» в список задач без точных формулировок. Ничего не создано.'
              : 'Tell me which tasks to create and in which project. I will not turn “all this” into a task list without exact wording. Nothing was created.',
            { memory_status: 'clarification_required', task_intent: 'create_task' }
          );
        }

        if (
          memoryIntent.action === 'remember' ||
          memoryIntent.action === 'save' ||
          memoryIntent.action === 'remind'
        ) {
          const content = memoryIntent.content?.trim();
          if (!content || !memoryIntent.kind) {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Уточни одним вопросом: это запомнить надолго, сохранить как заметку или поставить напоминание?'
                : 'One clarification: should I remember this long-term, save it as a note, or make a reminder?',
              { memory_status: 'clarification_required' }
            );
          }

          // Replacement is not guessed. If “вместо/больше не” does not map to
          // exactly one active record, nothing is written and the owner is
          // asked which record was meant.
          if (memoryIntent.possibleConflict) {
            let targets = 0;

            if (typeof searchMemory === 'function') {
              try {
                const match = await searchMemory(memoryStore, {
                  userId: ownerIdentityUserId,
                  query: content,
                  limit: 6,
                  includeArchive: false,
                });
                targets = match.records.length;
              } catch {
                targets = 0;
              }
            }

            if (targets !== 1) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Похоже, это меняет прежнюю договорённость. Я не буду незаметно перезаписывать старую запись. Уточни, какую именно запись заменить, или сформулируй новую без «вместо» и «больше не».'
                  : 'This seems to change an earlier agreement. I will not silently overwrite the old record. Tell me which record to replace, or phrase the new one without “instead” or “no longer”.',
                { memory_status: 'clarification_required' }
              );
            }
          }

          try {
            const artifactProject = conversationProject || turnProject || null;
            const created = await createMemoryRecord(memoryStore, ownerIdentityUserId, {
              kind: memoryIntent.kind,
              title: memoryIntent.title || content.slice(0, 96),
              content,
              rationale: trimmedMessage,
              project: artifactProject?.name || null,
              conversationId,
              messageId: userMessageId,
              reviewAt: memoryIntent.reviewAt,
              possibleConflict: memoryIntent.possibleConflict,
              sourceRefs: [
                {
                  type: 'owner_command',
                  action: memoryIntent.action,
                  projectId: artifactProject?.id || null,
                  projectSlug: artifactProject?.slug || null,
                  originalMessage: trimmedMessage.slice(0, 1_000),
                },
              ],
            });

            if (created.deduplicated) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Это уже есть в памяти: «${created.title}». Ничего не дублировал.`
                  : `This is already in memory: “${created.title}”. I did not duplicate it.`,
                {
                  memory_status: 'deduplicated',
                  memory_kind: created.kind,
                  memory_id: created.id,
                }
              );
            }

            if (artifactProject) {
              // Project context at the artifact level: the conversation may be
              // ordinary, but this extracted record has an unambiguous project.
              await moveDecisionToProject(
                memoryStore,
                ownerIdentityUserId,
                created.id,
                artifactProject
              ).catch(() => undefined);
            }

            const label =
              created.kind === 'memory'
                ? ownerLanguage === 'ru'
                  ? 'Запомнил'
                  : 'Remembered'
                : created.kind === 'saved'
                  ? ownerLanguage === 'ru'
                    ? 'Сохранил'
                    : 'Saved'
                  : ownerLanguage === 'ru'
                    ? 'Напомню'
                    : 'Reminder saved';

            const dateLine =
              created.kind === 'reminder' && created.reviewAt
                ? ownerLanguage === 'ru'
                  ? ` Срок: ${created.reviewAt.slice(0, 10)}.`
                  : ` Due: ${created.reviewAt.slice(0, 10)}.`
                : '';

            const replacementLine = created.supersededRecordId
              ? ownerLanguage === 'ru'
                ? ' Прежняя запись сохранена в архиве как заменённая.'
                : ' The previous record was preserved as superseded.'
              : '';

            const conflictLine =
              created.conflictRecordId || created.status === 'uncertain'
                ? ownerLanguage === 'ru'
                  ? ' Вижу возможное противоречие с другой записью, поэтому пометил новую как «под вопросом». Ничего не перезаписывал.'
                  : ' I see a possible contradiction with another record, so the new one is marked uncertain. Nothing was overwritten.'
                : '';

            const indexingLine =
              created.indexingStatus === 'pending' || created.indexingStatus === 'failed'
                ? ownerLanguage === 'ru'
                  ? ' Семантический индекс обновится позже; запись уже доступна по словам.'
                  : ' The semantic index will catch up later; the record is already searchable by words.'
                : '';

            return persistOwnerReply(
              `${label}: «${created.title}».${dateLine}${replacementLine}${conflictLine}${indexingLine}`,
              {
                memory_status: created.status === 'uncertain' ? 'uncertain' : 'saved',
                memory_kind: created.kind,
                memory_id: created.id,
                ...(created.indexingStatus ? { memory_index: created.indexingStatus } : {}),
              }
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : '';

            if (message === 'memory_replacement_ambiguous') {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Похоже, это заменяет прежнюю договорённость, но я не понял, какую именно. Ничего не изменил. Назови заголовок записи или скажи «что сейчас актуально по…».'
                  : 'This seems to replace an earlier agreement, but I could not identify which one. I changed nothing. Name the record title or ask “what is current about…”.',
                { memory_status: 'clarification_required' }
              );
            }

            if (message === 'memory_status_unsupported') {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Схема памяти ещё не обновлена, поэтому этот статус сейчас недоступен. Запись не изменена.'
                  : 'The memory schema has not been migrated, so this status is unavailable. The record was not changed.',
                { memory_status: 'migration_required' }
              );
            }

            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось сохранить запись. Я не буду говорить, что сохранил. Попробуй ещё раз.'
                : 'I could not save the record. I will not claim it was saved. Try again.',
              { memory_status: 'write_failed' }
            );
          }
        }

        if (
          memoryIntent.action === 'list' ||
          memoryIntent.action === 'search' ||
          memoryIntent.action === 'history_search' ||
          memoryIntent.action === 'current_status'
        ) {
          try {
            if (
              (memoryIntent.action === 'search' ||
                memoryIntent.action === 'history_search' ||
                memoryIntent.action === 'current_status') &&
              !memoryIntent.query
            ) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Что именно найти в памяти? Уточни тему или фразу.'
                  : 'What should I search for in memory? Give me a topic or phrase.',
                { memory_status: 'clarification_required' }
              );
            }

            if (memoryIntent.action === 'list') {
              const records = await listMemoryRecords(memoryStore, {
                userId: ownerIdentityUserId,
                status: 'active',
                limit: 60,
              });

              if (records.length === 0) {
                return persistOwnerReply(
                  ownerLanguage === 'ru'
                    ? 'Пока ничего не записано. Можно сказать «Запомни», «Сохрани» или «Напомни».'
                    : 'Nothing is recorded yet. You can say “Remember”, “Save” or “Remind me”.',
                  { memory_status: 'empty', memory_kind: 'list' }
                );
              }

              const groups = [
                formatGroup(
                  ownerLanguage === 'ru' ? 'Запомнено' : 'Remembered',
                  records.filter((record) => record.kind === 'memory')
                ),
                formatGroup(
                  ownerLanguage === 'ru' ? 'Сохранено' : 'Saved',
                  records.filter((record) => record.kind === 'saved')
                ),
                formatGroup(
                  ownerLanguage === 'ru' ? 'Напоминания' : 'Reminders',
                  records.filter((record) => record.kind === 'reminder')
                ),
                formatGroup(
                  ownerLanguage === 'ru' ? 'Решения и задачи' : 'Decisions and tasks',
                  records.filter((record) => !['memory', 'saved', 'reminder'].includes(record.kind))
                ),
              ].filter((group): group is string => Boolean(group));

              const counts = {
                memory: records.filter((record) => record.kind === 'memory').length,
                saved: records.filter((record) => record.kind === 'saved').length,
                reminder: records.filter((record) => record.kind === 'reminder').length,
              };

              const listContext = records.slice(0, 30);

              return persistOwnerReply(groups.join('\n\n'), {
                memory_status: 'listed',
                memory_counts: counts,
                memory_list_ids: listContext.map((record) => record.id),
                memory_list_kinds: listContext.map((record) => record.kind),
              });
            }

            const result = await searchMemory(memoryStore, {
              userId: ownerIdentityUserId,
              query: memoryIntent.query || '',
              includeArchive:
                memoryIntent.includeArchive || memoryIntent.action === 'history_search',
              historyOnly: memoryIntent.action === 'history_search',
              ...(memoryIntent.action === 'current_status'
                ? { statuses: ['current'] as const }
                : {}),
              limit: 12,
            });

            const listContext = result.records.slice(0, 30);

            return persistOwnerReply(
              formatSearchResults(result.records, {
                archive: result.archiveSearched || memoryIntent.action === 'history_search',
              }),
              {
                memory_status: result.records.length > 0 ? 'found' : 'empty',
                memory_query: memoryIntent.query,
                memory_list_ids: listContext.map((record) => record.id),
                memory_list_kinds: listContext.map((record) => record.kind),
                memory_search: {
                  semantic: result.semanticUsed,
                  lexical_fallback: result.lexicalFallback,
                  archive: result.archiveSearched,
                  ...(result.semanticUnavailableReason
                    ? { reason: result.semanticUnavailableReason }
                    : {}),
                },
              }
            );
          } catch {
            return memoryUnavailable();
          }
        }

        if (memoryIntent.action === 'cleanup_preview' || memoryIntent.action === 'cleanup') {
          try {
            const report = await runMemorySteward(memoryStore, ownerIdentityUserId, {
              apply: memoryIntent.action === 'cleanup',
              limitCandidates: 30,
            });

            const lines = [
              ownerLanguage === 'ru'
                ? `Проверил ${report.scanned} записей.`
                : `Scanned ${report.scanned} records.`,
            ];

            if (report.candidates.length === 0) {
              lines.push(
                ownerLanguage === 'ru'
                  ? 'Очевидных дублей, устаревших заметок и противоречий не нашёл.'
                  : 'I found no obvious duplicates, stale notes or contradictions.'
              );
            } else {
              lines.push(
                ownerLanguage === 'ru'
                  ? 'Кандидаты на уборку (ничего не удаляется):'
                  : 'Cleanup candidates (nothing is deleted):'
              );
              for (const candidate of report.candidates.slice(0, 12)) {
                lines.push(
                  `- ${candidate.title} · ${candidate.type} · ${
                    candidate.safeToApply
                      ? ownerLanguage === 'ru'
                        ? 'можно архивировать безопасно'
                        : 'safe to archive'
                      : ownerLanguage === 'ru'
                        ? 'нужно решение владельца'
                        : 'needs owner decision'
                  } — ${candidate.reason}`
                );
              }
            }

            if (memoryIntent.action === 'cleanup') {
              lines.push(
                report.applied.length > 0
                  ? ownerLanguage === 'ru'
                    ? `Архивировал безопасных кандидатов: ${report.applied.length}. Записи сохранены в архиве.`
                    : `Archived safe candidates: ${report.applied.length}. Records remain in the archive.`
                  : ownerLanguage === 'ru'
                    ? 'Ничего не изменил: безопасных автоматических действий нет.'
                    : 'Nothing changed: there are no safe automatic actions.'
              );
            }

            return persistOwnerReply(lines.join('\n'), {
              memory_status:
                memoryIntent.action === 'cleanup' ? 'cleanup_applied' : 'cleanup_preview',
              memory_candidates: report.candidates.length,
              memory_applied: report.applied.length,
            });
          } catch {
            return memoryUnavailable();
          }
        }

        const strictOperationAction = memoryOperationAction(memoryIntent);

        if (
          strictOperationAction &&
          ['complete', 'archive', 'forget'].includes(strictOperationAction)
        ) {
          try {
            const resolution = await resolveMemoryOperation({
              store: memoryStore,
              userId: ownerIdentityUserId,
              intent: memoryIntent,
              listContext: memoryListContext,
            });

            if (resolution.status !== 'resolved') {
              const outcome: MemoryOperationOutcome = {
                status: resolution.status === 'no_target' ? 'not_found' : resolution.status,
                action: resolution.action,
                scope: resolution.scope,
                changed: 0,
                already: 0,
                failed: 0,
                targets: [],
                candidates: resolution.candidates.map((record) => ({
                  id: record.id,
                  title: record.title,
                  status: record.status,
                })),
                projectName: resolution.projectRef,
                pending: null,
                engine: null,
              };

              return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
                memory_status: 'clarification_required',
                memory_operation_status: outcome.status,
                memory_operation_scope: outcome.scope,
                memory_candidates: outcome.candidates.length,
              });
            }

            if (resolution.requiresConfirmation) {
              if (!pierrotStore || !canStoreTranscript) {
                return persistOwnerReply(
                  ownerLanguage === 'ru'
                    ? 'Для массовой операции нужно подтверждение в сохранённом диалоге. Включи сохранение и повтори команду. Ничего не изменено.'
                    : 'A batch operation needs a confirmation in saved conversation context. Enable saving and repeat the command. Nothing was changed.',
                  { memory_status: 'confirmation_unavailable' }
                );
              }

              const pending = createPendingMemoryOperation(resolution);
              const outcome: MemoryOperationOutcome = {
                status: 'preview',
                action: resolution.action,
                scope: resolution.scope,
                changed: 0,
                already: 0,
                failed: 0,
                targets: resolution.targets.map((record) => ({
                  id: record.id,
                  title: record.title,
                  status: record.status,
                })),
                candidates: [],
                projectName: resolution.project?.name || null,
                pending,
                engine: null,
              };

              return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
                memory_status: 'confirmation_required',
                memory_operation_status: 'preview',
                memory_operation_scope: resolution.scope,
                memory_operation_pending: pending,
                memory_ids: pending.targetIds,
                memory_count: resolution.targets.length,
                ...(resolution.project ? { project_id: resolution.project.id } : {}),
              });
            }

            const executed = await executeMemoryOperation({
              store: memoryStore,
              userId: ownerIdentityUserId,
              action: resolution.action,
              targets: resolution.targets,
            });

            const outcome: MemoryOperationOutcome = {
              ...executed.outcome,
              status:
                executed.outcome.failed > 0
                  ? 'partial'
                  : executed.outcome.changed === 0
                    ? 'already'
                    : 'completed',
              action: resolution.action,
              scope: resolution.scope,
              candidates: [],
              projectName: resolution.project?.name || null,
              pending: null,
            };

            return persistOwnerReply(formatMemoryOperationOutcome(outcome, ownerLanguage), {
              memory_status:
                outcome.status === 'partial'
                  ? outcome.changed > 0
                    ? 'partial'
                    : 'write_failed'
                  : resolution.action === 'complete'
                    ? 'completed'
                    : resolution.action === 'forget'
                      ? 'forgotten'
                      : 'archived',
              memory_ids: outcome.targets.map((target) => target.id),
              memory_count: outcome.changed,
              memory_already: outcome.already,
              memory_failed: outcome.failed,
              memory_operation_status: outcome.status,
              memory_operation_scope: resolution.scope,
              memory_operation_engine: outcome.engine,
              memory_list_ids: outcome.targets.map((target) => target.id),
              ...(resolution.project ? { project_id: resolution.project.id } : {}),
              operation_log: {
                intent: `memory_operation:${resolution.action}`,
                project_id: resolution.project?.id || null,
                object_ids: outcome.targets.map((target) => target.id),
                previous_statuses: resolution.targets.map((target) => ({
                  id: target.id,
                  status: target.status,
                })),
                new_statuses: outcome.targets.map((target) => ({
                  id: target.id,
                  status: target.status,
                })),
                changed: outcome.changed,
                failed: outcome.failed,
                result: outcome.status,
              },
            });
          } catch {
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось разрешить цель команды. Я ничего не изменил. Уточни точный заголовок задачи или проект.'
                : 'I could not resolve the command target. Nothing was changed. Give the exact task title or project.',
              { memory_status: 'clarification_required' }
            );
          }
        }

        if (isMemoryMutationAction(memoryIntent.action)) {
          try {
            const includeArchive =
              memoryIntent.action === 'forget' ||
              memoryIntent.action === 'restore' ||
              memoryIntent.action === 'delete';
            const kinds = memoryMutationKinds(trimmedMessage, memoryIntent.action);
            const placeholder = isMemoryListPlaceholder(memoryIntent.query);
            const listReference = memoryIntent.listReference;
            const archiveStatuses: PierrotMemoryStatus[] = [
              'completed',
              'archived',
              'superseded',
              'rejected',
            ];
            const allowedStatuses: PierrotMemoryStatus[] =
              memoryIntent.action === 'restore'
                ? archiveStatuses
                : memoryIntent.action === 'delete'
                  ? ['current', 'uncertain', ...archiveStatuses]
                  : memoryIntent.action === 'complete'
                    ? ['current', 'completed']
                    : ['current', 'archived'];
            const statusAllowed = (record: PierrotMemoryRecord) =>
              allowedStatuses.includes(record.status);
            const kindAllowed = (record: PierrotMemoryRecord) =>
              !kinds || kinds.includes(record.kind);

            let candidates: PierrotMemoryRecord[] = [];
            const hasListContext = Boolean(memoryListContext && memoryListContext.length > 0);
            const useListContext =
              hasListContext &&
              (placeholder ||
                listReference === 'all' ||
                listReference === 'last' ||
                listReference === 'last_two' ||
                listReference === 'these');

            if (useListContext) {
              candidates = (memoryListContext ?? []).filter(
                (record) => statusAllowed(record) && kindAllowed(record)
              );

              if (memoryIntent.query && !placeholder) {
                const query = memoryIntent.query.toLowerCase();
                candidates = candidates.filter((record) =>
                  `${record.title} ${record.content}`.toLowerCase().includes(query)
                );
              }

              if (listReference === 'last_two') candidates = candidates.slice(-2);
              else if (listReference === 'last') candidates = candidates.slice(-1);
              else if (listReference === 'none' && memoryIntent.action === 'complete') {
                candidates = candidates.slice(-1);
              }
            } else if (memoryIntent.query && !placeholder) {
              const result = await searchMemory(memoryStore, {
                userId: ownerIdentityUserId,
                query: memoryIntent.query,
                includeArchive,
                historyOnly: false,
                ...(kinds ? { kinds } : {}),
                ...(memoryIntent.action === 'restore'
                  ? { statuses: archiveStatuses }
                  : memoryIntent.action === 'delete'
                    ? {}
                    : memoryIntent.action === 'complete'
                      ? { statuses: ['current', 'completed'] as PierrotMemoryStatus[] }
                      : { statuses: ['current', 'archived'] as PierrotMemoryStatus[] }),
                limit: 20,
              });
              candidates = result.records;
            } else if (memoryListContext && memoryListContext.length > 0) {
              candidates = memoryListContext.filter(
                (record) => statusAllowed(record) && kindAllowed(record)
              );
              if (memoryIntent.action === 'complete' && candidates.length > 0) {
                candidates = candidates.slice(-1);
              }
            }

            if (candidates.length === 0 && memoryIntent.action === 'complete') {
              candidates = await listMemoryRecords(memoryStore, {
                userId: ownerIdentityUserId,
                status: 'active',
                kinds: ['task', 'reminder'],
                limit: 20,
              });
            }

            const seen = new Set<string>();
            candidates = candidates.filter((record) => {
              if (seen.has(record.id)) return false;
              seen.add(record.id);
              return true;
            });

            if (candidates.length === 0) {
              if (memoryIntent.action === 'delete' && memoryIntent.permanent) {
                return persistOwnerReply(
                  ownerLanguage === 'ru'
                    ? 'Не вижу, какую именно запись удалить навсегда. Уточни точный заголовок — после этого я попрошу отдельное подтверждение. Ничего не удалено.'
                    : 'I cannot identify which record to delete permanently. Give me the exact title; after that I will ask for separate confirmation. Nothing was deleted.',
                  { memory_status: 'clarification_required' }
                );
              }

              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Не нашёл подходящей записи. Уточни заголовок или скажи «покажи память». Ничего не изменено.'
                  : 'I found no matching record. Give me the exact title or ask to show memory. Nothing was changed.',
                { memory_status: 'not_found' }
              );
            }

            if (memoryIntent.action === 'delete') {
              if (candidates.length !== 1) {
                return persistOwnerReply(
                  `${ownerLanguage === 'ru' ? 'Для безвозвратного удаления нужна одна запись. Нашёл несколько:' : 'Permanent deletion needs one record. I found several:'}\n\n${candidates
                    .map((record, index) => formatRecord(record, index))
                    .join('\n')}\n\n${
                    ownerLanguage === 'ru'
                      ? 'Уточни заголовок. Ничего не изменено и не удалено.'
                      : 'Give me the exact title. Nothing was deleted or changed.'
                  }`,
                  { memory_status: 'clarification_required', memory_candidates: candidates.length }
                );
              }

              const target = candidates[0];

              if (!pierrotStore || !canStoreTranscript) {
                return persistOwnerReply(
                  ownerLanguage === 'ru'
                    ? 'Для подтверждения безвозвратного удаления нужен сохранённый диалог. Включи сохранение и повтори команду. Ничего не удалено.'
                    : 'Permanent deletion needs saved conversation context for a separate confirmation. Enable saving, then repeat the command. Nothing was deleted.',
                  { memory_status: 'confirmation_unavailable', memory_id: target.id }
                );
              }

              const requestedAt = new Date().toISOString();
              const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Это безвозвратное удаление. Подтверди: удалить навсегда «${target.title}»? Ответь «да, удалить» или «отмена».`
                  : `This is permanent deletion. Confirm: permanently delete “${target.title}”? Reply “yes, delete” or “cancel”.`,
                {
                  memory_status: 'confirmation_required',
                  memory_id: target.id,
                  memory_delete_pending: {
                    id: target.id,
                    title: target.title,
                    requestedAt,
                    expiresAt,
                  },
                }
              );
            }

            if (memoryIntent.action === 'restore') {
              if (candidates.length !== 1) {
                return persistOwnerReply(
                  `${ownerLanguage === 'ru' ? 'Нашёл несколько записей:' : 'I found several records:'}\n\n${candidates
                    .map((record, index) => formatRecord(record, index))
                    .join('\n')}\n\n${
                    ownerLanguage === 'ru'
                      ? 'Уточни заголовок, чтобы я не вернул не ту запись. Ничего не изменено.'
                      : 'Give me the exact title so I do not restore the wrong record. Nothing was changed.'
                  }`,
                  { memory_status: 'clarification_required', memory_candidates: candidates.length }
                );
              }

              const target = candidates[0];
              const restored = await restoreMemoryRecord(
                memoryStore,
                ownerIdentityUserId,
                target.id
              );
              if (restored.id !== target.id || restored.status !== 'current') {
                throw new Error('memory_status_not_applied');
              }

              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? `Вернул в память запись «${restored.title}».`
                  : `Restored “${restored.title}” to active memory.`,
                {
                  memory_status: 'restored',
                  memory_id: restored.id,
                  memory_ids: [restored.id],
                }
              );
            }

            // Complete/archive/forget are handled by the strict ID resolver
            // above. Reaching this point means the target was not one of the
            // supported single-record delete/restore branches.
            return persistOwnerReply(
              ownerLanguage === 'ru'
                ? 'Не удалось однозначно определить одну задачу. Ничего не изменено. Уточни точный заголовок.'
                : 'I could not identify exactly one task. Nothing was changed. Give the exact title.',
              { memory_status: 'clarification_required' }
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : '';

            if (
              message === 'memory_event_write_failed' ||
              message === 'memory_event_write_failed_rollback_failed'
            ) {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Не удалось записать историю изменения в базу. Я не буду утверждать, что запись заархивирована или завершена. Проверь память и попробуй ещё раз.'
                  : 'I could not write the status-change event to the database. I will not claim the record was archived or completed. Check memory and try again.',
                { memory_status: 'write_failed' }
              );
            }

            if (message === 'memory_status_unsupported') {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Схема памяти ещё не обновлена, поэтому этот статус сейчас недоступен. Запись не изменена.'
                  : 'The memory schema has not been migrated, so this status is unavailable. The record was not changed.',
                { memory_status: 'migration_required' }
              );
            }

            if (message === 'memory_status_not_applied') {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Не удалось подтвердить изменение статуса в базе. Я не буду утверждать, что запись заархивирована или завершена. Проверь память и попробуй ещё раз.'
                  : 'I could not confirm the status change in the database. I will not claim the record was archived or completed. Check memory and try again.',
                { memory_status: 'write_failed' }
              );
            }

            if (message === 'memory_not_found') {
              return persistOwnerReply(
                ownerLanguage === 'ru'
                  ? 'Запись не найдена или уже изменилась. Я ничего не утверждаю и не меняю.'
                  : 'The record was not found or has already changed. I am not claiming or changing anything.',
                { memory_status: 'not_found' }
              );
            }

            return memoryUnavailable();
          }
        }

        return persistOwnerReply(
          ownerLanguage === 'ru'
            ? 'Уточни, что сделать с записью: запомнить, сохранить, напомнить, показать, завершить, заархивировать, вернуть из архива или удалить навсегда?'
            : 'Tell me what to do with the record: remember, save, remind, list, complete, archive, restore or delete permanently?',
          { memory_status: 'clarification_required' }
        );
      }

      if (executionPlan.operation === 'clarify.publications') {
        return persistOwnerReply(
          ownerLanguage === 'ru'
            ? 'Уточни, что считать публикациями: твои тексты в Brain или публикации о тебе в Media Archive?'
            : 'Should I count your own texts in Brain, or coverage about you in the Media Archive?',
          {
            owner_tool: 'clarify',
            source_status: {
              brain: 'not_requested',
              media: 'not_requested',
              web: 'not_requested',
            },
          }
        );
      }

      const ownerTool =
        executionPlan.operation === 'brain.stats' && executionPlan.ownerTool?.kind === 'stats'
          ? { kind: 'brain' as const, query: executionPlan.ownerTool.query }
          : executionPlan.ownerTool;

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
      ? decideWebSearch({
          message: trimmedMessage,
          history: normalizedHistory,
          // A verified owner may deliberately select the public persona, but
          // that must not make personal-state questions look like public
          // current-events requests. Explicit external requests still win in
          // decideWebSearch.
          ownerMode: ragOwnerAuthorized,
        })
      : null;
    // decideWebSearch is the *single* authority for autonomous web execution.
    // Intent classification, project context and early execution-plan hints
    // are inputs to the decision, never a second veto or a second permission.
    const webRequested = Boolean(useModel && webDecision?.shouldSearch);
    const webSearchPromise: Promise<WebSearchResult | null> = webRequested
      ? searchWebEvidence({
          query: webDecision?.query || trimmedMessage,
        }).catch(() => null)
      : Promise.resolve(null);

    const runGeneration = async (
      onDelta?: (text: string) => void,
      onStatus?: (stage: 'generating' | 'persisting') => void,
      generationSignal: AbortSignal = req.signal
    ): Promise<Response> => {
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
            ragOwnerAuthorized &&
            reasoningKeywords.some((keyword) => contextScan.includes(keyword));

          // Owner-only Brain retrieval. Public conversations never enter this
          // branch. The mode is a client intent only; access is decided by the
          // verified server-side owner identity above.
          let generationSystemPrompt = systemPrompt;
          const brainPlan = buildBrainQueryPlan(retrievalQuery);
          const requestsManuscript = brainPlan.requestedSources.includes('manuscript');
          const explicitBrainQuery = /\b(?:brain|rag)\b|баз[ае]\s+знаний|knowledge base/i.test(
            trimmedMessage
          );
          const useMediaBranch =
            queryPlan.intent !== 'document_lookup' &&
            !explicitBrainQuery &&
            !foodQuery &&
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
                  query: retrievalQuery,
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
                    query: retrievalQuery,
                    plan: brainPlan,
                    topK: 8,
                    maxAttempts: 3,
                    totalTimeoutMs: BRAIN_RAG_TOTAL_TIMEOUT_MS,
                    retrieve: (attempt) =>
                      retrieveBrainEvidence({
                        query: attempt.query,
                        scope: 'owner',
                        ownerAuthorized: true,
                        plan: attempt.plan,
                        topK: attempt.topK,
                        timeoutMs: attempt.timeoutMs,
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
                    timeoutStage: retrieval.timeoutStage ?? null,
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
                      : buildUnframedUnavailablePrompt(retrieval.outcome, retrieval.code);

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
                      : buildUnframedUnavailablePrompt(retrieval.outcome, retrieval.code);

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

          if (ownerMode && foodQuery && (ownerRag?.sources.length || 0) > 0) {
            generationSystemPrompt = `${generationSystemPrompt}\n\n${[
              'FOOD_QUERY_MODE',
              'The retrieved personal archive evidence contains recipe fragments.',
              'List the recipes and food fragments that are actually present, with their ingredients and steps.',
              'Do not claim that the archive has no recipes when recipe evidence is attached.',
              'If a recipe is incomplete, state exactly which part is present and which part is missing.',
            ].join('\n')}`;
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

          onStatus?.('generating');

          const generated = onDelta
            ? await streamPierrotModel(
                generationSystemPrompt,
                openAiMessages,
                prefersReasoning,
                onDelta,
                generationSignal
              )
            : await callPierrotModel(generationSystemPrompt, openAiMessages, prefersReasoning);

          onStatus?.('persisting');
          reply = generated.reply;
          usedProvider = generated.provider;
          usedModel = generated.model;
          generationLatencyMs = generated.latencyMs;
          fallbackUsed = generated.fallbackUsed;
        } catch (aiError) {
          const failure = classifyPierrotFailure(aiError, {
            aborted: generationSignal.aborted,
          });
          const interrupted = aiError instanceof PierrotStreamInterruptedError;

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
              ...(interrupted ? { interrupted: true } : {}),
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

      if (generationSignal.aborted) {
        return NextResponse.json(
          { error: 'Request cancelled.', code: 'cancelled' },
          { status: 499 }
        );
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
            historyId: historyScope?.history.id ?? null,
            episodeId: ownerEpisodeId,
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
              operation: executionPlan.operation,
              tool: executionPlan.tool,
              fallback_policy: executionPlan.fallbackPolicy,
              // requires_web is the executed decision, not an early intent
              // hint. This keeps the event internally consistent.
              requires_web: webRequested,
              intent_requires_web: executionPlan.requiresWeb,
              web_requested: webRequested,
              web_command: webRequested ? trimmedMessage.slice(0, 500) : null,
              web_query: webRequested ? webSearchResult?.query || webDecision?.query || null : null,
              web_reason: webDecision?.reason ?? null,
              web_used_context: webDecision?.usedContext ?? false,
              web_topic_changed: webDecision?.topicChanged ?? false,
              web_latency_ms: webSearchResult?.latencyMs ?? null,
              web_outcome: webSearchResult?.outcome ?? null,
              web_code: webSearchResult?.code ?? null,
              web_source_count: webSources.length,
              source_status: sourceStatus,
              evidence_warnings: evidenceGuard.violations,
              brain_timings: retrievalTrace?.timings ?? null,
              timeout_stage: retrievalTrace?.timeoutStage ?? null,
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
        ...historyResponseFields,
        userMessageId,
        assistantMessageId,
        recorded: canStoreTranscript,
        ...responseExtras,
      });
    };

    if (streaming) {
      return createPierrotStreamResponse({
        request: req,
        run: async (emit) => {
          emit({
            type: 'accepted',
            version: PIERROT_STREAM_VERSION,
            conversationId,
            sessionId,
            ...historyResponseFields,
            userMessageId,
            assistantMessageId,
          });
          emit({
            type: 'status',
            version: PIERROT_STREAM_VERSION,
            stage: 'retrieving',
          });

          const response = await runGeneration(
            (text) => emit({ type: 'delta', version: PIERROT_STREAM_VERSION, text }),
            (stage) => emit({ type: 'status', version: PIERROT_STREAM_VERSION, stage })
          );
          const payload = (await response.json().catch(() => null)) as Record<
            string,
            unknown
          > | null;

          if (!response.ok) {
            const error =
              payload && typeof payload.error === 'string'
                ? payload.error
                : 'The response stream failed.';
            const code =
              payload && typeof payload.code === 'string' ? payload.code : 'stream_error';
            const retryAfter =
              payload && typeof payload.retryAfter === 'number' ? payload.retryAfter : undefined;
            const interrupted = payload?.interrupted === true;

            emit({
              type: 'error',
              version: PIERROT_STREAM_VERSION,
              error,
              code,
              ...(retryAfter ? { retryAfter } : {}),
              retryable: response.status === 429 || response.status >= 500,
              ...(interrupted ? { interrupted: true } : {}),
            });
            return;
          }

          if (!payload) {
            emit({
              type: 'error',
              version: PIERROT_STREAM_VERSION,
              error: 'The response stream ended without a payload.',
              code: 'empty_stream_payload',
              retryable: true,
              interrupted: true,
            });
            return;
          }

          const sourcePayload = {
            ...(payload.rag ? { rag: payload.rag } : {}),
            ...(payload.web ? { web: payload.web } : {}),
            ...(payload.answerSources ? { answerSources: payload.answerSources } : {}),
            ...(payload.sourceStatus ? { sourceStatus: payload.sourceStatus } : {}),
          };

          if (Object.keys(sourcePayload).length > 0) {
            emit({
              type: 'sources',
              version: PIERROT_STREAM_VERSION,
              payload: sourcePayload,
            });
          }

          emit({
            type: 'completed',
            version: PIERROT_STREAM_VERSION,
            payload,
          });
        },
      });
    }

    return runGeneration();
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
