
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

type YouTubeMetadata = {
  video_id?: string;
  title?: string;
  author_name?: string | null;
  thumbnail_url?: string;
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

function itemHref(item: FlowItem) {
  return item.slug ? `/flow/${encodeURIComponent(item.slug)}` : '/flow';
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getSiteName(item: FlowItem) {
  const savedName = getString(item.metadata?.site_name);
  if (savedName) return savedName;

  if (!item.source_url) return '';

  try {
    return new URL(item.source_url).hostname.replace(/^www\./, '');
  } catch {
    return item.source_url;
  }
}

function getYouTube(item: FlowItem): YouTubeMetadata | null {
  const value = item.metadata?.youtube;
  return value && typeof value === 'object'
    ? (value as YouTubeMetadata)
    : null;
}

function getYouTubeThumbnail(item: FlowItem) {
  const youtube = getYouTube(item);

  if (youtube?.thumbnail_url) return youtube.thumbnail_url;

  return youtube?.video_id
    ? `https://i.ytimg.com/vi/${encodeURIComponent(youtube.video_id)}/hqdefault.jpg`
    : null;
}

function getPhotoUrl(item: FlowItem): string | null {
  const meta = item.metadata ?? {};
  return (
    getString(meta.public_url) ||
    getString(meta.image) ||
    getString(meta.image_url) ||
    (Array.isArray(meta.images) && meta.images.length > 0 ? getString(meta.images[0]) : null)
  );
}

type LinkPreviewData = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
};

function getLinkPreviewData(item: FlowItem): LinkPreviewData | null {
  const meta = item.metadata ?? {};
  const lp = meta.link_preview as Record<string, unknown> | undefined;

  const candidateUrl =
    (lp && getString(lp.url)) ||
    (item.source_url && !item.source_url.includes('youtube.com') && !item.source_url.includes('youtu.be')
      ? item.source_url
      : null);

  if (!candidateUrl) return null;

  return {
    url: candidateUrl,
    title: (lp && getString(lp.title)) || (item.title !== candidateUrl ? item.title : null) || getSiteName(item),
    description: (lp && getString(lp.description)) || getString(meta.description),
    image: (lp && getString(lp.image)) || getString(meta.image),
    site_name: (lp && getString(lp.site_name)) || getSiteName(item),
  };
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

function plainText(value: string | null | undefined) {
  if (!value) return '';

  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

function EntryDate({ item }: { item: FlowItem }) {
  const value = item.published_at || item.created_at;
  const date = formatDate(value);

  if (!date) return null;

  return (
    <time
      dateTime={value || undefined}
      className="shrink-0 text-xs text-neutral-400"
    >
      {date}
    </time>
  );
}

function AdminControls({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3">
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
        className="text-xs text-neutral-400 transition hover:text-red-700"
        aria-label="Delete post"
        title="Delete"
      >
        Delete
      </button>
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
  const date = <EntryDate item={item} />;

  const controls = admin ? (
    <AdminControls onEdit={onEdit} onDelete={onDelete} />
  ) : null;

  const youtube = getYouTube(item);
  const youtubeThumbnail = youtube ? getYouTubeThumbnail(item) : null;
  const photoUrl = getPhotoUrl(item);
  const linkPreview = getLinkPreviewData(item);
  const body = plainText(item.body_md);

  // Avoid duplicate photo if identical to youtube thumbnail or link preview image
  const showDedicatedPhoto =
    photoUrl &&
    photoUrl !== youtubeThumbnail &&
    (!linkPreview || photoUrl !== linkPreview.image);

  return (
    <article className="group border-b border-neutral-200 py-6 first:pt-0">
      <div className="mb-2.5 flex min-h-5 items-center justify-between gap-4">
        {date}
        {controls}
      </div>

      {/* 1. Title */}
      {item.title && (
        <h2 className="mb-2 text-lg font-medium leading-7 text-neutral-900 transition group-hover:text-neutral-700 sm:text-xl">
          <Link href={href}>{item.title}</Link>
        </h2>
      )}

      {/* 2. Text Body */}
      {body && (
        <div className="mb-3.5">
          <Link href={href} className="block">
            <p className="whitespace-pre-line text-[15px] leading-7 text-neutral-700 sm:text-[16px]">
              {body}
            </p>
          </Link>
        </div>
      )}

      {/* 3. YouTube Embed/Preview */}
      {youtube && (
        <div className="mb-4">
          <Link
            href={href}
            className="flex max-w-xl items-start gap-4 rounded-2xl border border-neutral-200/70 bg-neutral-50/70 p-2.5 transition hover:border-neutral-300 hover:bg-neutral-100/70"
          >
            {youtubeThumbnail && (
              <div className="relative w-32 shrink-0 overflow-hidden rounded-xl bg-neutral-200 sm:w-44">
                <img
                  src={youtubeThumbnail}
                  alt=""
                  loading="lazy"
                  className="block aspect-video h-auto w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white shadow">
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
            <div className="min-w-0 pt-1">
              <span className="line-clamp-2 text-sm font-medium leading-5 text-neutral-900">
                {youtube.title || 'Watch video'}
              </span>
              {youtube.author_name && (
                <span className="mt-1 block text-xs text-neutral-500">
                  {youtube.author_name}
                </span>
              )}
              <span className="mt-1.5 inline-block font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                youtube.com ↗
              </span>
            </div>
          </Link>
        </div>
      )}

      {/* 4. Attached Photo/Image */}
      {showDedicatedPhoto && (
        <div className="mb-4">
          <Link href={href} className="inline-block max-w-full">
            <img
              src={photoUrl}
              alt={getString(item.metadata?.alt) || item.title || ''}
              loading="lazy"
              className="block max-h-[560px] max-w-full rounded-2xl border border-neutral-200/60 object-contain object-left shadow-sm"
            />
          </Link>
        </div>
      )}

      {/* 5. Attached Web Link Card */}
      {linkPreview && (
        <div className="mt-3 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3 transition hover:border-neutral-300 hover:bg-neutral-50">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href={href}
                className="text-sm font-medium leading-5 text-neutral-900 hover:underline"
              >
                {linkPreview.title || linkPreview.url}
              </Link>
              {linkPreview.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
                  {linkPreview.description}
                </p>
              )}
              <a
                href={linkPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-xs font-mono uppercase tracking-wide text-neutral-400 hover:text-neutral-700"
                onClick={(e) => e.stopPropagation()}
              >
                {linkPreview.site_name} ↗
              </a>
            </div>
            {linkPreview.image && (
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden="true"
                className="hidden w-20 shrink-0 sm:block"
              >
                <img
                  src={linkPreview.image}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function LoadingEntries() {
  return (
    <div className="animate-pulse" aria-label="Loading Flow" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="border-b border-neutral-200 py-6">
          <div className="h-3 w-20 rounded bg-neutral-200" />
          <div className="mt-4 h-4 w-3/4 rounded bg-neutral-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function Message({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-10 text-sm text-neutral-500">
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

      if (!mountedRef.current) return;

      const incoming = Array.isArray(json.items) ? json.items : [];
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
    } catch (error) {
      if (!mountedRef.current) return;

      console.error('[flow] failed to load items:', error);
      setLoadError(
        error instanceof Error ? error.message : 'Could not load Flow.',
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

      if (mountedRef.current) setIsAdmin(response.ok);
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
    } catch (error) {
      console.error('[flow] delete failed:', error);
      window.alert(
        error instanceof Error ? error.message : 'Failed to delete item.',
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
        if (entries[0]?.isIntersecting && !isFetchingRef.current) {
          void loadItems(false);
        }
      },
      { rootMargin: '360px 0px', threshold: 0 },
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
      <main className="min-h-screen bg-white px-5 pb-20 pt-24 text-neutral-900 sm:px-8 sm:pt-28">
        <div className="mx-auto max-w-2xl">
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

              <div
                ref={observerRef}
                className="flex min-h-16 items-center justify-center py-6"
              >
                {loadingMore && (
                  <span className="text-xs text-neutral-400">Loading…</span>
                )}

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
