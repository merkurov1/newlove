'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import type { UnframedEvidenceSource } from '@/lib/knowledge/rag/evidence';
import type { RagRetrievalOutcome } from '@/lib/knowledge/rag/types';
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
  rotatePierrotConversationId,
  setPierrotConversationId,
  setPierrotSessionId,
  trackPierrotEvent,
} from '@/lib/pierrot/clientTelemetry';
import { detectPierrotLanguage } from '@/lib/pierrot/conversation';
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
  hasSavedHumanAccessToken,
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
  author?: 'visitor' | 'pierrot' | 'anton' | 'system';
  createdAt?: string;
  delivery?: PierrotDeliveryState;
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
  humanPresence: HumanPresencePublicState | null;
  isHumanActive: boolean;
  isHumanPending: boolean;
  pendingNavigation: PierrotNavigationProposal | null;
  openChat: () => void;
  openConversation: () => void;
  startConversation: () => void;
  toggleConversation: () => void;
  toggleUnframedMode: () => void;
  closeConversation: () => void;
  closeChat: () => void;
  updateDraft: (value: string, caret?: number | null) => void;
  sendMessage: (overrideText?: string) => Promise<void>;
  clearChat: (reason?: 'new_chat' | 'user_closed') => void;
  exploreSection: (sectionId: PierrotSectionId) => void;
  runAction: (action: PierrotChatAction) => void;
  cancelHumanRequest: () => Promise<void>;
  closeHumanConversation: () => Promise<void>;
};

const PierrotContext = createContext<PierrotContextValue | null>(null);

const STORAGE_KEY = 'pierrot_chat_history_v2';
const ARRIVAL_STORAGE_KEY = 'pierrot_navigation_arrival_v1';
const ONBOARDING_STORAGE_KEY = 'pierrot_onboarding_v1';
const BRAIN_UNLOCK_STORAGE_KEY = 'pierrot_brain_unlocked_v1';
const INTRO_DELAY_MS = 420;
const ONBOARDING_FIRST_NUDGE_MS = 10_000;
const ONBOARDING_SECOND_NUDGE_MS = 10_000;

const PIERROT_ONBOARDING_LINKS: PierrotMessageLink[] = [
  { label: 'Anton Merkurov', href: '/' },
  { label: 'Lobby', href: '/lobby' },
  { label: 'UNFRAMED', href: '/unframed' },
  { label: 'Flow', href: '/flow' },
  { label: 'Journal', href: '/journal' },
  { label: 'Art Engine', href: '/art-engine' },
  { label: 'Selection', href: '/selection' },
  { label: 'Heart & Angel', href: '/heartandangel' },
  { label: 'Temple', href: '/temple' },
];

