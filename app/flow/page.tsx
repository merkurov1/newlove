'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/items/list');
      const json = await res.json();
      const list = (json.items ?? []).filter(
        (item: FlowItem) => item.status === 'published' && item.visibility === 'public'
      );
      setItems(list);
      setLoading(false);
    }

    load();
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Flow
          </div>
          <h1 className="mt-2 text-4xl font-bold">Published stream</h1>
        </div>

        <Link href="/admin/items/new" className="rounded-lg bg-black px-4 py-2 text-sm text-white">
          + New post
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-500">
          Loading flow...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          No public posts yet. Publish the first item from admin.
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {item.lang} / {item.type}
              </div>

              <Link href={`/${item.lang}/${item.slug}`} className="text-2xl font-semibold hover:underline">
                {item.title}
              </Link>

              <p className="mt-3 text-zinc-600 line-clamp-3">
                {item.body_md?.slice(0, 240) || 'No excerpt yet.'}
              </p>

              <div className="mt-4 text-sm text-zinc-500">
                {item.published_at ? new Date(item.published_at).toLocaleString('ru-RU') : 'Draft'}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
