// src/components/GalleryGrid.js

import Image from 'next/image';

export default function GalleryGrid({ images }) {
  if (!images || images.length === 0) {
    return null;
  }

  return (
    <div
      className="gallery-grid not-prose" // not-prose, чтобы стили статьи не влияли
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '1rem',
        margin: '2rem 0',
      }}
    >
      {images.map((image, index) => (
        <div
          key={image.src || index}
          className="gallery-item"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
          }}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            style={{ objectFit: 'cover', borderRadius: '0.5rem' }}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      ))}
    </div>
  );
}
