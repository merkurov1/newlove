
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

function getPhotoUrl(item: FlowItem) {
  return getString(item.metadata?.public_url);
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

  if (item.type === 'photo') {
    const image = getPhotoUrl(item);
    const alt = getString(item.metadata?.alt) || item.title || '';

    return (
      <article className="group py-6 first:pt-0">
        <div className="mb-2 flex min-h-5 items-center justify-between gap-4">
          {date}
          {controls}
        </div>

        <Link href={href} className="inline-block max-w-full">
          {image ? (
            <img
              src={image}
              alt={alt}
              loading="lazy"
              className="block max-h-[560px] max-w-full object-contain object-left"
            />
          ) : (
            <span className="text-sm text-neutral-400">Image unavailable</span>
          )}
        </Link>

        {item.title && (
          <p className="mt-2 text-sm text-neutral-600">{item.title}</p>
        )}
      </article>
    );
  }

  if (item.type === 'video') {
    const youtube = getYouTube(item);
    const thumbnail = getYouTubeThumbnail(item);
    const title = youtube?.title || item.title || 'Watch video';

    return (
      <article className="group border-b border-neutral-200 py-5 first:pt-0">
        <div className="mb-2 flex min-h-5 items-center justify-between gap-4">
          {date}
          {controls}
        </div>

        <Link
          href={href}
          className="flex max-w-xl items-start gap-4"
        >
          {thumbnail && (
            <div className="relative w-28 shrink-0 overflow-hidden bg-neutral-100 sm:w-36">
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                className="block aspect-video h-auto w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white">
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

          <span className="min-w-0 pt-0.5 text-sm leading-6 text-neutral-800 transition group-hover:text-neutral-500">
            {title}
            {youtube?.author_name && (
              <span className="mt-1 block text-xs text-neutral-400">
                {youtube.author_name}
              </span>
            )}
          </span>
        </Link>
      </article>
    );
  }

  if (item.type === 'link' && item.source_url) {
    const title = item.title || getSiteName(item) || item.source_url;
    const description = getString(item.metadata?.description);
    const image = getString(item.metadata?.image);

    return (
      <article className="group border-b border-neutral-200 py-5 first:pt-0">
        <div className="mb-2 flex min-h-5 items-center justify-between gap-4">
          {date}
          {controls}
        </div>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <Link
              href={href}
              className="text-base leading-6 text-neutral-900 transition group-hover:text-neutral-500"
            >
              {title}
            </Link>

            {description && (
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-5 text-neutral-500">
                {description}
              </p>
            )}

            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block max-w-full truncate text-xs text-neutral-400 transition hover:text-neutral-700"
              onClick={(event) => event.stopPropagation()}
            >
              {getSiteName(item)} ↗
            </a>
          </div>

          {image && (
            <Link
              href={href}
              tabIndex={-1}
              aria-hidden="true"
              className="hidden w-20 shrink-0 sm:block"
            >
              <img
                src={image}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </Link>
          )}
        </div>
      </article>
    );
  }

  const body = plainText(item.body_md);

  return (
    <article className="group border-b border-neutral-200 py-5 first:pt-0">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-4">
        {date}
        {controls}
      </div>

      <Link href={href} className="block">
        {item.title && (
          <h2 className="text-base font-medium leading-6 text-neutral-900">
            {item.title}
          </h2>
        )}

        {body && (
          <p
            className={`whitespace-pre-line text-[15px] leading-7 text-neutral-700 ${
              item.title ? 'mt-1' : ''
            }`}
          >
            {body}
          </p>
        )}
      </Link>
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
