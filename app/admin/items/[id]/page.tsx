'use client';

import { useEffect, useState } from 'react';

type Item = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md: string;
};

export default function AdminItemDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/items/${params.id}`);
      const json = await res.json();
      setItem(json.item);
      setLoading(false);
    }
    load();
  }, [params.id]);

  async function handleSave() {
    if (!item) return;

    setSaving(true);

    const res = await fetch(`/api/admin/items/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: item.title,
        slug: item.slug,
        lang: item.lang,
        visibility: item.visibility,
        status: item.status,
        body_md: item.body_md,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(json.error ?? 'Save failed');
      return;
    }

    alert('Saved');
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!item) {
    return <div className="p-8">Not found</div>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Edit item</h1>

        <button onClick={handleSave} className="rounded-xl bg-black px-4 py-2 text-white" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} className="w-full rounded-xl border p-3" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Slug</label>
          <input value={item.slug} onChange={(e) => setItem({ ...item, slug: e.target.value })} className="w-full rounded-xl border p-3" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Language</label>
            <select value={item.lang} onChange={(e) => setItem({ ...item, lang: e.target.value })} className="w-full rounded-xl border p-3">
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Visibility</label>
            <select value={item.visibility} onChange={(e) => setItem({ ...item, visibility: e.target.value })} className="w-full rounded-xl border p-3">
              <option value="private">private</option>
              <option value="public">public</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Status</label>
          <select value={item.status} onChange={(e) => setItem({ ...item, status: e.target.value })} className="w-full rounded-xl border p-3">
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Body</label>
          <textarea value={item.body_md} onChange={(e) => setItem({ ...item, body_md: e.target.value })} rows={16} className="w-full rounded-xl border p-3" />
        </div>
      </div>
    </main>
  );
}
