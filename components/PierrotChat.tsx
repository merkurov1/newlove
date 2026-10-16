'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

export default function PierrotChat({ compact = false }: PierrotChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const validMessages = parsed.filter(
            (item): item is Message =>
              item !== null &&
              typeof item === 'object' &&
              (item.role === 'user' || item.role === 'assistant') &&
              typeof item.content === 'string',
          );

          setMessages(validMessages);
        }
      }
    } catch {
      // Ignore invalid or unavailable session storage.
    }
  }, []);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore unavailable session storage.
    }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, isOpen, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const clearChat = () => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setMessages([]);
    setInput('');
    setIsLoading(false);
    setIsAdminSession(false);

    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();

    if (!text || isLoading) return;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = ++requestIdRef.current;
    let timedOut = false;

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 35000);

    const previousMessages = messages;
    const userMessage: Message = { role: 'user', content: text };

    setInput('');
    setMessages((current) => [...current, userMessage]);
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

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply || 'Silence.',
          provider: data.provider,
        },
      ]);
    } catch (error: unknown) {
      if (requestIdRef.current !== requestId) return;

      const isAbort =
        error instanceof Error && error.name === 'AbortError';

      if (isAbort && !timedOut) return;

      console.error('[Pierrot] Chat error:', error);

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: timedOut
            ? 'The response is taking too long. Please try again.'
            : 'The connection was interrupted. Please try again.',
        },
      ]);
    } finally {
      window.clearTimeout(timeoutId);

      if (requestIdRef.current === requestId) {
        setIsLoading(false);
        abortControllerRef.current = null;

        window.requestAnimationFrame(() => {
          inputRef.current?.focus({ preventScroll: true });
        });
      }
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
          aria-haspopup="dialog"
          title="Pierrot"
          className="
            group flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full border border-[#E4DCCF]
            bg-[#F8F5EF] text-[#625B50]
            font-serif text-[17px] font-medium
            shadow-[0_2px_8px_rgba(75,62,45,0.04)]
            transition-colors duration-200
            hover:border-[#CFC3B1] hover:bg-white hover:text-[#3F3A33]
            active:scale-95 focus:outline-none focus:ring-2
            focus:ring-[#CFC3B1] focus:ring-offset-2
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
          aria-haspopup="dialog"
          className="
            group inline-flex items-center gap-2 rounded-full
            border border-[#E4DCCF] bg-[#F8F5EF]/95
            px-3.5 py-1.5 font-mono text-[10px] uppercase
            tracking-[0.16em] text-[#625B50]
            transition-colors hover:border-[#CFC3B1] hover:bg-white
          "
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8CA18A]" />
          <span>Pierrot</span>
        </button>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="
                  fixed inset-0 z-[9999] flex items-center justify-center
                  bg-[#24211D]/25 p-0 backdrop-blur-[3px]
                  sm:p-4
                "
                role="dialog"
                aria-modal="true"
                aria-label="Pierrot conversation"
                onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
                  if (event.target === event.currentTarget) {
                    setIsOpen(false);
                  }
                }}
              >
                <motion.section
                  initial={{ opacity: 0, y: 6, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.995 }}
                  transition={{ duration: 0.16 }}
                  className="
                    flex h-[100dvh] max-h-[100dvh] w-full flex-col
                    overflow-hidden bg-[#FAF8F4] text-[#37332D]
                    sm:h-[min(88dvh,780px)] sm:max-h-[calc(100dvh-2rem)]
                    sm:max-w-2xl sm:rounded-2xl sm:border sm:border-[#ECE6DC]
                    shadow-[0_24px_80px_rgba(36,33,29,0.14)]
                  "
                  onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                >
                  {/* Minimal top row matching NewPostModal */}
                  <header className="flex shrink-0 items-center justify-between border-b border-[#ECE6DC]/60 px-5 py-3 sm:px-7 sm:py-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 rounded-full bg-[#8CA18A]"
                        title="Online"
                      />
                      <span className="font-serif text-[15px] font-medium text-[#37332D]">
                        Pierrot
                      </span>
                      {isAdminSession && (
                        <span className="
                          rounded-full border border-[#E4DCCF]
                          bg-black/[0.03] px-2 py-0.5 font-mono
                          text-[9px] uppercase tracking-widest text-[#898277]
                        ">
                          Master
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {messages.length > 0 && (
                        <button
                          type="button"
                          onClick={clearChat}
                          title="New chat"
                          aria-label="New chat"
                          className="
                            flex h-9 w-9 items-center justify-center
                            rounded-full text-[#898277] transition
                            hover:bg-black/[0.04] hover:text-[#37332D]
                          "
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        title="Close"
                        aria-label="Close Pierrot"
                        className="
                          -mr-2 flex h-9 w-9 shrink-0 items-center justify-center
                          rounded-full text-[#898277] transition
                          hover:bg-black/[0.04] hover:text-[#37332D]
                        "
                      >
                        <X size={18} strokeWidth={1.6} />
                      </button>
                    </div>
                  </header>

                  {/* Messages container */}
                  <div
                    ref={messagesContainerRef}
                    className="
                      min-h-0 flex-1 overflow-y-auto overscroll-contain
                      px-5 py-5 sm:px-7 sm:py-6
                    "
                  >
                    <div className="mx-auto flex min-h-full w-full flex-col justify-end">
                      {messages.length === 0 ? (
                        <div className="
                          my-auto flex flex-col items-center
                          justify-center px-2 py-10 text-center
                        ">
                          <div className="
                            flex h-12 w-12 items-center justify-center
                            rounded-full border border-[#E6DEC6]
                            bg-[#F4EFE6] font-serif text-[20px] font-medium text-[#554E44]
                          ">
                            P
                          </div>

                          <h2 className="
                            mt-4 font-serif text-2xl font-light
                            tracking-tight text-[#37332D] sm:text-3xl
                          ">
                            Pierrot
                          </h2>

                          <p className="
                            mt-1.5 font-mono text-[11px] uppercase
                            tracking-[0.18em] text-[#898277]
                          ">
                            Digital shadow & advisor
                          </p>

                          <div className="mt-8 flex flex-wrap justify-center gap-2">
                            {SUGGESTIONS.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => void sendMessage(suggestion)}
                                disabled={isLoading}
                                className="
                                  rounded-full border border-[#E3DACD]
                                  bg-white/60 px-3.5 py-1.5
                                  font-serif text-[13px] text-[#554E44]
                                  transition hover:border-[#CFC3B1]
                                  hover:bg-white hover:text-[#37332D]
                                  disabled:opacity-40
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
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.16 }}
                              className={`flex flex-col ${
                                message.role === 'user'
                                  ? 'items-end'
                                  : 'items-start'
                              }`}
                            >
                              {message.role === 'user' ? (
                                <div className="
                                  max-w-[88%] sm:max-w-[78%]
                                  whitespace-pre-wrap break-words
                                  rounded-2xl rounded-br-sm
                                  bg-[#ECE5D9] px-4 py-2.5
                                  font-serif text-[15px] sm:text-[16px]
                                  leading-[1.65] text-[#37332D]
                                ">
                                  {message.content}
                                </div>
                              ) : (
                                <div className="
                                  max-w-[96%]
                                  whitespace-pre-wrap break-words
                                  font-serif text-[16px] sm:text-[17px]
                                  leading-[1.75] text-[#2F2B26]
                                ">
                                  {message.content}
                                </div>
                              )}

                              {message.provider && (
                                <span className="
                                  mt-1 font-mono text-[9px]
                                  uppercase tracking-wider text-[#A49A8C]
                                ">
                                  via {message.provider}
                                </span>
                              )}
                            </motion.article>
                          ))}

                          {isLoading && (
                            <div className="
                              flex items-center gap-2 text-xs
                              font-mono text-[#898277]
                            ">
                              <span className="
                                inline-block h-2 w-2 animate-pulse
                                rounded-full bg-[#8CA18A]
                              " />
                              <span>Thinking…</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Laconic Footer Input matching NewPostModal */}
                  <footer className="
                    shrink-0 border-t border-[#ECE6DC]/60
                    px-5 py-3 sm:px-7 sm:py-4
                    pb-[max(12px,env(safe-area-inset-bottom))]
                  ">
                    <div className="
                      flex items-end gap-2 rounded-2xl
                      border border-[#E3DACD] bg-white/70
                      p-2 sm:p-2.5 transition
                      focus-within:border-[#B5AAA0] focus-within:bg-white
                    ">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Write to Pierrot…"
                        rows={1}
                        disabled={isLoading}
                        className="
                          max-h-36 min-h-[38px] min-w-0 flex-1
                          resize-none border-0 bg-transparent
                          px-2 py-1.5 font-serif text-[16px]
                          leading-relaxed text-[#37332D]
                          outline-none placeholder:text-[#B8B0A4]
                          focus:outline-none focus:ring-0
                          disabled:opacity-60
                        "
                      />

                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={!input.trim() || isLoading}
                        aria-label="Send message"
                        className="
                          flex h-9 w-9 shrink-0 items-center
                          justify-center rounded-xl
                          bg-[#37332D] text-white
                          transition hover:bg-[#201D1A]
                          active:scale-95
                          disabled:cursor-not-allowed
                          disabled:opacity-20
                        "
                      >
                        <ArrowUp size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </footer>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
