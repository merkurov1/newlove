'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import type { UnframedEvidenceSource } from '@/lib/knowledge/rag/evidence';
import type { PierrotAnswerSources } from '@/lib/knowledge/web/types';
import type { RagRetrievalOutcome } from '@/lib/knowledge/rag/types';
import { parsePierrotResponse } from '@/lib/pierrot/response/schema';
import type { PierrotResponse } from '@/lib/pierrot/response/types';
import {
  PIERROT_SECTIONS,
  createNavigationProposal,
  createNavigationRecord,
  createPierrotId,
  findSectionByPrompt,
  getPierrotSection,
  isNavigationConfirmation,
  isPierrotSectionId,
  normalizePathname,
  parseNavigationRecord,
  type PierrotChatAction,
  type PierrotMessageLink,
  type PierrotNavigationProposal,
  type PierrotSectionId,
} from '@/lib/pierrot/navigation';
import {
  endPierrotConversation,
  getPierrotConsent,
  getPierrotConversationId,
  getPierrotSessionId,
  getPierrotVisitorId,
  rotatePierrotConversationId,
  rotatePierrotVisitorId,
  setPierrotConversationId,
  setPierrotSessionId,
  trackPierrotEvent,
} from '@/lib/pierrot/clientTelemetry';
import { detectPierrotLanguage } from '@/lib/pierrot/conversation';
import {
  PierrotStreamProtocolError,
  consumePierrotEventStream,
} from '@/lib/pierrot/streamProtocol';
import {
  HUMAN_MAX_MESSAGE_LENGTH,
  getHumanCopy,
  isHumanRequestStatus,
  type HumanPresencePublicState,
  type HumanPresenceStateResponse,
} from '@/lib/pierrot/humanPresenceShared';
import {
  clearHumanAccessToken,
  fetchHumanPresenceState,
  humanPresenceAction,
  loadHumanAccessToken,
  saveHumanAccessToken,
  sendHumanPresenceMessage,
} from '@/lib/pierrot/humanPresenceClient';
import {
  getBrainAvailableText,
  getBrainExampleQuestions,
  getBrainIntroText,
  isBrainActivationPhrase,
  type BrainLanguage,
} from '@/lib/pierrot/brain';
import {
  detectArtEngineModeCommand,
  getArtEngineModeText,
  isArtEngineExitCommand,
  type ArtEngineModeLanguage,
} from '@/lib/pierrot/artEngineMode';
import { recoverArtEngineAction } from '@/lib/pierrot/actionIntegrity';
import {
  normalizePierrotErrorCode,
  pierrotErrorCopy,
  type PierrotErrorLanguage,
} from '@/lib/pierrot/errorContracts';
import {
  isPierrotOfferId,
  isVerifiedPierrotInternalDestination,
  normalizePierrotOfferCta,
  type PierrotOfferCta,
  type PierrotOfferId,
} from '@/lib/pierrot/offers';
import type {
  PierrotCommercialMarker,
  PierrotCommercialMarkerAction,
} from '@/lib/pierrot/strategy';

export type PierrotMessageKind = 'chat' | 'section-trigger' | 'section-intro' | 'arrival';

export type PierrotMode = 'site' | 'modal';

export type PierrotMessageRole = 'user' | 'assistant' | 'human' | 'system';

export type PierrotDeliveryState = 'sending' | 'sent' | 'failed';

export type PierrotMessageMeta = {
  kind: PierrotMessageKind;
  sectionId?: PierrotSectionId;
  navigationId?: string;
  humanNoticeKey?: string;
};

export type PierrotMessage = {
  id: string;
  role: PierrotMessageRole;
  content: string;
  provider?: string;
  actions?: PierrotChatAction[];
  links?: PierrotMessageLink[];
  offerId?: PierrotOfferId;
  cta?: PierrotOfferCta;
  commercialMarker?: PierrotCommercialMarker;
  meta?: PierrotMessageMeta;
  evidence?: UnframedEvidenceSource[];
  ragOutcome?: RagRetrievalOutcome;
  answerSources?: PierrotAnswerSources;
  /** Optional validated visual composition; Markdown content remains fallback. */
  response?: PierrotResponse;
  author?: 'visitor' | 'pierrot' | 'anton' | 'system';
  createdAt?: string;
  delivery?: PierrotDeliveryState;
  sequence?: number;
  error?: boolean;
  streaming?: boolean;
  interrupted?: boolean;
};

type PierrotContextValue = {
  messages: PierrotMessage[];
  mode: PierrotMode;
  hasUnread: boolean;
  draft: string;
  draftCaret: number | null;
  isOpen: boolean;
  isLoading: boolean;
  isAdminSession: boolean;
  isUnframedMode: boolean;
  canUseUnframedMode: boolean;
  canShowBrainMode: boolean;
  isArtEngineMode: boolean;
  humanPresence: HumanPresencePublicState | null;
  isHumanActive: boolean;
  isHumanPending: boolean;
  pendingNavigation: PierrotNavigationProposal | null;
  openChat: () => void;
  openConversation: () => void;
  toggleConversation: () => void;
  toggleUnframedMode: () => void;
  exitArtEngineMode: (text?: string) => void;
  tryExitArtEngineMode: (text: string) => boolean;
  closeConversation: () => void;
  closeChat: () => void;
  updateDraft: (value: string, caret?: number | null) => void;
  sendMessage: (overrideText?: string) => Promise<void>;
  clearChat: (reason?: 'new_chat' | 'user_closed') => void;
  exploreSection: (sectionId: PierrotSectionId) => void;
  runAction: (action: PierrotChatAction) => void;
  cancelHumanRequest: () => Promise<void>;
  closeHumanConversation: () => Promise<void>;
  stopGeneration: () => void;
};

const PierrotContext = createContext<PierrotContextValue | null>(null);

const STORAGE_KEY = 'pierrot_chat_history_v2';
const ARRIVAL_STORAGE_KEY = 'pierrot_navigation_arrival_v1';
const BRAIN_UNLOCK_STORAGE_KEY = 'pierrot_brain_unlocked_v1';
const INTRO_DELAY_MS = 420;
const STREAM_TIMEOUT_MS = 60_000;

type PierrotWebResponse = {
  reply?: unknown;
  provider?: unknown;
  admin?: unknown;
  actions?: unknown;
  links?: unknown;
  cta?: unknown;
  commercialMarker?: unknown;
  rag?: unknown;
  answerSources?: unknown;
  web?: unknown;
  response?: unknown;
  offerId?: unknown;
  conversationId?: unknown;
  sessionId?: unknown;
  assistantMessageId?: unknown;
  human?: unknown;
  humanToken?: unknown;
  humanMode?: unknown;
  error?: unknown;
  code?: unknown;
  retryAfter?: unknown;
};

export function usePierrot(): PierrotContextValue {
  const context = useContext(PierrotContext);

  if (!context) {
    throw new Error('usePierrot must be used inside <PierrotProvider>');
  }

  return context;
}

/** For standalone editorial previews that reuse Markdown without the chat. */
export function usePierrotOptional(): PierrotContextValue | null {
  return useContext(PierrotContext);
}

function normalizeAction(value: unknown): PierrotChatAction | null {
  if (!value || typeof value !== 'object') return null;

  const action = value as Record<string, unknown>;

  if (
    action.kind === 'navigate' &&
    typeof action.label === 'string' &&
    isPierrotSectionId(action.sectionId)
  ) {
    return {
      kind: 'navigate',
      label: action.label,
      sectionId: action.sectionId,
    };
  }

  if (
    action.kind === 'prompt' &&
    typeof action.label === 'string' &&
    typeof action.prompt === 'string'
  ) {
    return {
      kind: 'prompt',
      label: action.label,
      prompt: action.prompt,
    };
  }

  return null;
}

function normalizeLink(value: unknown): PierrotMessageLink | null {
  if (!value || typeof value !== 'object') return null;

  const link = value as Record<string, unknown>;

  if (
    typeof link.label !== 'string' ||
    typeof link.href !== 'string' ||
    !isVerifiedPierrotInternalDestination(link.href)
  ) {
    return null;
  }

  return { label: link.label, href: link.href };
}

