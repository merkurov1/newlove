'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
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
  const { data: session } = useSession();

  useEffect(() => {
    const fetchPostcards = async () => {
      try {
        const response = await fetch('/api/postcards');
        if (!response.ok) throw new Error('Failed to fetch postcards');
        
        const data = await response.json();
        setPostcards(data.postcards || []);
      } catch (err) {
        setError('Не удалось загрузить открытки');
        console.error('Postcards fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPostcards();
  }, []);

  const formatPrice = (priceInPence: number) => {
    return `£${(priceInPence / 100).toFixed(0)}`;
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
        <button 
          onClick={() => window.location.reload()} 
          className="text-blue-600 hover:underline"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (postcards.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-2">🎨 Скоро здесь появятся открытки</div>
        <div className="text-sm text-gray-500">Авторские работы в разработке</div>
      </div>
    );
  }

  if (selectedPostcard) {
    // Форма заказа
    return (
      <PostcardOrderForm 
        postcard={selectedPostcard} 
        onBack={() => setSelectedPostcard(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      {postcards.map((postcard) => (
        <div 
          key={postcard.id}
          className={`border rounded-lg overflow-hidden transition-all duration-200 ${
            postcard.featured 
              ? 'border-orange-300 shadow-md' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {/* Изображение открытки */}
          <div className="relative aspect-[4/3] bg-gray-100">
            <Image
              src={postcard.image.includes('example.com') ? 'https://i.ibb.co/YB01f0LC/IMG-0553.jpg' : postcard.image}
              alt={postcard.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              onError={(e) => {
                // Если изображение не загружается, показываем заглушку
                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNzUgMTI1SDIyNVYxNzVIMTc1VjEyNVoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE1MCAyMDBIMjUwVjE3NUgxNTBWMjAwWiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K';
                e.currentTarget.style.objectFit = 'contain';
              }}
            />
            {postcard.featured && (
              <div className="absolute top-3 left-3 bg-orange-500 text-white px-2 py-1 rounded text-xs font-medium">
                🌟 Рекомендуем
              </div>
            )}
            {!postcard.available && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="bg-white px-3 py-1 rounded text-sm font-medium">
                  Временно недоступно
                </span>
              </div>
            )}
          </div>

          {/* Информация о открытке */}
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{postcard.title}</h3>
            {postcard.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {postcard.description}
              </p>
            )}
            
            <div className="flex items-center justify-between">
              <div className="text-xl font-bold text-orange-600">
                {formatPrice(postcard.price)}
              </div>
              
              <button
                onClick={() => handleOrderClick(postcard)}
                disabled={!postcard.available}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  postcard.available
                    ? 'bg-orange-600 text-white hover:bg-orange-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {postcard.available ? 'Заказать' : 'Недоступно'}
              </button>
            </div>
          </div>
        </div>
      ))}
      
      <div className="text-center pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-500 mb-2">
          💌 Персональные открытки с авторскими рисунками
        </p>
        <p className="text-xs text-gray-400">
          Отправляем по всему миру.
        </p>
      </div>
    </div>
  );
}