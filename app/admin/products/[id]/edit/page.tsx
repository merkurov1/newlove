"use client";
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function AdminProductEditPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const [form, setForm] = useState({
    name: '',
    slug: '',
    price: '',
    description: '',
    image: '',
    active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=*`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      cache: 'no-store',
    })
      .then(res => res.json())
      .then(data => {
        const p = data[0];
        if (p) setForm({ ...p, price: String(p.price) });
        setLoading(false);
      });
  }, [id]);

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        ...form,
        price: Number(form.price),
      }),
    });
    if (res.ok) {
      router.push('/admin/products');
    } else {
      setError('Ошибка при сохранении');
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8">Загрузка...</div>;

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Редактировать товар</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Название</label>
          <input name="name" value={form.name} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block mb-1 font-medium">Slug</label>
          <input name="slug" value={form.slug} onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block mb-1 font-medium">Цена (£)</label>
          <input name="price" value={form.price} onChange={handleChange} required type="number" min="1" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block mb-1 font-medium">Описание</label>
          <textarea name="description" value={form.description} onChange={handleChange} className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block mb-1 font-medium">Изображение (URL)</label>
          <input name="image" value={form.image} onChange={handleChange} className="w-full border rounded px-3 py-2" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" name="active" checked={form.active} onChange={handleChange} id="active" />
          <label htmlFor="active">Активен</label>
        </div>
        {error && <div className="text-red-600">{error}</div>}
        <button type="submit" disabled={saving} className="rounded bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