function normalizeMeta(value: unknown): PierrotMessageMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const meta = value as Record<string, unknown>;
  const kinds: PierrotMessageKind[] = ['chat', 'section-trigger', 'section-intro', 'arrival'];

  if (typeof meta.kind !== 'string' || !kinds.includes(meta.kind as PierrotMessageKind)) {
    return undefined;
  }

  return {
    kind: meta.kind as PierrotMessageKind,
    sectionId: isPierrotSectionId(meta.sectionId) ? meta.sectionId : undefined,
    navigationId: typeof meta.navigationId === 'string' ? meta.navigationId : undefined,
    humanNoticeKey:
      typeof meta.humanNoticeKey === 'string' && meta.humanNoticeKey.length <= 80
        ? meta.humanNoticeKey
        : undefined,
  };
}

function normalizeCommercialMarker(value: unknown): PierrotCommercialMarker | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const marker = value as Record<string, unknown>;
  const actions: PierrotCommercialMarkerAction[] = [
    'introduced',
    'objection',
    'declined',
    'purchased',
    'subscribed',
  ];

  if (!isPierrotOfferId(marker.offerId)) return undefined;
  if (typeof marker.action !== 'string') return undefined;
  if (!(actions as string[]).includes(marker.action)) return undefined;

  return {
    offerId: marker.offerId,
    action: marker.action as PierrotCommercialMarkerAction,
  };
}

function normalizeRagOutcome(value: unknown): RagRetrievalOutcome | undefined {
  if (
    value === 'relevant_results' ||
    value === 'weak_match' ||
    value === 'no_match' ||
    value === 'unavailable'
  ) {
    return value;
  }

  return undefined;
}

function normalizeAnswerSources(value: unknown): PierrotAnswerSources | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const mode = record.mode;

  if (
    mode !== 'model' &&
    mode !== 'brain' &&
    mode !== 'web' &&
    mode !== 'media' &&
    mode !== 'brain+web' &&
    mode !== 'brain+media' &&
    mode !== 'media+web' &&
    mode !== 'brain+media+web'
  ) {
    return undefined;
  }

  const label =
    mode === 'model'
      ? 'MODEL'
      : (mode.split('+').map((part) => part.toUpperCase()).join(' + ') as
          | 'BRAIN'
          | 'WEB'
          | 'MEDIA'
          | 'BRAIN + WEB'
          | 'BRAIN + MEDIA'
          | 'MEDIA + WEB'
          | 'BRAIN + MEDIA + WEB');

  return {
    mode,
    label,
    model: record.model !== false,
    brain: record.brain === true,
    media: record.media === true,
    web: record.web === true,
  };
}

function normalizeEvidenceSource(value: unknown): UnframedEvidenceSource | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const sectionPath = Array.isArray(source.sectionPath)
    ? source.sectionPath.filter((part): part is string => typeof part === 'string')
    : null;

  if (
    typeof source.chunkId !== 'string' ||
    typeof source.heading !== 'string' ||
    !sectionPath ||
    sectionPath.length === 0 ||
    typeof source.sectionIndex !== 'number' ||
    typeof source.lineStart !== 'number' ||
    typeof source.lineEnd !== 'number' ||
    typeof source.similarity !== 'number' ||
    !Number.isFinite(source.similarity) ||
    typeof source.excerpt !== 'string'
  ) {
    return null;
  }

  return {
    documentId: typeof source.documentId === 'string' ? source.documentId : undefined,
    documentTitle: typeof source.documentTitle === 'string' ? source.documentTitle : undefined,
    sourceType: typeof source.sourceType === 'string' ? source.sourceType : undefined,
    sourceClass: typeof source.sourceClass === 'string' ? source.sourceClass : undefined,
    sourceDomain: typeof source.sourceDomain === 'string' ? source.sourceDomain : null,
    author: typeof source.author === 'string' ? source.author : null,
    publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : null,
    chunkId: source.chunkId,
    heading: source.heading,
    sectionPath,
    sectionIndex: source.sectionIndex,
    lineStart: source.lineStart,
    lineEnd: source.lineEnd,
    similarity: source.similarity,
    excerpt: source.excerpt,
    outlet: typeof source.outlet === 'string' ? source.outlet : null,
    canonicalUrl: typeof source.canonicalUrl === 'string' ? source.canonicalUrl : null,
    quoteType:
      source.quoteType === 'direct_quote' ||
      source.quoteType === 'indirect_quote' ||
      source.quoteType === 'mention'
        ? source.quoteType
        : undefined,
    verificationStatus:
      source.verificationStatus === 'verified' ||
      source.verificationStatus === 'unverified' ||
      source.verificationStatus === 'none'
        ? source.verificationStatus
        : undefined,
    mediaRecordId: typeof source.mediaRecordId === 'string' ? source.mediaRecordId : undefined,
  };
}

function buildAssistantMessage(data: PierrotWebResponse, fallbackId: string): PierrotMessage {
  const actions = Array.isArray(data.actions)
    ? data.actions
        .map((action: unknown) => normalizeAction(action))
        .filter((action: PierrotChatAction | null): action is PierrotChatAction => action !== null)
    : [];
  const links = Array.isArray(data.links)
    ? data.links
        .map((link: unknown) => normalizeLink(link))
        .filter((link: PierrotMessageLink | null): link is PierrotMessageLink => link !== null)
    : [];
  const cta = normalizePierrotOfferCta(data.cta);
  const marker = normalizeCommercialMarker(data.commercialMarker);
  const ragPayload =
    data.rag && typeof data.rag === 'object' ? (data.rag as Record<string, unknown>) : null;
  const evidence = Array.isArray(ragPayload?.sources)
    ? ragPayload.sources
        .map(normalizeEvidenceSource)
        .filter((source): source is UnframedEvidenceSource => source !== null)
    : [];
  const response = parsePierrotResponse(data.response) ?? undefined;

  return {
    id:
      typeof data.assistantMessageId === 'string' && data.assistantMessageId
        ? data.assistantMessageId
        : fallbackId,
    role: 'assistant',
    content: typeof data.reply === 'string' ? data.reply : '',
    author: 'pierrot',
    createdAt: new Date().toISOString(),
    provider: typeof data.provider === 'string' ? data.provider : undefined,
    actions: actions.length > 0 ? actions : undefined,
    links: links.length > 0 ? links : undefined,
    offerId: cta?.offerId ?? (isPierrotOfferId(data.offerId) ? data.offerId : undefined),
    cta: cta ?? undefined,
    commercialMarker: marker,
    evidence: evidence.length > 0 ? evidence : undefined,
    ragOutcome: normalizeRagOutcome(ragPayload?.outcome),
    answerSources: normalizeAnswerSources(data.answerSources),
    response,
    meta: { kind: 'chat' },
  };
}

