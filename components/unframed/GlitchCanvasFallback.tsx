"use client";

import React, { useEffect, useRef } from 'react';

// Canvas 2D particle fallback (no three.js)
export default function GlitchCanvasFallback() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let mounted = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor((canvas.parentElement?.clientWidth || window.innerWidth) * dpr));
      canvas.height = Math.max(1, Math.floor((canvas.parentElement?.clientHeight || window.innerHeight) * dpr));
      canvas.style.width = (canvas.width / dpr) + 'px';
      canvas.style.height = (canvas.height / dpr) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener('resize', resize);
    resize();

    const particles = new Array(800).fill(0).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.6 + 0.4,
      hue: 340 + Math.random() * 30,
    }));

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      if (!mounted) return;
      const t = (performance.now() - start) / 1000;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      for (let p of particles) {
        p.x += p.vx + Math.sin(t * 0.2 + p.x * 0.001) * 0.2;
        p.y += p.vy + Math.cos(t * 0.3 + p.y * 0.001) * 0.2;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.beginPath();
        const alpha = 0.6 + 0.4 * Math.sin(t * 2 + p.x + p.y);
        ctx.fillStyle = `hsla(${p.hue},80%,60%,${alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="w-full h-full block" />;
}
