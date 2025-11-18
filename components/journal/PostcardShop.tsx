'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/AuthContext';
import PostcardOrderForm from './PostcardOrderForm';

interface Postcard {
  id: string;
  title: string;
  description: string;
  image: string;
  price: number;
  available: boolean;
  featured: boolean;
}

export default function PostcardShop() {
  const [postcards, setPostcards] = useState<Postcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostcard, setSelectedPostcard] = useState<Postcard | null>(null);
  const { session } = useAuth();
  useEffect(() => {
    const fetchPostcards = async () => {
      try {
        const response = await fetch('/api/postcards');
        if (!response.ok) throw new Error('Failed to fetch postcards');
        const data = await response.json();
        setPostcards(data.postcards || []);
      } catch (err) {
        setError('Failed to load postcards');
        console.error('Postcards fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPostcards();
  }, []);
  const formatPrice = (priceInPence: number) => {
    return `₽${(priceInPence / 100).toFixed(0)}`;
  };
  const handleOrderClick = (postcard: Postcard) => {
    setSelectedPostcard(postcard);
  };
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-48 bg-gray-200 rounded-lg mb-3"></div>
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">⚠️ {error}</div>
        <button onClick={() => window.location.reload()} className="text-blue-600 hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (postcards.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-2">🎨 Postcards coming soon</div>
        <div className="text-sm text-gray-500">Original works in progress</div>
      </div>
    );
  }
  if (selectedPostcard) {
    return (
      <PostcardOrderForm postcard={selectedPostcard} onBack={() => setSelectedPostcard(null)} />
    );
  }
  return (
    <div className="space-y-6">
      {postcards.map((postcard) => (
        <div
          key={postcard.id}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row items-center gap-6"
        >
          <div className="w-40 h-40 flex-shrink-0 relative">
            <Image
              src={postcard.image}
              alt={postcard.title}
              width={320}
              height={320}
              className="rounded-lg object-cover"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{postcard.title}</h3>
            <p className="text-gray-600 mb-2">{postcard.description}</p>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-orange-600">
                {formatPrice(postcard.price)}
              </span>
              {postcard.available ? (
                <button
                  onClick={() => handleOrderClick(postcard)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
                >
                  Order
                </button>
              ) : (
                <span className="text-gray-400">Out of stock</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
