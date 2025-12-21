"use client";

import React, { useEffect, useRef } from "react";

type HeartDNA = {
  name?: string;
  palette: string[];
  structure: string;
  physics: string;
  scaleMode: string;
  particleCount: number;
  particleSize: number;
  glitchFactor: number;
  rotationSpeed: number;
};

class Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  color: string;
  alpha: number;
  targetX?: number;
  targetY?: number;
  t: number;
  offset: number;
  speed: number;
  sparkleOffset: number;

  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.z = 0;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.size = 0;
    this.baseSize = Math.random() * 3 + 1;
    this.color = "0, 0%, 100%";
    this.alpha = 1;
    this.t = Math.random() * Math.PI * 2;
    this.offset = (Math.random() - 0.5) * 20;
    this.speed = 0.002 + Math.random() * 0.01;
    this.sparkleOffset = Math.random() * 100;
  }
}

const getHeartPos = (t: number, scale: number, w: number, h: number, rotationY: number) => {
  let x = 16 * Math.pow(Math.sin(t), 3);
  let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  scale *= 0.9;
  x *= scale;
  y *= -scale;

  const z = x * Math.sin(rotationY);
  x = x * Math.cos(rotationY);

  return { x: w / 2 + x, y: h / 2 + y, z };
};

export default function SharedArtifact({ dna }: { dna: HeartDNA }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(container.clientWidth));
      const h = Math.max(1, Math.floor(container.clientHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const obs = new ResizeObserver(resize);
    obs.observe(container);
    resize();

    const repopulateParticles = (dnaObj: HeartDNA) => {
      particlesRef.current = [];
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);

      let sVal = Math.min(w, h) / 35;
      if (dnaObj.scaleMode === "MICRO") sVal /= 2.5;
      if (dnaObj.scaleMode === "MACRO") sVal *= 1.3;
      if (dnaObj.scaleMode === "TITAN") sVal *= 1.8;

      const count = Math.max(100, Math.min(dnaObj.particleCount || 1000, 5000));

      for (let i = 0; i < count; i++) {
        const p = new Particle(w, h);
        const t = (Math.PI * 2 * i) / count;
        p.t = t;

        const pt = getHeartPos(t, sVal, w, h, 0);

        let scatter = 5;
        if (dnaObj.structure === "CLOUD") scatter = 60;
        if (dnaObj.structure === "NOISE") scatter = 150;
        if (dnaObj.structure === "GALAXY") scatter = 80;
        if (dnaObj.structure === "SPIRAL") p.t += i * 0.01;

        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;
        p.color = dnaObj.palette[i % dnaObj.palette.length];

        p.baseSize = (dnaObj.particleSize || 1) + Math.random();
        if (dnaObj.scaleMode === "MICRO") p.baseSize *= 0.6;
        if (dnaObj.structure === "GRID") p.baseSize = 1.5;

        p.size = 0;
        particlesRef.current.push(p);
      }
    };

    repopulateParticles(dna);

    const render = () => {
      time += 0.015;
      const curDNA = dna;

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);
      ctx.globalCompositeOperation = "lighter";

      particlesRef.current.forEach((p) => {
        if (p.size < p.baseSize) p.size += (p.baseSize - p.size) * 0.1;

        if (curDNA && p.targetX !== undefined && p.targetY !== undefined) {
          const w = Math.max(1, container.clientWidth);
          const h = Math.max(1, container.clientHeight);
          let scale = Math.min(w, h) / 35;
          if (curDNA.scaleMode === "MICRO") scale /= 2.5;
          if (curDNA.scaleMode === "MACRO") scale *= 1.3;
          if (curDNA.scaleMode === "TITAN") scale *= 1.6;

          if (["SPIN", "ATOM", "GALAXY", "VORTEX"].includes(curDNA.structure) || curDNA.physics === "SPIN") {
            const rot = time * curDNA.rotationSpeed;
            const pt = getHeartPos(p.t, scale, w, h, rot);
            if (curDNA.structure === "ATOM" || curDNA.structure === "GALAXY") {
              const orbitR = 40 + Math.sin(time * 2 + p.t) * 20;
              pt.x += Math.cos(time * 3 + p.offset) * orbitR;
              pt.y += Math.sin(time * 3 + p.offset) * orbitR;
            }

            p.targetX = pt.x + (Math.cos(time + p.offset) * curDNA.glitchFactor);
            p.targetY = pt.y + (Math.sin(time + p.offset) * curDNA.glitchFactor);
          } else if (curDNA.physics === "FLOW") {
            p.t += p.speed;
            const pt = getHeartPos(p.t, scale, w, h, 0);
            p.targetX = pt.x + (Math.random() - 0.5) * curDNA.glitchFactor;
            p.targetY = pt.y + (Math.random() - 0.5) * curDNA.glitchFactor;
          } else if (curDNA.physics === "PULSE" || curDNA.physics === "BREATHE") {
            const beat = Math.pow(Math.sin(time * 3), 4) * 25;
            const cx = container.clientWidth / 2;
            const cy = container.clientHeight / 2;
            p.targetX! += ((p.x - cx) / 100) * beat * 0.02;
            p.targetY! += ((p.y - cy) / 100) * beat * 0.02;
          }

          const dx = p.targetX - p.x;
          const dy = p.targetY - p.y;
          let ease = 0.08;
          if (curDNA.physics === "IMPLODE") ease = 0.01;
          if (curDNA.physics === "STILL") ease = 0.1;

          p.x += dx * ease;
          p.y += dy * ease;

          const sparkle = Math.sin(time * 8 + p.sparkleOffset);
          p.alpha = sparkle > 0.8 ? 1 : 0.6;
        }

        if (p.size > 0.01) {
          ctx.fillStyle = `hsla(${p.color}, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.shadowBlur = p.size * 2;
          ctx.shadowColor = `hsla(${p.color}, 0.5)`;
          ctx.fill();
        }
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    };
  }, [dna]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
                  if (curDNA.physics === "STILL") ease = 0.1;

                  p.x += dx * ease;
                  p.y += dy * ease;

                  const sparkle = Math.sin(time * 8 + p.sparkleOffset);
                  p.alpha = sparkle > 0.8 ? 1 : 0.6;
                }

                if (p.size > 0.01) {
                  ctx.fillStyle = `hsla(${p.color}, ${p.alpha})`;
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                  ctx.shadowBlur = p.size * 2;
                  ctx.shadowColor = `hsla(${p.color}, 0.5)`;
                  ctx.fill();
                }
              });

              animId = requestAnimationFrame(render);
            };

            render();

            return () => {
              cancelAnimationFrame(animId);
              obs.disconnect();
            };
          }, [dna]);

          return (
            <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
              <canvas ref={canvasRef} className="block w-full h-full" />
            </div>
          );
        }
