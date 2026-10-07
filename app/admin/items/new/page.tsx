'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewItemPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [lang, setLang] = useState('ru');
  const [type, setType] = useState('note');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch('/api/admin/items/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body_md: bodyMd,
        lang,
        type,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(json.error ?? 'Error creating item');
      return;
    }

    router.push(`/admin/items/${json.item.id}`);
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">New Item</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border p-3">
              <option value="note">note</option>
              <option value="article">article</option>
              <option value="link">link</option>
              <option value="quote">quote</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full rounded-xl border p-3">
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title" className="w-full rounded-xl border p-3" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Body (Markdown)</label>
          <textarea value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} placeholder="Write your content..." rows={12} className="w-full rounded-xl border p-3" />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-black px-6 py-3 text-white disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Draft'}
          </button>

          <button type="button" onClick={() => router.back()} className="rounded-lg border px-6 py-3">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
