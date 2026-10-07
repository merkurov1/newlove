'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import NewPostModal from '@/components/flow/NewPostModal';

type FlowItem = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md?: string;
  published_at?: string;
};

export default function FlowPage() {
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPostOpen, setNewPostOpen] = useState(false);

  async function loadItems() {
    try {
      setLoading(true);

      const res = await fetch('/api/flow/items', {
        cache: 'no-store',
      });

      const json = await res.json();

      setItems(json.items ?? []);
    } catch (error) {
      console.error('[flow] failed to load items', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  return (
    <>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Flow
            </div>

            <h1 className="mt-2 text-4xl font-bold">
              Published stream
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setNewPostOpen(true)}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white transition hover:bg-zinc-800"
          >
            + New post
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-500">
            Loading flow...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
            No public posts yet. Publish the first item.
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {item.lang} / {item.type}
                </div>

                <Link
                  href={`/flow/${item.lang}/${item.slug}`}
                  className="text-2xl font-semibold hover:underline"
                >
                  {item.title}
                </Link>

                <p className="mt-3 line-clamp-3 text-zinc-600">
                  {item.body_md?.slice(0, 240) || 'No excerpt yet.'}
                </p>

                <div className="mt-4 text-sm text-zinc-500">
                  {item.published_at
                    ? new Date(item.published_at).toLocaleString('ru-RU')
                    : 'Draft'}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {newPostOpen && (
        <NewPostModal
          onClose={() => setNewPostOpen(false)}
          onCreated={() => {
            void loadItems();
          }}
        />
      )}
    </>
  );
}