'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Markdown from 'markdown-to-jsx';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import type { UnframedEvidenceSource } from '@/lib/knowledge/rag/evidence';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import {
  createPierrotId,
  normalizePathname,
  type PierrotChatAction,
} from '@/lib/pierrot/navigation';
import { linkifyInternalRoutes } from '@/lib/pierrot/linkify';
import { isPierrotOfferId } from '@/lib/pierrot/offers';
import { getPierrotConversationId, trackPierrotEvent } from '@/lib/pierrot/clientTelemetry';
import {
  appendPierrotPostcardAttribution,
  appendPierrotSubscriptionAttribution,
  appendPierrotUnframedAttribution,
  createPierrotPostcardRef,
  createPierrotSubscriptionRef,
  createPierrotUnframedRef,
} from '@/lib/pierrot/orderAttribution';

function shouldCloseBeforeNavigation(href: string, pathname: string): boolean {
  if (href.startsWith('#')) return true;
  if (!href.startsWith('/')) return false;

  try {
    const target = new URL(href, 'https://pierrot.local');
    return normalizePathname(target.pathname) === normalizePathname(pathname);
  } catch {
    return false;
  }
}

function mediaEvidenceLabel(source: UnframedEvidenceSource): string | null {
  if (source.sourceType !== 'media_coverage') return null;

  if (source.verificationStatus === 'none') {
    return 'Media evidence — no verified quote';
  }

  if (source.verificationStatus !== 'verified') {
    return 'Excerpt only — no verified quote';
  }

  if (source.quoteType === 'direct_quote') return 'Verified direct quote';
  if (source.quoteType === 'indirect_quote') return 'Verified paraphrase';
  if (source.quoteType === 'mention') return 'Verified mention';

  return 'Verified media evidence';
}

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
  const pathname = usePathname() || '/';

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
                    onClick={() => {
                      if (shouldCloseBeforeNavigation(safe, pathname)) closeConversation();
                    }}
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
      {linkifyInternalRoutes(content)}
    </Markdown>
  );
}

function formatMessageTime(value?: string): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

function shouldShowMessageTime(message: {
  role: string;
  sequence?: number;
  delivery?: string;
}): boolean {
  // Keep the normal AI transcript visually unchanged. Times are introduced
  // only for human-mode messages (which have a server sequence or delivery
  // state) and for Anton's own messages.
  return (
    message.role === 'human' ||
    typeof message.sequence === 'number' ||
    typeof message.delivery === 'string'
  );
}

function deliveryLabel(delivery: 'sending' | 'sent' | 'failed'): string {
  const ru = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru');

  if (delivery === 'sending') return ru ? 'отправка…' : 'sending…';
  if (delivery === 'failed') return ru ? 'не доставлено' : 'not delivered';

  return ru ? 'доставлено' : 'delivered';
}

function OfferImpression({ messageId, offerId }: { messageId: string; offerId: unknown }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || !isPierrotOfferId(offerId)) return;

    const track = () => {
      if (tracked.current) return;
      tracked.current = true;
      trackPierrotEvent('offer_viewed', messageId, { offer_id: offerId });
    };

    const element = ref.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      track();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          track();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [messageId, offerId]);

  return <span ref={ref} className="sr-only" aria-hidden="true" />;
}

function AnswerFeedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  const submit = (value: 'up' | 'down') => {
    if (rating) return;
    setRating(value);
    trackPierrotEvent('answer_feedback', messageId, {
      rating: value,
      message_id: messageId,
    });
  };

  return (
    <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#A49A8C]">
      <span>Was this useful?</span>
      <button
        type="button"
        aria-label="Useful answer"
        onClick={() => submit('up')}
        disabled={rating !== null}
        className={`border px-1.5 py-0.5 transition ${
          rating === 'up'
            ? 'border-[#8CA18A] text-[#4F6B4D]'
            : 'border-[#DDD3C5] hover:border-[#8CA18A]'
        } disabled:opacity-50`}
      >
        Yes
      </button>
      <button
        type="button"
        aria-label="Not a useful answer"
        onClick={() => submit('down')}
        disabled={rating !== null}
        className={`border px-1.5 py-0.5 transition ${
          rating === 'down'
            ? 'border-[#C9A0AA] text-[#8A1235]'
            : 'border-[#DDD3C5] hover:border-[#C9A0AA]'
        } disabled:opacity-50`}
      >
        No
      </button>
    </div>
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
  const { closeConversation, startConversation } = usePierrot();
  const pathname = usePathname() || '/';

  return (
    <div className="mx-auto my-auto w-full max-w-2xl px-1 py-3 sm:py-8">
      <p className="text-center font-serif text-sm italic tracking-wide text-zinc-600 sm:text-lg">
        Structure is the antidote to chaos.
      </p>

      <div className="mt-5 flex justify-center sm:mt-7">
        <button
          type="button"
          onClick={startConversation}
          className="
            group inline-flex items-center gap-3 rounded-full border
            border-zinc-900/20 bg-white/80 px-5 py-2.5 font-serif text-base
            font-normal italic tracking-wide text-[#111111] shadow-sm
            backdrop-blur-sm transition-all duration-300 hover:bg-[#111111]
            hover:text-[#FAF8F5] sm:px-7 sm:py-3.5 sm:text-lg
          "
        >
          Ask Pierrot something
          <ArrowUpRight
            size={17}
            className="
              text-zinc-600 transition-all duration-300
              group-hover:-translate-y-0.5 group-hover:translate-x-0.5
              group-hover:text-[#FAF8F5]
            "
          />
        </button>
      </div>

      <nav aria-label="Pierrot site navigation" className="mt-6 space-y-2 sm:mt-10 sm:space-y-4">
        <Link
          href="/"
          onClick={() => {
            if (shouldCloseBeforeNavigation('/', pathname)) closeConversation();
          }}
          className="group flex items-baseline justify-between gap-4"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500 transition-colors group-hover:text-[#111111]">
            Anton Merkurov
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#B8B0A4]">
            Home
          </span>
        </Link>

        {PIERROT_MENU.map((section) => (
          <div key={section.href} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link
              href={section.href}
              onClick={() => {
                if (shouldCloseBeforeNavigation(section.href, pathname)) closeConversation();
              }}
              className="
                font-serif text-xl font-normal leading-tight tracking-tight
                text-[#111111] underline-offset-8 transition-colors
                hover:text-zinc-600 hover:underline hover:decoration-zinc-300
                sm:text-3xl
              "
            >
              {section.label}
            </Link>

            <Link
              href={section.child.href}
              onClick={() => {
                if (shouldCloseBeforeNavigation(section.child.href, pathname)) closeConversation();
              }}
              className="
                font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500
                transition-colors hover:text-[#111111] sm:text-[11px]
              "
            >
              {section.child.label}
            </Link>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function PierrotMessageList({ className = '' }: { className?: string }) {
  const { messages, isLoading, runAction, closeConversation, isHumanActive } = usePierrot();
  const pathname = usePathname() || '/';
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
      data-pierrot-messages
      aria-live="polite"
      style={{
        // Keep the transcript usable on a keyboard-short landscape viewport
        // without changing the normal 20/24px editorial spacing.
        paddingBlock: 'clamp(0px, calc(var(--pierrot-viewport-height, 100dvh) - 280px), 1.5rem)',
      }}
      className={`
        min-h-0 min-w-0 overflow-y-auto overscroll-contain
        px-5 sm:px-7
        ${className}
      `}
    >
      <div className="mx-auto flex min-h-full w-full min-w-0 max-w-3xl flex-col justify-end">
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
                className={`flex flex-col ${
                  message.role === 'user'
                    ? 'items-end'
                    : message.role === 'system'
                      ? 'items-center'
                      : 'items-start'
                }`}
              >
                {message.role === 'system' ? (
                  <p className="max-w-[92%] text-center font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
                    {message.content}
                  </p>
                ) : message.role === 'human' ? (
                  <div className="flex max-w-[92%] flex-col items-start sm:max-w-[80%]">
                    <span className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#8A8175]">
                      Anton
                    </span>
                    <div
                      className="
                        whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm
                        border border-[#DDD3C5] bg-white/75 px-4 py-2.5
                        font-serif text-[15px] leading-[1.65] text-[#37332D]
                        sm:text-[16px]
                      "
                    >
                      {message.content}
                    </div>
                    {shouldShowMessageTime(message) && formatMessageTime(message.createdAt) && (
                      <span className="mt-1 font-mono text-[8px] text-[#A49A8C]">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    )}
                  </div>
                ) : message.role === 'user' ? (
                  <div className="flex max-w-[88%] flex-col items-end sm:max-w-[78%]">
                    <div
                      className="
                        whitespace-pre-wrap break-words
                        rounded-2xl rounded-br-sm bg-[#ECE5D9] px-4 py-2.5
                        font-serif text-[15px] leading-[1.65] text-[#37332D]
                        sm:text-[16px]
                      "
                    >
                      {message.content}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[8px] text-[#A49A8C]">
                      {shouldShowMessageTime(message) && formatMessageTime(message.createdAt) && (
                        <span>{formatMessageTime(message.createdAt)}</span>
                      )}
                      {message.delivery && (
                        <span
                          className={message.delivery === 'failed' ? 'text-[#8A1235]' : undefined}
                        >
                          {deliveryLabel(message.delivery)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="
                      max-w-[96%] break-words font-serif text-[16px]
                      leading-[1.75] text-[#2F2B26] sm:text-[17px]
                    "
                  >
                    <PierrotMarkdown content={message.content} />
                    {shouldShowMessageTime(message) && formatMessageTime(message.createdAt) && (
                      <span className="mt-1 block font-mono text-[8px] text-[#A49A8C]">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    )}
                  </div>
                )}

                {message.role === 'assistant' && (message.offerId || message.cta?.offerId) && (
                  <OfferImpression
                    messageId={message.id}
                    offerId={message.offerId ?? message.cta?.offerId}
                  />
                )}

                {!isHumanActive &&
                  message.role === 'assistant' &&
                  message.actions &&
                  message.actions.length > 0 && (
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

                {!isHumanActive && message.role === 'assistant' && message.cta && (
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
                          if (shouldCloseBeforeNavigation(message.cta!.href, pathname)) {
                            closeConversation();
                          }
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

                {!isHumanActive &&
                  message.role === 'assistant' &&
                  message.links &&
                  message.links.length > 0 && (
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
                          onClick={() => {
                            if (shouldCloseBeforeNavigation(link.href, pathname)) {
                              closeConversation();
                            }
                          }}
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

                {message.ragOutcome && message.ragOutcome !== 'relevant_results' && (
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#A49A8C]">
                    {message.ragOutcome === 'unavailable'
                      ? 'Brain retrieval is unavailable right now.'
                      : 'No sufficiently relevant Brain passage was retrieved.'}
                  </p>
                )}

                {message.evidence && message.evidence.length > 0 && (
                  <details className="mt-3 rounded-xl border border-[#E4DCCF] bg-[#F8F5EF]/70 px-3 py-2">
                    <summary className="cursor-pointer select-none font-mono text-[9px] uppercase tracking-[0.14em] text-[#7D7468]">
                      Sources · {message.evidence.length}
                    </summary>
                    <ul className="mt-2 space-y-3">
                      {message.evidence.map((source) => (
                        <li
                          key={source.chunkId}
                          className="border-t border-[#E9E1D5] pt-2 first:border-0 first:pt-0"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-sans text-[11px] font-semibold leading-snug text-[#4D463D]">
                              {source.documentTitle || source.heading}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] text-[#9C9284]">
                              {source.similarity.toFixed(3)}
                            </span>
                          </div>
                          {mediaEvidenceLabel(source) && (
                            <span className="mt-1 inline-flex rounded border border-[#D8C9B7] bg-white/70 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7A5A45]">
                              {mediaEvidenceLabel(source)}
                            </span>
                          )}
                          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#A49A8C]">
                            {source.sourceDomain
                              ? `${source.sourceDomain} · `
                              : source.sourceClass
                                ? `${source.sourceClass.replace(/_/g, ' ')} · `
                                : ''}
                            {source.publishedAt ? `${source.publishedAt} · ` : ''}
                            {source.heading}
                            {source.sourceType === 'media_coverage'
                              ? ''
                              : ` · ${source.sectionPath.join(' / ')} · lines ${source.lineStart}–${source.lineEnd}`}
                          </p>
                          <p className="mt-1.5 font-serif text-[12px] leading-relaxed text-[#625B50]">
                            {source.excerpt}
                          </p>
                          {source.canonicalUrl && (
                            <a
                              href={source.canonicalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex font-mono text-[8px] uppercase tracking-[0.1em] text-[#8A6A4F] underline underline-offset-2"
                            >
                              Original publication ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {message.role === 'assistant' && <AnswerFeedback messageId={message.id} />}

                {message.role === 'assistant' && message.provider && (
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

const PIERROT_INPUT_MIN_HEIGHT = 38;
const PIERROT_INPUT_MAX_HEIGHT = 144;

export function PierrotInput({
  placeholder = 'Write to Pierrot…',
  className = '',
}: {
  placeholder?: string;
  className?: string;
}) {
  const { draft, draftCaret, isLoading, isHumanActive, updateDraft, sendMessage } = usePierrot();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);

  caretRef.current = draftCaret;

  // Restore the caret when the user focuses the composer themselves. The
  // previous effect focused the textarea whenever loading changed, which
  // reopened the mobile keyboard on mount and after every response.
  const handleFocus = () => {
    const input = inputRef.current;
    if (!input) return;

    const position = Math.min(caretRef.current ?? input.value.length, input.value.length);
    input.setSelectionRange(position, position);
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const resizeInput = () => {
      // The CSS max-height is derived from the modal's authoritative viewport
      // variable, so a short visual viewport (keyboard in landscape) shrinks
      // the composer before it can push the footer past the screen edge.
      const cssMaxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight);
      const maxHeight = Number.isFinite(cssMaxHeight)
        ? Math.min(cssMaxHeight, PIERROT_INPUT_MAX_HEIGHT)
        : PIERROT_INPUT_MAX_HEIGHT;

      const nextHeight = Math.min(
        Math.max(input.scrollHeight, PIERROT_INPUT_MIN_HEIGHT),
        maxHeight
      );

      input.style.height = `${nextHeight}px`;
      input.style.overflowY = input.scrollHeight > nextHeight ? 'auto' : 'hidden';
    };

    resizeInput();

    const modal = input.closest('[data-pierrot-modal]');
    if (!modal || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(resizeInput);
    observer.observe(modal);

    return () => observer.disconnect();
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
      data-pierrot-composer
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={`
        flex min-w-0 items-end gap-2 rounded-2xl border border-[#E3DACD]
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
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        readOnly={isLoading}
        aria-disabled={isLoading || undefined}
        data-pierrot-input
        aria-label={isHumanActive ? 'Message Anton' : 'Message Pierrot'}
        style={{
          // Grow to 144px, then scroll internally. On a short keyboard-visible
          // viewport the 264px reserve keeps header + footer + a message row
          // inside the modal. The viewport variable comes from PierrotChat.
          maxHeight: 'clamp(38px, calc(var(--pierrot-viewport-height, 100dvh) - 264px), 144px)',
        }}
        className="
          min-h-[38px] min-w-0 flex-1 resize-none
          overflow-y-auto border-0 bg-transparent px-2 py-1.5
          font-serif text-[16px] leading-relaxed text-[#37332D]
          outline-none placeholder:text-[#B8B0A4]
          focus:outline-none focus:ring-0 aria-disabled:opacity-60
        "
      />

      <button
        type="submit"
        data-pierrot-send
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
