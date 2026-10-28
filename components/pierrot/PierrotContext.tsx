'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  PIERROT_COMPOSER_EXPAND_THRESHOLD,
  shouldExpandPierrotComposer,
} from '@/lib/pierrot/config';

export type PierrotMessageKind = 'chat' | 'section-trigger' | 'section-intro' | 'arrival';

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
  meta?: PierrotMessageMeta;
};

type PierrotContextValue = {
  messages: PierrotMessage[];
  draft: string;
  draftCaret: number | null;
  isOpen: boolean;
  isHomeMode: boolean;
  isLoading: boolean;
  isComposerOpen: boolean;
  isAdminSession: boolean;
  pendingNavigation: PierrotNavigationProposal | null;
  expandThreshold: number;
  openChat: () => void;
  openConversation: () => void;
  toggleConversation: () => void;
  closeConversation: () => void;
  closeChat: () => void;
  toggleComposer: () => void;
  updateDraft: (value: string, caret?: number | null) => void;
  sendMessage: (overrideText?: string) => Promise<void>;
  clearChat: () => void;
  exploreSection: (sectionId: PierrotSectionId) => void;
  runAction: (action: PierrotChatAction) => void;
};

const PierrotContext = createContext<PierrotContextValue | null>(null);

const STORAGE_KEY = 'pierrot_chat_history_v2';
const ARRIVAL_STORAGE_KEY = 'pierrot_navigation_arrival_v1';
const INTRO_DELAY_MS = 420;

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
    !link.href.startsWith('/')
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
    meta: normalizeMeta(message.meta),
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

  const [messages, setMessages] = useState<PierrotMessage[]>(loadMessages);
  const [draft, setDraft] = useState('');
  const [draftCaret, setDraftCaret] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isHomeMode, setIsHomeMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PierrotNavigationProposal | null>(
    null
  );

  const messagesRef = useRef<PierrotMessage[]>(messages);
  const pendingNavigationRef = useRef<PierrotNavigationProposal | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const introTimersRef = useRef<Record<string, number>>({});
  const navigationLockRef = useRef<string | null>(null);
  const navigationTargetRef = useRef<string | null>(null);
  const thresholdArmedRef = useRef(true);

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

      return nextMessage;
    },
    []
  );

  const updatePendingNavigation = useCallback((proposal: PierrotNavigationProposal | null) => {
    pendingNavigationRef.current = proposal;
    setPendingNavigation(proposal);
  }, []);

  const openChat = useCallback(() => {
    setIsHomeMode(false);
    setIsComposerOpen(false);
    setIsOpen(true);
  }, []);

  const openConversation = useCallback(() => {
    if (normalizePathname(pathname) === '/') {
      setIsOpen(false);
      setIsComposerOpen(false);
      setIsHomeMode(true);
      return;
    }

    setIsHomeMode(false);
    setIsComposerOpen(false);
    setIsOpen(true);
  }, [pathname]);

  const toggleConversation = useCallback(() => {
    if (normalizePathname(pathname) === '/') {
      setIsOpen(false);
      setIsComposerOpen(false);
      setIsHomeMode((current) => !current);
      return;
    }

    setIsComposerOpen(false);
    setIsOpen((current) => !current);
  }, [pathname]);

  const closeConversation = useCallback(() => {
    setIsOpen(false);
    setIsHomeMode(false);
    setIsComposerOpen(false);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleComposer = useCallback(() => {
    setIsComposerOpen((current) => {
      const next = !current;

      if (next) {
        thresholdArmedRef.current = !shouldExpandPierrotComposer(draft);
      }

      return next;
    });
  }, [draft]);

  const updateDraft = useCallback(
    (value: string, caret: number | null = null) => {
      setDraft(value);
      setDraftCaret(caret);

      if (isOpen || !isComposerOpen) {
        if (!shouldExpandPierrotComposer(value)) {
          thresholdArmedRef.current = true;
        }
        return;
      }

      if (!shouldExpandPierrotComposer(value)) {
        thresholdArmedRef.current = true;
        return;
      }

      if (!thresholdArmedRef.current) return;

      thresholdArmedRef.current = false;
      setIsOpen(true);
    },
    [isComposerOpen, isOpen]
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

      setIsOpen(false);
      setIsHomeMode(false);
      setIsComposerOpen(false);
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
      introduceSection(sectionId, true);
    },
    [introduceSection]
  );

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();

      if (!text) return;

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
        thresholdArmedRef.current = true;
        executeNavigation(proposal);
        return;
      }

      if (loadingRef.current) return;

      const typedSection = findSectionByPrompt(text);

      if (typedSection) {
        appendMessage({
          role: 'user',
          content: text,
          meta: { kind: 'section-trigger', sectionId: typedSection.id },
        });
        setDraft('');
        setDraftCaret(0);
        thresholdArmedRef.current = true;
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
      thresholdArmedRef.current = true;
      appendMessage(userMessage);
      setIsLoading(true);

      try {
        const response = await fetch('/api/pierrot-web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: previousMessages.map(({ role, content }) => ({
              role,
              content,
            })),
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Error ${response.status}`);
        }

        if (requestIdRef.current !== requestId) return;

        if (data.admin) setIsAdminSession(true);

        appendMessage({
          role: 'assistant',
          content: data.reply || 'Silence.',
          provider: data.provider,
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
    [appendMessage, draft, executeNavigation, introduceSection]
  );

  const runAction = useCallback(
    (action: PierrotChatAction) => {
      if (action.kind === 'navigate') {
        navigateToSection(action.sectionId);
        return;
      }

      void sendMessage(action.prompt);
    },
    [navigateToSection, sendMessage]
  );

  const clearChat = useCallback(() => {
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
    thresholdArmedRef.current = true;
    setIsLoading(false);
    setIsAdminSession(false);
    updatePendingNavigation(null);

    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, [updatePendingNavigation]);

  useEffect(() => {
    if (!navigationTargetRef.current) return;

    if (normalizePathname(pathname) === normalizePathname(navigationTargetRef.current)) {
      navigationLockRef.current = null;
      navigationTargetRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    if (normalizePathname(pathname) !== '/') {
      setIsHomeMode(false);
    }
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
    draft,
    draftCaret,
    isOpen,
    isHomeMode,
    isLoading,
    isComposerOpen,
    isAdminSession,
    pendingNavigation,
    expandThreshold: PIERROT_COMPOSER_EXPAND_THRESHOLD,
    openChat,
    openConversation,
    toggleConversation,
    closeConversation,
    closeChat,
    toggleComposer,
    updateDraft,
    sendMessage,
    clearChat,
    exploreSection,
    runAction,
  };

  return <PierrotContext.Provider value={value}>{children}</PierrotContext.Provider>;
}
