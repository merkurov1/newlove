"use client";
import React from 'react';

export default function BackgroundShapes({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className || ''}`}>
      {/* Large blurred blobs */}
      <div className="absolute -left-40 -top-24 w-72 h-72 bg-gradient-to-br from-pink-300 via-rose-300 to-pink-200 opacity-40 rounded-full filter blur-3xl animate-float" />
      <div className="absolute right-0 top-12 w-56 h-56 bg-gradient-to-tr from-purple-300 via-pink-200 to-rose-200 opacity-30 rounded-full filter blur-2xl animate-float" style={{ animationDelay: '1.2s' }} />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[420px] h-[420px] bg-gradient-to-t from-pink-50-soft to-rose-50-custom opacity-30 rounded-[48%] filter blur-2xl transform scale-100 animate-float" style={{ animationDelay: '2s' }} />
      {/* subtle SVG organic shape for contrast */}
      <svg className="absolute right-12 bottom-12 w-80 h-80 opacity-20" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(300,300)">
          <path d="M120 -140C170 -90 210 -20 190 30C170 80 100 120 40 130C-20 140 -70 110 -120 80C-170 50 -200 -10 -170 -60C-140 -110 -80 -160 -20 -170C40 -180 80 -190 120 -140Z" fill="url(#g1)" />
        </g>
        <defs>
          <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#FFB6C1" stopOpacity="0.8" />
            <stop offset="1" stopColor="#D946EF" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
