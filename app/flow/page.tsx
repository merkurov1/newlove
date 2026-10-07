'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

type YouTubeMetadata = {
  video_id?: string;
  title?: string;
  author_name?: string | null;
  author_url?: string | null;
  thumbnail_url?: string;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  provider_name?: 'YouTube' | string;
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
};

function excerpt(
  body:
    | string
    | null
    | undefined,
) {
  if (!body) {
    return '';
  }

  return body
    .replace(
      /!\[[^\]]*\]\([^)]*\)/g,
      '',
    )
    .replace(
      /\[([^\]]+)\]\([^)]*\)/g,
      '$1',
    )
    .replace(
      /^#{1,6}\s+/gm,
      '',
    )
    .replace(
      /^>\s+/gm,
      '',
    )
    .replace(
      /[*_`]/g,
      '',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim()
    .slice(0, 280);
}

function itemHref(
  item: FlowItem,
) {
  return item.slug
    ? `/flow/${encodeURIComponent(
        item.slug,
      )}`
    : '#';
}

function Controls({
  item,
  onEdit,
  onDelete,
}: {
  item: FlowItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onEdit();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900"
        aria-label="Edit"
        title="Edit"
      >
        <span className="text-xs">
          ↗
        </span>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-600"
        aria-label="Delete"
        title="Delete"
      >
        ×
      </button>
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
  const metadata =
    item.metadata ?? {};

  const image =
    typeof metadata.image ===
    'string'
      ? metadata.image
      : null;

  const description =
    typeof metadata.description ===
    'string'
      ? metadata.description
      : null;

  const siteName =
    typeof metadata.site_name ===
    'string'
      ? metadata.site_name
      : item.source_url
      ? (() => {
          try {
            return new URL(
              item.source_url!,
            ).hostname;
          } catch {
            return item.source_url;
          }
        })()
      : '';

  return (
    <div className="group relative">
      {admin && (
        <Controls
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      <Link
        href={itemHref(item)}
        className="block overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[#FAF8F5] transition hover:border-stone-400"
      >
        {image && (
          <div className="aspect-[16/8] overflow-hidden bg-stone-100">
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
            />
          </div>
        )}

        <div className="p-6 sm:p-7">
          {siteName && (
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
              {siteName}
            </div>
          )}

          <div className="mt-3 font-serif text-2xl font-light leading-tight text-stone-900">
            {item.title ||
              item.source_url}
          </div>

          {description && (
            <p className="mt-3 font-serif text-base leading-7 text-stone-600">
              {description}
            </p>
          )}
        </div>
      </Link>
    </div>
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
  const metadata =
    item.metadata ?? {};

  const youtube =
    metadata.youtube &&
    typeof metadata.youtube ===
      'object' &&
    metadata.youtube !== null
      ? (metadata.youtube as YouTubeMetadata)
      : null;

  const videoId =
    youtube?.video_id ?? null;

  const thumbnail =
    youtube?.thumbnail_url ??
    (videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null);

  const title =
    youtube?.title ||
    item.title ||
    'YouTube video';

  const channel =
    youtube?.author_name ||
    null;

  return (
    <div className="group relative">
      {admin && (
        <Controls
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      <Link
        href={itemHref(item)}
        className="block overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white transition hover:border-stone-400"
      >
        <div className="relative aspect-video overflow-hidden bg-stone-100">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.015]"
            />
          ) : (
            <div className="h-full w-full bg-stone-100" />
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition duration-300 group-hover:bg-black/10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition duration-300 group-hover:scale-105">
              <span
                className="ml-1 text-[22px] text-stone-900"
                aria-hidden="true"
              >
                ▶
              </span>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 font-mono text-[9px] uppercase tracking-[0.2em] text-white drop-shadow-md">
            YouTube
          </div>
        </div>

        <div className="p-6 sm:p-7">
          {channel && (
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
              {channel}
            </div>
          )}

          <div className="mt-2 font-serif text-2xl font-light leading-tight text-stone-900">
            {title}
          </div>
        </div>
      </Link>
    </div>
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
  const image =
    item.metadata &&
    typeof item.metadata
      .public_url ===
      'string'
      ? item.metadata
          .public_url
      : null;

  return (
    <div className="group relative overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white">
      {admin && (
        <Controls
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      <Link
        href={itemHref(item)}
        className="block overflow-hidden"
      >
        {image ? (
          <div className="overflow-hidden bg-stone-100">
            <img
              src={image}
              alt={
                item.metadata &&
                typeof item
                  .metadata
                  .alt ===
                  'string'
                  ? item.metadata
                      .alt
                  : ''
              }
              className="max-h-[620px] w-full object-contain transition duration-700 group-hover:scale-[1.01]"
            />
          </div>
        ) : (
          <div className="min-h-[320px] bg-stone-50" />
        )}
      </Link>
    </div>
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
  return (
    <div className="group relative">
      {admin && (
        <Controls
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      <Link
        href={itemHref(item)}
        className="block rounded-[1.75rem] border border-stone-200/80 bg-white p-7 transition hover:border-stone-400 sm:p-10"
      >
        <div className="whitespace-pre-wrap font-serif text-[20px] font-light leading-[1.8] text-stone-800 sm:text-[23px]">
          {excerpt(
            item.body_md,
          )}
        </div>
      </Link>
    </div>
  );
}

export default function FlowPage() {
  const [
    items,
    setItems,
  ] =
    useState<FlowItem[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    isAdmin,
    setIsAdmin,
  ] =
    useState(false);

  const [
    editingId,
    setEditingId,
  ] =
    useState<string | null>(
      null,
    );

  async function loadItems() {
    try {
      setLoading(true);

      const response =
        await fetch(
          '/api/flow/items',
          {
            cache:
              'no-store',
          },
        );

      const json =
        await response.json();

      setItems(
        Array.isArray(
          json.items,
        )
          ? json.items
          : [],
      );
    } catch (error) {
      console.error(
        '[flow] failed to load items',
        error,
      );

      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function checkAdmin() {
    try {
      const response =
        await fetch(
          '/api/admin/items/list',
          {
            cache:
              'no-store',
          },
        );

      setIsAdmin(
        response.ok,
      );
    } catch {
      setIsAdmin(false);
    }
  }

  async function deleteItem(
    item: FlowItem,
  ) {
    const confirmed =
      window.confirm(
        `Delete “${
          item.title ||
          'this post'
        }”?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/admin/items/${item.id}`,
          {
            method:
              'DELETE',
          },
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ??
            'Failed to delete item.',
        );
      }

      setItems(
        (current) =>
          current.filter(
            (entry) =>
              entry.id !==
              item.id,
          ),
      );

      window.dispatchEvent(
        new CustomEvent(
          'flow:updated',
        ),
      );
    } catch (error) {
      console.error(
        '[flow] delete failed:',
        error,
      );

      window.alert(
        error instanceof Error
          ? error.message
          : 'Failed to delete item.',
      );
    }
  }

  useEffect(() => {
    void loadItems();
    void checkAdmin();

    const handleUpdated =
      () => {
        void loadItems();
      };

    window.addEventListener(
      'flow:updated',
      handleUpdated,
    );

    return () => {
      window.removeEventListener(
        'flow:updated',
        handleUpdated,
      );
    };
  }, []);

  return (
    <>
      <main className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-28 text-stone-900 sm:px-8 sm:pt-36">
        <div className="mx-auto max-w-4xl">
          <header className="mb-12">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
              Flow
            </div>
          </header>

          {loading ? (
            <div className="rounded-[2rem] border border-stone-200/80 bg-white/70 p-10 font-serif text-lg text-stone-400">
              Loading…
            </div>
          ) : items.length ===
            0 ? (
            <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/60 p-12 text-center font-serif text-lg text-stone-400">
              Nothing here yet.
            </div>
          ) : (
            <div className="space-y-8">
              {items.map(
                (item) => (
                  <article
                    key={item.id}
                  >
                    {item.type ===
                      'video' ? (
                      <YouTubeCard
                        item={item}
                        admin={
                          isAdmin
                        }
                        onEdit={() =>
                          setEditingId(
                            item.id,
                          )
                        }
                        onDelete={() =>
                          void deleteItem(
                            item,
                          )
                        }
                      />
                    ) : item.type ===
                        'link' &&
                      item.source_url ? (
                      <LinkCard
                        item={item}
                        admin={
                          isAdmin
                        }
                        onEdit={() =>
                          setEditingId(
                            item.id,
                          )
                        }
                        onDelete={() =>
                          void deleteItem(
                            item,
                          )
                        }
                      />
                    ) : item.type ===
                      'photo' ? (
                      <PhotoCard
                        item={item}
                        admin={
                          isAdmin
                        }
                        onEdit={() =>
                          setEditingId(
                            item.id,
                          )
                        }
                        onDelete={() =>
                          void deleteItem(
                            item,
                          )
                        }
                      />
                    ) : (
                      <TextCard
                        item={item}
                        admin={
                          isAdmin
                        }
                        onEdit={() =>
                          setEditingId(
                            item.id,
                          )
                        }
                        onDelete={() =>
                          void deleteItem(
                            item,
                          )
                        }
                      />
                    )}
                  </article>
                ),
              )}
            </div>
          )}
        </div>
      </main>

      {editingId && (
        <NewPostModal
          itemId={editingId}
          onClose={() =>
            setEditingId(
              null,
            )
          }
          onCreated={() => {
            setEditingId(
              null,
            );

            window.dispatchEvent(
              new CustomEvent(
                'flow:updated',
              ),
            );
          }}
        />
      )}
    </>
  );
}