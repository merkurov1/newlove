'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  width?: number;
  height?: number;
}

export default function SafeImage({ src, alt, fill, sizes, className, width, height }: SafeImageProps) {
  const [imageError, setImageError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Сбрасываем состояние при изменении src
  useEffect(() => {
    setImageError(false);
    setRetryCount(0);
    setIsLoading(true);
    setCurrentSrc(src);
  }, [src]);

  const handleError = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Image failed to load:', currentSrc, 'retry:', retryCount);
    }
    
    // Пробуем перезагрузить до 2 раз
    if (retryCount < 2) {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      setTimeout(() => {
        // Форсируем обновление src с параметром retry
        const newSrc = src.includes('?') ? `${src}&retry=${newRetryCount}` : `${src}?retry=${newRetryCount}`;
        if (process.env.NODE_ENV === 'development') {
          console.log('Retrying image load:', newSrc);
        }
        setCurrentSrc(newSrc);
      }, 500 * newRetryCount); // Увеличиваем задержку с каждой попыткой
      return;
    }
    
    setImageError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
    setImageError(false);
  };

  if (imageError) {
    return (
      <div className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${className || ''}`}>
        <div className="text-center p-4">
          <div className="text-4xl text-gray-300 mb-2">📄</div>
          <p className="text-sm text-gray-400">Изображение не загружено</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ''}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center rounded-lg z-10">
          <div className="text-center p-4">
            <div className="text-2xl text-gray-300 mb-2">⏳</div>
            <p className="text-xs text-gray-400">Загрузка...</p>
          </div>
        </div>
      )}
      <Image
        src={currentSrc}
        alt={alt}
        fill={fill}
        sizes={sizes}
        width={width}
        height={height}
        className={`${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
}
