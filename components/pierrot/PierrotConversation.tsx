'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Square } from 'lucide-react';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import type { UnframedEvidenceSource } from '@/lib/knowledge/rag/evidence';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import {
  createPierrotId,
  normalizePathname,
  type PierrotChatAction,
} from '@/lib/pierrot/navigation';
import { parseRecipeResponse } from '@/lib/pierrot/recipeParser';
import PierrotMarkdown from '@/components/pierrot/PierrotMarkdown';
import PierrotResponseRenderer from '@/components/pierrot/response/PierrotResponseRenderer';
import type { PierrotResponse } from '@/lib/pierrot/response/types';
import { isPierrotOfferId } from '@/lib/pierrot/offers';
import RecipeCard from '@/components/pierrot/RecipeCard';
import {
  detectPierrotInterfaceLanguage,
  getPierrotGreeting,
  getPierrotStarters,
} from '@/lib/pierrot/onboarding';
import { getPierrotConversationId, trackPierrotEvent } from '@/lib/pierrot/clientTelemetry';
import {
  appendPierrotPostcardAttribution,
  appendPierrotSubscriptionAttribution,
  appendPierrotTributeAttribution,
  appendPierrotUnframedAttribution,
  createPierrotPostcardRef,
  createPierrotSubscriptionRef,
  createPierrotTributeRef,
  createPierrotUnframedRef,
} from '@/lib/pierrot/orderAttribution';

function useInterfaceLanguage(): 'ru' | 'en' {
  const [language, setLanguage] = useState<'ru' | 'en'>('en');

  useEffect(() => {
    setLanguage(detectPierrotInterfaceLanguage());
  }, []);

  return language;
}

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

function PierrotAssistantContent({
  content,
  response,
  streaming = false,
}: {
  content: string;
  response?: PierrotResponse;
  streaming?: boolean;
}) {
  // Streaming always uses stable Markdown. Once the server has completed the
  // answer and validated the structured payload, the registry takes over.
  if (response && !streaming) {
    return <PierrotResponseRenderer response={response} fallbackMarkdown={content} />;
  }

  const parsed = parseRecipeResponse(content);

  // A recipe structure is only meaningful once the complete reply is known.
  // While streaming, render the partial text as ordinary Markdown.
  if (!parsed || streaming) return <PierrotMarkdown content={content} streaming={streaming} />;

  return (
    <>
      {parsed.before && <PierrotMarkdown content={parsed.before} />}
      <RecipeCard recipe={parsed.recipe} />
      {parsed.after && (
        <div className="mt-3">
          <PierrotMarkdown content={parsed.after} />
        </div>
      )}
    </>
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
    <div className="mt-4 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8F8578]">
      <span className="mr-0.5 normal-case tracking-[0.06em]">Was this useful?</span>
      <button
        type="button"
        aria-label="Useful answer"
        aria-pressed={rating === 'up'}
        onClick={() => submit('up')}
        disabled={rating !== null}
        className={`rounded-full px-2 py-0.5 transition ${
          rating === 'up'
            ? 'bg-[#EEF3EC] text-[#4F6B4D]'
            : 'text-[#8F8578] hover:bg-[#F4EFE7] hover:text-[#4F6B4D]'
        } disabled:cursor-default`}
      >
        Yes
      </button>
      <span aria-hidden="true" className="text-[#D5CCBF]">
        /
      </span>
      <button
        type="button"
        aria-label="Not a useful answer"
        aria-pressed={rating === 'down'}
        onClick={() => submit('down')}
        disabled={rating !== null}
        className={`rounded-full px-2 py-0.5 transition ${
          rating === 'down'
            ? 'bg-[#F8EAF0] text-[#8A1235]'
            : 'text-[#8F8578] hover:bg-[#F8EAF0] hover:text-[#8A1235]'
        } disabled:cursor-default`}
      >
        No
      </button>
    </div>
  );
}

