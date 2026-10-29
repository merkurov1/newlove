'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Markdown from 'markdown-to-jsx';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import { createPierrotId, type PierrotChatAction } from '@/lib/pierrot/navigation';
import { getPierrotConversationId, trackPierrotEvent } from '@/lib/pierrot/clientTelemetry';
import {
  appendPierrotPostcardAttribution,
  appendPierrotSubscriptionAttribution,
  appendPierrotUnframedAttribution,
  createPierrotPostcardRef,
  createPierrotSubscriptionRef,
  createPierrotUnframedRef,
} from '@/lib/pierrot/orderAttribution';

function safeMarkdownUrl(value: string): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;

  return null;
}

/**
 * Assistant replies are markdown. Render a safe subset (emphasis, links,
 * lists, code) and never raw HTML. User messages stay plain text.
 */
function PierrotMarkdown({ content }: { content: string }) {
  const { closeConversation } = usePierrot();

  return (
    <Markdown
      options={{
        disableParsingRawHTML: true,
        forceBlock: true,
        sanitizer: (value: string) => safeMarkdownUrl(value),
        overrides: {
          p: {
            component: 'p',
            props: { className: 'mb-2 last:mb-0' },
          },
          strong: {
            component: 'strong',
            props: { className: 'font-semibold text-[#1F1C18]' },
          },
          em: {
            component: 'em',
            props: { className: 'italic' },
          },
          a: {
            component: ({
              href,
              children,
              ...props
            }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
              children?: React.ReactNode;
            }) => {
              const safe = safeMarkdownUrl(href || '');

              if (!safe) return <span>{children}</span>;

              if (safe.startsWith('/') || safe.startsWith('#')) {
                return (
                  <Link
                    href={safe}
                    onClick={() => closeConversation()}
                    className="underline decoration-[#CFC3B1] underline-offset-4 transition-colors hover:decoration-[#37332D]"
                    {...props}
                  >
                    {children}
                  </Link>
                );
              }

              return (
                <a
                  href={safe}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[#CFC3B1] underline-offset-4 transition-colors hover:decoration-[#37332D]"
                  {...props}
                >
                  {children}
                </a>
              );
            },
          },
          ul: {
            component: 'ul',
            props: { className: 'my-2 list-disc space-y-1 pl-5' },
          },
          ol: {
            component: 'ol',
            props: { className: 'my-2 list-decimal space-y-1 pl-5' },
          },
          li: {
            component: 'li',
            props: { className: 'pl-0.5' },
          },
          code: {
            component: 'code',
            props: {
              className:
                'rounded bg-black/[0.05] px-1 py-0.5 font-mono text-[0.88em] text-[#37332D]',
            },
          },
          pre: {
            component: 'pre',
            props: {
              className:
                'my-3 overflow-x-auto rounded-xl bg-[#F1ECE3] p-3 font-mono text-xs leading-relaxed',
            },
          },
          blockquote: {
            component: 'blockquote',
            props: {
              className: 'my-3 border-l-2 border-[#CFC3B1] pl-3 italic text-[#625B50]',
            },
          },
          hr: {
            component: 'hr',
            props: { className: 'my-4 border-[#E4DCCF]' },
          },
          h1: {
            component: 'h1',
            props: { className: 'mb-2 mt-4 font-serif text-xl text-[#111111]' },
          },
          h2: {
            component: 'h2',
            props: { className: 'mb-2 mt-4 font-serif text-lg text-[#111111]' },
          },
          h3: {
            component: 'h3',
            props: { className: 'mb-2 mt-3 font-serif text-base text-[#111111]' },
          },
          img: {
            component: () => null,
          },
        },
      }}
    >
      {content}
    </Markdown>
  );
}

const PIERROT_MENU = [
  {
    label: 'Lobby',
    href: '/lobby',
    child: { label: 'Unframed', href: '/unframed' },
  },
  {
    label: 'Flow',
    href: '/flow',
    child: { label: 'Journal', href: '/journal' },
  },
  {
    label: 'Art Engine',
    href: '/art-engine',
    child: { label: 'Selection', href: '/selection' },
  },
  {
    label: 'Heart & Angel',
    href: '/heartandangel',
    child: { label: 'Temple', href: '/temple' },
  },
] as const;

