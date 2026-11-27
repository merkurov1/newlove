'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PenLine, Trash2 } from 'lucide-react';
import NewPostModal from '@/components/flow/NewPostModal';
import FlowImageComponent from '@/components/flow/FlowImage';
import FlowLinkCard from '@/components/flow/FlowLinkCard';
import FlowHomeScreenPrompt from '@/components/flow/FlowHomeScreenPrompt';
import useIsTelegram from '@/components/useIsTelegram';
import { useTelegramBottomButton } from '@/components/telegram/useTelegramBottomButton';
import { telegramAuthHeaders } from '@/lib/telegram/clientAuth';
import { hapticSelection } from '@/lib/telegram/webApp';
import { resolveFlowCardComposition } from '@/lib/flow/cardComposition';
import { flowDayMarkers } from '@/lib/flow/dayMarker';
import { formatReadingProgress } from '@/lib/flow/readingProgress';
import {
  readFlowFeedPosition,
  readFlowReaderState,
  safeLocalStorage,
  safeSessionStorage,
  writeFlowFeedPosition,
  type FlowFeedPosition,
} from '@/lib/flow/readerState';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';
import { GA_EVENTS, trackGaEvent } from '@/lib/analytics/ga4';

type FlowImage = {
  url: string;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
};

type FlowVideo = {
  url: string;
  provider: 'youtube' | 'other';
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
  author: string | null;
};

type FlowLink = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  domain: string | null;
  inBody: boolean;
};

type FlowItem = {
  id: string;
  title: string;
  slug: string | null;
  lang: string;
  type: string;
  contentType: string;
  status: string;
  visibility: string;
  body_md?: string | null;
  bodyText?: string;
  bodyExcerpt?: string;
  bodyTruncated?: boolean;
  showTitle?: boolean;
  description?: string;
  source_url?: string | null;
  canonicalUrl?: string;
  sourceName?: string;
  images?: FlowImage[];
  videos?: FlowVideo[];
  links?: FlowLink[];
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  bluesky_uri?: string | null;
  telegram_message_id?: string | number | null;
  metadata?: Record<string, unknown> | null;
};

type FlowResponse = {
  items?: FlowItem[];
  hasMore?: boolean;
  error?: string;
};

const PAGE_SIZE = 10;

function itemHref(item: FlowItem) {
  return item.slug ? `/flow/${encodeURIComponent(item.slug)}` : '/flow';
}

function formatDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function EntryDate({ item }: { item: FlowItem }) {
  const value = item.published_at || item.created_at;
  const date = formatDate(value);

  if (!date) return null;

  return (
    <time dateTime={value || undefined} className="flow-entry__date">
      {date}
    </time>
  );
}

