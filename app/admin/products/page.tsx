"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=*`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      cache: 'no-store',
    })
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        setLoading(false);
      });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить товар?')) return;
    setDeleting(id);
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
    });
    setProducts(products.filter(p => p.id !== id));
    setDeleting(null);
  };

  if (loading) return <div className="p-8">Загрузка...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Товары</h1>
        <Link href="/admin/products/new" className="rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 transition">Добавить товар</Link>
      </div>
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3">Название</th>
            <th className="p-3">Slug</th>
            <th className="p-3">Цена</th>
            <th className="p-3">Активен</th>
            <th className="p-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product: any) => (
            <tr key={product.id} className="border-t hover:bg-gray-50">
              <td className="p-3">{product.name}</td>
              <td className="p-3">{product.slug}</td>
              <td className="p-3">{product.price} ₽</td>
              <td className="p-3">{product.active ? 'Да' : 'Нет'}</td>
              <td className="p-3">
                <Link href={`/admin/products/${product.id}/edit`} className="text-blue-600 hover:underline mr-2">Изменить</Link>
                <button
                  className="text-red-600 hover:underline disabled:opacity-50"
                  onClick={() => handleDelete(product.id)}
                  disabled={deleting === product.id}
                >
                  {deleting === product.id ? 'Удаление...' : 'Удалить'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
