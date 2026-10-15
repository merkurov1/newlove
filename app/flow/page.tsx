
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

type YouTubeMetadata = {
  video_id?: string;
  title?: string;
  author_name?: string | null;
  author_url?: string | null;
  thumbnail_url?: string;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  provider_name?: string;
};

type FlowItem = {
  id: string;
  title: string | null;
  slug: string | null;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md?: string | null;
  source_url?: string | null;
  metadata?: Record<string, unknown> | null;
  published_at?: string | null;
  created_at?: string | null;
};

type FlowResponse = {
  items?: FlowItem[];
  hasMore?: boolean;
  error?: string;
};

const PAGE_SIZE = 10;

function excerpt(body: string | null | undefined): string {
  if (!body) return '';

  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function itemHref(item: FlowItem): string {
  return item.slug
    ? `/flow/${encodeURIComponent(item.slug)}`
    : '/flow';
}

function getSiteName(item: FlowItem): string {
  const siteName = item.metadata?.site_name;

  if (typeof siteName === 'string' && siteName.trim()) {
    return siteName.trim();
  }

  if (!item.source_url) return '';

  try {
    return new URL(item.source_url).hostname.replace(/^www\./, '');
  } catch {
    return item.source_url;
  }
}

function getImage(item: FlowItem): string | null {
  const value = item.metadata?.image;
  return typeof value === 'string' && value.trim() ? value : null;
}

function getPhotoUrl(item: FlowItem): string | null {
  const value = item.metadata?.public_url;
  return typeof value === 'string' && value.trim() ? value : null;
}

function getYouTube(item: FlowItem): YouTubeMetadata | null {
  const value = item.metadata?.youtube;

  if (!value || typeof value !== 'object') return null;

  return value as YouTubeMetadata;
}

function getYouTubeThumbnail(item: FlowItem): string | null {
  const youtube = getYouTube(item);

  if (youtube?.thumbnail_url) return youtube.thumbnail_url;

  const videoId = youtube?.video_id;

  return videoId
    ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
    : null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function ItemMeta({
  item,
  label,
}: {
  item: FlowItem;
  label?: string;
}) {
  const date = formatDate(item.published_at || item.created_at);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#948A7D]">
      {label && <span>{label}</span>}
      {label && date && <span aria-hidden="true">/</span>}
      {date && <time dateTime={item.published_at || item.created_at || undefined}>{date}</time>}
    </div>
  );
}

function Controls({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
      <button
        type="button"
        onClick={onEdit}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E9E1D6] bg-[#FAF8F5]/95 text-[#71685C] backdrop-blur transition hover:border-[#CFC3B1] hover:bg-white hover:text-[#39352F]"
        aria-label="Edit post"
        title="Edit"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E9E1D6] bg-[#FAF8F5]/95 text-[#71685C] backdrop-blur transition hover:border-[#E6C7BD] hover:bg-white hover:text-[#A34F40]"
        aria-label="Delete post"
        title="Delete"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="m19 6-1 14H6L5 6" />
          <path d="M10 10v6M14 10v6" />
        </svg>
      </button>
    </div>
  );
}

function CardFrame({
  children,
  admin,
  onEdit,
  onDelete,
  className = '',
}: {
  children: React.ReactNode;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      {admin && (
        <Controls
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      {children}
    </div>
  );
}

function LinkCard({
  item,
  admin,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const image = getImage(item);
  const description =
    typeof item.metadata?.description === 'string'
      ? item.metadata.description
      : null;
  const siteName = getSiteName(item);

  return (
    <CardFrame
      admin={admin}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <Link
        href={itemHref(item)}
        className="grid overflow-hidden rounded-2xl border border-[#E8E1D7] bg-[#FDFBF8] transition duration-300 hover:border-[#CFC4B5] sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        {image && (
          <div className="relative aspect-[16/10] overflow-hidden bg-[#EEE9E0] sm:aspect-auto sm:min-h-[250px]">
            <img
              src={image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8">
          <ItemMeta item={item} label="Link" />

          {siteName && (
            <div className="mt-4 truncate font-mono text-[10px] tracking-wide text-[#9B9082]">
              {siteName}
            </div>
          )}

          <h2 className="mt-2 font-serif text-[25px] font-normal leading-[1.2] tracking-[-0.025em] text-[#39352F] sm:text-[29px]">
            {item.title || item.source_url || 'Untitled link'}
          </h2>

          {description && (
            <p className="mt-3 line-clamp-4 font-serif text-[15px] leading-7 text-[#777064]">
              {description}
            </p>
          )}

          <span className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#82786A] transition group-hover:text-[#39352F]">
            Open entry
            <span aria-hidden="true">↗</span>
          </span>
        </div>
      </Link>
    </CardFrame>
  );
}

function YouTubeCard({
  item,
  admin,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const youtube = getYouTube(item);
  const thumbnail = getYouTubeThumbnail(item);
  const title = youtube?.title || item.title || 'YouTube video';
  const channel = youtube?.author_name;

  return (
    <CardFrame
      admin={admin}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <Link
        href={itemHref(item)}
        className="block overflow-hidden rounded-2xl border border-[#E8E1D7] bg-[#FDFBF8] transition duration-300 hover:border-[#CFC4B5]"
      >
        <div className="relative aspect-video overflow-hidden bg-[#E8E3DA]">
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
            />
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/5 transition group-hover:bg-black/15">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white/95 text-[#39352F] shadow-sm transition group-hover:scale-105">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 h-5 w-5"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>

          <span className="absolute bottom-4 left-4 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white backdrop-blur">
            YouTube
          </span>
        </div>

        <div className="p-6 sm:p-8">
          <ItemMeta item={item} label="Video" />

          {channel && (
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[#948A7D]">
              {channel}
            </div>
          )}

          <h2 className="mt-2 max-w-2xl font-serif text-[26px] font-normal leading-tight tracking-[-0.02em] text-[#39352F] sm:text-[32px]">
            {title}
          </h2>
        </div>
      </Link>
    </CardFrame>
  );
}

function PhotoCard({
  item,
  admin,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const image = getPhotoUrl(item);
  const alt =
    typeof item.metadata?.alt === 'string'
      ? item.metadata.alt
      : item.title || 'Flow image';

  return (
    <CardFrame
      admin={admin}
      onEdit={onEdit}
      onDelete={onDelete}
      className="overflow-hidden rounded-2xl border border-[#E8E1D7] bg-[#F1EDE6]"
    >
      <Link href={itemHref(item)} className="block">
        {image ? (
          <div className="flex max-h-[680px] items-center justify-center overflow-hidden">
            <img
              src={image}
              alt={alt}
              loading="lazy"
              className="max-h-[680px] w-full object-contain transition duration-500 group-hover:scale-[1.005]"
            />
          </div>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.15em] text-[#948A7D]">
            Image unavailable
          </div>
        )}

        {(item.title || item.published_at || item.created_at) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E1D9CD] bg-[#FDFBF8] px-5 py-4 sm:px-6">
            {item.title && (
              <span className="font-serif text-[17px] text-[#514A40]">
                {item.title}
              </span>
            )}
            <ItemMeta item={item} label="Image" />
          </div>
        )}
      </Link>
    </CardFrame>
  );
}

function TextCard({
  item,
  admin,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const body = excerpt(item.body_md);

  return (
    <CardFrame
      admin={admin}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <Link
        href={itemHref(item)}
        className="block rounded-2xl border border-[#E8E1D7] bg-[#FDFBF8] px-6 py-7 transition duration-300 hover:border-[#CFC4B5] sm:px-10 sm:py-10"
      >
        <ItemMeta item={item} label="Note" />

        {item.title && (
          <h2 className="mt-5 font-serif text-[25px] font-normal leading-tight tracking-[-0.02em] text-[#39352F] sm:text-[29px]">
            {item.title}
          </h2>
        )}

        {body && (
          <p className="mt-4 whitespace-pre-wrap font-serif text-[19px] font-normal leading-[1.75] text-[#625B50] sm:text-[21px]">
            {body}
            {item.body_md && excerpt(item.body_md).length >= 360 ? '…' : ''}
          </p>
        )}

        <span className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#948A7D] transition group-hover:text-[#39352F]">
          Read entry
          <span aria-hidden="true">↗</span>
        </span>
      </Link>
    </CardFrame>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading Flow" aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-[#E8E1D7] bg-[#FDFBF8] p-7 sm:p-9"
        >
          <div className="h-2.5 w-24 rounded-full bg-[#E8E1D7]" />
          <div className="mt-6 h-6 w-3/4 rounded bg-[#EEE8DF]" />
          <div className="mt-4 h-3 w-full rounded bg-[#F0EBE4]" />
          <div className="mt-2 h-3 w-4/5 rounded bg-[#F0EBE4]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReload }: { onReload: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#DCD3C6] px-6 py-16 text-center sm:py-20">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9A8F80]">
        A quiet beginning
      </div>
      <h2 className="mt-4 font-serif text-3xl font-normal tracking-tight text-[#514A40]">
        Nothing here yet.
      </h2>
      <p className="mx-auto mt-3 max-w-sm font-serif text-base leading-7 text-[#8B8174]">
        Notes, links, images and videos will appear here as they are published.
      </p>
      <button
        type="button"
        onClick={onReload}
        className="mt-7 rounded-full border border-[#DCD3C6] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#71685C] transition hover:border-[#BDB09E] hover:bg-white"
      >
        Refresh
      </button>
    </div>
  );
}

export default function FlowPage() {
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const observerRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const itemsRef = useRef<FlowItem[]>([]);
  const mountedRef = useRef(false);

  const loadItems = useCallback(async (reset = false) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;

    if (reset) {
      setLoading(true);
      setLoadError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : itemsRef.current.length;
      const response = await fetch(
        `/api/flow/items?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: 'no-store' },
      );

      const json = (await response.json().catch(() => ({}))) as FlowResponse;

      if (!response.ok) {
        throw new Error(json.error || 'Could not load Flow.');
      }

      const incoming = Array.isArray(json.items) ? json.items : [];

      if (!mountedRef.current) return;

      const nextItems = reset
        ? incoming
        : [
            ...itemsRef.current,
            ...incoming.filter(
              (incomingItem) =>
                !itemsRef.current.some(
                  (existingItem) => existingItem.id === incomingItem.id,
                ),
            ),
          ];

      itemsRef.current = nextItems;
      setItems(nextItems);
      setHasMore(Boolean(json.hasMore));
      setLoadError(null);
    } catch (cause) {
      if (!mountedRef.current) return;

      console.error('[flow] failed to load items:', cause);
      setLoadError(
        cause instanceof Error ? cause.message : 'Could not load Flow.',
      );
    } finally {
      isFetchingRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const checkAdmin = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/items/list', {
        cache: 'no-store',
      });

      if (mountedRef.current) {
        setIsAdmin(response.ok);
      }
    } catch {
      if (mountedRef.current) setIsAdmin(false);
    }
  }, []);

  const deleteItem = useCallback(async (item: FlowItem) => {
    const confirmed = window.confirm(
      `Delete “${item.title || 'this post'}”? This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/items/${item.id}`, {
        method: 'DELETE',
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || 'Failed to delete item.');
      }

      const nextItems = itemsRef.current.filter(
        (entry) => entry.id !== item.id,
      );

      itemsRef.current = nextItems;
      setItems(nextItems);
      window.dispatchEvent(new CustomEvent('flow:updated'));
    } catch (cause) {
      console.error('[flow] delete failed:', cause);
      window.alert(
        cause instanceof Error ? cause.message : 'Failed to delete item.',
      );
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    void loadItems(true);
    void checkAdmin();

    const handleUpdated = () => {
      void loadItems(true);
    };

    window.addEventListener('flow:updated', handleUpdated);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('flow:updated', handleUpdated);
    };
  }, [checkAdmin, loadItems]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading || loadError) return;

    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          !isFetchingRef.current
        ) {
          void loadItems(false);
        }
      },
      {
        rootMargin: '360px 0px',
        threshold: 0,
      },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadError, loadItems, items.length]);

  const handleEditCreated = useCallback(() => {
    setEditingId(null);
    window.dispatchEvent(new CustomEvent('flow:updated'));
  }, []);

  return (
    <>
      <main className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-28 text-[#39352F] sm:px-8 sm:pt-36">
        <div className="mx-auto max-w-4xl">
          <header className="mb-10 border-b border-[#E5DDD1] pb-8 sm:mb-14 sm:pb-10">
            <div className="flex items-center justify-between gap-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8E8375]">
                Anton Merkurov
                <span className="mx-2 text-[#C9BFB1]">/</span>
                <span className="text-[#514A40]">Flow</span>
              </div>

              <div className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-[#A69B8D] sm:block">
                Notes · Links · Moving images
              </div>
            </div>

            <div className="mt-8 flex flex-col justify-between gap-5 sm:mt-10 sm:flex-row sm:items-end">
              <div>
                <h1 className="font-serif text-[48px] font-normal leading-[0.98] tracking-[-0.045em] text-[#39352F] sm:text-[68px]">
                  Flow<span className="text-[#B5A795]">.</span>
                </h1>
                <p className="mt-4 max-w-xl font-serif text-[17px] leading-7 text-[#81776B] sm:text-[18px]">
                  A living stream of notes, references, images and things worth keeping.
                </p>
              </div>

              <div className="flex items-center gap-3 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9A8F81]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A0A68E]" />
                <span>{loading ? 'Updating' : 'Open archive'}</span>
              </div>
            </div>
          </header>

          {loadError && items.length === 0 ? (
            <div
              className="rounded-2xl border border-[#E8D8CF] bg-[#FBF5F1] px-6 py-10 text-center"
              role="alert"
            >
              <p className="font-serif text-xl text-[#77594F]">
                Flow could not be loaded.
              </p>
              <p className="mt-2 font-mono text-xs text-[#9B7D72]">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void loadItems(true)}
                className="mt-6 rounded-full border border-[#D9C2B7] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#77594F] transition hover:bg-white"
              >
                Try again
              </button>
            </div>
          ) : loading ? (
            <FeedSkeleton />
          ) : items.length === 0 ? (
            <EmptyState onReload={() => void loadItems(true)} />
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between border-b border-[#EAE3D9] pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8E8375]">
                  The stream
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[#A69B8D]">
                  {String(items.length).padStart(2, '0')}
                  {hasMore ? '+' : ''}
                </span>
              </div>

              <div className="space-y-6 sm:space-y-7">
                {items.map((item) => {
                  const cardProps = {
                    item,
                    admin: isAdmin,
                    onEdit: () => setEditingId(item.id),
                    onDelete: () => void deleteItem(item),
                  };

                  return (
                    <article key={item.id}>
                      {item.type === 'video' ? (
                        <YouTubeCard {...cardProps} />
                      ) : item.type === 'link' && item.source_url ? (
                        <LinkCard {...cardProps} />
                      ) : item.type === 'photo' ? (
                        <PhotoCard {...cardProps} />
                      ) : (
                        <TextCard {...cardProps} />
                      )}
                    </article>
                  );
                })}
              </div>

              {loadError && (
                <div
                  className="mt-8 flex flex-col gap-3 rounded-xl border border-[#E8D8CF] bg-[#FBF5F1] p-5 sm:flex-row sm:items-center sm:justify-between"
                  role="alert"
                >
                  <p className="font-serif text-sm text-[#77594F]">
                    Could not load the next entries.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadItems(false)}
                    className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-[#77594F] underline underline-offset-4 sm:self-auto"
                  >
                    Try again
                  </button>
                </div>
              )}

              <div
                ref={observerRef}
                className="flex min-h-28 flex-col items-center justify-center py-8"
              >
                {loadingMore && (
                  <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9A8F81]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A69B8D]" />
                    Loading more
                  </div>
                )}

                {!loadingMore && hasMore && !loadError && (
                  <button
                    type="button"
                    onClick={() => void loadItems(false)}
                    className="rounded-full border border-[#DCD3C6] bg-[#FDFBF8] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71685C] transition hover:border-[#BDB09E] hover:text-[#39352F]"
                  >
                    Load more
                  </button>
                )}

                {!hasMore && !loadingMore && !loadError && (
                  <div className="pt-5 text-center">
                    <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#B3A898]">
                      End of flow
                    </div>
                    <div className="mx-auto mt-4 h-px w-10 bg-[#DCD3C6]" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {editingId && (
        <NewPostModal
          open
          itemId={editingId}
          onClose={() => setEditingId(null)}
          onCreated={handleEditCreated}
        />
      )}
    </>
  );
}
