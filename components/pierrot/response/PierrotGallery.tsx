'use client';

/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { isAllowedPierrotImageUrl } from '@/lib/pierrot/response/images';
import type { PierrotGalleryBlock } from '@/lib/pierrot/response/types';

export default function PierrotGallery({ block }: { block: PierrotGalleryBlock }) {
  const images = block.images.filter(
    (image) => isAllowedPierrotImageUrl(image.src) && Boolean(image.source?.trim())
  );

  if (images.length === 0) {
    return (
      <div className="my-5 border-l border-[#C9BBA8] pl-3 font-mono text-[10.5px] leading-relaxed tracking-[0.04em] text-[#8A8175]">
        Изображения не показаны: нет проверенного источника.
      </div>
    );
  }

  if (block.layout === 'single' || images.length === 1) {
    const image = images[0];
    return (
      <figure className="my-6 min-w-0">
        <img
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-auto max-h-[70vh] w-full border border-[#E4DCCF] object-contain"
        />
        <figcaption className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#625B50]">
          {image.caption || image.alt}
          {image.source && (
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#948A7D]">
              {image.source}
            </span>
          )}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="my-6 min-w-0">
      {block.title && (
        <figcaption className="mb-1 font-serif text-[17px] leading-snug text-[#211F1F]">
          {block.title}
        </figcaption>
      )}
      {block.description && (
        <p className="mb-3 max-w-2xl text-[14px] leading-relaxed text-[#7A7268]">
          {block.description}
        </p>
      )}
      <div
        className={
          block.layout === 'carousel'
            ? 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {images.map((image, index) => (
          <div
            key={`${image.src}-${index}`}
            className={
              block.layout === 'carousel'
                ? 'w-[76%] shrink-0 snap-start sm:w-[44%]'
                : 'min-w-0'
            }
          >
            <img
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-auto w-full border border-[#E4DCCF] object-cover"
            />
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#625B50]">
              {image.caption || image.alt}
            </p>
            {image.source && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#948A7D]">
                {image.source}
              </p>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}
