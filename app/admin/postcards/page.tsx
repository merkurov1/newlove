'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

// Заглушка данных до того как Prisma модели заработают
const initialMockPostcards = [
  {
    id: 'postcard_1',
    title: 'Авторская открытка "Закат"',
    description: 'Уникальная открытка с авторским рисунком заката над городом',
    image: 'https://example.com/postcard1.jpg',
    price: 2900,
    available: true,
    featured: true,
    createdAt: new Date(),
    _count: { orders: 3 }
  },
  {
    id: 'postcard_2', 
    title: 'Открытка "Минимализм"',
    description: 'Стильная минималистичная открытка в черно-белых тонах',
    image: 'https://example.com/postcard2.jpg',
    price: 2900,
    available: true,
    featured: false,
    createdAt: new Date(),
    _count: { orders: 1 }
  }
];

export default function AdminPostcardsPage() {
  const [postcards, setPostcards] = useState(initialMockPostcards);
  const [editingPostcard, setEditingPostcard] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const formatPrice = (priceInPence: number) => {
    return `£${(priceInPence / 100).toFixed(0)}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleEdit = (postcard: any) => {
    setEditingPostcard({...postcard});
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editingPostcard) {
      // Проверяем валидность данных
      if (!editingPostcard.title || !editingPostcard.description || editingPostcard.price < 0) {
        alert('Пожалуйста, заполните все обязательные поля корректно');
        return;
      }
      
      setPostcards(postcards.map(p => 
        p.id === editingPostcard.id ? {...editingPostcard} : p
      ));
      setIsEditing(false);
      setEditingPostcard(null);
      
      // Показываем сообщение об успехе
      alert('Открытка успешно обновлена!');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить эту открытку?')) {
      setPostcards(postcards.filter(p => p.id !== id));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingPostcard(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Управление открытками</h1>
          <p className="text-gray-600 mt-2">Создание и редактирование авторских открыток</p>
        </div>
        <Link 
          href="/admin/postcards/new"
          className="bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
        >
          + Добавить открытку
        </Link>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                <span className="text-orange-600 text-lg">🎨</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего открыток</p>
              <p className="text-2xl font-semibold text-gray-900">{postcards.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                <span className="text-green-600 text-lg">✅</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Доступно</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.filter(p => p.available).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                <span className="text-yellow-600 text-lg">⭐</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Рекомендуемые</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.filter(p => p.featured).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <span className="text-blue-600 text-lg">📦</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего заказов</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.reduce((sum, p) => sum + p._count.orders, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Список открыток */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {postcards.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Пока нет открыток</h3>
            <p className="text-gray-500 mb-4">Создайте первую авторскую открытку</p>
            <Link 
              href="/admin/postcards/new"
              className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              Добавить открытку
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Открытка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Цена
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Заказов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Создана
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {postcards.map((postcard) => (
                  <tr key={postcard.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-16 w-16">
                          <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-400 text-2xl">🎨</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {postcard.title}
                            {postcard.featured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⭐ Рекомендуем
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {postcard.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatPrice(postcard.price)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        postcard.available 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {postcard.available ? '✅ Доступна' : '❌ Недоступна'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {postcard._count.orders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(postcard.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEdit(postcard)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                        >
                          Изменить
                        </button>
                        <button 
                          onClick={() => handleDelete(postcard.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          Удалить
                        </button>
                        <Link 
                          href={`/admin/postcards/orders/${postcard.id}`}
                          className="text-green-600 hover:text-green-900 transition-colors"
                        >
                          Заказы
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Полезные ссылки */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          🔗 Полезные ссылки
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link 
            href="/admin/postcards/orders"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">📦 Все заказы</div>
            <div className="text-sm text-gray-600">Управление заказами открыток</div>
          </Link>
          <Link 
            href="/letters"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">👀 Посмотреть магазин</div>
            <div className="text-sm text-gray-600">Как видят пользователи</div>
          </Link>
          <Link 
            href="/admin/media"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">🖼️ Загрузить изображения</div>
            <div className="text-sm text-gray-600">Медиа для открыток</div>
          </Link>
        </div>
      </div>

      {/* Модальное окно для редактирования */}
      {isEditing && editingPostcard && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Редактировать открытку
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Название</label>
                  <input
                    type="text"
                    value={editingPostcard.title}
                    onChange={(e) => setEditingPostcard({...editingPostcard, title: e.target.value})}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-orange-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Описание</label>
                  <textarea
                    value={editingPostcard.description}
                    onChange={(e) => setEditingPostcard({...editingPostcard, description: e.target.value})}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-orange-500"
                    rows={3}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Цена (в фунтах)</label>
                  <input
                    type="number"
                    value={editingPostcard.price / 100}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const priceInPence = isNaN(value) ? 0 : Math.round(value * 100);
                      setEditingPostcard({...editingPostcard, price: priceInPence});
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-orange-500"
                    step="0.01"
                    min="0"
                  />
                </div>
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingPostcard.available}
                      onChange={(e) => setEditingPostcard({...editingPostcard, available: e.target.checked})}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Доступна для заказа</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingPostcard.featured}
                      onChange={(e) => setEditingPostcard({...editingPostcard, featured: e.target.checked})}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Рекомендуемая</span>
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}