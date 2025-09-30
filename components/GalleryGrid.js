import React from 'react';

export default function GalleryGrid({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="gallery-grid">
      {images.map((src, i) => (
        <div key={i}>
          <img src={src} alt="gallery image" />
        </div>
      ))}
    </div>
  );
}
