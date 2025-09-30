// src/components/GalleryGrid.js

import Image from 'next/image';

/**
 * images: Array<{ src: string, alt?: string }>
 */
export default function GalleryGrid({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div
      className="gallery-grid not-prose"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '1rem',
        margin: '2rem 0',
      }}
    >
      {images.map((img, i) => (
        <div
          key={img.src || i}
          className="gallery-item"
          style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}
        >
          <Image
            src={img.src}
            alt={img.alt || `Изображение ${i + 1}`}
            fill
            style={{ objectFit: 'cover', borderRadius: '0.5rem' }}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      ))}
    </div>
  );
}
