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

  // Сбрасываем состояние при изменении src
  useEffect(() => {
    setImageError(false);
    setRetryCount(0);
    setCurrentSrc(src);
  }, [src]);

  const handleError = () => {
    console.log('SafeImage error for:', currentSrc, 'retry:', retryCount);
    
    // Пробуем перезагрузить до 1 раза
    if (retryCount < 1) {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      setTimeout(() => {
        const newSrc = src.includes('?') ? `${src}&retry=${newRetryCount}` : `${src}?retry=${newRetryCount}`;
        console.log('SafeImage retrying:', newSrc);
        setCurrentSrc(newSrc);
      }, 1000);
      return;
    }
    
    setImageError(true);
  };

  if (imageError) {
    // Для fill режима возвращаем абсолютно позиционированный элемент
    if (fill) {
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg">
          <div className="text-center p-4">
            <div className="text-4xl text-gray-300 mb-2">📄</div>
            <p className="text-sm text-gray-400">Изображение не загружено</p>
          </div>
        </div>
      );
    }
    
    // Для обычного режима возвращаем блок с размерами
    return (
      <div 
        className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${className || ''}`}
        style={{ width, height }}
      >
        <div className="text-center p-4">
          <div className="text-4xl text-gray-300 mb-2">📄</div>
          <p className="text-sm text-gray-400">Изображение не загружено</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={width}
      height={height}
      className={className}
      onError={handleError}
    />
  );
}
