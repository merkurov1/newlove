// src/components/GalleryGrid.tsx
"use client";

import { useState } from 'react';
import Image from 'next/image';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import { GalleryImage } from '@/types/blocks';

export default function GalleryGrid({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState(-1);

  if (!images || images.length === 0) return null;

  // Готовим слайды для лайтбокса
  const slides = images.map(item => ({
    src: item.url,
    width: 800, // можно добавить width/height в GalleryImage при необходимости
    height: 600,
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
            key={item.url || i}
            onClick={() => setIndex(i)}
            style={{
              position: 'relative', width: '100%', aspectRatio: '1 / 1',
              cursor: 'pointer', overflow: 'hidden', borderRadius: '0.5rem'
            }}
          >
            <Image
              src={item.url}
              alt={item.alt || `Gallery image ${i + 1}`}
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
