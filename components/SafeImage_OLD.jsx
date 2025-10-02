'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function SafeImage({ 
  src, 
  alt = 'Изображение', 
  width, 
  height, 
  fill, 
  sizes, 
  className = '', 
  priority = false,
  onError: customOnError,
  ...otherProps 
}) {
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    setHasError(true);
    // Вызываем пользовательский обработчик если есть
    if (customOnError) {
      customOnError();
    }
  };

  // Если нет src или произошла ошибка - показываем fallback
  if (!src || hasError) {
    const fallbackContent = (
      <div className="text-center text-gray-400">
        <div className="text-2xl mb-1">📷</div>
        <div className="text-xs">Изображение недоступно</div>
      </div>
    );

    if (fill) {
      return (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          {fallbackContent}
        </div>
      );
    }

    return (
      <div 
        className={`bg-gray-100 flex items-center justify-center ${className}`}
        style={{ 
          width: width || 'auto', 
          height: height || 'auto',
          minWidth: width ? `${width}px` : '40px',
          minHeight: height ? `${height}px` : '40px'
        }}
      >
        {fallbackContent}
      </div>
    );
  }

  // Рендерим Next.js Image с правильными пропсами
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
      onError={handleError}
      {...otherProps}
    />
  );
}