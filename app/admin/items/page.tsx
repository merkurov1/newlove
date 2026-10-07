'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Item = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  updated_at: string;
};

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published'>('all');

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/items/list');
      const json = await res.json();
      setItems(json.items ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = items.filter((item) => {
    if (filter === 'draft') return item.status === 'draft';
    if (filter === 'published') return item.status === 'published';
    return true;
  });

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Items</h1>

        <Link href="/admin/items/new" className="rounded-lg bg-black px-4 py-2 text-white">
          + New Item
        </Link>
      </div>

      <div className="mb-6 flex gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-lg px-4 py-2 text-sm ${filter === 'all' ? 'bg-black text-white' : 'border border-zinc-300'}`}>
          All ({items.length})
        </button>
        <button onClick={() => setFilter('draft')} className={`rounded-lg px-4 py-2 text-sm ${filter === 'draft' ? 'bg-black text-white' : 'border border-zinc-300'}`}>
          Drafts ({items.filter((i) => i.status === 'draft').length})
        </button>
        <button onClick={() => setFilter('published')} className={`rounded-lg px-4 py-2 text-sm ${filter === 'published' ? 'bg-black text-white' : 'border border-zinc-300'}`}>
          Published ({items.filter((i) => i.status === 'published').length})
        </button>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl border bg-white p-4">
            <div className="flex-1">
              <Link href={`/admin/items/${item.id}`} className="font-semibold hover:underline">
                {item.title}
              </Link>

              <div className="mt-1 text-xs text-zinc-500">
                <span className="mr-3">{item.type}</span>
                <span className="mr-3">{item.lang}</span>
                <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-medium ${item.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                  {item.status}
                </span>
              </div>
            </div>

            <Link href={`/admin/items/${item.id}`} className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50">
              Edit
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