function onboardingLanguage(): 'ru' | 'en' {
  if (typeof navigator === 'undefined') return 'ru';

  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function buildOnboardingSequence(): Array<Omit<PierrotMessage, 'id'>> {
  const ru = onboardingLanguage() === 'ru';

  return [
    {
      role: 'assistant',
      content: ru
        ? 'Привет! Я Пьеро, помощник Антона Меркурова.\nКак тебе помочь?'
        : 'Hello. I am Pierrot, Anton Merkurov’s assistant.\nHow can I help?',
      links: PIERROT_ONBOARDING_LINKS,
      meta: { kind: 'chat' },
    },
    {
      role: 'assistant',
      content: ru
        ? 'Что молчишь?\n\nЕсли скучно — почитай книгу.'
        : 'Still there?\n\nIf you are bored, read the book.',
      links: [{ label: 'UNFRAMED', href: '/unframed' }],
      meta: { kind: 'chat' },
    },
    {
      role: 'assistant',
      content: ru ? 'Мало любви? — купи открытку.' : 'Short of love? Buy a postcard.',
      links: [
        {
          label: ru ? 'Купить открытку' : 'Heart & Angel postcard',
          href: '/heartandangel/card#order',
        },
      ],
      meta: { kind: 'chat' },
    },
  ];
}

export function usePierrot(): PierrotContextValue {
  const context = useContext(PierrotContext);

  if (!context) {
    throw new Error('usePierrot must be used inside <PierrotProvider>');
  }

  return context;
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
      message.delivery === 'sending' ||
      message.delivery === 'sent' ||
      message.delivery === 'failed'
        ? message.delivery
        : undefined,
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
  const [humanRestorePending, setHumanRestorePending] = useState(() =>
    hasSavedHumanAccessToken()
  );
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
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const introTimersRef = useRef<Record<string, number>>({});
  const onboardingTimersRef = useRef<number[]>([]);
  const onboardingCancelledRef = useRef(false);
  const navigationLockRef = useRef<string | null>(null);
  const navigationTargetRef = useRef<string | null>(null);
  const startLockRef = useRef(false);
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
    (id: string, patch: Partial<Pick<PierrotMessage, 'delivery' | 'createdAt'>>) => {
      setMessages((current) => {
        const next = current.map((message) =>
          message.id === id ? { ...message, ...patch } : message
        );
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

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
    (text: string) => {
      appendMessage({
        role: 'system',
        author: 'system',
        content: text,
        createdAt: new Date().toISOString(),
        meta: { kind: 'chat' },
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

      setHumanState(request);

      if (payload.messages.length > 0) {
        setMessages((current) => {
          const ids = new Set(current.map((message) => message.id));
          let next = current;

          for (const incoming of payload.messages) {
            if (ids.has(incoming.id)) {
              next = next.map((message) =>
                message.id === incoming.id
                  ? {
                      ...message,
                      createdAt: incoming.createdAt ?? message.createdAt,
                      ...(message.role === 'user' ? { delivery: 'sent' as const } : {}),
                    }
                  : message
              );
              continue;
            }

            const role: PierrotMessageRole = incoming.role === 'human' ? 'human' : 'user';

            next = [
              ...next,
              {
                id: incoming.id,
                role,
                author: role === 'human' ? 'anton' : 'visitor',
                content: incoming.content,
                createdAt: incoming.createdAt ?? undefined,
                delivery: role === 'user' ? ('sent' as const) : undefined,
                meta: { kind: 'chat' },
              },
            ];
            ids.add(incoming.id);
          }

          messagesRef.current = next;
          return next;
        });
      }

      const noticeKey = `${request.requestId}:${request.status}`;

      if (humanNoticeRef.current === noticeKey) return;

      const copy = getHumanCopy(humanLanguage());

      if (request.status === 'active') {
        humanNoticeRef.current = noticeKey;
        appendHumanNotice(copy.here);
        return;
      }

      if (request.status === 'closed') {
        humanNoticeRef.current = noticeKey;
        appendHumanNotice(request.resolvedBy === 'visitor' ? copy.ended : copy.closed);
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        return;
      }

      if (request.status === 'declined') {
        humanNoticeRef.current = noticeKey;
        appendHumanNotice(
          request.resolvedBy === 'visitor' ? copy.cancelled : copy.declined
        );
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
        return;
      }

      if (request.status === 'expired') {
        humanNoticeRef.current = noticeKey;
        appendHumanNotice(copy.expired);
        clearHumanAccessToken();
        humanTokenRef.current = null;
        setHumanState(null);
      }
    },
    [appendHumanNotice, humanLanguage, setHumanState]
  );

  const cancelOnboarding = useCallback(() => {
    onboardingCancelledRef.current = true;

    onboardingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    onboardingTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let alreadyStarted = false;

    try {
      alreadyStarted = Boolean(window.sessionStorage.getItem(ONBOARDING_STORAGE_KEY));
    } catch {
      // Without storage, the in-memory guards still prevent a duplicate
      // greeting during this mount.
    }

    if (humanRestorePending) return;
    if (alreadyStarted || messagesRef.current.length > 0) return;

    try {
      window.sessionStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      // Onboarding still works for this page view.
    }

    const [greeting, firstNudge, secondNudge] = buildOnboardingSequence();

    appendMessage(greeting);

    onboardingTimersRef.current.push(
      window.setTimeout(() => {
        if (onboardingCancelledRef.current) return;
        if (messagesRef.current.some((message) => message.role === 'user')) return;

        appendMessage(firstNudge);

        onboardingTimersRef.current.push(
          window.setTimeout(() => {
            if (onboardingCancelledRef.current) return;
            if (messagesRef.current.some((message) => message.role === 'user')) return;

            appendMessage(secondNudge);
          }, ONBOARDING_SECOND_NUDGE_MS)
        );
      }, ONBOARDING_FIRST_NUDGE_MS)
    );

    return () => {
      onboardingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      onboardingTimersRef.current = [];
    };
  }, [appendMessage, humanRestorePending]);

  // Recover an active/pending human conversation after a full browser restart.
  // The recovery token is the only persistent credential; the server returns
  // the conversation/session ids only after validating its hash.
  useEffect(() => {
    const saved = loadHumanAccessToken();

    if (!saved) {
      setHumanRestorePending(false);
      return;
    }

    humanTokenRef.current = saved.token;
    let cancelled = false;

    const restore = async () => {
      const result = await fetchHumanPresenceState({ token: saved.token });

      if (cancelled) return;

      if (result.ok && result.data?.request) {
        applyHumanState(result.data);
      } else if (result.status === 403) {
        clearHumanAccessToken();
        humanTokenRef.current = null;
      }

      setHumanRestorePending(false);
    };

    void restore();

    return () => {
      cancelled = true;
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
        const result = await fetchHumanPresenceState({
          token: humanTokenRef.current,
          conversationId: getPierrotConversationId(),
          sessionId: getPierrotSessionId(),
        });

        if (!cancelled && result.ok && result.data) {
          applyHumanState(result.data);
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
  }, [applyHumanState, humanPresence?.requestId, humanPresence?.status]);

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

  const startConversation = useCallback(() => {
    if (startLockRef.current || messagesRef.current.length > 0) return;

    startLockRef.current = true;
    setMode('modal');

    appendMessage({
      role: 'user',
      content: 'Where should I start?',
      meta: { kind: 'chat' },
    });

    appendMessage({
      role: 'assistant',
      content:
        'Start with the [Lobby](/lobby) — it is the private office and the clearest way into the site. From there you can open [UNFRAMED](/unframed), the [Journal](/journal), the [Art Engine](/art-engine), or [Heart & Angel](/heartandangel).',
      actions: [
        { kind: 'navigate', label: 'Enter the Lobby', sectionId: 'lobby' },
        { kind: 'navigate', label: 'Open the Journal', sectionId: 'journal' },
      ],
      meta: { kind: 'chat' },
    });
  }, [appendMessage]);

  const toggleConversation = useCallback(() => {
    setMode((current) => (current === 'modal' ? 'site' : 'modal'));
  }, []);

  const closeConversation = useCallback(() => {
    setMode('site');
  }, []);

  const closeChat = useCallback(() => {
    setMode((current) => (current === 'modal' ? 'site' : current));
  }, []);

  const updateDraft = useCallback((value: string, caret: number | null = null) => {
    setDraft(value);
    setDraftCaret(caret);
  }, []);

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
      cancelOnboarding();
      introduceSection(sectionId, true);
    },
    [cancelOnboarding, introduceSection]
  );

  const sendHumanModeMessage = useCallback(
    async (
      text: string,
      existing?: { id: string; createdAt?: string }
    ) => {
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
    [
      appendHumanNotice,
      appendMessage,
      applyHumanState,
      humanLanguage,
      setHumanState,
      updateMessage,
    ]
  );

  const cancelHumanRequest = useCallback(async () => {
    const current = humanPresenceRef.current;

    if (!current || current.status !== 'pending') return;

    const copy = getHumanCopy(humanLanguage());
    humanNoticeRef.current = `${current.requestId}:declined`;

    const result = await humanPresenceAction({
      token: humanTokenRef.current,
      conversationId: getPierrotConversationId(),
      sessionId: getPierrotSessionId(),
      action: 'cancel',
    });

    if (result.ok) {
      clearHumanAccessToken();
      humanTokenRef.current = null;
      setHumanState(null);
      appendHumanNotice(copy.cancelled);
    }
  }, [appendHumanNotice, humanLanguage, setHumanState]);

  const closeHumanConversation = useCallback(async () => {
    const current = humanPresenceRef.current;

    if (!current || current.status !== 'active') return;

    const copy = getHumanCopy(humanLanguage());
    humanNoticeRef.current = `${current.requestId}:closed`;

    const result = await humanPresenceAction({
      token: humanTokenRef.current,
      conversationId: getPierrotConversationId(),
      sessionId: getPierrotSessionId(),
      action: 'close',
    });

    if (result.ok) {
      clearHumanAccessToken();
      humanTokenRef.current = null;
      setHumanState(null);
      appendHumanNotice(copy.ended);
    }
  }, [appendHumanNotice, humanLanguage, setHumanState]);

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

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestId = ++requestIdRef.current;
      let timedOut = false;

      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 35000);

      const previousMessages = messagesRef.current;
      const userMessage: PierrotMessage = {
        id: createPierrotId(),
        role: 'user',
        author: 'visitor',
        content: text,
        createdAt: new Date().toISOString(),
        delivery: 'sent',
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
            ...(telegramInitData ? { 'x-telegram-init-data': String(telegramInitData) } : {}),
          },
          body: JSON.stringify({
            message: text,
            ...(hasChosenUnframedMode ? { mode: isUnframedMode ? 'unframed' : 'site' } : {}),
            conversationId: getPierrotConversationId(),
            sessionId: getPierrotSessionId(),
            userMessageId: userMessage.id,
            consent: getPierrotConsent(),
            context: {
              pathname,
              referrer: typeof document !== 'undefined' ? document.referrer : undefined,
            },
            history: previousMessages
              .filter(
                (message) =>
                  message.role === 'user' ||
                  message.role === 'assistant' ||
                  message.role === 'human'
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

        const data = await response.json().catch(() => ({}));

        // The server refuses to run the AI while Anton is present. Switch the
        // same message into the human transport instead of showing an error.
        if (response.status === 409 && data?.humanMode) {
          const serverHuman =
            data.human && isHumanRequestStatus(data.human.status)
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
          throw new Error(data.error || `Error ${response.status}`);
        }

        if (requestIdRef.current !== requestId) return;

        setPierrotConversationId(data.conversationId);

        if (data.human && isHumanRequestStatus(data.human.status)) {
          if (
            typeof data.humanToken === 'string' &&
            typeof data.human.requestId === 'string'
          ) {
            humanTokenRef.current = data.humanToken;
            saveHumanAccessToken(data.humanToken, data.human.requestId);
          }

          applyHumanState({
            request: data.human as HumanPresencePublicState,
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

        const responseActions = Array.isArray(data.actions)
          ? data.actions
              .map((action: unknown) => normalizeAction(action))
              .filter(
                (action: PierrotChatAction | null): action is PierrotChatAction => action !== null
              )
          : [];
        const responseLinks = Array.isArray(data.links)
          ? data.links
              .map((link: unknown) => normalizeLink(link))
              .filter(
                (link: PierrotMessageLink | null): link is PierrotMessageLink => link !== null
              )
          : [];
        const responseCta = normalizePierrotOfferCta(data.cta);
        const responseMarker = normalizeCommercialMarker(data.commercialMarker);
        const ragPayload =
          data.rag && typeof data.rag === 'object' ? (data.rag as Record<string, unknown>) : null;
        const responseRagOutcome = normalizeRagOutcome(ragPayload?.outcome);
        const responseEvidence = Array.isArray(ragPayload?.sources)
          ? ragPayload.sources
              .map(normalizeEvidenceSource)
              .filter((source): source is UnframedEvidenceSource => source !== null)
          : [];

        appendMessage({
          role: 'assistant',
          content: data.reply || 'Silence.',
          provider: data.provider,
          actions: responseActions.length > 0 ? responseActions : undefined,
          links: responseLinks.length > 0 ? responseLinks : undefined,
          offerId:
            responseCta?.offerId ?? (isPierrotOfferId(data.offerId) ? data.offerId : undefined),
          cta: responseCta ?? undefined,
          commercialMarker: responseMarker,
          evidence: responseEvidence.length > 0 ? responseEvidence : undefined,
          ragOutcome: responseRagOutcome,
          meta: { kind: 'chat' },
        });
      } catch (error: unknown) {
        if (requestIdRef.current !== requestId) return;

        const isAbort = error instanceof Error && error.name === 'AbortError';

        if (isAbort && !timedOut) return;

        console.error('[Pierrot] Chat error:', error);

        appendMessage({
          role: 'assistant',
          content: timedOut
            ? 'The response is taking too long. Please try again.'
            : 'The connection was interrupted. Please try again.',
          meta: { kind: 'chat' },
        });
      } finally {
        window.clearTimeout(timeoutId);

        if (requestIdRef.current === requestId) {
          loadingRef.current = false;
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [
      appendBrainExamples,
      appendMessage,
      canUseUnframedMode,
      cancelOnboarding,
      currentBrainLanguage,
      draft,
      executeNavigation,
      introduceSection,
      isUnframedMode,
      pathname,
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
        void humanPresenceAction({
          token: humanTokenRef.current,
          conversationId: getPierrotConversationId(),
          sessionId: getPierrotSessionId(),
          action: currentHuman.status === 'active' ? 'close' : 'cancel',
        }).catch(() => undefined);
      }

      clearHumanAccessToken();
      humanTokenRef.current = null;
      humanNoticeRef.current = null;
      setHumanState(null);
      setHumanRestorePending(false);

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
      startLockRef.current = false;
      setDraft('');
      setDraftCaret(0);
      setIsLoading(false);
      setIsAdminSession(false);
      setIsUnframedMode(canUseUnframedMode);
      setHasChosenUnframedMode(false);
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
    humanPresence,
    isHumanActive: humanPresence?.status === 'active',
    isHumanPending: humanPresence?.status === 'pending',
    pendingNavigation,
    openChat,
    openConversation,
    startConversation,
    toggleConversation,
    toggleUnframedMode,
    closeConversation,
    closeChat,
    updateDraft,
    sendMessage,
    clearChat,
    exploreSection,
    runAction,
    cancelHumanRequest,
    closeHumanConversation,
  };

  return <PierrotContext.Provider value={value}>{children}</PierrotContext.Provider>;
}
