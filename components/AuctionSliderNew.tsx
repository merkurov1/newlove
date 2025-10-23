"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type Article = {
  id: string | number;
  title: string;
  slug: string;
  previewImage?: string | null;
  description?: string | null;
};

export default function AuctionSliderNew({ articles }: { articles: Article[] }) {
  const [index, setIndex] = useState(0);
  const len = (articles && articles.length) || 0;

  useEffect(() => {
    // clamp index when articles change
    if (index >= len) setIndex(0);
  }, [len, index]);

  if (!articles || articles.length === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + len) % len);
  const next = () => setIndex((i) => (i + 1) % len);

  const a = articles[index];

  return (
    <div className="relative w-full max-w-4xl mx-auto bg-white/30 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg">
      <div className="relative w-full h-[360px] md:h-[420px]">
        {a.previewImage ? (
          <Link href={`/${a.slug}`} className="block w-full h-full">
            <Image src={a.previewImage} alt={a.title} fill sizes="100vw" className="object-cover" priority draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </Link>
        ) : (
          <Link href={`/${a.slug}`} className="block w-full h-full bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
            <div className="text-4xl text-gray-400">📰</div>
          </Link>
        )}
      </div>

      <div className="p-4 md:p-6 text-center">
        <Link href={`/${a.slug}`} className="block">
          <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2 line-clamp-2">{a.title}</h3>
        </Link>
        {a.description ? <p className="text-gray-600 text-sm md:text-base line-clamp-3">{a.description}</p> : null}

        <div className="mt-4 flex items-center justify-center gap-4">
          <button onClick={prev} aria-label="Previous" className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">‹</button>
          <span className="text-sm text-gray-500">{index + 1} / {len}</span>
          <button onClick={next} aria-label="Next" className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">›</button>
        </div>
      </div>
    </div>
  );
}
