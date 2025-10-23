'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { updatePostcard, deletePostcard } from '../actions';

interface Postcard {
  id: string;
  title: string;
  description: string | null;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
  createdAt: string;
  _count?: { orders: number };
}

export default function AdminPostcardsPage() {
  const [postcards, setPostcards] = useState<Postcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPostcard, setEditingPostcard] = useState<Postcard | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Загружаем открытки из API
  useEffect(() => {
    const fetchPostcards = async () => {
      try {
        const response = await fetch('/api/postcards');
        if (response.ok) {
          const data = await response.json();
          setPostcards(data.postcards || []);
        }
      } catch (error) {
        console.error('Error fetching postcards:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPostcards();
  }, []);

  const formatPrice = (priceInPence: number) => {
    return `£${(priceInPence / 100).toFixed(0)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleEdit = (postcard: Postcard) => {
    setEditingPostcard({ ...postcard });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingPostcard) return;

    try {
      const formData = new FormData();
      formData.append('id', editingPostcard.id);
      formData.append('title', editingPostcard.title);
      formData.append('description', editingPostcard.description || '');
      formData.append('image', editingPostcard.image);
      formData.append('price', editingPostcard.price.toString());
      if (editingPostcard.available) formData.append('available', 'on');
      if (editingPostcard.featured) formData.append('featured', 'on');

      await updatePostcard(formData);
      
      // Обновляем локальное состояние
      setPostcards(prev => 
        prev.map(p => p.id === editingPostcard.id ? editingPostcard : p)
      );
      
      setIsEditing(false);
      setEditingPostcard(null);
    } catch (error) {
      console.error('Error saving postcard:', error);
      alert('Ошибка при сохранении открытки');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту открытку?')) return;

    try {
      const formData = new FormData();
      formData.append('id', id);
      
      await deletePostcard(formData);
      
      // Удаляем из локального состояния
      setPostcards(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting postcard:', error);
      alert('Ошибка при удалении открытки');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingPostcard(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg text-gray-600">Загрузка открыток...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Управление открытками</h1>
          <p className="text-gray-600 mt-1">Редактирование авторских открыток для продажи</p>
        </div>
        <Link 
          href="/admin" 
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          ← Назад в админку
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="text-sm text-gray-600">Всего открыток</div>
          <div className="text-2xl font-bold text-blue-600">{postcards.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="text-sm text-gray-600">Доступных</div>
          <div className="text-2xl font-bold text-green-600">
            {postcards.filter(p => p.available).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="text-sm text-gray-600">Рекомендуемых</div>
          <div className="text-2xl font-bold text-purple-600">
            {postcards.filter(p => p.featured).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="text-sm text-gray-600">Всего заказов</div>
          <div className="text-2xl font-bold text-orange-600">
            {postcards.reduce((sum, p) => sum + (p._count?.orders || 0), 0)}
          </div>
        </div>
      </div>

      {/* Postcards List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Открытки</h2>
        </div>
        
        {postcards.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">🖼️</div>
            <h3 className="text-lg font-medium mb-2">Открыток пока нет</h3>
            <p className="text-sm">Добавьте первую открытку для продажи</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {postcards.map((postcard) => (
              <div key={postcard.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                      <Image 
                        src={postcard.image} 
                        alt={postcard.title}
                        fill
                        className="object-cover"
                        onError={() => {
                          // Fallback если изображение не загружается
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">{postcard.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {postcard.description || 'Без описания'}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-lg font-bold text-gray-900">
                          {formatPrice(postcard.price)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(postcard.createdAt)}
                        </span>
                        <span className="text-xs text-gray-500">
                          Заказов: {postcard._count?.orders || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {/* Status badges */}
                    <div className="flex space-x-2">
                      {postcard.available && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          Доступна
                        </span>
                      )}
                      {postcard.featured && (
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                          Рекомендуемая
                        </span>
                      )}
                      {!postcard.available && (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                          Недоступна
                        </span>
                      )}
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(postcard)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(postcard.id)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditing && editingPostcard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Редактировать открытку</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название
                </label>
                <input
                  type="text"
                  value={editingPostcard.title}
                  onChange={(e) => setEditingPostcard({
                    ...editingPostcard,
                    title: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <textarea
                  value={editingPostcard.description || ''}
                  onChange={(e) => setEditingPostcard({
                    ...editingPostcard,
                    description: e.target.value
                  })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Изображение (URL)
                </label>
                <input
                  type="url"
                  value={editingPostcard.image}
                  onChange={(e) => setEditingPostcard({
                    ...editingPostcard,
                    image: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Цена (в пенсах)
                </label>
                <input
                  type="number"
                  value={editingPostcard.price}
                  onChange={(e) => setEditingPostcard({
                    ...editingPostcard,
                    price: parseInt(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editingPostcard.available}
                    onChange={(e) => setEditingPostcard({
                      ...editingPostcard,
                      available: e.target.checked
                    })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Доступна для заказа</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editingPostcard.featured}
                    onChange={(e) => setEditingPostcard({
                      ...editingPostcard,
                      featured: e.target.checked
                    })}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Рекомендуемая</span>
                </label>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}