function PierrotEmptyState() {
  const { runAction } = usePierrot();
  const language = useInterfaceLanguage();
  const [opening, invitation] = getPierrotGreeting(language).split('\n\n');
  const starters = getPierrotStarters(language);

  return (
    <div className="mx-auto my-auto w-full max-w-2xl px-1 py-6 sm:py-10">
      <p className="mb-5 font-serif text-sm italic tracking-wide text-[#8A8175]">
        Structure is the antidote to chaos.
      </p>

      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#A5764F]">
        Pierrot · merkurov.love
      </p>

      <h2 className="mt-4 max-w-xl font-serif text-[24px] font-normal leading-[1.2] tracking-[-0.015em] text-[#1F1C18] sm:text-[30px]">
        {opening}
      </h2>

      <p className="mt-3 max-w-xl font-serif text-[14.5px] leading-[1.7] text-[#625B50] sm:text-[15.5px]">
        {invitation}
      </p>

      <nav aria-label="Ways to begin" className="mt-7 border-t border-[#E2D9CC]">
        {starters.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => runAction(starter.action)}
            className="
              group flex w-full items-center gap-4 border-b border-[#E9E2D7]
              py-3.5 text-left transition-colors
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#B9AB98] focus-visible:ring-offset-2
            "
          >
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[17px] leading-tight text-[#2F2B26] transition-colors group-hover:text-[#111111] sm:text-[18px]">
                {starter.title}
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-[#8A8175]">
                {starter.description}
              </span>
            </span>
            <ArrowUpRight
              size={16}
              aria-hidden="true"
              className="shrink-0 text-[#B8B0A4] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#37332D]"
            />
          </button>
        ))}
      </nav>

      <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#A49A8C]">
        {language === 'ru' ? 'Или просто напишите ниже' : 'Or simply write below'}
      </p>
    </div>
  );
}

