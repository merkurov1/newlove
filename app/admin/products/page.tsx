'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/admin/Card';
import { Button } from '@/components/admin/Button';
import { SearchBox } from '@/components/admin/SearchBox';
import { useNotifications } from '@/components/admin/NotificationSystem';
import ImageUploader from '@/components/ImageUploader';
import Link from 'next/link';
import Image from 'next/image';

interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  image?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductFormData {
  name: string;
  slug: string;
  description: string;
  price: string;
  image: string;
  active: boolean;
}

const emptyForm: ProductFormData = {
  name: '',
  slug: '',
  description: '',
  price: '',
  image: '',
  active: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [formLoading, setFormLoading] = useState(false);
  const { addNotification } = useNotifications();

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        addNotification({ type: 'error', title: 'Ошибка при загрузке товаров' });
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      addNotification({ type: 'error', title: 'Ошибка при загрузке товаров' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));

    // Автогенерация slug из названия
    if (name === 'name' && !editingProduct) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const url = editingProduct 
        ? `/api/products/${editingProduct.id}`
        : '/api/products';
      
      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        addNotification({
          type: 'success',
          title: editingProduct ? 'Товар успешно обновлен!' : 'Товар успешно создан!'
        });
        setShowForm(false);
        setEditingProduct(null);
        setFormData(emptyForm);
        fetchProducts();
      } else {
        const error = await response.json();
        addNotification({ type: 'error', title: error.error || 'Ошибка при сохранении товара' });
      }
    } catch (error) {
      console.error('Error saving product:', error);
      addNotification({ type: 'error', title: 'Ошибка при сохранении товара' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      slug: product.slug,
      description: product.description || '',
      price: product.price.toString(),
      image: product.image || '',
      active: product.active
    });
    setShowForm(true);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Вы уверены, что хотите удалить товар "${product.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        addNotification({ type: 'success', title: 'Товар успешно удален!' });
        fetchProducts();
      } else {
        addNotification({ type: 'error', title: 'Ошибка при удалении товара' });
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      addNotification({ type: 'error', title: 'Ошибка при удалении товара' });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData(emptyForm);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление товарами</h1>
          <p className="text-gray-600 mt-1">Создавайте и редактируйте товары для магазина</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Добавить товар
        </Button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <Card className="border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {editingProduct ? 'Редактировать товар' : 'Добавить новый товар'}
              </h2>
              <Button
                onClick={handleCancel}
                variant="secondary"
                className="text-gray-500 hover:text-gray-700"
              >
                Отмена
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Название товара *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Введите название товара"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL (slug) *
                  </label>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="url-tovara"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Цена (₽) *
                  </label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL изображения
                  </label>
                  <input
                    type="url"
                    name="image"
                    value={formData.image}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/image.jpg"
                  />
                  
                  <div className="mt-4">
                    <ImageUploader 
                      onUploadSuccess={(markdownImage: string) => {
                        // Извлекаем URL из markdown формата ![_](url)
                        const urlMatch = markdownImage.match(/\!\[.*?\]\((.*?)\)/);
                        if (urlMatch) {
                          setFormData(prev => ({ ...prev, image: urlMatch[1] }));
                        }
                      }}
                    />
                  </div>
                  
                  {formData.image && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">Превью изображения:</p>
                      <img 
                        src={formData.image} 
                        alt="Превью" 
                        className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Описание
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Описание товара..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Товар активен (показывается в магазине)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={formLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {formLoading ? 'Сохранение...' : (editingProduct ? 'Обновить' : 'Создать')}
                </Button>
                <Button
                  type="button"
                  onClick={handleCancel}
                  variant="secondary"
                >
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Search */}
      <Card>
        <div className="p-4">
          <SearchBox
            onSearch={setSearchTerm}
            placeholder="Поиск товаров..."
          />
        </div>
      </Card>

      {/* Products List */}
      <Card>
        <div className="p-6">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🛍️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'Товары не найдены' : 'Товаров пока нет'}
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm 
                  ? 'Попробуйте изменить поисковый запрос'
                  : 'Создайте первый товар для вашего магазина'
                }
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Добавить товар
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Товар
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Цена
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Создан
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          {product.image && (
                            <div className="flex-shrink-0 h-12 w-12 mr-3">
                              <Image
                                src={product.image}
                                alt={product.name}
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-lg object-cover"
                              />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {product.name}
                            </div>
                            <div className="text-sm text-gray-500">/{product.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {Number(product.price).toLocaleString('ru-RU')} ₽
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {product.active ? 'Активен' : 'Неактивен'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(product.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/shop/${product.slug}`}
                            target="_blank"
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Открыть
                          </Link>
                          <button
                            onClick={() => handleEdit(product)}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Всего товаров</div>
            <div className="text-2xl font-bold text-gray-900">{products.length}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Активных</div>
            <div className="text-2xl font-bold text-green-600">
              {products.filter(p => p.active).length}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Неактивных</div>
            <div className="text-2xl font-bold text-red-600">
              {products.filter(p => !p.active).length}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}