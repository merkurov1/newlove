'use client';

import Image from 'next/image';
import { useState } from 'react';
import { flowImageSrc, canUseNextImage } from '@/lib/flow/image';

export type FlowImageProps = {
  src?: string | null;
  alt?: string | null;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  transformWidth?: number;
  quality?: number;
  style?: React.CSSProperties;
};

/**
 * Flow image renderer with a stable reserved box.
 *
 * - Next/Image for configured hosts (Supabase, Bluesky, YouTube, Medium, etc.)
 * - one bounded Supabase transform before Next optimization
 * - plain lazy image for unknown external link-preview hosts
 * - deterministic fallback instead of a collapsed or broken layout
 */
export default function FlowImage({
  src,
  alt,
  sizes = '(max-width: 768px) 100vw, 720px',
  priority = false,
  className = '',
  imageClassName = '',
  aspectRatio = '4 / 3',
  objectFit = 'cover',
  transformWidth = 1200,
  quality = 82,
  style,
}: FlowImageProps) {
  const [nextFailedSrc, setNextFailedSrc] = useState<string | null>(null);
  const [plainFailedSrc, setPlainFailedSrc] = useState<string | null>(null);

  const source = typeof src === 'string' ? src.trim() : '';
  const plainFailed = Boolean(source && plainFailedSrc === source);
  const nextFailed = Boolean(source && nextFailedSrc === source);

  const wrapperStyle: React.CSSProperties = {
    display: 'block',
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    aspectRatio,
    background: '#f5f3ef',
    ...style,
  };

  if (!source || plainFailed) {
    return (
      <span
        className={`pw-flow-image ${className}`.trim()}
        style={wrapperStyle}
        role="img"
        aria-label={alt || 'Изображение недоступно'}
      />
    );
  }

  if (canUseNextImage(source) && !nextFailed) {
    return (
      <span className={`pw-flow-image ${className}`.trim()} style={wrapperStyle}>
        <Image
          src={flowImageSrc(source, transformWidth)}
          alt={alt || ''}
          fill
          sizes={sizes}
          priority={priority}
          quality={quality}
          className={`pw-flow-image-el ${imageClassName}`.trim()}
          style={{ objectFit }}
          onError={() => setNextFailedSrc(source)}
        />
      </span>
    );
  }

  return (
    <span className={`pw-flow-image ${className}`.trim()} style={wrapperStyle}>
      {/* Unknown remote hosts bypass next/image rather than failing the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={alt || ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`pw-flow-image-el ${imageClassName}`.trim()}
        style={{ width: '100%', height: '100%', objectFit }}
        onError={() => setPlainFailedSrc(source)}
      />
    </span>
  );
}
