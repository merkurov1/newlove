import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';

import FlowImageComponent from './FlowImage';
import type { FlowLink } from '@/lib/flow/content';
import { flowLinkKind, internalFlowPath } from '@/lib/flow/linkKind';

export type FlowLinkCardVariant = 'card' | 'row' | 'reader';

type FlowLinkCardProps = {
  link: FlowLink;
  /** The Flow publication this card belongs to. */
  itemHref: string;
  variant?: FlowLinkCardVariant;
};

function titleFor(link: FlowLink): string {
  return link.title || link.siteName || link.domain || link.url;
}

function domainFor(link: FlowLink): string {
  return link.siteName || link.domain || '';
}

function TelegramGlyph({ reader = false }: { reader?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-sm ${
        reader ? 'h-12 w-12' : 'h-9 w-9'
      }`}
    >
      <Send size={reader ? 18 : 15} strokeWidth={2} />
    </span>
  );
}

function InternalGlyph({ size = 'default' }: { size?: 'compact' | 'default' | 'reader' }) {
  const box = size === 'reader' ? 'h-12 w-12' : size === 'compact' ? 'h-10 w-10' : 'h-9 w-9';

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 ${box}`}
    >
      <ArrowRight size={size === 'reader' ? 17 : size === 'compact' ? 15 : 14} strokeWidth={1.7} />
    </span>
  );
}

/**
 * Telegram links get their own quiet card: a paper-plane mark, a cool tint and
 * no external-arrow row. The whole card opens the Telegram destination.
 */
