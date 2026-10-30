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
  trackPierrotEvent,
} from '@/lib/pierrot/clientTelemetry';
import { detectPierrotLanguage } from '@/lib/pierrot/conversation';
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

export type PierrotMessageMeta = {
  kind: PierrotMessageKind;
  sectionId?: PierrotSectionId;
  navigationId?: string;
};

export type PierrotMessage = {
  id: string;
  role: 'user' | 'assistant';
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
      links: [{ label: ru ? 'Купить открытку' : 'Heart & Angel postcard', href: '/heartandangel/card#order' }],
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
    (message.role !== 'user' && message.role !== 'assistant') ||
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

      if (nextMessage.role === 'assistant' && modeRef.current !== 'modal') {
        setHasUnread(true);
      }

      return nextMessage;
    },
    []
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
  }, [appendMessage]);

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

    if (isUnframedMode) {
      setIsUnframedMode(false);
      return;
    }

    cancelOnboarding();
    setIsUnframedMode(true);
    appendBrainExamples();
  }, [
    appendBrainExamples,
    cancelOnboarding,
    canUseUnframedMode,
    isBrainUnlocked,
    isUnframedMode,
  ]);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!canUseUnframedMode) {
      setIsUnframedMode(false);
      setIsBrainUnlocked(false);
    }
  }, [canUseUnframedMode, isAuthLoading]);

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

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();

      if (!text) return;

      cancelOnboarding();

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
        content: text,
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
            mode: isUnframedMode ? 'unframed' : 'site',
            conversationId: getPierrotConversationId(),
            sessionId: getPierrotSessionId(),
            userMessageId: userMessage.id,
            consent: getPierrotConsent(),
            context: {
              pathname,
              referrer: typeof document !== 'undefined' ? document.referrer : undefined,
            },
            history: previousMessages.map(({ role, content, offerId, commercialMarker }) => ({
              role,
              content,
              ...(offerId ? { offerId } : {}),
              ...(commercialMarker ? { commercialMarker } : {}),
            })),
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Error ${response.status}`);
        }

        if (requestIdRef.current !== requestId) return;

        setPierrotConversationId(data.conversationId);

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
      setIsUnframedMode(false);
      if (reason === 'user_closed') setIsBrainUnlocked(false);
      updatePendingNavigation(null);

      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
        if (reason === 'user_closed') {
          window.sessionStorage.removeItem(BRAIN_UNLOCK_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors.
      }
    },
    [cancelOnboarding, updatePendingNavigation]
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
  };

  return <PierrotContext.Provider value={value}>{children}</PierrotContext.Provider>;
}
