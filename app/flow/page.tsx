'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';
import FlowImageComponent from '@/components/flow/FlowImage';
import { resolveFlowCardComposition } from '@/lib/flow/cardComposition';
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
    <time
      dateTime={value || undefined}
      className="text-xs font-mono tracking-wide text-neutral-400"
    >
      {date}
    </time>
  );
}

function EntryMeta({
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
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 font-mono text-[11px] text-neutral-400">
        <EntryDate item={item} />
      </div>

      {admin && <AdminControls onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

function AdminControls({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-neutral-400 transition hover:text-neutral-900"
        aria-label="Edit post"
        title="Edit"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-neutral-400 transition hover:text-red-600"
        aria-label="Delete post"
        title="Delete"
      >
        Delete
      </button>
    </div>
  );
}

function LinkCard({ preview, itemHref: href }: { preview: FlowLink; itemHref: string }) {
  const domain = preview.siteName || preview.domain || '';

  return (
    <div className="group/card flex items-stretch overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40 transition hover:border-neutral-300 hover:bg-neutral-50">
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <Link
            href={href}
            className="text-[15px] font-medium leading-snug text-neutral-900 group-hover/card:text-neutral-700"
          >
            {preview.title || domain || preview.url}
          </Link>

          {preview.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
              {preview.description}
            </p>
          )}
        </div>

        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block w-fit font-mono text-[11px] tracking-wider text-neutral-400 transition hover:text-neutral-700"
          onClick={(event) => event.stopPropagation()}
        >
          {domain} ↗
        </a>
      </div>

      {preview.image && (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="w-32 shrink-0 sm:w-40">
          <FlowImageComponent
            src={preview.image}
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

function CompactLinkRow({ preview, itemHref: href }: { preview: FlowLink; itemHref: string }) {
  const domain = preview.siteName || preview.domain || '';

  return (
    <div className="group/row flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-100/50">
      <div className="flex min-w-0 items-center gap-3">
        {preview.image ? (
          <FlowImageComponent
            src={preview.image}
            alt=""
            aspectRatio="1 / 1"
            sizes="40px"
            transformWidth={160}
            className="shrink-0 rounded-lg"
            style={{ width: 40, height: 40 }}
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-200/50 font-mono text-xs text-neutral-400">
            ↗
          </div>
        )}

        <div className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            {domain}
          </span>
          <Link
            href={href}
            className="block truncate text-[13px] font-medium leading-tight text-neutral-900 group-hover/row:text-neutral-700"
          >
            {preview.title || domain || preview.url}
          </Link>
        </div>
      </div>

      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${domain}`}
        onClick={(event) => event.stopPropagation()}
        className="shrink-0 p-1 font-mono text-xs text-neutral-400 transition hover:text-neutral-900"
      >
        ↗
      </a>
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
      <figure className="mb-4">
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
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3">
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
      <div className="mb-4 space-y-2.5 sm:space-y-3">
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
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3">
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
    <div className="mb-4 space-y-3">
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

            <span className="mt-2 inline-block font-mono text-[10px] tracking-wider text-neutral-400">
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
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  admin: boolean;
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
      className={`group flow-entry flow-entry--${composition} border-b border-neutral-100 py-8 first:pt-0 last:border-b-0`}
      data-content-type={item.contentType || item.type}
    >
      <EntryMeta item={item} admin={admin} onEdit={onEdit} onDelete={onDelete} />

      {/* Image and video are the lead element whenever they exist. The title
       * and body follow, so text can never visually displace the media. */}
      {hasImages && <GalleryGrid images={images} itemHref={href} />}

      {hasVideos && <VideoCards videos={videos} />}

      {showTitle && (
        <h2 className="mb-2 text-lg font-medium leading-snug text-neutral-900 sm:text-xl">
          <Link href={href} className="transition hover:text-neutral-600">
            {item.title}
          </Link>
        </h2>
      )}

      {body && (
        <div className="mb-4">
          <Link href={href} className="block">
            <p className="whitespace-pre-line font-serif text-[16px] leading-[1.7] text-neutral-800 sm:text-[17px]">
              {body}
            </p>
          </Link>

          {item.bodyTruncated && (
            <Link
              href={href}
              className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400 transition hover:text-neutral-900"
            >
              Read full →
            </Link>
          )}
        </div>
      )}

      {links.length === 1 && (
        <div className="mt-3">
          <LinkCard preview={links[0]} itemHref={href} />
        </div>
      )}

      {links.length > 1 && (
        <div className="mt-3 divide-y divide-neutral-200/50 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40">
          {links.map((preview) => (
            <CompactLinkRow key={preview.url} preview={preview} itemHref={href} />
          ))}
        </div>
      )}
    </article>
  );
}

function LoadingEntries() {
  return (
    <div className="animate-pulse space-y-8" aria-label="Loading Flow" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="border-b border-neutral-100 py-8 first:pt-0">
          <div className="h-3 w-20 rounded bg-neutral-100" />
          <div className="mt-4 h-5 w-3/4 rounded bg-neutral-100" />
          <div className="mt-2.5 h-4 w-1/2 rounded bg-neutral-50" />
        </div>
      ))}
    </div>
  );
}

function Message({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-16 text-center text-sm text-neutral-400">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
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
  const flowViewSentRef = useRef(false);

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
    window.dispatchEvent(new CustomEvent('flow:updated'));
  }, []);

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
      <div className="min-h-screen bg-white px-5 pb-24 pt-20 text-neutral-900 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-2xl">
          <header className="mb-10 border-b border-neutral-100 pb-6">
            <h1 className="font-serif text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl">
              Flow
            </h1>
            <p className="mt-1 font-serif text-sm text-neutral-400">
              Stream of thoughts, media &amp; signals
            </p>
          </header>

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
                {items.map((item) => (
                  <Entry
                    key={item.id}
                    item={item}
                    admin={isAdmin}
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
                {loadingMore && <span className="text-xs text-neutral-400">Loading…</span>}

                {!loadingMore && hasMore && !loadError && (
                  <button
                    type="button"
                    onClick={() => void loadItems(false)}
                    className="text-xs text-neutral-400 transition hover:text-neutral-900"
                  >
                    Load more
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

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
