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
  bluesky_uri?: string | null;
  telegram_message_id?: string | number | null;
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

function getTelegramUrl(item: FlowItem): string | null {
  const msgId =
    item.telegram_message_id ||
    (getRecord(item.metadata)?.telegram_message_id as string | number | undefined);

  if (msgId) {
    return `https://t.me/merkurov/${msgId}`;
  }
  return null;
}

function getBlueskyUrl(item: FlowItem): string | null {
  const uri =
    item.bluesky_uri ||
    (getString(getRecord(item.metadata)?.bluesky_uri) as string | null);

  if (uri && typeof uri === 'string') {
    const rkey = uri.split('/').pop();
    if (rkey) {
      return `https://bsky.app/profile/merkurov.love/post/${encodeURIComponent(rkey)}`;
    }
  }
  return null;
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function getTitleAndBodyDisplay(item: FlowItem) {
  const rawTitle = (item.title || '').trim();
  const rawBody = plainText(item.body_md).trim();

  if (!rawTitle) {
    return { title: null, body: rawBody || null };
  }

  if (!rawBody) {
    return { title: rawTitle, body: null };
  }

  const normTitle = normalizeForComparison(rawTitle);
  const normBody = normalizeForComparison(rawBody);

  // If title is redundant with body (e.g. title === body or body starts with title)
  if (
    normTitle === normBody ||
    normBody.startsWith(normTitle) ||
    normTitle.startsWith(normBody)
  ) {
    return { title: null, body: rawBody };
  }

  // Also check first line of body
  const firstLine = rawBody.split(/\r?\n/)[0]?.trim() || '';
  const firstLineNorm = normalizeForComparison(firstLine);
  if (
    firstLineNorm &&
    (firstLineNorm === normTitle ||
      normTitle.startsWith(firstLineNorm) ||
      firstLineNorm.startsWith(normTitle))
  ) {
    return { title: null, body: rawBody };
  }

  return { title: rawTitle, body: rawBody };
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
  const tgUrl = getTelegramUrl(item);
  const bskyUrl = getBlueskyUrl(item);

  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 font-mono text-[11px] text-neutral-400">
        <EntryDate item={item} />
        {(tgUrl || bskyUrl) && (
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="text-neutral-300">·</span>
            {tgUrl && (
              <a
                href={tgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-neutral-900"
                title="View on Telegram"
              >
                tg ↗
              </a>
            )}
            {bskyUrl && (
              <a
                href={bskyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-neutral-900"
                title="View on Bluesky"
              >
                bsky ↗
              </a>
            )}
          </div>
        )}
      </div>

      {admin && <AdminControls onEdit={onEdit} onDelete={onDelete} />}
    </div>
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

function CompactLinkRow({
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
    <div className="group/row flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-100/50">
      <div className="flex min-w-0 items-center gap-3">
        {preview.image ? (
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-lg bg-neutral-200 object-cover"
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
            {preview.title || preview.url}
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

function GalleryGrid({
  urls,
  title,
  alt,
  itemHref: href,
}: {
  urls: string[];
  title: string | null;
  alt: string | null;
  itemHref: string;
}) {
  const count = urls.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <div className="mb-4">
        <Link
          href={href}
          className="inline-block max-w-full overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50 transition hover:border-neutral-300"
        >
          <img
            src={urls[0]}
            alt={alt || title || 'Attached image'}
            loading="lazy"
            className="block max-h-[520px] w-auto max-w-full object-cover"
          />
        </Link>
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3">
        {urls.slice(0, 2).map((url, index) => (
          <Link
            key={`${url}-${index}`}
            href={href}
            className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
          >
            <img
              src={url}
              alt={alt || (title ? `${title} — image ${index + 1}` : '')}
              loading="lazy"
              className="block aspect-[4/3] w-full object-cover"
            />
          </Link>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="mb-4 space-y-2.5 sm:space-y-3">
        <Link
          href={href}
          className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
        >
          <img
            src={urls[0]}
            alt={alt || (title ? `${title} — image 1` : '')}
            loading="lazy"
            className="block aspect-[16/9] w-full object-cover"
          />
        </Link>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {urls.slice(1, 3).map((url, index) => (
            <Link
              key={`${url}-${index}`}
              href={href}
              className="block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
            >
              <img
                src={url}
                alt={alt || (title ? `${title} — image ${index + 2}` : '')}
                loading="lazy"
                className="block aspect-[4/3] w-full object-cover"
              />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // 4 or more
  const displayPhotos = urls.slice(0, 4);
  const remaining = count - 4;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3">
      {displayPhotos.map((url, index) => {
        const isLastWithMore = index === 3 && remaining > 0;
        return (
          <Link
            key={`${url}-${index}`}
            href={href}
            className="relative block overflow-hidden rounded-2xl bg-neutral-100 transition hover:opacity-95"
          >
            <img
              src={url}
              alt={alt || (title ? `${title} — image ${index + 1}` : '')}
              loading="lazy"
              className="block aspect-square w-full object-cover"
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
  const display = getTitleAndBodyDisplay(item);

  const linkImages = new Set(
    linkPreviews.map((preview) => preview.image).filter(Boolean),
  );

  const visiblePhotoUrls = photoUrls.filter(
    (url) => url !== youtubeThumbnail && !linkImages.has(url),
  );

  return (
    <article className="group border-b border-neutral-100 py-8 first:pt-0 last:border-b-0">
      {/* Meta header */}
      <EntryMeta
        item={item}
        admin={admin}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {/* Title (rendered only when it doesn't duplicate the body) */}
      {display.title && (
        <h2 className="mb-2 text-lg font-medium leading-snug text-neutral-900 sm:text-xl">
          <Link href={href} className="transition hover:text-neutral-600">
            {display.title}
          </Link>
        </h2>
      )}

      {/* Text body */}
      {display.body && (
        <div className="mb-4">
          <Link href={href} className="block">
            <p className="whitespace-pre-line font-serif text-[16px] leading-[1.7] text-neutral-800 sm:text-[17px]">
              {display.body}
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

      {/* Attached images - Creative and adaptive gallery */}
      {visiblePhotoUrls.length > 0 && (
        <GalleryGrid
          urls={visiblePhotoUrls}
          title={display.title}
          alt={getString(item.metadata?.alt)}
          itemHref={href}
        />
      )}

      {/* Web link cards - single rich card or compact curated list */}
      {linkPreviews.length === 1 && (
        <div className="mt-3">
          <LinkCard preview={linkPreviews[0]} itemHref={href} />
        </div>
      )}

      {linkPreviews.length > 1 && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-50/40 divide-y divide-neutral-200/50">
          {linkPreviews.map((preview) => (
            <CompactLinkRow
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
          <header className="mb-10 flex flex-col justify-between gap-3 border-b border-neutral-100 pb-6 sm:flex-row sm:items-baseline">
            <div>
              <h1 className="font-serif text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl">
                Flow
              </h1>
              <p className="mt-1 font-serif text-sm text-neutral-400">
                Stream of thoughts, media & signals
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
              <a
                href="https://t.me/merkurov"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-neutral-900"
              >
                Telegram ↗
              </a>
              <span className="text-neutral-200">·</span>
              <a
                href="https://bsky.app/profile/merkurov.love"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-neutral-900"
              >
                Bluesky ↗
              </a>
            </div>
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
