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
        <p className="mt-4 text-gray-600">Loading order info...</p>
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Order placed successfully!</h1>
        <p className="text-lg text-gray-600">
          Thank you for your order. We have received your payment and will start work soon.
        </p>
      </div>
      {orderInfo && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Order details #{orderInfo.id.slice(-8)}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Postcard:</span>
              <span className="font-medium">{orderInfo.postcard.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Recipient:</span>
              <span className="font-medium">{orderInfo.recipientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery city:</span>
              <span className="font-medium">{orderInfo.city}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-bold text-orange-600">{formatPrice(orderInfo.amount)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="text-center mt-8">
        <Link href="/journal" className="text-blue-600 hover:underline">
          ← Back to Journal
        </Link>
      </div>
    </div>
  );
}
