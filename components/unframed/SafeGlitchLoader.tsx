"use client";

import React from 'react';
import GlitchCanvasFallback from './GlitchCanvasFallback';

export default function SafeGlitchLoader() {
  // Simplified loader: always render the canvas fallback (no dynamic three imports)
  return <GlitchCanvasFallback />;
}
