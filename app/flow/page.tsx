'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

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
};

function excerpt(body: string | null | undefined) {
  if (!body) {
    return '';
  }

  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString(
    'en-GB',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
}

function FlowMeta({
  item,
}: {
  item: FlowItem;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
      <span>{item.lang}</span>
      <span>·</span>
      <span>{item.type}</span>

      {item.published_at && (
        <>
          <span>·</span>
          <span>
            {formatDate(item.published_at)}
          </span>
        </>
      )}
    </div>
  );
}

function LinkCard({
  item,
}: {
  item: FlowItem;
}) {
  const metadata =
    item.metadata ?? {};

  const image =
    typeof metadata.image === 'string'
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
    <a
      href={item.source_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[#FAF8F5] transition hover:border-stone-400"
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

        <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
          Open original ↗
        </div>
      </div>
    </a>
  );
}

function PhotoCard({
  item,
}: {
  item: FlowItem;
}) {
  const image =
    item.metadata &&
    typeof item.metadata.public_url ===
      'string'
      ? item.metadata.public_url
      : null;

  return (
    <Link
      href={
        item.slug
          ? `/flow/${item.lang}/${encodeURIComponent(item.slug)}`
          : '#'
      }
      className="group block overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white"
    >
      {image ? (
        <div className="overflow-hidden bg-stone-100">
          <img
            src={image}
            alt={
              item.metadata &&
              typeof item.metadata.alt ===
                'string'
                ? item.metadata.alt
                : ''
            }
            className="max-h-[620px] w-full object-contain transition duration-700 group-hover:scale-[1.01]"
          />
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center bg-stone-50 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
          View image ↗
        </div>
      )}
    </Link>
  );
}

export default function FlowPage() {
  const [items, setItems] =
    useState<FlowItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [newPostOpen, setNewPostOpen] =
    useState(false);

  async function loadItems() {
    try {
      setLoading(true);

      const response =
        await fetch(
          '/api/flow/items',
          {
            cache: 'no-store',
          },
        );

      const json =
        await response.json();

      setItems(
        Array.isArray(json.items)
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

  useEffect(() => {
    void loadItems();
  }, []);

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-28 text-stone-900 sm:px-8 sm:pt-36">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Flow
          </div>

          <div className="mt-4 flex items-end justify-between gap-8">
            <p className="max-w-2xl font-serif text-3xl font-light leading-[1.15] sm:text-5xl">
              A living stream of thoughts,
              images and things worth
              keeping.
            </p>

            <button
              type="button"
              onClick={() =>
                setNewPostOpen(true)
              }
              className="shrink-0 rounded-full bg-stone-900 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition hover:bg-stone-700"
            >
              + Post
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/70 p-10 font-serif text-lg text-stone-400">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white/60 p-12 text-center font-serif text-lg text-stone-400">
            Nothing here yet.
          </div>
        ) : (
          <div className="space-y-8">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-[2rem] border border-stone-200/80 bg-white/75 p-7 shadow-sm backdrop-blur-md sm:p-10"
              >
                <FlowMeta item={item} />

                {item.type === 'link' &&
                item.source_url ? (
                  <LinkCard
                    item={item}
                  />
                ) : item.type ===
                  'photo' ? (
                  <PhotoCard
                    item={item}
                  />
                ) : (
                  <Link
                    href={
                      item.slug
                        ? `/flow/${item.lang}/${encodeURIComponent(item.slug)}`
                        : '#'
                    }
                    className="group block"
                  >
                    <div className="whitespace-pre-wrap font-serif text-[20px] font-light leading-[1.8] text-stone-800 sm:text-[23px]">
                      {excerpt(
                        item.body_md,
                      ) ||
                        'Open post ↗'}
                    </div>

                    <div className="mt-7 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400 transition group-hover:text-stone-900">
                      Open ↗
                    </div>
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {newPostOpen && (
        <NewPostModal
          onClose={() =>
            setNewPostOpen(false)
          }
          onCreated={() => {
            void loadItems();
          }}
        />
      )}
    </main>
  );
}