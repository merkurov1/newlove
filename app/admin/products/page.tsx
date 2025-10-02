'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/admin/Card';
import { Button } from '@/components/admin/Button';
import { SearchBox } from '@/components/admin/SearchBox';
import { useNotifications } from '@/components/admin/NotificationSystem';
import { createProduct, updateProduct, deleteProduct } from '../actions';

interface Product {
  id: number;
  name: string;
  slug: string;
  description?: string;
  price: number;
  image?: string;
  active: boolean;
  createdAt: string;
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
  const { addNotification } = useNotifications();

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const showSuccessNotification = (message: string) => {
    addNotification({
      type: 'success',
      title: 'Успех',
      message
    });
  };

  const showErrorNotification = (message: string) => {
    addNotification({
      type: 'error',
      title: 'Ошибка',
      message
    });
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[а-я]/g, (char) => {
        const map: { [key: string]: string } = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
          'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
          'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
          'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
          'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        return map[char] || char;
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleInputChange = (field: keyof ProductFormData, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (field === 'name' && typeof value === 'string') {
        updated.slug = generateSlug(value);
      }
      
      return updated;
    });
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingProduct(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const productData = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        price: parseFloat(formData.price),
        image: formData.image || null,
        active: formData.active,
      };

      if (editingProduct) {
        const formDataObj = new FormData();
        formDataObj.append('id', editingProduct.id.toString());
        formDataObj.append('name', productData.name);
        formDataObj.append('slug', productData.slug);
        formDataObj.append('description', productData.description || '');
        formDataObj.append('price', productData.price.toString());
        formDataObj.append('image', productData.image || '');
        formDataObj.append('active', productData.active.toString());
        
        await updateProduct(formDataObj);
        showSuccessNotification('Товар успешно обновлен');
      } else {
        const formDataObj = new FormData();
        formDataObj.append('name', productData.name);
        formDataObj.append('slug', productData.slug);
        formDataObj.append('description', productData.description || '');
        formDataObj.append('price', productData.price.toString());
        formDataObj.append('image', productData.image || '');
        formDataObj.append('active', productData.active.toString());
        
        await createProduct(formDataObj);
        showSuccessNotification('Товар успешно создан');
      }

      await fetchProducts();
      resetForm();
    } catch (error) {
      showErrorNotification('Произошла ошибка при сохранении');
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
      active: product.active,
    });
    setShowForm(true);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Удалить товар "${product.name}"?`)) return;
    
    try {
      const formData = new FormData();
      formData.append('id', product.id.toString());
      await deleteProduct(formData);
      showSuccessNotification('Товар успешно удален');
      await fetchProducts();
    } catch (error) {
      showErrorNotification('Произошла ошибка при удалении');
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Управление товарами</h1>
        <Button onClick={() => setShowForm(true)}>
          Добавить товар
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingProduct ? 'Редактировать товар' : 'Добавить товар'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL (slug) *
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => handleInputChange('slug', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Цена (₽) *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL изображения
                  </label>
                  <input
                    type="url"
                    value={formData.image}
                    onChange={(e) => handleInputChange('image', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => handleInputChange('active', e.target.checked)}
                    className="mr-2"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Активный товар
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <Button type="submit" className="flex-1">
                    {editingProduct ? 'Обновить' : 'Создать'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={resetForm}
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="p-6">
          <div className="mb-4">
            <SearchBox
              onSearch={setSearchTerm}
              placeholder="Поиск товаров..."
            />
          </div>
          
          {filteredProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Название</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Цена</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Статус</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Дата</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-500">/{product.slug}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {product.price.toLocaleString('ru-RU')} ₽
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
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(product)}
                          >
                            Редактировать
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDelete(product)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'Товары не найдены' : 'Нет товаров'}
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm 
                  ? 'Попробуйте изменить критерии поиска'
                  : 'Добавьте первый товар в магазин'
                }
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowForm(true)}>
                  Добавить товар
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
