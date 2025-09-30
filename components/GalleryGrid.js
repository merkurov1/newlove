// src/components/GalleryGrid.tsx
"use client";

import { useState } from 'react';
import Image from 'next/image';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

// Ожидаем, что images будет массивом объектов, где каждый объект содержит image
type ImageItem = {
  image: {
    url: string;
    alt: string;
    width: number;
    height: number;
  }
}

export default function GalleryGrid({ images }: { images: ImageItem[] }) {
  const [index, setIndex] = useState(-1);

  if (!images || images.length === 0) return null;

  // Готовим слайды для лайтбокса
  const slides = images.map(item => ({
    src: item.image.url,
    width: item.image.width,
    height: item.image.height,
  }));

  return (
    <>
      <div
        className="gallery-grid not-prose"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1rem', margin: '2rem 0',
        }}
      >
        {images.map((item, i) => (
          <div
            key={item.image.url || i}
            onClick={() => setIndex(i)}
            style={{
              position: 'relative', width: '100%', aspectRatio: '1 / 1',
              cursor: 'pointer', overflow: 'hidden', borderRadius: '0.5rem'
            }}
          >
            <Image
              src={item.image.url}
              alt={item.image.alt || `Gallery image ${i + 1}`}
              fill
              style={{ objectFit: 'cover' }}
              className="transition-transform duration-300 hover:scale-105"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        ))}
      </div>

      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
      />
    </>
  );
}
