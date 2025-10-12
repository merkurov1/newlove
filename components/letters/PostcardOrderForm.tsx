'use client';

import { useState } from 'react';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import Image from 'next/image';

interface Postcard {
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
}

interface PostcardOrderFormProps {
  postcard: Postcard;
  onBack: () => void;
}

interface FormData {
  recipientName: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  customMessage: string;
}

export default function PostcardOrderForm({ postcard, onBack }: PostcardOrderFormProps) {
  const { session } = useSupabaseSession();
  const [formData, setFormData] = useState<FormData>({
  recipientName: session?.user?.name || '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: 'United Kingdom',
    phone: '',
    customMessage: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (priceInPence: number) => {
    return `£${(priceInPence / 100).toFixed(0)}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const required = ['recipientName', 'streetAddress', 'city', 'postalCode', 'country'];
    for (const field of required) {
      if (!formData[field as keyof FormData].trim()) {
        setError(`Поле "${getFieldLabel(field)}" обязательно для заполнения`);
        return false;
      }
    }
    return true;
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      recipientName: 'Имя получателя',
      streetAddress: 'Адрес',
      city: 'Город',
      stateProvince: 'Регион/Штат',
      postalCode: 'Почтовый индекс',
      country: 'Страна'
    };
    return labels[field] || field;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setLoading(true);
    
    try {
      // Создаем заказ и Payment Intent
      const response = await fetch('/api/postcards/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postcardId: postcard.id,
          ...formData
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при создании заказа');
      }

      // Перенаправляем на страницу оплаты или показываем Stripe Elements
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setError('Ошибка при создании ссылки для оплаты');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Кнопка назад */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
      >
        ← Назад к каталогу
      </button>

      {/* Информация о заказываемой открытке */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex gap-4">
          <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
            <Image
              src={postcard.image}
              alt={postcard.title}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{postcard.title}</h3>
            <p className="text-sm text-gray-600 mb-2">{postcard.description}</p>
            <div className="text-xl font-bold text-orange-600">
              {formatPrice(postcard.price)}
            </div>
          </div>
        </div>
      </div>

      {/* Форма заказа */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Имя получателя */}
          <div className="sm:col-span-2">
            <label htmlFor="recipientName" className="block text-sm font-medium text-gray-700 mb-2">
              Имя получателя *
            </label>
            <input
              type="text"
              id="recipientName"
              name="recipientName"
              value={formData.recipientName}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Как подписать открытку"
            />
          </div>

          {/* Адрес строка 1 */}
          <div className="sm:col-span-2">
            <label htmlFor="streetAddress" className="block text-sm font-medium text-gray-700 mb-2">
              Адрес (строка 1) *
            </label>
            <input
              type="text"
              id="streetAddress"
              name="streetAddress"
              value={formData.streetAddress}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Улица, дом, квартира"
            />
          </div>

          {/* Адрес строка 2 */}
          <div className="sm:col-span-2">
            <label htmlFor="addressLine2" className="block text-sm font-medium text-gray-700 mb-2">
              Адрес (строка 2)
            </label>
            <input
              type="text"
              id="addressLine2"
              name="addressLine2"
              value={formData.addressLine2}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Район, комплекс, корпус (опционально)"
            />
          </div>

          {/* Город */}
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
              Город *
            </label>
            <input
              type="text"
              id="city"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Регион/Штат */}
          <div>
            <label htmlFor="stateProvince" className="block text-sm font-medium text-gray-700 mb-2">
              Регион/Штат/Область
            </label>
            <input
              type="text"
              id="stateProvince"
              name="stateProvince"
              value={formData.stateProvince}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Для США, Канады, Индии и др."
            />
          </div>

          {/* Почтовый индекс */}
          <div>
            <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-2">
              Почтовый индекс *
            </label>
            <input
              type="text"
              id="postalCode"
              name="postalCode"
              value={formData.postalCode}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Формат зависит от страны"
            />
          </div>

          {/* Страна */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
              Страна *
            </label>
            <select
              id="country"
              name="country"
              value={formData.country}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="United Kingdom">🇬🇧 United Kingdom</option>
              <option value="United States">🇺🇸 United States</option>
              <option value="Canada">🇨🇦 Canada</option>
              <option value="Australia">🇦🇺 Australia</option>
              <option value="Germany">🇩🇪 Germany</option>
              <option value="France">🇫🇷 France</option>
              <option value="Italy">🇮🇹 Italy</option>
              <option value="Spain">🇪🇸 Spain</option>
              <option value="Netherlands">🇳🇱 Netherlands</option>
              <option value="Belgium">🇧🇪 Belgium</option>
              <option value="Switzerland">🇨🇭 Switzerland</option>
              <option value="Austria">🇦🇹 Austria</option>
              <option value="Sweden">🇸🇪 Sweden</option>
              <option value="Norway">🇳🇴 Norway</option>
              <option value="Denmark">🇩🇰 Denmark</option>
              <option value="Finland">🇫🇮 Finland</option>
              <option value="Japan">🇯🇵 Japan</option>
              <option value="South Korea">🇰🇷 South Korea</option>
              <option value="Singapore">🇸🇬 Singapore</option>
              <option value="New Zealand">🇳🇿 New Zealand</option>
              <option value="Russia">🇷🇺 Russia</option>
              <option value="Poland">🇵🇱 Poland</option>
              <option value="Czech Republic">🇨🇿 Czech Republic</option>
              <option value="Ireland">🇮🇪 Ireland</option>
              <option value="Portugal">🇵🇹 Portugal</option>
              <option value="Other">🌍 Other</option>
            </select>
          </div>

          {/* Телефон */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Телефон (опционально)
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="+7 999 123-45-67"
            />
          </div>

          {/* Персональное сообщение */}
          <div className="sm:col-span-2">
            <label htmlFor="customMessage" className="block text-sm font-medium text-gray-700 mb-2">
              Персональное сообщение (опционально)
            </label>
            <textarea
              id="customMessage"
              name="customMessage"
              value={formData.customMessage}
              onChange={handleInputChange}
              rows={3}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              placeholder="Текст, который будет написан на открытке (до 200 символов)"
            />
            <div className="text-xs text-gray-500 mt-1">
              {formData.customMessage.length}/200 символов
            </div>
          </div>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-red-800 text-sm">{error}</div>
          </div>
        )}

        {/* Кнопка заказа */}
        <div className="border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 text-white py-3 px-6 rounded-md font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Создаем заказ...' : `Заказать за ${formatPrice(postcard.price)}`}
          </button>
          
          <p className="text-xs text-gray-500 text-center mt-3">
            Нажимая кнопку, вы переходите к безопасной оплате через Stripe
          </p>
        </div>
      </form>
    </div>
  );
}