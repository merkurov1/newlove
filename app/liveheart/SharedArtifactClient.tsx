"use client";

import React from "react";

type HeartDNA = {
  name?: string;
  palette: string[];
  structure?: string;
  physics?: string;
  scaleMode?: string;
  particleCount?: number;
  particleSize?: number;
  glitchFactor?: number;
  rotationSpeed?: number;
};

export default function SharedArtifact({ dna }: { dna: HeartDNA }) {
  const palette = dna?.palette && dna.palette.length ? dna.palette : ["#ff6b6b", "#ffd166"];
  const id = `grad-${Math.random().toString(36).slice(2, 9)}`;

  const formatColor = (c: string) => {
    if (!c) return c;
    // If the palette entry looks like 'h, s%, l%' or contains '%' or comma, assume HSL
    if (c.includes('%') || c.includes(',')) return `hsl(${c})`;
    return c;
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-black p-4">
      <svg viewBox="0 0 200 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            {palette.map((c, i) => (
              <stop key={i} offset={`${(i / (palette.length - 1 || 1)) * 100}%`} stopColor={formatColor(c)} />
            ))}
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform="translate(100,100)">
          <path
            d="M0,-28 C12,-48 48,-48 48,-12 C48,8 24,28 0,44 C-24,28 -48,8 -48,-12 C-48,-48 -12,-48 0,-28 Z"
            fill={`url(#${id})`}
            filter="url(#glow)"
            transform="scale(1.2)"
          />
          <circle cx="-28" cy="-10" r="3" fill="rgba(255,255,255,0.25)" />
          <circle cx="20" cy="-6" r="2.5" fill="rgba(255,255,255,0.18)" />
        </g>
      </svg>
    </div>
  );
}
