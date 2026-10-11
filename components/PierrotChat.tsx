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
                  overflow-hidden bg-[#6B6255]/25 p-2
                  backdrop-blur-sm sm:p-5
                "
                onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
                  if (event.target === event.currentTarget) {
                    setIsOpen(false);
                  }
                }}
              >
                <motion.section
                  initial={{ opacity: 0, y: 5, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.995 }}
                  transition={{ duration: 0.16 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Pierrot conversation"
                  className="
                    relative flex h-[min(88dvh,760px)]
                    max-h-[calc(100dvh-1rem)] w-full max-w-2xl
                    flex-col overflow-hidden rounded-[28px]
                    border border-[#E8E0D4]
                    bg-[#F7F4EE] text-[#49443C]
                    shadow-[0_24px_80px_rgba(64,52,38,0.18)]
                  "
                  onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                >
                  {/* Compact action bar: intentionally no title or divider. */}
                  <div className="
                    absolute inset-x-0 top-0 z-20 flex
                    items-center justify-between px-4 pt-3 pb-2
                    pointer-events-none sm:px-5 sm:pt-4
                  ">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <span
                        className="h-2 w-2 rounded-full bg-[#8CA18A]"
                        title="Online"
                      />
                      {isAdminSession && (
                        <span className="
                          rounded-full border border-[#E4DCCF]
                          bg-white/70 px-2 py-0.5 font-mono
                          text-[9px] uppercase tracking-widest text-[#8B8174]
                        ">
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
                            flex h-9 w-9 items-center justify-center
                            rounded-full text-[#928779]
                            transition-colors hover:bg-[#EBE4D9]
                            hover:text-[#49443C]
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
                          flex h-9 w-9 items-center justify-center
                          rounded-full text-[#928779]
                          transition-colors hover:bg-[#EBE4D9]
                          hover:text-[#49443C]
                        "
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="
                      min-h-0 flex-1 overflow-y-auto overscroll-contain
                      px-4 pt-12 pb-4 sm:px-8 sm:pt-14 sm:pb-5
                    "
                  >
                    <div className="mx-auto flex min-h-full w-full flex-col justify-end">
                      {messages.length === 0 ? (
                        <div className="
                          my-auto flex flex-col items-center
                          justify-center px-2 py-8 text-center
                        ">
                          <h2 className="
                            font-serif text-[34px] font-normal
                            leading-tight tracking-[-0.035em]
                            text-[#49443C] sm:text-[40px]
                          ">
                            Pierrot
                          </h2>

                          <p className="
                            mt-3 font-mono text-[12px] font-medium
                            uppercase tracking-[0.16em]
                            text-[#82786A] sm:text-[13px]
                          ">
                            The advisor is listening
                          </p>

                          <p className="
                            mt-4 max-w-md font-serif text-[17px]
                            leading-[1.65] text-[#71685C]
                            sm:text-[19px]
                          ">
                            Art, strategy, digital architecture.
                            Ask what deserves your attention.
                          </p>

                          <div className="mt-7 flex flex-wrap justify-center gap-2">
                            {SUGGESTIONS.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => void sendMessage(suggestion)}
                                disabled={isLoading}
                                className="
                                  rounded-full border border-[#E3DACD]
                                  bg-[#FBF9F5] px-4 py-2
                                  text-[12px] text-[#71685C]
                                  transition-colors
                                  hover:border-[#CFC3B1] hover:bg-white
                                  hover:text-[#49443C]
                                  disabled:opacity-50 sm:text-[13px]
                                "
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-5 sm:space-y-6">
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
                              <div
                                className={`
                                  max-w-[96%] whitespace-pre-wrap
                                  break-words rounded-[22px] border
                                  px-4 py-3.5 text-[16px]
                                  leading-[1.7] sm:px-5 sm:py-4
                                  sm:text-[17px]
                                  ${
                                    message.role === 'user'
                                      ? 'max-w-[88%] rounded-tr-md border-[#E4D9C9] bg-[#EDE5D9] text-[#4E473D] sm:max-w-[80%]'
                                      : 'rounded-tl-md border-[#EBE4D9] bg-[#FCFAF6] font-serif text-[#49443C] shadow-[0_2px_8px_rgba(75,62,45,0.025)]'
                                  }
                                `}
                              >
                                {message.content}
                              </div>

                              {message.provider && (
                                <span className="
                                  mt-1.5 px-1 font-mono text-[9px]
                                  uppercase tracking-wider text-[#A49A8C]
                                ">
                                  via {message.provider}
                                </span>
                              )}
                            </motion.article>
                          ))}

                          {isLoading && (
                            <div className="
                              flex items-center gap-2 px-1
                              text-[12px] text-[#918779]
                            ">
                              <span className="
                                inline-block h-2 w-2 animate-pulse
                                rounded-full bg-[#A9B5A1]
                              " />
                              <span>Thinking…</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <footer className="
                    shrink-0 border-t border-[#EAE2D7]
                    bg-[#F7F4EE] p-3
                    pb-[max(12px,env(safe-area-inset-bottom))]
                    sm:p-4 sm:pb-4
                  ">
                    <div className="
                      mx-auto flex w-full items-end gap-2
                      rounded-[22px] border border-[#E4DCCF]
                      bg-[#FCFAF6] p-2
                      transition-colors
                      focus-within:border-[#CFC3B1]
                      sm:p-2.5
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
                          max-h-36 min-h-[42px] min-w-0 flex-1
                          resize-none border-0 bg-transparent
                          px-2.5 py-2.5 font-sans text-[16px]
                          leading-relaxed text-[#49443C]
                          outline-none placeholder:text-[#A69C8E]
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
                          flex h-10 w-10 shrink-0 items-center
                          justify-center rounded-[15px]
                          bg-[#6C6559] text-white
                          transition-colors hover:bg-[#575145]
                          active:scale-95
                          disabled:cursor-not-allowed
                          disabled:bg-[#E7E0D6]
                          disabled:text-[#A9A092]
                        "
                      >
                        <ArrowUp size={18} strokeWidth={2.2} />
                      </button>
                    </div>

                    <p className="
                      mt-2 text-center font-mono text-[9px]
                      tracking-wide text-[#A49A8C]
                    ">
                      Enter to send · Shift + Enter for new line
                    </p>
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
