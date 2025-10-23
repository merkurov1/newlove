'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface OrderInfo {
  id: string;
  postcard: {
    title: string;
    image: string;
  };
  recipientName: string;
  city: string;
  amount: number;
  status: string;
  createdAt: string;
}

export default function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderInfo = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/postcards/order-success?session_id=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setOrderInfo(data.order);
        }
      } catch (error) {
        console.error('Error fetching order info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderInfo();
  }, [sessionId]);

  const formatPrice = (priceInCopecks: number) => {
    return `${(priceInCopecks / 100).toFixed(0)} ₽`;
  };

  if (loading) {
    return (
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Загружаем информацию о заказе...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Иконка успеха */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Заказ успешно оформлен!
        </h1>
        <p className="text-lg text-gray-600">
          Спасибо за ваш заказ. Мы получили оплату и скоро приступим к работе.
        </p>
      </div>

      {/* Информация о заказе */}
      {orderInfo && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Детали заказа #{orderInfo.id.slice(-8)}
          </h2>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Открытка:</span>
              <span className="font-medium">{orderInfo.postcard.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Получатель:</span>
              <span className="font-medium">{orderInfo.recipientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Город доставки:</span>
              <span className="font-medium">{orderInfo.city}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Сумма:</span>
              <span className="font-bold text-orange-600">{formatPrice(orderInfo.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Статус:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                В обработке
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Следующие шаги */}
      <div className="bg-blue-50 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          📮 Что дальше?
        </h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">1.</span>
            <span>Я получу уведомление о вашем заказе и приступлю к созданию открытки</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">2.</span>
            <span>Открытка будет нарисована и подписана вручную (2-3 дня)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">3.</span>
            <span>Отправлю её по указанному адресу через Почту России</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">4.</span>
            <span>Доставка займет 7-14 дней в зависимости от региона</span>
          </li>
        </ul>
      </div>

      {/* Контакты и поддержка */}
      <div className="bg-gray-50 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          💬 Вопросы по заказу?
        </h3>
        <p className="text-gray-700 mb-3">
          Если у вас есть вопросы о заказе или нужно что-то изменить, свяжитесь со мной:
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a 
            href="mailto:anton@merkurov.love" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            aria-label="Написать на email"
          >
            📧 anton@merkurov.love
          </a>
          <a 
            href="https://t.me/merkurov" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            aria-label="Связаться в Telegram"
          >
            📱 Telegram
          </a>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link 
          href="/letters"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
        >
          📮 Вернуться к письмам
        </Link>
        <Link 
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          🏠 На главную
        </Link>
      </div>
    </div>
  );
}