function PierrotEmptyState() {
  const { closeConversation } = usePierrot();

  return (
    <div className="mx-auto my-auto w-full max-w-2xl px-1 py-8 sm:py-10">
      <p className="text-center font-serif text-sm italic tracking-wide text-zinc-600 sm:text-lg">
        Structure is the antidote to chaos.
      </p>

      <nav
        aria-label="Pierrot site navigation"
        className="mt-10 border-b border-[#E4DCCF] sm:mt-12"
      >
        <Link
          href="/"
          onClick={() => closeConversation()}
          className="group flex items-center justify-between gap-4 border-t border-[#E4DCCF] py-4"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#625B50] transition-colors group-hover:text-[#111111]">
            Anton Merkurov
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#B8B0A4]">
            Home
          </span>
        </Link>

        {PIERROT_MENU.map((section, index) => (
          <div key={section.href} className="border-t border-[#E4DCCF]">
            <Link
              href={section.href}
              onClick={() => closeConversation()}
              className="group flex items-baseline justify-between gap-4 pt-4"
            >
              <span className="min-w-0 font-serif text-2xl font-normal leading-tight tracking-tight text-[#111111] transition-colors group-hover:text-[#625B50] sm:text-3xl">
                {section.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-[#B8B0A4]">
                {String(index + 1).padStart(2, '0')}
              </span>
            </Link>

            <Link
              href={section.child.href}
              onClick={() => closeConversation()}
              className="group mt-2 flex items-center gap-3 pb-4 pl-5 sm:pl-6"
            >
              <span
                aria-hidden="true"
                className="h-px w-5 bg-[#CFC3B1] transition-all duration-300 group-hover:w-8 group-hover:bg-[#8D3D2E]"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#898277] transition-colors group-hover:text-[#111111]">
                {section.child.label}
              </span>
              <ArrowUpRight
                size={13}
                className="text-[#B8B0A4] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#111111]"
              />
            </Link>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function PierrotMessageList({ className = '' }: { className?: string }) {
  const { messages, isLoading, runAction, closeConversation } = usePierrot();
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      // The empty state is a navigation index, not a transcript. Always show
      // it from the top; only real conversations should stick to the bottom.
      container.scrollTop = messages.length === 0 ? 0 : container.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading]);

  const handleAction = (action: PierrotChatAction) => {
    void runAction(action);
  };

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      className={`
        min-h-0 overflow-y-auto overscroll-contain
        px-5 py-5 sm:px-7 sm:py-6
        ${className}
      `}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
        {messages.length === 0 ? (
          <PierrotEmptyState />
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <motion.article
                key={message.id}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
                className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {message.role === 'user' ? (
                  <div
                    className="
                      max-w-[88%] whitespace-pre-wrap break-words
                      rounded-2xl rounded-br-sm bg-[#ECE5D9] px-4 py-2.5
                      font-serif text-[15px] leading-[1.65] text-[#37332D]
                      sm:max-w-[78%] sm:text-[16px]
                    "
                  >
                    {message.content}
                  </div>
                ) : (
                  <div
                    className="
                      max-w-[96%] break-words font-serif text-[16px]
                      leading-[1.75] text-[#2F2B26] sm:text-[17px]
                    "
                  >
                    <PierrotMarkdown content={message.content} />
                  </div>
                )}

                {message.actions && message.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {message.actions.map((action) => (
                      <button
                        key={`${action.kind}-${action.label}`}
                        type="button"
                        onClick={() => handleAction(action)}
                        disabled={isLoading && action.kind === 'prompt'}
                        className={
                          action.kind === 'navigate'
                            ? `
                              inline-flex items-center rounded-full
                              bg-[#37332D] px-4 py-2 font-mono
                              text-[10px] uppercase tracking-[0.16em]
                              text-white transition hover:bg-[#201D1A]
                              disabled:opacity-40
                            `
                            : `
                              inline-flex items-center rounded-full
                              border border-[#DDD3C5] px-4 py-2
                              font-mono text-[10px] uppercase
                              tracking-[0.16em] text-[#625B50]
                              transition hover:border-[#B5AAA0]
                              hover:text-[#37332D]
                              disabled:opacity-40
                            `
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {message.cta && (
                  <div className="mt-3">
                    {message.cta.kind === 'external' ? (
                      <a
                        href={message.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          trackPierrotEvent('offer_action_clicked', createPierrotId(), {
                            offer_id: message.cta!.offerId,
                            cta_kind: message.cta!.kind,
                            destination: message.cta!.href,
                          });
                          closeConversation();
                        }}
                        className="
                          inline-flex items-center rounded-full bg-[#37332D] px-4 py-2
                          font-mono text-[10px] uppercase tracking-[0.16em] text-white
                          transition hover:bg-[#201D1A]
                        "
                      >
                        {message.cta.label}
                      </a>
                    ) : (
                      <Link
                        href={
                          message.cta.offerId === 'heart_angel_postcard'
                            ? appendPierrotPostcardAttribution(
                                message.cta.href,
                                createPierrotPostcardRef(getPierrotConversationId())
                              )
                            : message.cta.offerId === 'journal_flow'
                              ? appendPierrotSubscriptionAttribution(
                                  message.cta.href,
                                  createPierrotSubscriptionRef(getPierrotConversationId())
                                )
                              : message.cta.offerId === 'unframed'
                                ? appendPierrotUnframedAttribution(
                                    message.cta.href,
                                    createPierrotUnframedRef(getPierrotConversationId())
                                  )
                                : message.cta.href
                        }
                        onClick={() => {
                          trackPierrotEvent('offer_action_clicked', createPierrotId(), {
                            offer_id: message.cta!.offerId,
                            cta_kind: message.cta!.kind,
                            destination: message.cta!.href,
                          });
                          if (message.cta!.offerId === 'journal_flow') {
                            trackPierrotEvent('subscribe_cta_clicked', createPierrotId(), {
                              offer_id: 'journal_flow',
                            });
                          }
                          closeConversation();
                        }}
                        className="
                          inline-flex items-center rounded-full bg-[#37332D] px-4 py-2
                          font-mono text-[10px] uppercase tracking-[0.16em] text-white
                          transition hover:bg-[#201D1A]
                        "
                      >
                        {message.cta.label}
                      </Link>
                    )}
                  </div>
                )}

                {message.links && message.links.length > 0 && (
                  <nav
                    aria-label="Pierrot navigation"
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    {message.links.map((link) => (
                      <Link
                        key={link.href}
                        href={
                          link.href.startsWith('/unframed')
                            ? appendPierrotUnframedAttribution(
                                link.href,
                                createPierrotUnframedRef(getPierrotConversationId())
                              )
                            : link.href
                        }
                        onClick={closeConversation}
                        className="
                          inline-flex items-center rounded-full
                          border border-[#DDD3C5] px-4 py-2
                          font-mono text-[10px] uppercase
                          tracking-[0.16em] text-[#625B50]
                          transition hover:border-[#B5AAA0]
                          hover:text-[#37332D]
                        "
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                )}

                {message.provider && (
                  <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#A49A8C]">
                    via {message.provider}
                  </span>
                )}
              </motion.article>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#898277]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#8CA18A]" />
                <span>Thinking…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PierrotInput({
  placeholder = 'Write to Pierrot…',
  className = '',
}: {
  placeholder?: string;
  className?: string;
}) {
  const { draft, draftCaret, isLoading, updateDraft, sendMessage } = usePierrot();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);

  caretRef.current = draftCaret;

  useEffect(() => {
    if (isLoading) return;

    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });

      const position = Math.min(caretRef.current ?? input.value.length, input.value.length);
      input.setSelectionRange(position, position);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoading]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const nextHeight = Math.min(Math.max(input.scrollHeight, 38), 144);

    input.style.height = `${nextHeight}px`;
  }, [draft]);

  const submit = () => {
    if (!draft.trim() || isLoading) return;
    void sendMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={`
        flex items-end gap-2 rounded-2xl border border-[#E3DACD]
        bg-white/70 p-2 transition focus-within:border-[#B5AAA0]
        focus-within:bg-white sm:p-2.5
        ${className}
      `}
    >
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
          updateDraft(event.target.value, event.target.selectionStart)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isLoading}
        aria-label="Message Pierrot"
        className="
          max-h-36 min-h-[38px] min-w-0 flex-1 resize-none
          border-0 bg-transparent px-2 py-1.5 font-serif
          text-[16px] leading-relaxed text-[#37332D] outline-none
          placeholder:text-[#B8B0A4] focus:outline-none focus:ring-0
          disabled:opacity-60
        "
      />

      <button
        type="submit"
        disabled={!draft.trim() || isLoading}
        aria-label="Send message"
        className="
          flex h-9 w-9 shrink-0 items-center justify-center
          rounded-xl bg-[#37332D] text-white transition
          hover:bg-[#201D1A] active:scale-95
          disabled:cursor-not-allowed disabled:opacity-20
        "
      >
        <ArrowUp size={16} strokeWidth={2.2} />
      </button>
    </form>
  );
}
