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

type LinkPreviewData = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
};

const PAGE_SIZE = 10;

function itemHref(item: FlowItem) {
  return item.slug ? `/flow/${encodeURIComponent(item.slug)}` : '/flow';
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
  return getRecord(item.metadata?.youtube) as YouTubeMetadata | null;
}

function getYouTubeThumbnail(item: FlowItem) {
  const youtube = getYouTube(item);

  if (youtube?.thumbnail_url) return youtube.thumbnail_url;

  return youtube?.video_id
    ? `https://i.ytimg.com/vi/${encodeURIComponent(youtube.video_id)}/hqdefault.jpg`
    : null;
}

function getPhotoUrls(item: FlowItem): string[] {
  const meta = item.metadata ?? {};
  const urls: string[] = [];

  if (Array.isArray(meta.images)) {
    for (const value of meta.images) {
      const url =
        getString(value) ||
        getString(getRecord(value)?.url) ||
        getString(getRecord(value)?.public_url);

      if (url) urls.push(url);
    }
  }

  for (const key of ['public_url', 'image', 'image_url', 'og_image']) {
    const url = getString(meta[key]);
    if (url) urls.push(url);
  }

  return [...new Set(urls)];
}

function isYouTubeUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    return (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be'
    );
  } catch {
    return /(?:youtube\.com|youtu\.be)/i.test(value);
  }
}

function getLinkPreviewData(item: FlowItem): LinkPreviewData[] {
  const meta = item.metadata ?? {};
  const candidates: LinkPreviewData[] = [];

  const addPreview = (value: unknown) => {
    const preview = getRecord(value);
    if (!preview) return;

    const url = getString(preview.url);
    if (!url) return;

    candidates.push({
      url,
      title: getString(preview.title),
      description: getString(preview.description),
      image: getString(preview.image),
      site_name: getString(preview.site_name),
    });
  };

  if (Array.isArray(meta.link_previews)) {
    meta.link_previews.forEach(addPreview);
  }

  addPreview(meta.link_preview);

  const sourceUrl = getString(item.source_url);
  if (sourceUrl && !isYouTubeUrl(sourceUrl)) {
    const alreadyPresent = candidates.some((preview) => preview.url === sourceUrl);

    if (!alreadyPresent) {
      candidates.push({
        url: sourceUrl,
        title:
          (item.title && item.title !== sourceUrl ? item.title : null) ||
          getSiteName(item) ||
          sourceUrl,
        description: getString(meta.description),
        image: getString(meta.og_image) || getString(meta.image),
        site_name: getSiteName(item),
      });
    }
  }

  const seen = new Set<string>();

  return candidates.filter((preview) => {
    if (seen.has(preview.url)) return false;
    seen.add(preview.url);
    return true;
  });
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
      className="text-xs font-medium tracking-wide text-neutral-400"
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

function LinkCard({
  preview,
  itemHref: href,
}: {
  preview: LinkPreviewData;
  itemHref: string;
}) {
  let domain = preview.site_name || '';

  if (!domain) {
    try {
      domain = new URL(preview.url).hostname.replace(/^www\./, '');
    } catch {
      domain = preview.url;
    }
  }

  return (
    <div className="group/card flex items-stretch overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40 transition hover:border-neutral-300 hover:bg-neutral-50">
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <Link
            href={href}
            className="text-[15px] font-medium leading-snug text-neutral-900 group-hover/card:text-neutral-700"
          >
            {preview.title || preview.url}
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
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="relative w-32 shrink-0 sm:w-40"
        >
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </Link>
      )}
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
  const youtube = getYouTube(item);
  const youtubeThumbnail = youtube ? getYouTubeThumbnail(item) : null;
  const photoUrls = getPhotoUrls(item);
  const linkPreviews = getLinkPreviewData(item);
  const body = plainText(item.body_md);

  const linkImages = new Set(
    linkPreviews.map((preview) => preview.image).filter(Boolean),
  );

  const visiblePhotoUrls = photoUrls.filter(
    (url) => url !== youtubeThumbnail && !linkImages.has(url),
  );

  return (
    <article className="group border-b border-neutral-100 py-8 first:pt-0 last:border-b-0">
      {/* Meta header */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <EntryDate item={item} />
        {admin && <AdminControls onEdit={onEdit} onDelete={onDelete} />}
      </div>

      {/* Title */}
      {item.title && (
        <h2 className="mb-2.5 text-lg font-normal leading-relaxed text-neutral-900 sm:text-xl">
          <Link href={href} className="transition hover:text-neutral-600">
            {item.title}
          </Link>
        </h2>
      )}

      {/* Text body */}
      {body && (
        <div className="mb-4">
          <Link href={href} className="block">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-700 sm:text-[16px]">
              {body}
            </p>
          </Link>
        </div>
      )}

      {/* YouTube card */}
      {youtube && (
        <div className="mb-4">
          <Link
            href={href}
            className="flex items-center gap-4 rounded-2xl border border-neutral-200/60 bg-neutral-50/50 p-3 transition hover:border-neutral-300 hover:bg-neutral-50 sm:p-3.5"
          >
            {youtubeThumbnail && (
              <div className="relative w-32 shrink-0 overflow-hidden rounded-xl bg-neutral-200 sm:w-40">
                <img
                  src={youtubeThumbnail}
                  alt=""
                  loading="lazy"
                  className="block aspect-video h-auto w-full object-cover"
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
                {youtube.title || 'Watch video'}
              </span>

              {youtube.author_name && (
                <span className="mt-1 block text-xs text-neutral-500">
                  {youtube.author_name}
                </span>
              )}

              <span className="mt-2 inline-block font-mono text-[10px] tracking-wider text-neutral-400">
                youtube.com ↗
              </span>
            </div>
          </Link>
        </div>
      )}

      {/* Attached images */}
      {visiblePhotoUrls.length > 0 && (
        <div
          className={
            visiblePhotoUrls.length === 1
              ? 'mb-4'
              : 'mb-4 grid grid-cols-2 gap-2.5 sm:gap-3'
          }
        >
          {visiblePhotoUrls.map((url, index) => (
            <Link
              key={`${url}-${index}`}
              href={href}
              className={
                visiblePhotoUrls.length === 1
                  ? 'inline-block max-w-full overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50'
                  : 'block min-w-0 overflow-hidden rounded-2xl bg-neutral-100'
              }
            >
              <img
                src={url}
                alt={
                  getString(item.metadata?.alt) ||
                  (item.title ? `${item.title} — image ${index + 1}` : '')
                }
                loading="lazy"
                className={
                  visiblePhotoUrls.length === 1
                    ? 'block max-h-[520px] w-auto object-cover'
                    : 'block aspect-[4/3] h-full max-h-[360px] w-full object-cover transition duration-300 hover:scale-[1.01]'
                }
              />
            </Link>
          ))}
        </div>
      )}

      {/* Web link cards */}
      {linkPreviews.length > 0 && (
        <div className="mt-3 grid gap-2.5">
          {linkPreviews.map((preview) => (
            <LinkCard
              key={preview.url}
              preview={preview}
              itemHref={href}
            />
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

function Message({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
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
      <main className="min-h-screen bg-white px-5 pb-24 pt-20 text-neutral-900 sm:px-8 sm:pt-24">
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
                    className="text-xs text-neutral-400 transition hover:text-neutral-900"
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
