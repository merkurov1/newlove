'use client';

import Image from 'next/image';
import { useState, useCallback } from 'react';

/**
 * Безопасный компонент изображения с fallback
 * Архитектурно правильная реализация без конфликтов пропсов
 */
export default function SafeImage(props: any) {
  const {
    src,
    alt = 'Изображение',
    width,
    height,
    fill = false,
    sizes,
    className = '',
    priority = false,
    style,
    ...imageProps // Только валидные пропсы Image
  } = props;

  const [imageError, setImageError] = useState(false);

  // Стабильный обработчик ошибок
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Fallback UI
  const renderFallback = () => {
    const fallbackContent = (
      <div className="text-center text-gray-400 p-2">
        <div className="text-xl mb-1">📷</div>
        <div className="text-xs">Изображение</div>
      </div>
    );

    if (fill) {
      return (
        <div
          className={`absolute inset-0 bg-gray-100 flex items-center justify-center ${className}`}
          style={style}
        >
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
          minHeight: height ? `${height}px` : '40px',
          ...style
        }}
      >
        {fallbackContent}
      </div>
    );
  };

  // Показываем fallback если нет src или ошибка
  if (!src || imageError) {
    return renderFallback();
  }

  // Добавляем параметры ресайза для Supabase Storage
  let safeSrc = src;
  if (typeof safeSrc === 'string' && safeSrc.includes('supabase.co/storage')) {
    // Не дублируем параметры, если они уже есть
    if (!safeSrc.match(/[?&]width=\d+/)) {
      safeSrc += (safeSrc.includes('?') ? '&' : '?') + 'width=800&quality=75';
    }
  }
  return (
    <Image
      src={safeSrc}
      alt={alt}
      width={width}
      height={height}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
      style={style}
      onError={handleImageError}
    // НЕ используем ...imageProps чтобы избежать переписывания onError
    />
  );
}