function normalizeMessage(value: unknown, index: number): PierrotMessage | null {
  if (!value || typeof value !== 'object') return null;

  const message = value as Record<string, unknown>;

  if (
    (message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'human' &&
      message.role !== 'system') ||
    typeof message.content !== 'string'
  ) {
    return null;
  }

  const actions = Array.isArray(message.actions)
    ? message.actions
        .map(normalizeAction)
        .filter((action): action is PierrotChatAction => action !== null)
    : [];
  const links = Array.isArray(message.links)
    ? message.links.map(normalizeLink).filter((link): link is PierrotMessageLink => link !== null)
    : [];
  const cta = normalizePierrotOfferCta(message.cta);
  const offerId = cta?.offerId ?? (isPierrotOfferId(message.offerId) ? message.offerId : undefined);
  const evidence = Array.isArray(message.evidence)
    ? message.evidence
        .map(normalizeEvidenceSource)
        .filter((source): source is UnframedEvidenceSource => source !== null)
    : [];

  return {
    id:
      typeof message.id === 'string' && message.id
        ? message.id
        : `legacy-${message.role}-${index}-${message.content.slice(0, 12).replace(/\s+/g, '-')}`,
    role: message.role,
    content: message.content,
    provider: typeof message.provider === 'string' ? message.provider : undefined,
    actions: actions.length > 0 ? actions : undefined,
    links: links.length > 0 ? links : undefined,
    offerId,
    cta: cta ?? undefined,
    commercialMarker: normalizeCommercialMarker(message.commercialMarker ?? message.commercial),
    meta: normalizeMeta(message.meta),
    evidence: evidence.length > 0 ? evidence : undefined,
    ragOutcome: normalizeRagOutcome(message.ragOutcome),
    answerSources: normalizeAnswerSources(message.answerSources),
    response: parsePierrotResponse(message.response) ?? undefined,
    author:
      message.author === 'visitor' ||
      message.author === 'pierrot' ||
      message.author === 'anton' ||
      message.author === 'system'
        ? message.author
        : message.role === 'human'
          ? 'anton'
          : message.role === 'system'
            ? 'system'
            : message.role === 'user'
              ? 'visitor'
              : 'pierrot',
    createdAt: typeof message.createdAt === 'string' ? message.createdAt : undefined,
    delivery:
      message.delivery === 'sending' || message.delivery === 'sent' || message.delivery === 'failed'
        ? message.delivery
        : undefined,
    sequence:
      typeof message.sequence === 'number' && Number.isFinite(message.sequence)
        ? message.sequence
        : undefined,
    error: message.error === true ? true : undefined,
    streaming: message.streaming === true ? true : undefined,
    interrupted: message.interrupted === true ? true : undefined,
  };
}

function loadMessages(): PierrotMessage[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeMessage)
      .filter((message): message is PierrotMessage => message !== null);
  } catch {
    return [];
  }
}