function EntryMeta({
  item,
  admin,
  showDate,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  showDate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!showDate && !admin) return null;

  return (
    <div className="flow-entry__meta">
      {showDate && <EntryDate item={item} />}

      {admin && <AdminControls onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

function AdminControls({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flow-entry__admin">
      <button type="button" onClick={onEdit} aria-label="Edit post" title="Edit">
        <PenLine size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        data-action="delete"
        aria-label="Delete post"
        title="Delete"
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function GalleryGrid({ images, itemHref: href }: { images: FlowImage[]; itemHref: string }) {
  if (images.length === 0) return null;

  const altFor = (image: FlowImage, index: number) =>
    image.caption || image.alt || `Image ${index + 1}`;

  if (images.length === 1) {
    const image = images[0];

    return (
      <figure>
        <Link
          href={href}
          className="block w-full overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50 transition hover:border-neutral-300"
        >
          <FlowImageComponent
            src={image.url}
            alt={altFor(image, 0)}
            aspectRatio="4 / 3"
            objectFit="contain"
            sizes="(max-width: 768px) 100vw, 640px"
          />
        </Link>
        {(image.caption || image.alt) && (
          <figcaption className="mt-2 text-xs italic text-neutral-500">
            {image.caption || image.alt}
          </figcaption>
        )}
      </figure>
    );
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {images.slice(0, 2).map((image, index) => (
          <Link
            key={`${image.url}-${index}`}
            href={href}
            className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
          >
            <FlowImageComponent
              src={image.url}
              alt={altFor(image, index)}
              aspectRatio="4 / 3"
              sizes="(max-width: 640px) 50vw, 320px"
            />
          </Link>
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="space-y-2.5 sm:space-y-3">
        <Link
          href={href}
          className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
        >
          <FlowImageComponent
            src={images[0].url}
            alt={altFor(images[0], 0)}
            aspectRatio="16 / 9"
            sizes="(max-width: 768px) 100vw, 640px"
          />
        </Link>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {images.slice(1, 3).map((image, index) => (
            <Link
              key={`${image.url}-${index}`}
              href={href}
              className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
            >
              <FlowImageComponent
                src={image.url}
                alt={altFor(image, index + 1)}
                aspectRatio="4 / 3"
                sizes="(max-width: 640px) 50vw, 320px"
              />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const displayPhotos = images.slice(0, 4);
  const remaining = images.length - 4;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {displayPhotos.map((image, index) => {
        const isLastWithMore = index === 3 && remaining > 0;

        return (
          <Link
            key={`${image.url}-${index}`}
            href={href}
            className="relative block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
          >
            <FlowImageComponent
              src={image.url}
              alt={altFor(image, index)}
              aspectRatio="1 / 1"
              sizes="(max-width: 640px) 50vw, 320px"
            />
            {isLastWithMore && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white backdrop-blur-[2px]">
                <span className="font-mono text-sm font-medium tracking-widest">
                  +{remaining + 1}
                </span>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function VideoCards({ videos }: { videos: FlowVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="space-y-3">
      {videos.map((video, index) => (
        <Link
          key={`${video.url}-${index}`}
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200/60 bg-neutral-50/50 p-3 transition hover:border-neutral-300 hover:bg-neutral-50 sm:p-3.5"
        >
          {video.thumbnail && (
            <div className="relative w-32 shrink-0 overflow-hidden rounded-xl bg-neutral-200 sm:w-40">
              <FlowImageComponent
                src={video.thumbnail}
                alt=""
                aspectRatio="16 / 9"
                sizes="(max-width: 640px) 128px, 160px"
                transformWidth={320}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900/80 text-white shadow backdrop-blur-sm">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="ml-0.5 h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900">
              {video.title || 'Watch video'}
            </span>

            {video.author && (
              <span className="mt-1 block text-xs text-neutral-500">{video.author}</span>
            )}

            <span className="mt-2 inline-block font-mono text-[10px] tracking-wider text-neutral-500">
              {video.provider === 'youtube' ? 'youtube.com' : 'video'} ↗
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Entry({
  item,
  admin,
  showDate,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
  showDate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const href = itemHref(item);
  const images = item.images ?? [];
  const videos = item.videos ?? [];
  const links = (item.links ?? []).filter((link) => !link.inBody);
  const body = item.bodyExcerpt ?? item.bodyText ?? '';
  const showTitle = Boolean(item.showTitle && item.title);
  const hasText = showTitle || Boolean(body);
  const hasImages = images.length > 0;
  const hasVideos = videos.length > 0;
  const composition = resolveFlowCardComposition({
    hasText,
    images: images.length,
    videos: videos.length,
    links: links.length,
  });

  return (
    <article
      className={`group flow-entry flow-entry--${composition}`}
      data-content-type={item.contentType || item.type}
      data-flow-entry-id={item.id}
    >
      <EntryMeta item={item} admin={admin} showDate={showDate} onEdit={onEdit} onDelete={onDelete} />

      {/* Image and video are the lead element whenever they exist. The title
       * and body follow, so text can never visually displace the media. */}
      {hasImages && (
        <div className="flow-entry__media">
          <GalleryGrid images={images} itemHref={href} />
        </div>
      )}

      {hasVideos && (
        <div className="flow-entry__media">
          <VideoCards videos={videos} />
        </div>
      )}

      {showTitle && (
        <h2 className="flow-entry__title">
          <Link href={href}>{item.title}</Link>
        </h2>
      )}

      {body && (
        <div className="flow-entry__body">
          <Link href={href} className="block">
            <p>{body}</p>
          </Link>

          {item.bodyTruncated && (
            <Link href={href} className="flow-entry__more">
              Read full →
            </Link>
          )}
        </div>
      )}

      {links.length === 1 && (
        <div className="flow-entry__links">
          <FlowLinkCard link={links[0]} itemHref={href} variant="card" />
        </div>
      )}

      {links.length > 1 && (
        <div className="flow-entry__links divide-y divide-neutral-200/50 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40">
          {links.map((preview) => (
            <FlowLinkCard key={preview.url} link={preview} itemHref={href} variant="row" />
          ))}
        </div>
      )}
    </article>
  );
}

function LoadingEntries() {
  return (
    <div className="flow-loading" aria-label="Loading Flow" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flow-loading__row animate-pulse">
          <div className="flow-loading__bar h-2.5 w-24" />
          <div className="flow-loading__bar mt-4 h-5 w-3/4" />
          <div className="flow-loading__bar mt-2.5 h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function Message({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flow-page__message">
      <p>{children}</p>
      {action && <div>{action}</div>}
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [continueItem, setContinueItem] = useState<{
    slug: string;
    title: string;
    progress: number;
  } | null>(null);
  const isTelegram = useIsTelegram();

  const observerRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const itemsRef = useRef<FlowItem[]>([]);
  const mountedRef = useRef(false);
  const flowViewSentRef = useRef(false);
  const scrollRestoredRef = useRef(false);
  const pendingRestoreRef = useRef<{
    position: FlowFeedPosition | null;
    attempts: number;
  } | null>(null);

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
      const response = await fetch(`/api/flow/items?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: 'no-store',
      });

      const json = (await response.json().catch(() => ({}))) as FlowResponse;

      if (!response.ok) {
        throw new Error(json.error || 'Could not load Flow.');
      }

      if (!mountedRef.current) return;

      const incoming = Array.isArray(json.items) ? json.items : [];
      const nextItems = reset
        ? incoming
        : [
            ...itemsRef.current,
            ...incoming.filter(
              (incomingItem) =>
                !itemsRef.current.some((existingItem) => existingItem.id === incomingItem.id)
            ),
          ];

      itemsRef.current = nextItems;
      setItems(nextItems);
      setHasMore(Boolean(json.hasMore));
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current) return;

      console.error('[flow] failed to load items:', error);
      setLoadError(error instanceof Error ? error.message : 'Could not load Flow.');
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
        headers: telegramAuthHeaders(),
      });

      if (mountedRef.current) setIsAdmin(response.ok);
    } catch {
      if (mountedRef.current) setIsAdmin(false);
    }
  }, []);

  const deleteItem = useCallback(async (item: FlowItem) => {
    const confirmed = window.confirm(
      `Delete “${item.title || 'this post'}”? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/items/${item.id}`, {
        method: 'DELETE',
        headers: telegramAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || 'Failed to delete item.');
      }

      const nextItems = itemsRef.current.filter((entry) => entry.id !== item.id);

      itemsRef.current = nextItems;
      setItems(nextItems);
      window.dispatchEvent(new CustomEvent('flow:updated'));
    } catch (error) {
      console.error('[flow] delete failed:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to delete item.');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!flowViewSentRef.current) {
      flowViewSentRef.current = true;
      trackGaEvent(GA_EVENTS.flowView, { section: 'flow' });
    }

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

  // Persist a stable anchor, not just a pixel offset: images can load, the
  // Telegram viewport can resize and pagination can change the total height.
  useEffect(() => {
    let frame = 0;
    let lastSavedAt = 0;

    const persist = () => {
      const entries = Array.from(
        document.querySelectorAll<HTMLElement>('[data-flow-entry-id]')
      );
      let anchorId: string | null = null;
      let anchorOffset = 0;

      for (const entry of entries) {
        const rect = entry.getBoundingClientRect();

        if (rect.bottom > 0) {
          anchorId = entry.dataset.flowEntryId ?? null;
          anchorOffset = Math.round(rect.top);
          break;
        }
      }

      writeFlowFeedPosition(safeSessionStorage(), {
        scrollY: window.scrollY,
        anchorId,
        anchorOffset,
        loadedCount: itemsRef.current.length,
      });
    };

    // One anchor write per quarter second is enough for a stable return; a
    // per-frame sessionStorage write would compete with scrolling.
    const saveScroll = () => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;

        const now = Date.now();

        if (now - lastSavedAt < 250) return;

        lastSavedAt = now;
        persist();
      });
    };

    const flush = () => {
      if (frame) window.cancelAnimationFrame(frame);

      frame = 0;
      persist();
    };

    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', flush);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);

      window.removeEventListener('scroll', saveScroll);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useEffect(() => {
    if (loading || scrollRestoredRef.current || items.length === 0) return;

    if (!pendingRestoreRef.current) {
      pendingRestoreRef.current = {
        position: readFlowFeedPosition(safeSessionStorage()),
        attempts: 0,
      };
    }

    const pending = pendingRestoreRef.current;
    const position = pending.position;

    if (!position) {
      scrollRestoredRef.current = true;
      return;
    }

    const anchor = position.anchorId
      ? Array.from(document.querySelectorAll<HTMLElement>('[data-flow-entry-id]')).find(
          (entry) => entry.dataset.flowEntryId === position.anchorId
        )
      : null;

    if (anchor) {
      scrollRestoredRef.current = true;

      // Two frames let the media boxes and font metrics settle before the
      // anchor is measured, so the reader lands on the exact entry.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const top =
            anchor.getBoundingClientRect().top + window.scrollY - position.anchorOffset;

          window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: 'auto' });
        });
      });
      return;
    }

    // The saved entry lives on a later page. Load a bounded number of pages
    // until it is present, then restore; never loop forever.
    if (position.anchorId && hasMore && !loadingMore && pending.attempts < 4) {
      pending.attempts += 1;
      void loadItems(false);
      return;
    }

    scrollRestoredRef.current = true;

    if (position.scrollY > 0) {
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: position.scrollY, behavior: 'auto' })
      );
    }
  }, [hasMore, items.length, loadItems, loading, loadingMore]);

  // A quiet continuation affordance, only for an item that is still in the
  // loaded feed. Deleted or unavailable publications are never linked.
  useEffect(() => {
    if (loading || items.length === 0) {
      setContinueItem(null);
      return;
    }

    const lastRead = readFlowReaderState(safeLocalStorage()).lastRead;

    if (!lastRead || lastRead.progress <= 0.02 || lastRead.progress >= 0.98) {
      setContinueItem(null);
      return;
    }

    const matching = items.find((item) => item.slug === lastRead.slug);

    setContinueItem(
      matching?.slug
        ? {
            slug: matching.slug,
            title: matching.title || lastRead.title || 'Continue reading',
            progress: lastRead.progress,
          }
        : null
    );
  }, [items, loading]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading || loadError) return;

    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingRef.current) {
          void loadItems(false);
        }
      },
      { rootMargin: '360px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadError, loadItems, items.length]);

  const handleEditCreated = useCallback(() => {
    setEditingId(null);
    setComposerOpen(false);
    window.dispatchEvent(new CustomEvent('flow:updated'));
  }, []);

  useTelegramBottomButton({
    text: 'WRITE',
    visible: isTelegram && isAdmin && !editingId && !composerOpen,
    enabled: true,
    onClick: () => {
      hapticSelection();
      setComposerOpen(true);
    },
  });

  const dayMarkers = flowDayMarkers(items);

  return (
    <>
      <JsonLd
        data={collectionPageJsonLd({
          path: '/flow',
          name: 'Flow — notes, signals and artifacts',
          description:
            'A stream of notes, links, images, video and signals selected by Anton Merkurov.',
          inLanguage: 'en',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Flow', path: '/flow' },
        ])}
      />
      <div className="flow-page px-5 pb-24 pt-20 sm:px-8 sm:pt-24">
        <div className="flow-page__column">
          <header className="flow-page__header lg:hidden">
            <h1 className="flow-page__title">Flow</h1>
            <p className="flow-page__subtitle">Stream of thoughts &amp; media</p>
          </header>

          {continueItem && (
            <Link
              href={`/flow/${encodeURIComponent(continueItem.slug)}`}
              className="flow-continue"
            >
              <span className="flow-continue__label">Continue reading</span>
              <span className="flow-continue__title">{continueItem.title}</span>
              <span className="flow-continue__progress">
                {formatReadingProgress(continueItem.progress)}
              </span>
            </Link>
          )}

          {loadError && items.length === 0 ? (
            <Message
              action={
                <button
                  type="button"
                  onClick={() => void loadItems(true)}
                  className="text-neutral-900 underline underline-offset-4"
                >
                  Try again
                </button>
              }
            >
              Could not load Flow.
            </Message>
          ) : loading ? (
            <LoadingEntries />
          ) : items.length === 0 ? (
            <Message
              action={
                <button
                  type="button"
                  onClick={() => void loadItems(true)}
                  className="text-neutral-900 underline underline-offset-4"
                >
                  Refresh
                </button>
              }
            >
              Nothing here yet.
            </Message>
          ) : (
            <>
              <div>
                {items.map((item, index) => (
                  <Entry
                    key={item.id}
                    item={item}
                    admin={isAdmin}
                    showDate={dayMarkers[index] ?? false}
                    onEdit={() => setEditingId(item.id)}
                    onDelete={() => void deleteItem(item)}
                  />
                ))}
              </div>

              {loadError && (
                <Message
                  action={
                    <button
                      type="button"
                      onClick={() => void loadItems(false)}
                      className="text-neutral-900 underline underline-offset-4"
                    >
                      Try again
                    </button>
                  }
                >
                  Could not load more entries.
                </Message>
              )}

              <div ref={observerRef} className="flex min-h-16 items-center justify-center py-6">
                {loadingMore && <span className="text-xs text-neutral-500">Loading…</span>}

                {!loadingMore && hasMore && !loadError && (
                  <button
                    type="button"
                    onClick={() => void loadItems(false)}
                    className="text-xs text-neutral-500 transition hover:text-neutral-900"
                  >
                    Load more
                  </button>
                )}
              </div>

              <FlowHomeScreenPrompt className="flow-home-screen--feed" />
            </>
          )}
        </div>
      </div>

      {editingId && (
        <NewPostModal
          open
          itemId={editingId}
          lang="ru"
          onClose={() => setEditingId(null)}
          onCreated={handleEditCreated}
        />
      )}

      {composerOpen && (
        <NewPostModal
          open
          lang="ru"
          onClose={() => setComposerOpen(false)}
          onCreated={handleEditCreated}
        />
      )}
    </>
  );
}
