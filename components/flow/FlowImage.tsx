'use client';

import Image from 'next/image';
import { useEffect, useState, type SyntheticEvent } from 'react';
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
  /**
   * Use the image's own proportions once it has loaded. A stable frame is
   * kept while loading (and on failure), so layout never collapses.
   */
  natural?: boolean;
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
  natural = false,
}: FlowImageProps) {
  const [nextFailedSrc, setNextFailedSrc] = useState<string | null>(null);
  const [plainFailedSrc, setPlainFailedSrc] = useState<string | null>(null);
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);

  const source = typeof src === 'string' ? src.trim() : '';
  const plainFailed = Boolean(source && plainFailedSrc === source);
  const nextFailed = Boolean(source && nextFailedSrc === source);

  useEffect(() => {
    setNaturalRatio(null);
  }, [source]);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!natural) return;

    const image = event.currentTarget;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setNaturalRatio(`${image.naturalWidth} / ${image.naturalHeight}`);
    }
  };

  const wrapperStyle: React.CSSProperties = {
    display: 'block',
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    aspectRatio: natural && naturalRatio ? naturalRatio : aspectRatio,
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
          onLoad={handleLoad}
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
        onLoad={handleLoad}
        onError={() => setPlainFailedSrc(source)}
      />
    </span>
  );
}
