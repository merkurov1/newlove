'use client';

import Image from 'next/image';
import { useState } from 'react';

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
  const [retryCount, setRetryCount] = useState(0);

  const handleError = () => {
    console.log('Image failed to load:', src);
    
    // Пробуем перезагрузить 1 раз
    if (retryCount < 1) {
      setRetryCount(retryCount + 1);
      setTimeout(() => {
        // Форсируем обновление src
        const newSrc = src.includes('?') ? `${src}&retry=${retryCount + 1}` : `${src}?retry=${retryCount + 1}`;
        console.log('Retrying image load:', newSrc);
      }, 1000);
      return;
    }
    
    setImageError(true);
  };

  if (imageError) {
    return (
      <div className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${className}`}>
        <div className="text-center p-4">
          <div className="text-4xl text-gray-300 mb-2">📄</div>
          <p className="text-sm text-gray-400">Изображение не загружено</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={src}
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
