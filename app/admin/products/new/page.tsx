"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminProductNewPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    price: '',
    description: '',
    image: '',
    active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
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
      setError('Ошибка при добавлении товара');
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Добавить товар</h1>
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
          <label className="block mb-1 font-medium">Цена (₽)</label>
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
        <button type="submit" disabled={loading} className="rounded bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {loading ? 'Сохранение...' : 'Добавить'}
        </button>
      </form>
    </div>
  );
}