export function PierrotProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const {
    user: authUser,
    profile: authProfile,
    roles: authRoles,
    isLoading: isAuthLoading,
  } = useAuth();

  const [messages, setMessages] = useState<PierrotMessage[]>(loadMessages);
  const [draft, setDraft] = useState('');
  const [draftCaret, setDraftCaret] = useState<number | null>(null);
  const [mode, setMode] = useState<PierrotMode>('site');
  const [hasUnread, setHasUnread] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [isUnframedMode, setIsUnframedMode] = useState(false);
  const [hasChosenUnframedMode, setHasChosenUnframedMode] = useState(false);
  const [isArtEngineMode, setIsArtEngineMode] = useState(false);
  const [isBrainUnlocked, setIsBrainUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;

    try {
      return window.sessionStorage.getItem(BRAIN_UNLOCK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [pendingNavigation, setPendingNavigation] = useState<PierrotNavigationProposal | null>(
    null
  );
  const [humanPresence, setHumanPresence] = useState<HumanPresencePublicState | null>(null);
  const humanPresenceRef = useRef<HumanPresencePublicState | null>(null);
  const humanTokenRef = useRef<string | null>(null);
  const humanPollInFlightRef = useRef(false);
  const humanNoticeRef = useRef<string | null>(null);

  const canUseUnframedMode =
    isAdminSession ||
    (Array.isArray(authRoles) && authRoles.some((role) => role.toUpperCase() === 'ADMIN')) ||
    (typeof authProfile?.role === 'string' && authProfile.role.toUpperCase() === 'ADMIN');

  const canShowBrainMode = canUseUnframedMode && isBrainUnlocked;

  const isOpen = mode === 'modal';

  const modeRef = useRef<PierrotMode>(mode);
  modeRef.current = mode;

  const messagesRef = useRef<PierrotMessage[]>(messages);
  const pendingNavigationRef = useRef<PierrotNavigationProposal | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'user' | 'timeout' | null>(null);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const introTimersRef = useRef<Record<string, number>>({});
  const navigationLockRef = useRef<string | null>(null);
  const navigationTargetRef = useRef<string | null>(null);
  const lastAuthUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    messagesRef.current = messages;

    try {
      if (messages.length > 0) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore unavailable session storage.
    }
  }, [messages]);

  const appendMessage = useCallback(
    (message: Omit<PierrotMessage, 'id'> & { id?: string }): PierrotMessage => {
      const nextMessage: PierrotMessage = {
        ...message,
        id: message.id ?? createPierrotId(),
      };

      setMessages((current) => {
        const next = [...current, nextMessage];
        messagesRef.current = next;

        try {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore unavailable session storage.
        }

        return next;
      });

      if (nextMessage.role !== 'user' && modeRef.current !== 'modal') {
        setHasUnread(true);
      }

      return nextMessage;
    },
    []
  );

  const updateMessage = useCallback(
    (id: string, patch: Partial<Pick<PierrotMessage, 'delivery' | 'createdAt' | 'sequence'>>) => {
      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === id ? { ...message, ...patch } : message
        );

        if (typeof patch.sequence !== 'number') {
          messagesRef.current = updated;
          return updated;
        }

        const sequenceToInsert = patch.sequence;

        // Telegram and the browser can race. Reinsert a message that just
        // received its authoritative sequence so the transcript matches the
        // server's per-conversation order.
        const target = updated.find((message) => message.id === id);

        if (!target) {
          messagesRef.current = updated;
          return updated;
        }

        const rest = updated.filter((message) => message.id !== id);
        let insertAt = rest.length;

        for (let index = 0; index < rest.length; index += 1) {
          const sequence = rest[index].sequence;

          if (typeof sequence === 'number' && sequence > sequenceToInsert) {
            insertAt = index;
            break;
          }
        }

        const next = [...rest.slice(0, insertAt), target, ...rest.slice(insertAt)];
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

  const replaceMessage = useCallback((id: string, nextMessage: PierrotMessage) => {
    setMessages((current) => {
      const withoutDuplicate = current.filter(
        (message) => message.id === id || message.id !== nextMessage.id
      );
      const mapped = withoutDuplicate.map((message) => (message.id === id ? nextMessage : message));
      const next = mapped.filter(
        (message, index) => mapped.findIndex((candidate) => candidate.id === message.id) === index
      );

      messagesRef.current = next;

      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore unavailable session storage.
      }

      return next;
    });
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((current) => {
      const next = current.filter((message) => message.id !== id);
      messagesRef.current = next;

      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore unavailable session storage.
      }

      return next;
    });
  }, []);

  const setHumanState = useCallback((value: HumanPresencePublicState | null) => {
    humanPresenceRef.current = value;
    setHumanPresence(value);
  }, []);

  const humanLanguage = useCallback((): 'ru' | 'en' => {
    const lastUserMessage = [...messagesRef.current]
      .reverse()
      .find((message) => message.role === 'user');
    const detected = detectPierrotLanguage(lastUserMessage?.content || '');

    if (detected !== 'und') return detected;

    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) {
      return 'ru';
    }

    return 'en';
  }, []);

  const appendHumanNotice = useCallback(
    (text: string, noticeKey?: string) => {
      appendMessage({
        role: 'system',
        author: 'system',
        content: text,
        createdAt: new Date().toISOString(),
        meta: {
          kind: 'chat',
          ...(noticeKey ? { humanNoticeKey: noticeKey } : {}),
        },
      });
    },
    [appendMessage]
  );

  /**
   * Merge the server's authorized human state into the existing transcript.
   * Visitor messages keep their optimistic client id, so a poll never
   * duplicates a message that is already on screen.
   */
  const applyHumanState = useCallback(
    (payload: HumanPresenceStateResponse) => {
      if (payload.conversationId) setPierrotConversationId(payload.conversationId);
      if (payload.sessionId) setPierrotSessionId(payload.sessionId);

      const request = payload.request;

      if (!request) {
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        return;
      }

      // A closed session must never look live in the browser, even if the
      // request row still says "active" during a partial write.
      let effectiveRequest = request;

      if (request.status === 'active' && payload.session && payload.session.status !== 'active') {
        effectiveRequest = {
          ...request,
          status: 'closed',
          closedAt: payload.session.closedAt ?? request.closedAt,
        };
      }

      setHumanState(effectiveRequest);

      if (payload.messages.length > 0) {
        setMessages((current) => {
          const ids = new Set(current.map((message) => message.id));
          let next = current;

          for (const incoming of payload.messages) {
            if (ids.has(incoming.id)) {
              const updatedList = next.map((message) =>
                message.id === incoming.id
                  ? {
                      ...message,
                      createdAt: incoming.createdAt ?? message.createdAt,
                      sequence: incoming.sequence,
                      ...(message.role === 'user' && message.delivery !== 'failed'
                        ? { delivery: 'sent' as const }
                        : {}),
                    }
                  : message
              );
              const target = updatedList.find((message) => message.id === incoming.id);

              if (target && typeof incoming.sequence === 'number') {
                const rest = updatedList.filter((message) => message.id !== incoming.id);
                let insertAt = rest.length;

                for (let index = 0; index < rest.length; index += 1) {
                  const sequence = rest[index].sequence;

                  if (typeof sequence === 'number' && sequence > incoming.sequence) {
                    insertAt = index;
                    break;
                  }
                }

                next = [...rest.slice(0, insertAt), target, ...rest.slice(insertAt)];
              } else {
                next = updatedList;
              }

              continue;
            }

            const role: PierrotMessageRole = incoming.role === 'human' ? 'human' : 'user';
            const incomingMessage: PierrotMessage = {
              id: incoming.id,
              role,
              author: role === 'human' ? 'anton' : 'visitor',
              content: incoming.content,
              createdAt: incoming.createdAt ?? undefined,
              delivery: role === 'user' ? 'sent' : undefined,
              sequence: incoming.sequence,
              meta: { kind: 'chat' },
            };

            let insertAt = next.length;

            for (let index = 0; index < next.length; index += 1) {
              const sequence = next[index].sequence;

              if (typeof sequence === 'number' && sequence > incoming.sequence) {
                insertAt = index;
                break;
              }
            }

            next = [...next.slice(0, insertAt), incomingMessage, ...next.slice(insertAt)];
            ids.add(incoming.id);
          }

          messagesRef.current = next;
          return next;
        });
      }

      const noticeKey = `${effectiveRequest.requestId}:${effectiveRequest.status}`;

      if (humanNoticeRef.current === noticeKey) return;

      const noticeAlreadyPresent = messagesRef.current.some(
        (message) => message.meta?.humanNoticeKey === noticeKey
      );
      const copy = getHumanCopy(humanLanguage());

      if (effectiveRequest.status === 'active') {
        humanNoticeRef.current = noticeKey;

        // Stop any AI answer that was already in flight when Anton accepted,
        // so a late model response cannot appear after "Anton is here".
        requestIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        loadingRef.current = false;
        setIsLoading(false);

        if (!noticeAlreadyPresent) appendHumanNotice(copy.here, noticeKey);
        return;
      }

      if (effectiveRequest.status === 'closed') {
        humanNoticeRef.current = noticeKey;
        if (!noticeAlreadyPresent) {
          appendHumanNotice(
            effectiveRequest.resolvedBy === 'visitor' ? copy.ended : copy.closed,
            noticeKey
          );
        }
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        return;
      }

      if (effectiveRequest.status === 'declined') {
        humanNoticeRef.current = noticeKey;
        if (!noticeAlreadyPresent) {
          appendHumanNotice(
            effectiveRequest.resolvedBy === 'visitor' ? copy.cancelled : copy.declined,
            noticeKey
          );
        }
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        return;
      }

      if (effectiveRequest.status === 'expired') {
        humanNoticeRef.current = noticeKey;
        if (!noticeAlreadyPresent) appendHumanNotice(copy.expired, noticeKey);
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
      }
    },
    [appendHumanNotice, humanLanguage, setHumanState]
  );

  const cancelOnboarding = useCallback(() => undefined, []);

  // Recover an active/pending human conversation after a full browser restart.
  // The recovery token is the only persistent credential; the server returns
  // the conversation/session ids only after validating its hash.
  useEffect(() => {
    const saved = loadHumanAccessToken();

    if (!saved) return;

    humanTokenRef.current = saved.token;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    const restore = async () => {
      const result = await fetchHumanPresenceState({
        token: saved.token,
        signal: controller.signal,
      });

      if (cancelled) return;

      if (result.ok && result.data?.request) {
        applyHumanState(result.data);
      } else if (result.status === 403) {
        clearHumanAccessToken();
        humanTokenRef.current = null;
      }
    };

    void restore();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [applyHumanState]);

  // Bounded, server-mediated realtime. Polling stops as soon as the request
  // is settled, pauses while the tab is hidden and never has overlapping
  // in-flight requests.
  useEffect(() => {
    const status = humanPresence?.status;

    if (status !== 'pending' && status !== 'active') return;

    let cancelled = false;
    let timer: number | null = null;
    let run: () => Promise<void> = async () => undefined;

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        void run();
      }, delay);
    };

    run = async () => {
      if (cancelled) return;

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        schedule(5000);
        return;
      }

      if (humanPollInFlightRef.current) {
        schedule(1000);
        return;
      }

      humanPollInFlightRef.current = true;

      try {
        const afterSequence = messagesRef.current.reduce(
          (max, message) =>
            typeof message.sequence === 'number' && message.sequence > max ? message.sequence : max,
          0
        );

        const result = await fetchHumanPresenceState({
          token: humanTokenRef.current,
          conversationId: getPierrotConversationId(),
          sessionId: getPierrotSessionId(),
          afterSequence: afterSequence > 0 ? afterSequence : undefined,
        });

        if (!cancelled && result.ok && result.data) {
          applyHumanState(result.data);
        } else if (!cancelled && result.status === 403) {
          const lostKey = `${humanPresence?.requestId ?? 'unknown'}:lost`;

          if (humanNoticeRef.current !== lostKey) {
            humanNoticeRef.current = lostKey;
            clearHumanAccessToken();
            humanTokenRef.current = null;
            setHumanState(null);
            appendHumanNotice(getHumanCopy(humanLanguage()).sessionLost);
          }
        }
      } finally {
        humanPollInFlightRef.current = false;

        if (!cancelled) {
          schedule(status === 'active' ? 2000 : 4500);
        }
      }
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (timer) window.clearTimeout(timer);
        void run();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    schedule(1200);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [
    appendHumanNotice,
    applyHumanState,
    humanLanguage,
    humanPresence?.requestId,
    humanPresence?.status,
    setHumanState,
  ]);

  useEffect(() => {
    if (mode === 'modal') {
      setHasUnread(false);
    }
  }, [mode]);

  const updatePendingNavigation = useCallback((proposal: PierrotNavigationProposal | null) => {
    pendingNavigationRef.current = proposal;
    setPendingNavigation(proposal);

    if (proposal) {
      trackPierrotEvent('navigation_proposed', proposal.id, {
        section_id: proposal.sectionId,
      });
    }
  }, []);

  const openChat = useCallback(() => {
    setMode('modal');
  }, []);

  const openConversation = useCallback(() => {
    setMode('modal');
  }, []);

  useEffect(() => {
    try {
      if (isBrainUnlocked) {
        window.sessionStorage.setItem(BRAIN_UNLOCK_STORAGE_KEY, '1');
      } else {
        window.sessionStorage.removeItem(BRAIN_UNLOCK_STORAGE_KEY);
      }
    } catch {
      // Ignore unavailable session storage.
    }
  }, [isBrainUnlocked]);

  const currentBrainLanguage = useCallback((): BrainLanguage => {
    const lastUserMessage = [...messagesRef.current]
      .reverse()
      .find((message) => message.role === 'user');
    const detected = detectPierrotLanguage(lastUserMessage?.content || '');

    if (detected !== 'und') return detected;

    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) {
      return 'ru';
    }

    return 'en';
  }, []);

  const artEngineLanguage = useCallback(
    (text: string): ArtEngineModeLanguage => {
      if (/[а-яё]/i.test(text)) return 'ru';
      if (/[a-z]/i.test(text)) return 'en';
      return currentBrainLanguage();
    },
    [currentBrainLanguage]
  );

  const appendBrainExamples = useCallback(
    (languageOverride?: BrainLanguage) => {
      const language = languageOverride ?? currentBrainLanguage();

      appendMessage({
        role: 'assistant',
        content: getBrainIntroText(language),
        actions: getBrainExampleQuestions(language).map((question) => ({
          kind: 'prompt' as const,
          label: question.label,
          prompt: question.prompt,
        })),
        meta: { kind: 'chat' },
      });
    },
    [appendMessage, currentBrainLanguage]
  );

  const toggleUnframedMode = useCallback(() => {
    if (humanPresenceRef.current?.status === 'active') return;
    if (!canUseUnframedMode || !isBrainUnlocked) return;

    setHasChosenUnframedMode(true);

    if (isUnframedMode) {
      setIsUnframedMode(false);
      return;
    }

    cancelOnboarding();
    setIsUnframedMode(true);
    appendBrainExamples();
  }, [appendBrainExamples, cancelOnboarding, canUseUnframedMode, isBrainUnlocked, isUnframedMode]);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!canUseUnframedMode) {
      setIsUnframedMode(false);
      setIsBrainUnlocked(false);
      setHasChosenUnframedMode(false);
      return;
    }

    // The owner's Brain is available by default. No activation phrase is
    // required; the toggle is only for explicitly turning it off or on.
    setIsBrainUnlocked(true);

    if (!hasChosenUnframedMode) setIsUnframedMode(true);
  }, [canUseUnframedMode, hasChosenUnframedMode, isAuthLoading]);

  const toggleConversation = useCallback(() => {
    setMode((current) => (current === 'modal' ? 'site' : 'modal'));
  }, []);

  const closeConversation = useCallback(() => {
    setMode('site');
  }, []);

  const closeChat = useCallback(() => {
    setMode((current) => (current === 'modal' ? 'site' : current));
  }, []);

  const stopGeneration = useCallback(() => {
    abortReasonRef.current = 'user';
    abortControllerRef.current?.abort();
  }, []);

  const updateDraft = useCallback((value: string, caret: number | null = null) => {
    setDraft(value);
    setDraftCaret(caret);
  }, []);

  const enterArtEngineMode = useCallback(
    (languageOverride?: ArtEngineModeLanguage) => {
      const language = languageOverride ?? currentBrainLanguage();

      setIsArtEngineMode(true);
      appendMessage({
        role: 'assistant',
        content: getArtEngineModeText(language, 'enter'),
        meta: { kind: 'chat' },
      });
    },
    [appendMessage, currentBrainLanguage]
  );

  const exitArtEngineMode = useCallback(
    (text?: string) => {
      if (!isArtEngineMode) return;

      const language: ArtEngineModeLanguage = text
        ? artEngineLanguage(text)
        : currentBrainLanguage();

      if (text) {
        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'chat' },
        });
      }

      setIsArtEngineMode(false);
      appendMessage({
        role: 'assistant',
        content: getArtEngineModeText(language, 'exit'),
        meta: { kind: 'chat' },
      });
    },
    [appendMessage, artEngineLanguage, currentBrainLanguage, isArtEngineMode]
  );

  const tryExitArtEngineMode = useCallback(
    (text: string) => {
      if (!isArtEngineMode || !isArtEngineExitCommand(text)) return false;

      exitArtEngineMode(text);
      return true;
    },
    [exitArtEngineMode, isArtEngineMode]
  );

  const executeNavigation = useCallback(
    (proposal: PierrotNavigationProposal) => {
      if (navigationLockRef.current) return;

      navigationLockRef.current = proposal.id;
      navigationTargetRef.current = proposal.route;
      updatePendingNavigation(null);

      try {
        const record = createNavigationRecord(proposal);
        window.sessionStorage.setItem(ARRIVAL_STORAGE_KEY, JSON.stringify(record));
      } catch {
        // Navigation still works without persistence; only the arrival
        // message could be missed.
      }

      trackPierrotEvent('navigation_completed', proposal.id, {
        section_id: proposal.sectionId,
      });

      setMode('site');
      router.push(proposal.route);

      window.setTimeout(() => {
        if (navigationLockRef.current === proposal.id) {
          navigationLockRef.current = null;
        }
      }, 5000);
    },
    [router, updatePendingNavigation]
  );

  const navigateToSection = useCallback(
    (sectionId: PierrotSectionId) => {
      const current = pendingNavigationRef.current;

      if (current && current.sectionId === sectionId) {
        executeNavigation(current);
        return;
      }

      executeNavigation(createNavigationProposal(sectionId));
    },
    [executeNavigation]
  );

  const introduceSection = useCallback(
    (sectionId: PierrotSectionId, addUserMessage: boolean) => {
      const section = getPierrotSection(sectionId);

      if (!section) return;

      openConversation();

      const alreadyIntroduced = messagesRef.current.some(
        (message) => message.meta?.kind === 'section-intro' && message.meta.sectionId === sectionId
      );

      if (alreadyIntroduced) {
        updatePendingNavigation(createNavigationProposal(sectionId));
        return;
      }

      if (introTimersRef.current[sectionId]) return;

      if (addUserMessage) {
        appendMessage({
          role: 'user',
          content: section.triggerText,
          meta: { kind: 'section-trigger', sectionId },
        });
      }

      introTimersRef.current[sectionId] = window.setTimeout(() => {
        delete introTimersRef.current[sectionId];

        const introducedMeanwhile = messagesRef.current.some(
          (message) =>
            message.meta?.kind === 'section-intro' && message.meta.sectionId === sectionId
        );

        if (!introducedMeanwhile) {
          appendMessage({
            role: 'assistant',
            content: section.intro,
            actions: [
              {
                kind: 'navigate',
                label: section.actionLabel,
                sectionId,
              },
              {
                kind: 'prompt',
                label: 'Tell me more',
                prompt: section.followUpPrompt,
              },
            ],
            meta: { kind: 'section-intro', sectionId },
          });
        }

        updatePendingNavigation(createNavigationProposal(sectionId));
      }, INTRO_DELAY_MS);
    },
    [appendMessage, openConversation, updatePendingNavigation]
  );

  const exploreSection = useCallback(
    (sectionId: PierrotSectionId) => {
      if (humanPresenceRef.current?.status === 'active') {
        openConversation();
        return;
      }

      cancelOnboarding();
      introduceSection(sectionId, true);
    },
    [cancelOnboarding, introduceSection, openConversation]
  );

  const sendHumanModeMessage = useCallback(
    async (text: string, existing?: { id: string; createdAt?: string }) => {
      const trimmed = text.trim();

      if (!trimmed) return;

      const copy = getHumanCopy(humanLanguage());

      if (trimmed.length > HUMAN_MAX_MESSAGE_LENGTH) {
        appendHumanNotice(copy.sendFailed);
        return;
      }

      const messageId = existing?.id ?? createPierrotId();
      const createdAt = existing?.createdAt ?? new Date().toISOString();

      if (existing) {
        updateMessage(messageId, { delivery: 'sending' });
      } else {
        appendMessage({
          id: messageId,
          role: 'user',
          author: 'visitor',
          content: trimmed,
          createdAt,
          delivery: 'sending',
          meta: { kind: 'chat' },
        });
      }

      setDraft('');
      setDraftCaret(0);

      const result = await sendHumanPresenceMessage({
        token: humanTokenRef.current,
        conversationId: getPierrotConversationId(),
        sessionId: getPierrotSessionId(),
        messageId,
        content: trimmed,
      });

      if (result.ok && result.data) {
        updateMessage(messageId, {
          delivery: result.data.delivery,
          createdAt: result.data.message.createdAt ?? createdAt,
          sequence: result.data.message.sequence,
        });
        setHumanState(result.data.request);
        return;
      }

      updateMessage(messageId, { delivery: 'failed' });

      if (result.status === 409 && result.data) {
        const state = result.data as unknown as HumanPresenceStateResponse;

        if (state.request) {
          applyHumanState(state);
          return;
        }
      }

      if (result.status === 403) {
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        appendHumanNotice(copy.sessionLost);
        return;
      }

      appendHumanNotice(copy.sendFailed);
    },
    [appendHumanNotice, appendMessage, applyHumanState, humanLanguage, setHumanState, updateMessage]
  );

  const cancelHumanRequest = useCallback(async () => {
    const current = humanPresenceRef.current;

    if (!current || current.status !== 'pending') return;

    const result = await humanPresenceAction({
      token: humanTokenRef.current,
      conversationId: getPierrotConversationId(),
      sessionId: getPierrotSessionId(),
      action: 'cancel',
    });

    if (result.ok && result.data) {
      // The request may have been accepted between the click and this call.
      // applyHumanState enters human mode in that case instead of pretending
      // the visitor cancelled a live conversation.
      applyHumanState(result.data);
      return;
    }

    if (result.status === 403) {
      clearHumanAccessToken();
      humanTokenRef.current = null;
      setHumanState(null);
      appendHumanNotice(getHumanCopy(humanLanguage()).sessionLost);
    }
  }, [appendHumanNotice, applyHumanState, humanLanguage, setHumanState]);

  const closeHumanConversation = useCallback(async () => {
    const current = humanPresenceRef.current;

    if (!current || current.status !== 'active') return;

    const result = await humanPresenceAction({
      token: humanTokenRef.current,
      conversationId: getPierrotConversationId(),
      sessionId: getPierrotSessionId(),
      action: 'close',
    });

    if (result.ok && result.data) {
      applyHumanState(result.data);
      return;
    }

    if (result.status === 403) {
      clearHumanAccessToken();
      humanTokenRef.current = null;
      setHumanState(null);
      appendHumanNotice(getHumanCopy(humanLanguage()).sessionLost);
    }
  }, [appendHumanNotice, applyHumanState, humanLanguage, setHumanState]);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();

      if (!text) return;

      cancelOnboarding();

      // Human mode bypasses navigation/AI/brain shortcuts. Anton receives the
      // words exactly as typed.
      if (humanPresenceRef.current?.status === 'active') {
        await sendHumanModeMessage(text);
        return;
      }

      if (pendingNavigationRef.current && isNavigationConfirmation(text)) {
        const proposal = pendingNavigationRef.current;

        requestIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        loadingRef.current = false;
        setIsLoading(false);

        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'chat' },
        });
        setDraft('');
        setDraftCaret(0);
        executeNavigation(proposal);
        return;
      }

      if (loadingRef.current) return;

      // A correction/repeat after an ignored Art Engine command must execute
      // the unresolved client action, not send a fresh generic prompt.
      if (!isArtEngineMode) {
        const recoveredArtEngine = recoverArtEngineAction(
          text,
          messagesRef.current.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
          })),
          artEngineLanguage(text)
        );

        if (recoveredArtEngine) {
          appendMessage({
            role: 'user',
            content: text,
            meta: { kind: 'chat' },
          });
          setDraft('');
          setDraftCaret(0);
          enterArtEngineMode(artEngineLanguage(text));
          return;
        }
      }

      const artEngineCommand = detectArtEngineModeCommand(text);

      if (artEngineCommand === 'enter' && !isArtEngineMode) {
        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'chat' },
        });
        setDraft('');
        setDraftCaret(0);

        enterArtEngineMode(artEngineLanguage(text));
        return;
      }

      if (artEngineCommand === 'exit' && isArtEngineMode) {
        exitArtEngineMode(text);
        setDraft('');
        setDraftCaret(0);
        return;
      }

      if (canUseUnframedMode && isBrainActivationPhrase(text)) {
        const detected = detectPierrotLanguage(text);
        const language: BrainLanguage = detected === 'und' ? currentBrainLanguage() : detected;

        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'chat' },
        });
        setDraft('');
        setDraftCaret(0);
        setIsBrainUnlocked(true);

        if (isUnframedMode) {
          appendBrainExamples(language);
        } else {
          appendMessage({
            role: 'assistant',
            content: getBrainAvailableText(language),
            meta: { kind: 'chat' },
          });
        }

        return;
      }

      const typedSection = findSectionByPrompt(text);

      if (typedSection) {
        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'section-trigger', sectionId: typedSection.id },
        });
        setDraft('');
        setDraftCaret(0);
        introduceSection(typedSection.id, false);
        return;
      }

      abortControllerRef.current?.abort();
      abortReasonRef.current = null;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestId = ++requestIdRef.current;
      let timedOut = false;
      let streamMessageId: string | null = null;
      let streamedText = '';
      let flushStreamDelta: (() => void) | null = null;

      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        abortReasonRef.current = 'timeout';
        controller.abort();
      }, STREAM_TIMEOUT_MS);

      const previousMessages = messagesRef.current;
      const userMessage: PierrotMessage = {
        id: createPierrotId(),
        role: 'user',
        author: 'visitor',
        content: text,
        createdAt: new Date().toISOString(),
        meta: { kind: 'chat' },
      };

      loadingRef.current = true;
      setDraft('');
      setDraftCaret(0);
      appendMessage(userMessage);
      setIsLoading(true);

      try {
        const telegramInitData =
          typeof window !== 'undefined'
            ? (
                window as Window & {
                  Telegram?: { WebApp?: { initData?: string } };
                }
              ).Telegram?.WebApp?.initData
            : '';

        const response = await fetch('/api/pierrot-web', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(telegramInitData ? { 'x-telegram-init-data': String(telegramInitData) } : {}),
          },
          body: JSON.stringify({
            message: text,
            stream: true,
            ...(hasChosenUnframedMode ? { mode: isUnframedMode ? 'unframed' : 'site' } : {}),
            conversationId: getPierrotConversationId(),
            sessionId: getPierrotSessionId(),
            visitorId: getPierrotVisitorId(),
            userMessageId: userMessage.id,
            consent: getPierrotConsent(),
            context: {
              pathname,
              referrer: typeof document !== 'undefined' ? document.referrer : undefined,
            },
            history: previousMessages
              .filter(
                (message) =>
                  !message.error &&
                  !message.interrupted &&
                  !message.streaming &&
                  (message.role === 'user' ||
                    message.role === 'assistant' ||
                    message.role === 'human')
              )
              .map(({ role, content, offerId, commercialMarker }) => ({
                // Anton's human turns become assistant context so Piero can
                // resume coherently after a closed takeover.
                role: role === 'human' ? 'assistant' : role,
                content,
                ...(offerId ? { offerId } : {}),
                ...(commercialMarker ? { commercialMarker } : {}),
              })),
          }),
          signal: controller.signal,
        });

        const contentType = response.headers?.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          const streamId = `stream-${requestId}-${Date.now()}`;
          streamMessageId = streamId;

          appendMessage({
            id: streamId,
            role: 'assistant',
            author: 'pierrot',
            content: '',
            createdAt: new Date().toISOString(),
            streaming: true,
            meta: { kind: 'chat' },
          });

          let pending = '';
          let frame: number | null = null;

          const commitChunk = (chunk: string) => {
            if (!chunk) return;

            // Track the partial answer synchronously. React state updates are
            // batched, but an error/abort handler must know whether any text
            // reached the visitor before deciding to keep or remove the turn.
            streamedText += chunk;

            setMessages((current) => {
              const next = current.map((message) =>
                message.id === streamId
                  ? { ...message, content: message.content + chunk, streaming: true }
                  : message
              );
              messagesRef.current = next;
              return next;
            });
          };

          flushStreamDelta = () => {
            if (frame !== null) {
              window.cancelAnimationFrame(frame);
              frame = null;
            }

            const chunk = pending;
            pending = '';
            commitChunk(chunk);
          };

          const streamState: {
            completed: Record<string, unknown> | null;
            error: {
              error: string;
              code: string;
              retryAfter?: number;
              retryable?: boolean;
              interrupted?: boolean;
            } | null;
          } = { completed: null, error: null };

          try {
            await consumePierrotEventStream(response, {
              onAccepted: (event) => {
                if (requestIdRef.current !== requestId) return;
                setPierrotConversationId(event.conversationId);
                setPierrotSessionId(event.sessionId);
              },
              onDelta: (chunk) => {
                if (requestIdRef.current !== requestId) return;

                pending += chunk;

                if (frame !== null) return;

                // Batch provider deltas into one paint. The final `completed`
                // payload still replaces this partial text, so an interrupted
                // answer can never be mistaken for a persisted one.
                frame = window.requestAnimationFrame(() => {
                  frame = null;
                  const buffered = pending;
                  pending = '';
                  commitChunk(buffered);
                });
              },
              onCompleted: (payload) => {
                streamState.completed = payload;
              },
              onError: (event) => {
                streamState.error = event;
              },
            });
          } finally {
            if (frame !== null) {
              window.cancelAnimationFrame(frame);
              frame = null;
            }
          }

          if (requestIdRef.current !== requestId) return;

          if (streamState.error) {
            flushStreamDelta();

            const failure = new Error(
              streamState.error.error || 'The response stream failed.'
            ) as Error & {
              code?: string;
              retryAfter?: number;
              retryable?: boolean;
              interrupted?: boolean;
            };
            failure.name = 'PierrotStreamError';
            failure.code = streamState.error.code;
            failure.retryAfter = streamState.error.retryAfter;
            failure.interrupted = streamState.error.interrupted;
            throw failure;
          }

          if (!streamState.completed) {
            flushStreamDelta();
            throw new PierrotStreamProtocolError('stream_ended_before_completion');
          }

          const streamed = streamState.completed as PierrotWebResponse;

          if (!response.ok) {
            const requestError = new Error(
              typeof streamed.error === 'string' && streamed.error
                ? streamed.error
                : `Request failed with status ${response.status}`
            ) as Error & { code?: string | null; status?: number; retryAfter?: number };

            requestError.name = 'PierrotHttpError';
            requestError.code = normalizePierrotErrorCode(streamed.code);
            requestError.status = response.status;
            requestError.retryAfter =
              typeof streamed.retryAfter === 'number' ? streamed.retryAfter : undefined;

            throw requestError;
          }

          if (typeof streamed.conversationId === 'string') {
            setPierrotConversationId(streamed.conversationId);
          }

          if (typeof streamed.sessionId === 'string') {
            setPierrotSessionId(streamed.sessionId);
          }

          if (
            streamed.human &&
            typeof streamed.human === 'object' &&
            isHumanRequestStatus((streamed.human as Record<string, unknown>).status)
          ) {
            const humanState = streamed.human as HumanPresencePublicState;

            if (
              typeof streamed.humanToken === 'string' &&
              typeof humanState.requestId === 'string'
            ) {
              humanTokenRef.current = streamed.humanToken;
              saveHumanAccessToken(streamed.humanToken, humanState.requestId);
            }

            applyHumanState({
              request: humanState,
              session: null,
              conversationId:
                typeof streamed.conversationId === 'string'
                  ? streamed.conversationId
                  : getPierrotConversationId(),
              sessionId: typeof streamed.sessionId === 'string' ? streamed.sessionId : null,
              messages: [],
              serverTime: new Date().toISOString(),
            });
          }

          setIsAdminSession(streamed.admin === true);

          if (typeof streamed.reply !== 'string' || !streamed.reply.trim()) {
            const emptyError = new Error('Pierrot returned no readable answer.') as Error & {
              code?: string;
            };
            emptyError.name = 'PierrotEmptyResponse';
            emptyError.code = 'INVALID_RESPONSE';
            throw emptyError;
          }

          // The completed payload is authoritative. Replacing the placeholder
          // keeps one assistant turn in the transcript and uses the server id
          // that answer feedback and retrieval analytics expect.
          replaceMessage(streamId, buildAssistantMessage(streamed, streamId));
          return;
        }

        const data = (await response.json().catch(() => null)) as PierrotWebResponse | null;

        // The server refuses to run the AI while Anton is present. Switch the
        // same message into the human transport instead of showing an error.
        if (response.status === 409 && data?.humanMode === true) {
          const serverHuman =
            data.human &&
            typeof data.human === 'object' &&
            isHumanRequestStatus((data.human as Record<string, unknown>).status)
              ? (data.human as HumanPresencePublicState)
              : null;

          if (serverHuman) {
            applyHumanState({
              request: serverHuman,
              session: null,
              conversationId:
                typeof data.conversationId === 'string'
                  ? data.conversationId
                  : getPierrotConversationId(),
              sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
              messages: [],
              serverTime: new Date().toISOString(),
            });

            await sendHumanModeMessage(text, {
              id: userMessage.id,
              createdAt: userMessage.createdAt,
            });
            return;
          }
        }

        if (!response.ok) {
          const requestError = new Error(
            typeof data?.error === 'string' && data.error
              ? data.error
              : `Request failed with status ${response.status}`
          ) as Error & { code?: string | null; status?: number; retryAfter?: number };

          requestError.name = 'PierrotHttpError';
          requestError.code = normalizePierrotErrorCode(data?.code);
          requestError.status = response.status;
          requestError.retryAfter =
            typeof data?.retryAfter === 'number' ? data.retryAfter : undefined;

          throw requestError;
        }

        if (requestIdRef.current !== requestId) return;

        if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
          const emptyError = new Error('Pierrot returned no readable answer.') as Error & {
            code?: string;
          };
          emptyError.name = 'PierrotEmptyResponse';
          emptyError.code = 'INVALID_RESPONSE';
          throw emptyError;
        }

        if (typeof data.conversationId === 'string') {
          setPierrotConversationId(data.conversationId);
        }

        if (typeof data.sessionId === 'string') {
          setPierrotSessionId(data.sessionId);
        }

        if (
          data.human &&
          typeof data.human === 'object' &&
          isHumanRequestStatus((data.human as Record<string, unknown>).status)
        ) {
          const humanState = data.human as HumanPresencePublicState;

          if (typeof data.humanToken === 'string' && typeof humanState.requestId === 'string') {
            humanTokenRef.current = data.humanToken;
            saveHumanAccessToken(data.humanToken, humanState.requestId);
          }

          applyHumanState({
            request: humanState,
            session: null,
            conversationId:
              typeof data.conversationId === 'string'
                ? data.conversationId
                : getPierrotConversationId(),
            sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
            messages: [],
            serverTime: new Date().toISOString(),
          });
        }

        setIsAdminSession(data.admin === true);
        appendMessage(buildAssistantMessage(data, createPierrotId()));
      } catch (error: unknown) {
        if (requestIdRef.current !== requestId) return;

        const isAbort = error instanceof Error && error.name === 'AbortError';
        const stoppedByVisitor = isAbort && abortReasonRef.current === 'user' && !timedOut;

        // Flush any buffered deltas so a partial answer is not silently lost.
        flushStreamDelta?.();

        const streamedMessage = streamMessageId
          ? messagesRef.current.find((message) => message.id === streamMessageId)
          : null;
        const partialText = (streamedText || streamedMessage?.content || '').trim();

        if (stoppedByVisitor) {
          if (streamMessageId && partialText) {
            replaceMessage(streamMessageId, {
              ...(streamedMessage || {
                id: streamMessageId,
                role: 'assistant',
                author: 'pierrot',
                createdAt: new Date().toISOString(),
                meta: { kind: 'chat' },
              }),
              content: partialText,
              streaming: false,
              interrupted: true,
            });
          } else if (streamMessageId) {
            removeMessage(streamMessageId);
          }

          return;
        }

        if (streamMessageId && partialText) {
          // Keep what actually arrived, mark it as incomplete, and never
          // pretend it was persisted as a finished assistant turn.
          replaceMessage(streamMessageId, {
            ...(streamedMessage || {
              id: streamMessageId,
              role: 'assistant',
              author: 'pierrot',
              createdAt: new Date().toISOString(),
              meta: { kind: 'chat' },
            }),
            content: partialText,
            streaming: false,
            interrupted: true,
          });
          return;
        }

        if (streamMessageId) removeMessage(streamMessageId);

        const typedError = error as {
          code?: string | null;
          status?: number;
          retryAfter?: number;
        };
        const status = typedError.status;
        let code = normalizePierrotErrorCode(typedError.code);

        if (!code && timedOut) code = 'AI_TIMEOUT';
        if (!code && isAbort) code = 'NETWORK_ERROR';
        if (!code && error instanceof PierrotStreamProtocolError) code = 'INVALID_RESPONSE';
        if (!code && typeof status === 'number') {
          code =
            status === 429
              ? 'AI_RATE_LIMITED'
              : status === 504
                ? 'AI_TIMEOUT'
                : status >= 500
                  ? 'AI_UNAVAILABLE'
                  : 'AI_FAILED';
        }
        if (!code) code = 'NETWORK_ERROR';

        const language: PierrotErrorLanguage = humanLanguage() === 'en' ? 'en' : 'ru';

        console.warn('[Pierrot] Chat request failed', {
          status: typeof status === 'number' ? status : 0,
          code,
        });

        appendMessage({
          role: 'assistant',
          author: 'pierrot',
          content: pierrotErrorCopy(language, code),
          createdAt: new Date().toISOString(),
          error: true,
          meta: { kind: 'chat' },
        });
      } finally {
        window.clearTimeout(timeoutId);

        if (requestIdRef.current === requestId) {
          loadingRef.current = false;
          setIsLoading(false);
          abortControllerRef.current = null;
          abortReasonRef.current = null;
        }
      }
    },
    [
      appendBrainExamples,
      appendMessage,
      applyHumanState,
      artEngineLanguage,
      canUseUnframedMode,
      cancelOnboarding,
      currentBrainLanguage,
      draft,
      enterArtEngineMode,
      executeNavigation,
      exitArtEngineMode,
      hasChosenUnframedMode,
      humanLanguage,
      introduceSection,
      isArtEngineMode,
      isUnframedMode,
      pathname,
      removeMessage,
      replaceMessage,
      sendHumanModeMessage,
    ]
  );

  const runAction = useCallback(
    (action: PierrotChatAction) => {
      cancelOnboarding();
      trackPierrotEvent('action_clicked', createPierrotId(), {
        action_kind: action.kind,
        ...(action.kind === 'navigate' ? { section_id: action.sectionId } : {}),
        label_length: action.label.length,
      });

      if (action.kind === 'navigate') {
        navigateToSection(action.sectionId);
        return;
      }

      void sendMessage(action.prompt);
    },
    [cancelOnboarding, navigateToSection, sendMessage]
  );

  const clearChat = useCallback(
    (reason: 'new_chat' | 'user_closed' = 'new_chat') => {
      cancelOnboarding();

      const currentHuman = humanPresenceRef.current;

      if (currentHuman && (currentHuman.status === 'active' || currentHuman.status === 'pending')) {
        const token = humanTokenRef.current;
        const conversationIdAtClear = getPierrotConversationId();
        const sessionIdAtClear = getPierrotSessionId();

        void (async () => {
          const first = await humanPresenceAction({
            token,
            conversationId: conversationIdAtClear,
            sessionId: sessionIdAtClear,
            action: currentHuman.status === 'active' ? 'close' : 'cancel',
          });

          // A pending request may have been accepted in the same instant the
          // visitor started a new chat. Close that new live session instead
          // of leaving Anton talking to an abandoned conversation.
          if (
            currentHuman.status === 'pending' &&
            first.ok &&
            first.data?.request?.status === 'active'
          ) {
            await humanPresenceAction({
              token,
              conversationId: conversationIdAtClear,
              sessionId: sessionIdAtClear,
              action: 'close',
            });
          }
        })().catch(() => undefined);
      }

      clearHumanAccessToken();
      humanTokenRef.current = null;
      humanNoticeRef.current = null;
      setHumanState(null);

      endPierrotConversation(reason);
      rotatePierrotConversationId();

      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      loadingRef.current = false;

      Object.values(introTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      introTimersRef.current = {};

      setMessages([]);
      messagesRef.current = [];
      setDraft('');
      setDraftCaret(0);
      setIsLoading(false);
      setIsAdminSession(false);
      setIsUnframedMode(canUseUnframedMode);
      setHasChosenUnframedMode(false);
      setIsArtEngineMode(false);
      updatePendingNavigation(null);

      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
      } catch {
        // Ignore storage errors.
      }
    },
    [canUseUnframedMode, cancelOnboarding, setHumanState, updatePendingNavigation]
  );

  // Conversation history lives in sessionStorage and is shared by every tab
  // session. When the authenticated identity changes (sign-in, sign-out or a
  // different account), drop the previous identity's transcript and owner-only
  // state instead of showing them to the next user.
  useEffect(() => {
    if (isAuthLoading) return;

    const userId = authUser?.id ?? null;

    if (lastAuthUserIdRef.current === undefined) {
      lastAuthUserIdRef.current = userId;
      return;
    }

    if (lastAuthUserIdRef.current === userId) return;

    lastAuthUserIdRef.current = userId;
    // Do not let the next anonymous user of this browser profile inherit the
    // previous authenticated identity's visitor history.
    rotatePierrotVisitorId();
    clearChat('user_closed');
  }, [authUser?.id, clearChat, isAuthLoading]);

  useEffect(() => {
    if (!navigationTargetRef.current) return;

    if (normalizePathname(pathname) === normalizePathname(navigationTargetRef.current)) {
      navigationLockRef.current = null;
      navigationTargetRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    setMode((current) => (current === 'modal' ? 'site' : current));
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raw: string | null = null;

    try {
      raw = window.sessionStorage.getItem(ARRIVAL_STORAGE_KEY);
    } catch {
      return;
    }

    const record = parseNavigationRecord(raw);

    if (!record) {
      if (raw) {
        try {
          window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
        } catch {
          // Ignore storage errors.
        }
      }
      return;
    }

    if (record.arrivalDelivered) return;

    if (Date.now() - record.createdAt > 5 * 60 * 1000) {
      try {
        window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
      } catch {
        // Ignore storage errors.
      }
      return;
    }

    if (normalizePathname(pathname) !== normalizePathname(record.route)) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        ARRIVAL_STORAGE_KEY,
        JSON.stringify({ ...record, arrivalDelivered: true })
      );
    } catch {
      // Continue; the in-memory dedupe below still protects this render.
    }

    const alreadyDelivered = messagesRef.current.some(
      (message) => message.meta?.kind === 'arrival' && message.meta.navigationId === record.id
    );

    if (alreadyDelivered) return;

    const section = PIERROT_SECTIONS[record.sectionId];

    appendMessage({
      role: 'assistant',
      content: section.arrival.content,
      links: section.arrival.links,
      meta: {
        kind: 'arrival',
        sectionId: record.sectionId,
        navigationId: record.id,
      },
    });
  }, [appendMessage, pathname]);

  const value: PierrotContextValue = {
    messages,
    mode,
    hasUnread,
    draft,
    draftCaret,
    isOpen,
    isLoading,
    isAdminSession,
    isUnframedMode,
    canUseUnframedMode,
    canShowBrainMode,
    isArtEngineMode,
    humanPresence,
    isHumanActive: humanPresence?.status === 'active',
    isHumanPending: humanPresence?.status === 'pending',
    pendingNavigation,
    openChat,
    openConversation,
    toggleConversation,
    toggleUnframedMode,
    exitArtEngineMode,
    tryExitArtEngineMode,
    closeConversation,
    closeChat,
    updateDraft,
    sendMessage,
    clearChat,
    exploreSection,
    runAction,
    cancelHumanRequest,
    closeHumanConversation,
    stopGeneration,
  };

  return <PierrotContext.Provider value={value}>{children}</PierrotContext.Provider>;
}
