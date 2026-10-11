'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ArrowUp } from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
};

type PierrotChatProps = {
  compact?: boolean;
};

const STORAGE_KEY = 'pierrot_chat_history_v2';

const SUGGESTIONS = [
  'Архитектура контекста',
  'Оценка лота',
  'Стратегия наследия',
];

export default function PierrotChat({
  compact = false,
}: PierrotChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Restore history from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // Ignore sessionStorage read errors
    }
  }, []);

  // Persist history to sessionStorage
  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore sessionStorage write errors
    }
  }, [messages]);

  // Lock body scroll when modal is open to prevent background scrolling & flying
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isOpen]);

  // Internal smooth scroll contained within messagesContainer
  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
    }
  }, [messages, isLoading, isOpen, scrollToBottom]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const clearChat = () => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setInput('');
    setIsLoading(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    inputRef.current?.focus();
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const previousMessages = messages;
    const userMessage: Message = {
      role: 'user',
      content: text,
    };

    setInput('');
    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);

    try {
      const timeoutId = setTimeout(() => abortController.abort(), 35000);

      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: previousMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}`);
      }

      if (data.admin) {
        setIsAdminSession(true);
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply || 'Silence.',
          provider: data.provider,
        },
      ]);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: '[ REQUEST TIMED OUT. THE CONNECTION WAVERS. ]',
          },
        ]);
      } else {
        console.error('[Pierrot] Chat error:', error);
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: '[ CONNECTION LOST. THE ETHER IS UNSTABLE. ]',
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleInputKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open Pierrot"
          title="Pierrot"
          className="
            group flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full border border-stone-200/80
            bg-white/90 text-stone-700
            font-serif text-[17px] font-medium
            shadow-[0_2px_10px_rgba(0,0,0,0.03)]
            transition-all duration-200
            hover:-translate-y-px hover:border-stone-400
            hover:bg-white hover:text-stone-950
            hover:shadow-[0_5px_18px_rgba(0,0,0,0.07)]
            active:scale-95 focus:outline-none focus:ring-2
            focus:ring-stone-300/70 focus:ring-offset-2
          "
        >
          <span className="transition-transform duration-200 group-hover:scale-110">
            P
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="
            group inline-flex items-center gap-2
            rounded-full border border-stone-200/80
            bg-[#FAF8F5]/90 px-3.5 py-1.5
            font-mono text-[10px] uppercase
            tracking-[0.18em] text-stone-700
            shadow-[0_2px_10px_rgba(0,0,0,0.03)]
            backdrop-blur-md transition-all
            hover:border-stone-400 hover:bg-white
            hover:text-stone-950
          "
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>Pierrot</span>
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="
              fixed inset-0 z-[100]
              flex items-center justify-center
              overflow-hidden bg-black/60
              p-3 sm:p-6 backdrop-blur-md
            "
            onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
              }
            }}
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Pierrot"
              className="
                relative flex h-[88dvh] max-h-[760px] w-full max-w-2xl
                flex-col overflow-hidden rounded-3xl
                border border-white/[0.08]
                bg-[#18181b]/95 text-stone-100
                shadow-2xl shadow-black/80
                backdrop-blur-2xl
              "
              onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
            >
              {/* TOP ACTION BAR: No text header or divider - maximum vertical chat space */}
              <div className="
                absolute top-0 inset-x-0 z-20
                flex items-center justify-between
                px-5 pt-4 pb-2
                pointer-events-none
              ">
                <div className="flex items-center gap-2 pointer-events-auto">
                  <span
                    className="h-2 w-2 rounded-full bg-emerald-400/80 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    title="Pierrot Online"
                  />
                  {isAdminSession && (
                    <span className="rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                      Master
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 pointer-events-auto">
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={clearChat}
                      title="New chat"
                      aria-label="New chat"
                      className="
                        flex h-8 w-8 items-center justify-center
                        rounded-full text-zinc-400 hover:text-zinc-100
                        hover:bg-white/[0.06] transition-colors
                      "
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Close"
                    aria-label="Close Pierrot"
                    className="
                      flex h-8 w-8 items-center justify-center
                      rounded-full text-zinc-400 hover:text-zinc-100
                      hover:bg-white/[0.06] transition-colors
                    "
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* MESSAGES SCROLL CONTAINER */}
              <div
                ref={messagesContainerRef}
                className="
                  min-h-0 flex-1 overflow-y-auto
                  overscroll-contain px-5 pt-12 pb-4
                  sm:px-8 sm:pt-14 sm:pb-5
                  scrollbar-thin scrollbar-thumb-zinc-700/40
                "
              >
                <div className="mx-auto flex min-h-full w-full flex-col justify-end">
                  {messages.length === 0 ? (
                    <div className="
                      my-auto flex flex-col items-center
                      justify-center py-10 text-center
                    ">
                      <div className="
                        mb-4 flex h-14 w-14 items-center justify-center
                        rounded-2xl border border-white/[0.08]
                        bg-white/[0.03] font-serif text-2xl
                        font-light text-zinc-200 shadow-inner
                      ">
                        P.
                      </div>

                      <p className="
                        max-w-sm font-serif text-[17px] sm:text-[19px]
                        italic leading-relaxed text-zinc-300
                      ">
                        Art, capital, digital architecture.
                      </p>

                      <p className="
                        mt-1.5 font-mono text-[10px] uppercase
                        tracking-[0.2em] text-zinc-500
                      ">
                        The advisor is listening
                      </p>

                      {/* Quick Suggestion Pills */}
                      <div className="mt-8 flex flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => void sendMessage(suggestion)}
                            className="
                              rounded-full border border-white/[0.08]
                              bg-white/[0.03] px-3.5 py-1.5
                              font-mono text-[11px] text-zinc-400
                              hover:border-white/[0.2] hover:bg-white/[0.07]
                              hover:text-zinc-200 transition-all duration-200
                            "
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {messages.map((message, index) => (
                        <motion.article
                          key={`${index}-${message.role}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`flex flex-col ${
                            message.role === 'user' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`
                              whitespace-pre-wrap break-words
                              ${
                                message.role === 'user'
                                  ? 'max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-tr-md bg-zinc-800/90 border border-zinc-700/50 px-4 py-3 sm:px-5 sm:py-3.5 font-sans text-[15px] sm:text-[16px] leading-[1.6] text-zinc-100 shadow-sm'
                                  : 'max-w-[94%] sm:max-w-[90%] rounded-2xl rounded-tl-md bg-white/[0.04] border border-white/[0.07] px-5 py-4 sm:px-6 sm:py-5 font-serif text-[17px] sm:text-[19px] leading-[1.65] text-zinc-100 shadow-sm'
                              }
                            `}
                          >
                            {message.content}
                          </div>

                          {message.provider && (
                            <span className="mt-1 px-1 font-mono text-[8px] uppercase tracking-widest text-zinc-600">
                              via {message.provider}
                            </span>
                          )}
                        </motion.article>
                      ))}

                      {isLoading && (
                        <div className="flex items-center gap-2 px-1 text-zinc-500 font-mono text-[11px] uppercase tracking-widest">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 animate-ping" />
                          <span>Thinking…</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* INPUT AREA */}
              <footer className="
                shrink-0 p-4 sm:p-5
                pb-[max(16px,env(safe-area-inset-bottom))]
              ">
                <div className="
                  mx-auto flex w-full items-end gap-2
                  rounded-2xl border border-white/[0.1]
                  bg-zinc-900/90 p-2 sm:p-2.5
                  shadow-lg shadow-black/40
                  transition-all duration-200
                  focus-within:border-zinc-500/80 focus-within:bg-zinc-900
                ">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Write to Pierrot…"
                    rows={1}
                    disabled={isLoading}
                    className="
                      max-h-36 min-h-[40px] min-w-0
                      flex-1 resize-none border-0
                      bg-transparent px-2.5 py-2
                      font-sans text-[15px] sm:text-[16px]
                      leading-relaxed text-zinc-100 outline-none
                      placeholder:text-zinc-500
                      focus:border-0 focus:outline-none focus:ring-0
                      disabled:opacity-50
                    "
                  />

                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isLoading}
                    aria-label="Send message"
                    className="
                      flex h-10 w-10 shrink-0 items-center justify-center
                      rounded-xl bg-zinc-100 text-zinc-950
                      transition-all hover:bg-white active:scale-95
                      disabled:cursor-not-allowed disabled:bg-zinc-800
                      disabled:text-zinc-600 disabled:opacity-40
                    "
                  >
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </button>
                </div>

                <p className="
                  mt-2 text-center font-mono text-[9px]
                  uppercase tracking-widest text-zinc-500
                ">
                  Enter to send · Shift + Enter for new line
                </p>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
