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

  const handleError = () => {
    console.error('Failed to load image:', src);
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