export function PierrotMessageList({
  className = '',
  onScrollStateChange,
}: {
  className?: string;
  onScrollStateChange?: (scrolled: boolean) => void;
}) {
  const { messages, isLoading, runAction, closeConversation, isHumanActive } = usePierrot();
  const pathname = usePathname() || '/';
  const interfaceLanguage = useInterfaceLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const shouldReduceMotion = usePrefersReducedMotion();
  const hasStreamingContent = messages.some(
    (message) => message.streaming === true && message.content.trim().length > 0
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      // The empty state is an invitation, not a transcript. Always show it
      // from the top; real conversations follow the reader's position instead
      // of yanking them to the bottom while a long answer streams in.
      if (messages.length === 0) {
        container.scrollTop = 0;
        return;
      }

      if (atBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
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
      onScroll={(event) => {
        const element = event.currentTarget;
        atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        onScrollStateChange?.(element.scrollTop > 0);
      }}
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
            {messages.map((message) => {
              // The placeholder exists so deltas have a stable target. Until
              // the first token arrives, the single "Thinking…" row is enough.
              if (message.role === 'assistant' && message.streaming && !message.content.trim()) {
                return null;
              }

              return (
                <motion.article
                  key={message.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
                  className={`flex min-w-0 flex-col ${
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
                    <div className="flex max-w-[86%] flex-col items-end sm:max-w-[74%]">
                      <div
                        className="
                        whitespace-pre-wrap break-words rounded-[18px] rounded-br-[7px]
                        border border-[#D8CCBA]/70 bg-[#EAE2D5] px-3.5 py-2.5
                        font-serif text-[14.5px] leading-[1.65] text-[#37332D]
                        sm:px-4 sm:text-[15.5px]
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
                      min-w-0 max-w-[94%] break-words font-serif text-[15.5px]
                      leading-[1.8] text-[#2F2B26] sm:max-w-[92%] sm:text-[16.5px]
                    "
                    >
                      <PierrotAssistantContent
                        content={message.content}
                        response={message.response}
                        streaming={message.streaming}
                      />
                      {message.streaming && message.content.trim() && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-[1em] w-[0.45em] translate-y-[0.12em] animate-pulse bg-[#B08A5A]"
                        />
                      )}
                      {message.interrupted && (
                        <p className="mt-3 border-l border-[#C9A97A] pl-2.5 font-mono text-[9px] leading-relaxed tracking-[0.04em] text-[#8A8175]">
                          {interfaceLanguage === 'ru'
                            ? 'Ответ прерван. Сообщение сохранено — можно спросить ещё раз.'
                            : 'The answer was interrupted. Your message is preserved — you can ask again.'}
                        </p>
                      )}
                      {shouldShowMessageTime(message) &&
                        !message.streaming &&
                        formatMessageTime(message.createdAt) && (
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
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EDE7DE] pt-3">
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
                              bg-[#2B2723] px-3.5 py-2 font-mono
                              text-[10px] font-medium uppercase tracking-[0.12em]
                              text-[#FAF8F5] shadow-none ring-1 ring-black/5
                              transition hover:bg-[#171411]
                              focus-visible:outline-none focus-visible:ring-2
                              focus-visible:ring-[#B5AAA0] focus-visible:ring-offset-2
                              disabled:opacity-40
                            `
                                : `
                              inline-flex items-center rounded-full
                              border border-[#D9CDBC] bg-transparent px-3.5 py-2
                              font-mono text-[10px] font-medium uppercase
                              tracking-[0.12em] text-[#5B544A]
                              transition hover:border-[#A99B89] hover:bg-[#F7F3EC]
                              focus-visible:outline-none focus-visible:ring-2
                              focus-visible:ring-[#B5AAA0] focus-visible:ring-offset-2
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
                    <div className="mt-4">
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
                          inline-flex items-center rounded-full bg-[#2B2723] px-4 py-2
                          font-mono text-[10px] font-medium uppercase tracking-[0.12em]
                          text-[#FAF8F5] shadow-none ring-1 ring-black/5
                          transition hover:bg-[#171411]
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[#B5AAA0] focus-visible:ring-offset-2
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
                                  : message.cta.offerId === 'temple_tribute'
                                    ? appendPierrotTributeAttribution(
                                        message.cta.href,
                                        createPierrotTributeRef(getPierrotConversationId())
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
                          inline-flex items-center rounded-full bg-[#2B2723] px-4 py-2
                          font-mono text-[10px] font-medium uppercase tracking-[0.12em]
                          text-[#FAF8F5] shadow-none ring-1 ring-black/5
                          transition hover:bg-[#171411]
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[#B5AAA0] focus-visible:ring-offset-2
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
                        className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EDE7DE] pt-3"
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
                          border border-[#D9CDBC] bg-transparent px-3.5 py-1.5
                          font-mono text-[9.5px] font-medium uppercase
                          tracking-[0.12em] text-[#5B544A]
                          transition hover:border-[#A99B89] hover:bg-[#F7F3EC]
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[#B5AAA0] focus-visible:ring-offset-2
                        "
                          >
                            {link.label}
                          </Link>
                        ))}
                      </nav>
                    )}

                  {message.ragOutcome && message.ragOutcome !== 'relevant_results' && (
                    <p className="mt-3 border-l border-[#D9CDBC] pl-2.5 font-mono text-[9px] leading-relaxed tracking-[0.04em] text-[#8A8175]">
                      {message.ragOutcome === 'unavailable'
                        ? 'Brain retrieval is unavailable right now.'
                        : 'No sufficiently relevant Brain passage was retrieved.'}
                    </p>
                  )}

                  {message.evidence && message.evidence.length > 0 && (
                    <details className="mt-4 w-full border-t border-[#E4DCCF] pt-2">
                      <summary className="cursor-pointer select-none font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8A8175] transition-colors hover:text-[#5B544A]">
                        Sources · {message.evidence.length}
                      </summary>
                      <ul className="mt-2.5 space-y-3">
                        {message.evidence.map((source) => (
                          <li
                            key={source.chunkId}
                            className="border-t border-[#E9E1D5] pt-2.5 first:border-0 first:pt-0"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-sans text-[11.5px] font-semibold leading-snug text-[#4D463D]">
                                {source.documentTitle || source.heading}
                              </span>
                              <span className="shrink-0 font-mono text-[8.5px] text-[#9C9284]">
                                {source.similarity.toFixed(3)}
                              </span>
                            </div>
                            {mediaEvidenceLabel(source) && (
                              <span className="mt-1 inline-flex rounded-[3px] border border-[#D8C9B7] bg-transparent px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.1em] text-[#7A5A45]">
                                {mediaEvidenceLabel(source)}
                              </span>
                            )}
                            <p className="mt-0.5 font-mono text-[8px] uppercase leading-relaxed tracking-[0.08em] text-[#A49A8C]">
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
                            <p className="mt-1.5 font-serif text-[12px] leading-[1.65] text-[#625B50]">
                              {source.excerpt}
                            </p>
                            {source.canonicalUrl && (
                              <a
                                href={source.canonicalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex font-mono text-[8px] uppercase tracking-[0.1em] text-[#8A6A4F] underline decoration-[#B08A5A]/50 underline-offset-2 hover:text-[#5B3F2A]"
                              >
                                Original publication ↗
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {message.role === 'assistant' &&
                    !message.error &&
                    !message.streaming &&
                    !message.interrupted && <AnswerFeedback messageId={message.id} />}

                  {message.role === 'assistant' &&
                    !message.error &&
                    !message.streaming &&
                    (message.provider || message.answerSources) && (
                      <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#B0A79B]">
                        {message.answerSources?.label}
                        {message.answerSources && message.provider ? ' · ' : ''}
                        {message.provider ? `via ${message.provider}` : ''}
                      </span>
                    )}
                </motion.article>
              );
            })}

            {isLoading && !hasStreamingContent && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#898277]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#8CA18A]" />
                <span>{interfaceLanguage === 'ru' ? 'Пьеро думает…' : 'Thinking…'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const PIERROT_INPUT_MIN_HEIGHT = 44;
const PIERROT_INPUT_MAX_HEIGHT = 168;

export function PierrotInput({
  placeholder = 'Write to Pierrot…',
  className = '',
}: {
  placeholder?: string;
  className?: string;
}) {
  const { draft, draftCaret, isLoading, isHumanActive, updateDraft, sendMessage, stopGeneration } =
    usePierrot();
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
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    submit();
  };

  return (
    <form
      data-pierrot-composer
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={`
        flex min-w-0 items-end gap-1.5 rounded-[26px] border border-[#D8CBB8]
        bg-white p-1.5 shadow-[0_4px_20px_rgba(75,62,45,0.07)]
        transition-[border-color,box-shadow] duration-200
        focus-within:border-[#8C7B67]
        focus-within:shadow-[0_6px_26px_rgba(75,62,45,0.12)]
        hover:border-[#C8B9A4] sm:gap-2 sm:p-2
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
          // Grow naturally to 168px, then scroll internally. On a short
          // keyboard-visible viewport the same viewport variable caps growth
          // so the composer cannot push the footer past the screen edge.
          maxHeight: 'clamp(44px, calc(var(--pierrot-viewport-height, 100dvh) - 264px), 168px)',
        }}
        className="
          min-h-[44px] min-w-0 flex-1 resize-none
          overflow-y-auto border-0 bg-transparent px-3 py-2.5
          font-serif text-[16px] leading-[1.5] text-[#37332D]
          outline-none placeholder:text-[#B8B0A4]
          focus:outline-none focus:ring-0 aria-disabled:opacity-60
          sm:px-4 sm:text-[17px]
        "
      />

      {isLoading ? (
        <button
          type="button"
          data-pierrot-stop
          onClick={stopGeneration}
          aria-label="Stop generating"
          className="
            flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full border border-[#CFC1AF] bg-white text-[#4A443D]
            transition hover:border-[#8C7B67] hover:bg-[#F7F3EC]
            active:scale-95 focus:outline-none focus:ring-2
            focus:ring-[#B9AB98] focus:ring-offset-2
            sm:h-11 sm:w-11
          "
        >
          <Square size={12} strokeWidth={2} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          data-pierrot-send
          disabled={!draft.trim()}
          aria-label="Send message"
          className="
            flex h-10 w-10 shrink-0 items-center justify-center
            rounded-full bg-[#2B2723] text-[#FAF8F5] shadow-sm
            ring-1 ring-black/5 transition-all duration-200
            hover:bg-[#171411] hover:shadow-md
            active:scale-95 disabled:cursor-not-allowed disabled:opacity-25
            disabled:shadow-none focus:outline-none focus:ring-2
            focus:ring-[#B9AB98] focus:ring-offset-2
            sm:h-11 sm:w-11
          "
        >
          <ArrowUp size={18} strokeWidth={2.2} />
        </button>
      )}
    </form>
  );
}
