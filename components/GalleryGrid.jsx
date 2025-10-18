// src/components/GalleryGrid.jsx
"use client";

import { useState } from 'react';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import SafeImage from '@/components/SafeImage';

export default function GalleryGrid({ images }) {
  const [index, setIndex] = useState(-1);

  if (!images || images.length === 0) return null;

  // Ensure images are plain objects (strip prototypes) and prepare slides
  const safeImages = (() => {
    try {
      return JSON.parse(JSON.stringify(images || []));
    } catch (e) {
      console.error('GalleryGrid: failed to deep-clone images', e);
      return images || [];
    }
  })();

  // Готовим слайды для лайтбокса
  const slides = safeImages.map(item => ({
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
        {safeImages.map((item, i) => (
          <div
            key={item.url || i}
            onClick={() => setIndex(i)}
            style={{
              position: 'relative', width: '100%', aspectRatio: '4 / 3',
              cursor: 'pointer', overflow: 'hidden', borderRadius: '0.5rem',
              transition: 'transform 0.2s ease'
            }}
            className="hover:scale-105 shadow-md hover:shadow-lg"
          >
            <SafeImage
              src={item.url}
              alt={item.alt || `Gallery image ${i + 1}`}
              fill={true}
              className="transition-all duration-300 object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            {/* Индикатор кликабельности */}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 transition-all duration-300 flex items-center justify-center">
              <div className="opacity-0 hover:opacity-100 transition-opacity duration-300 bg-white bg-opacity-90 rounded-full p-2">
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>
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
