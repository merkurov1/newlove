'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function SafeImage(props) {
  const { 
    src, 
    alt, 
    width, 
    height, 
    fill, 
    sizes, 
    className = '', 
    priority = false,
    ...restProps 
  } = props;
  
  const [error, setError] = useState(false);

  if (error || !src) {
    // Простая заглушка без сложностей
    const style = fill 
      ? { position: 'absolute', inset: 0 }
      : { width: width || 'auto', height: height || 'auto' };
    
    return (
      <div 
        className={`bg-gray-100 flex items-center justify-center ${className}`}
        style={style}
      >
        <div className="text-gray-400 text-center p-2">
          <div className="text-2xl">📷</div>
          <div className="text-xs">Изображение</div>
        </div>
      </div>
    );
  }

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
      onError={() => setError(true)}
      {...restProps}
    />
  );
}