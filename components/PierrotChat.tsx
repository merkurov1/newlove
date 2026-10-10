'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type PierrotChatProps = {
  compact?: boolean;
};

export default function PierrotChat({
  compact = false,
}: PierrotChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();

    if (!text || isLoading) return;

    const previousMessages = messages;
    const userMessage: Message = {
      role: 'user',
      content: text,
    };

    setInput('');
    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: previousMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Connection error: ${response.status}`,
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply || 'Silence.',
        },
      ]);
    } catch (error) {
      console.error('[Pierrot] Chat error:', error);

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: '[ CONNECTION LOST. THE ETHER IS UNSTABLE. ]',
        },
      ]);
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
          aria-label="Open Pierrot Advisor"
          title="PIERROT // ADVISOR"
          className="
            group flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full border border-stone-200/80
            bg-white/90 text-stone-600
            font-serif text-[17px] font-medium
            shadow-[0_2px_10px_rgba(0,0,0,0.03)]
            transition-all duration-200
            hover:-translate-y-px hover:border-stone-400
            hover:bg-white hover:text-stone-950
            hover:shadow-[0_5px_18px_rgba(0,0,0,0.07)]
            active:scale-95
            focus:outline-none focus:ring-2
            focus:ring-stone-300/70
            focus:ring-offset-2 focus:ring-offset-[#FAF8F5]
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
            border border-stone-200/80
            bg-[#FAF8F5]/90 px-3 py-2
            font-mono text-[10px] uppercase
            tracking-[0.18em] text-stone-700
            shadow-[0_2px_10px_rgba(0,0,0,0.03)]
            backdrop-blur-md transition-all
            hover:border-stone-400 hover:bg-white
            hover:text-stone-950
          "
        >
          <span className="h-1.5 w-1.5 animate-pulse bg-stone-900" />
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
              overflow-hidden bg-black/30
              p-0 backdrop-blur-[8px]
            "
            onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
              }
            }}
          >
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="PIERROT // ADVISOR"
              className="
                relative flex h-[100dvh] w-full
                flex-col overflow-hidden
                border-0 bg-[#fffefa]/95
                text-stone-900 shadow-none
                backdrop-blur-2xl
              "
              onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
            >
              <header className="
                flex shrink-0 items-center justify-between
                border-b border-stone-200/80
                px-6 pb-5 pt-7
                sm:px-12 sm:pb-6 sm:pt-8
              ">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="
                    font-mono text-[10px] uppercase
                    tracking-[0.22em] text-stone-600
                    sm:text-[11px] sm:tracking-[0.25em]
                  ">
                    PIERROT // ADVISOR
                  </span>

                  <span
                    className="h-1.5 w-1.5 shrink-0 animate-pulse bg-stone-900"
                    aria-label="Ready"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Pierrot Advisor"
                  className="
                    ml-4 shrink-0 border-0 bg-transparent
                    font-mono text-[10px] uppercase
                    tracking-[0.16em] text-stone-400
                    transition-colors hover:text-stone-950
                    focus:outline-none
                  "
                >
                  CLOSE ×
                </button>
              </header>

              <div className="
                min-h-0 flex-1 overflow-y-auto
                overscroll-contain px-6 py-7
                sm:px-12 sm:py-10
              ">
                <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                  {messages.length === 0 ? (
                    <div className="
                      flex flex-1 flex-col items-center
                      justify-center py-16 text-center
                    ">
                      <span className="
                        mb-6 font-serif text-5xl
                        font-light text-stone-300
                      ">
                        P.
                      </span>

                      <p className="
                        font-mono text-[10px] uppercase
                        tracking-[0.22em] text-stone-500
                      ">
                        THE ADVISOR IS LISTENING
                      </p>

                      <p className="
                        mt-3 max-w-sm font-serif
                        text-base italic leading-relaxed
                        text-stone-500 sm:text-lg
                      ">
                        Art, strategy, digital architecture.
                        Ask what deserves your attention.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-7">
                      {messages.map((message, index) => (
                        <motion.article
                          key={`${index}-${message.role}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18 }}
                          className={`flex flex-col ${
                            message.role === 'user'
                              ? 'items-end'
                              : 'items-start'
                          }`}
                        >
                          <span className="
                            mb-2 font-mono text-[9px]
                            uppercase tracking-[0.2em]
                            text-stone-400
                          ">
                            {message.role === 'user' ? 'YOU' : 'PIERROT'}
                          </span>

                          <div className={`
                            max-w-[92%] whitespace-pre-wrap
                            break-words text-sm leading-[1.75]
                            sm:max-w-[85%] sm:text-base
                            ${
                              message.role === 'user'
                                ? 'bg-stone-900 px-4 py-3.5 text-stone-50'
                                : 'border border-stone-200/80 bg-white/80 px-5 py-4 font-serif text-stone-800 sm:px-6 sm:py-5'
                            }
                          `}>
                            {message.content}
                          </div>
                        </motion.article>
                      ))}

                      {isLoading && (
                        <div className="
                          font-mono text-[10px]
                          uppercase tracking-[0.2em]
                          text-stone-400
                        ">
                          THINKING…
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>

              <footer className="
                shrink-0 border-t border-stone-200/80
                px-6 pb-[max(20px,env(safe-area-inset-bottom))]
                pt-4 sm:px-12 sm:pb-7 sm:pt-5
              ">
                <div className="
                  mx-auto flex w-full max-w-3xl
                  items-end gap-3 border-b
                  border-stone-300 pb-3
                  transition-colors focus-within:border-stone-900
                ">
                  <span className="
                    pb-2 font-serif text-xl
                    font-light text-stone-400
                  ">
                    ›
                  </span>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Write to Pierrot…"
                    rows={1}
                    disabled={isLoading}
                    className="
                      max-h-32 min-h-[42px] min-w-0
                      flex-1 resize-y border-0
                      bg-transparent px-0 py-2
                      font-serif text-base leading-relaxed
                      text-stone-900 outline-none
                      placeholder:text-stone-300
                      focus:border-0 focus:outline-none
                      focus:ring-0 disabled:opacity-50
                      sm:text-lg
                    "
                  />

                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="
                      mb-1 shrink-0 rounded-full
                      border border-stone-900
                      bg-stone-900 px-5 py-2.5
                      font-mono text-[9px] uppercase
                      tracking-[0.16em] text-white
                      transition-all hover:bg-stone-700
                      disabled:cursor-not-allowed
                      disabled:opacity-25
                    "
                  >
                    {isLoading ? '…' : 'SEND'}
                  </button>
                </div>

                <p className="
                  mx-auto mt-3 w-full max-w-3xl
                  font-mono text-[9px] uppercase
                  tracking-[0.12em] text-stone-400
                ">
                  ENTER TO SEND · SHIFT + ENTER FOR NEW LINE
                </p>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
