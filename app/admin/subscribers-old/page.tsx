"use client";
import { useEffect, useState } from 'react';

export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/subscribers')
      .then(res => res.json())
      .then(data => {
        setSubscribers(data.subscribers || []);
        setLoading(false);
      });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить подписчика?')) return;
    setDeleting(id);
    await fetch(`/api/subscribers/${id}`, { method: 'DELETE' });
    setSubscribers(subscribers.filter(s => s.id !== id));
    setDeleting(null);
  };

  if (loading) return <div className="p-8">Загрузка...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Подписчики рассылки</h1>
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3">Email</th>
            <th className="p-3">Дата подписки</th>
            <th className="p-3">Пользователь</th>
            <th className="p-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map(sub => (
            <tr key={sub.id} className="border-t hover:bg-gray-50">
              <td className="p-3">{sub.email}</td>
              <td className="p-3">{new Date(sub.createdAt).toLocaleDateString()}</td>
              <td className="p-3">{sub.userId ? <span className="text-green-600">Пользователь</span> : <span className="text-gray-400">Гость</span>}</td>
              <td className="p-3">
                <button
                  className="text-red-600 hover:underline disabled:opacity-50"
                  onClick={() => handleDelete(sub.id)}
                  disabled={deleting === sub.id}
                >
                  {deleting === sub.id ? 'Удаление...' : 'Удалить'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
