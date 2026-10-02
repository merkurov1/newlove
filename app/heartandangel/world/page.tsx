import React from 'react';
import Link from 'next/link';
import WorldScene from '@/components/WorldScene';

export default function WorldPage() {
  return (
    <div className="relative w-full min-h-screen bg-[#111] overflow-hidden">
      {/* Кнопка возврата к экосистеме в левом верхнем углу */}
      <div className="absolute top-6 left-6 z-50">
        <Link
          href="/heartandangel"
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white/90 hover:bg-white/30 transition-all shadow-lg text-xs font-medium tracking-wide"
        >
          <span>← Heart & Angel</span>
        </Link>
      </div>

      {/* Интерактивная сцена World */}
      <WorldScene />
    </div>
  );
}