function TelegramLinkCard({ link, variant }: { link: FlowLink; variant: FlowLinkCardVariant }) {
  const title = titleFor(link);

  if (variant !== 'card') {
    const reader = variant === 'reader';

    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        data-link-kind="telegram"
        className={`group/row flex items-center justify-between gap-3 transition hover:bg-[#eef7fc] ${
          reader ? 'gap-4 p-4' : 'p-3'
        }`}
      >
        <span className={`flex min-w-0 items-center ${reader ? 'gap-4' : 'gap-3'}`}>
          {link.image ? (
            <FlowImageComponent
              src={link.image}
              alt=""
              aspectRatio="1 / 1"
              sizes={reader ? '56px' : '40px'}
              transformWidth={160}
              className={`shrink-0 rounded-lg ${reader ? 'rounded-xl' : ''}`}
              style={reader ? { width: 56, height: 56 } : { width: 40, height: 40 }}
            />
          ) : (
            <TelegramGlyph reader={reader} />
          )}

          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-[#3d8fb8]">
              Telegram
            </span>
            <span
              className={`block text-[#123a50] group-hover/row:text-[#0d2d3d] ${
                reader
                  ? 'mt-0.5 font-serif text-[16px] font-medium leading-snug sm:text-[17px]'
                  : 'truncate text-[13px] font-medium leading-tight'
              }`}
            >
              {title}
            </span>
            {reader && link.description && (
              <span className="mt-1 line-clamp-1 block text-xs leading-relaxed text-[#4d7f96]">
                {link.description}
              </span>
            )}
          </span>
        </span>

        <span
          aria-hidden="true"
          className={`shrink-0 p-1 font-mono text-[#3d8fb8] transition group-hover/row:text-[#0d5c80] ${
            reader ? 'text-sm' : 'text-xs'
          }`}
        >
          ↗
        </span>
      </a>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-link-kind="telegram"
      className="group/card flex items-stretch overflow-hidden rounded-2xl border border-[#cfe7f4] bg-[#f4fafe] transition hover:border-[#a9d8ef] hover:bg-[#eaf6fd]"
    >
      <span className="flex flex-1 flex-col justify-between p-4">
        <span className="block">
          <span className="flex items-start gap-3">
            <TelegramGlyph />
            <span className="min-w-0 flex-1 pt-1 text-[15px] font-medium leading-snug text-[#123a50] group-hover/card:text-[#0d2d3d]">
              {title}
            </span>
          </span>

          {link.description && (
            <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#4d7f96]">
              {link.description}
            </span>
          )}
        </span>

        <span className="mt-3 inline-block w-fit font-mono text-[11px] tracking-wider text-[#3d8fb8] transition group-hover/card:text-[#0d5c80]">
          Telegram ↗
        </span>
      </span>

      {link.image && (
        <span className="w-32 shrink-0 sm:w-40">
          <FlowImageComponent
            src={link.image}
            alt=""
            aspectRatio="1 / 1"
            sizes="(max-width: 640px) 128px, 160px"
            transformWidth={320}
          />
        </span>
      )}
    </a>
  );
}

/**
 * A merkurov.love destination stays inside the product: it uses the client
 * router, a neutral paper surface and a forward arrow instead of the external
 * ↗ mark. The whole card is one link.
 */
function InternalLinkCard({
  link,
  itemHref,
  variant,
}: {
  link: FlowLink;
  itemHref: string;
  variant: FlowLinkCardVariant;
}) {
  const href = internalFlowPath(link.url);
  const title = titleFor(link);
  const domain = domainFor(link);

  if (!href) return <ExternalLinkCard link={link} itemHref={itemHref} variant={variant} />;

  if (variant !== 'card') {
    const reader = variant === 'reader';

    return (
      <Link
        href={href}
        data-link-kind="internal"
        className={`group/row flex items-center justify-between gap-3 transition hover:bg-neutral-100/70 ${
          reader ? 'gap-4 p-4' : 'p-3'
        }`}
      >
        <span className={`flex min-w-0 items-center ${reader ? 'gap-4' : 'gap-3'}`}>
          {link.image ? (
            <FlowImageComponent
              src={link.image}
              alt=""
              aspectRatio="1 / 1"
              sizes={reader ? '56px' : '40px'}
              transformWidth={160}
              className={`shrink-0 ${reader ? 'rounded-xl' : 'rounded-lg'}`}
              style={reader ? { width: 56, height: 56 } : { width: 40, height: 40 }}
            />
          ) : (
            <InternalGlyph size={reader ? 'reader' : 'compact'} />
          )}

          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {domain || 'merkurov.love'}
            </span>
            <span
              className={`block text-neutral-900 group-hover/row:text-neutral-700 ${
                reader
                  ? 'mt-0.5 font-serif text-[16px] font-medium leading-snug sm:text-[17px]'
                  : 'truncate text-[13px] font-medium leading-tight'
              }`}
            >
              {title}
            </span>
            {reader && link.description && (
              <span className="mt-1 line-clamp-1 block text-xs leading-relaxed text-neutral-500">
                {link.description}
              </span>
            )}
          </span>
        </span>

        <span
          aria-hidden="true"
          className={`shrink-0 p-1 font-mono text-neutral-500 transition group-hover/row:text-neutral-900 ${
            reader ? 'text-sm' : 'text-xs'
          }`}
        >
          →
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      data-link-kind="internal"
      className="group/card flex items-stretch overflow-hidden rounded-2xl border border-neutral-300/70 bg-white transition hover:border-neutral-400 hover:bg-neutral-50/40"
    >
      <span className="flex flex-1 flex-col justify-between p-4">
        <span className="block">
          <span className="flex items-start gap-3">
            <InternalGlyph />
            <span className="min-w-0 flex-1 pt-1 text-[15px] font-medium leading-snug text-neutral-900 group-hover/card:text-neutral-700">
              {title}
            </span>
          </span>

          {link.description && (
            <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
              {link.description}
            </span>
          )}
        </span>

        <span className="mt-3 inline-block w-fit font-mono text-[11px] tracking-wider text-neutral-500 transition group-hover/card:text-neutral-800">
          {domain || 'merkurov.love'} →
        </span>
      </span>

      {link.image && (
        <span className="w-32 shrink-0 sm:w-40">
          <FlowImageComponent
            src={link.image}
            alt=""
            aspectRatio="1 / 1"
            sizes="(max-width: 640px) 128px, 160px"
            transformWidth={320}
          />
        </span>
      )}
    </Link>
  );
}

/** The unchanged external preview: title opens the Flow post, domain opens the source. */
function ExternalLinkCard({ link, itemHref, variant }: FlowLinkCardProps) {
  const domain = domainFor(link);
  const title = titleFor(link);

  if (variant === 'reader') {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        data-link-kind="external"
        className="group flex min-w-0 items-center justify-between gap-4 p-4 transition hover:bg-stone-100/50"
      >
        <div className="flex min-w-0 items-center gap-4">
          {link.image ? (
            <FlowImageComponent
              src={link.image}
              alt=""
              aspectRatio="1 / 1"
              sizes="56px"
              transformWidth={160}
              className="shrink-0 rounded-xl"
              style={{ width: 56, height: 56 }}
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-200/60 font-mono text-sm text-stone-500">
              ↗
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-stone-500">
              {domain}
            </span>

            <span className="mt-0.5 block truncate font-serif text-[16px] font-medium leading-snug text-stone-900 transition group-hover:text-stone-600 sm:text-[17px]">
              {title}
            </span>

            {link.description && (
              <span className="mt-1 line-clamp-1 block text-xs leading-relaxed text-stone-500">
                {link.description}
              </span>
            )}
          </div>
        </div>

        <span
          aria-hidden="true"
          className="shrink-0 p-1 font-mono text-sm text-stone-500 transition group-hover:text-stone-900"
        >
          ↗
        </span>
      </a>
    );
  }

  if (variant === 'row') {
    return (
      <div
        data-link-kind="external"
        className="group/row flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-100/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          {link.image ? (
            <FlowImageComponent
              src={link.image}
              alt=""
              aspectRatio="1 / 1"
              sizes="40px"
              transformWidth={160}
              className="shrink-0 rounded-lg"
              style={{ width: 40, height: 40 }}
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-200/60 font-mono text-xs text-neutral-500">
              ↗
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {domain}
            </span>
            <Link
              href={itemHref}
              className="block truncate text-[13px] font-medium leading-tight text-neutral-900 group-hover/row:text-neutral-700"
            >
              {title}
            </Link>
          </div>
        </div>

        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${domain}`}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 p-1 font-mono text-xs text-neutral-500 transition hover:text-neutral-900"
        >
          ↗
        </a>
      </div>
    );
  }

  return (
    <div
      data-link-kind="external"
      className="group/card flex items-stretch overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40 transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <Link
            href={itemHref}
            className="text-[15px] font-medium leading-snug text-neutral-900 group-hover/card:text-neutral-700"
          >
            {title}
          </Link>

          {link.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
              {link.description}
            </p>
          )}
        </div>

        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block w-fit font-mono text-[11px] tracking-wider text-neutral-500 transition hover:text-neutral-800"
          onClick={(event) => event.stopPropagation()}
        >
          {domain} ↗
        </a>
      </div>

      {link.image && (
        <Link href={itemHref} tabIndex={-1} aria-hidden="true" className="w-32 shrink-0 sm:w-40">
          <FlowImageComponent
            src={link.image}
            alt=""
            aspectRatio="1 / 1"
            sizes="(max-width: 640px) 128px, 160px"
            transformWidth={320}
          />
        </Link>
      )}
    </div>
  );
}

export default function FlowLinkCard({
  link,
  itemHref,
  variant = 'card',
}: FlowLinkCardProps) {
  const kind = flowLinkKind(link.url);

  if (kind === 'telegram') return <TelegramLinkCard link={link} variant={variant} />;
  if (kind === 'internal') {
    return <InternalLinkCard link={link} itemHref={itemHref} variant={variant} />;
  }

  return <ExternalLinkCard link={link} itemHref={itemHref} variant={variant} />;
}
