"use client";

import React, { useEffect, useRef, useState } from "react";

// --- DNA & PARTICLE (copied from main engine to ensure parity) ---
type HeartDNA = {
  name: string;
  palette: string[];
  structure: "CONTOUR" | "CLOUD" | "GRID" | "ORBIT" | "RAIN" | "ATOM" | "SPIRAL" | "NOISE" | "GALAXY" | "VORTEX";
  physics: "PULSE" | "FLOW" | "VIBRATE" | "STILL" | "SPIN" | "IMPLODE" | "BREATHE";
  scaleMode: "MICRO" | "NORMAL" | "MACRO" | "TITAN";
  particleCount: number;
  particleSize: number;
  glitchFactor: number;
  rotationSpeed: number;
};

class Particle {
  x: number; y: number; z: number; vz: number; vx: number; vy: number;
  size: number; baseSize: number; color: string; alpha: number;
  targetX?: number; targetY?: number; targetZ?: number; t: number; offset: number; speed: number; sparkleOffset: number;

  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.z = (Math.random() - 0.5) * 80;
    this.vz = (Math.random() - 0.5) * 1.5;
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

// Reused math from original
const getHeartPos = (t: number, scale: number, w: number, h: number, rotationY: number) => {
  let x = 16 * Math.pow(Math.sin(t), 3);
  let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  scale *= 0.9;
  x *= scale; y *= -scale;
  const z = x * Math.sin(rotationY);
  x = x * Math.cos(rotationY);
  return { x: w / 2 + x, y: h / 2 + y, z };
};

const project3D = (x: number, y: number, z: number, width: number, height: number) => {
  const FOV = 250;
  const denom = FOV + z;
  const scale = denom > 0.1 ? (FOV / denom) : 0.001;
  const sx = (x - width / 2) * scale + width / 2;
  const sy = (y - height / 2) * scale + height / 2;
  return { x: sx, y: sy, scale };
};

export default function LiveHeartTV() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const dnaRef = useRef<HeartDNA | null>(null);
  const phaseRef = useRef<'display' | 'transition' | 'idle'>('idle');

  const animRef = useRef<number | null>(null);
  const cycleTimeoutRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);

  const [currentName, setCurrentName] = useState<string>("");
  const [nameVisible, setNameVisible] = useState(false);

  // Palettes copied to keep visual parity
  const palettes = [
    { name: "CYBERPUNK", colors: ["320, 100%, 60%", "190, 100%, 50%", "280, 100%, 60%"] },
    { name: "GOLDEN HOUR", colors: ["40, 100%, 60%", "20, 100%, 60%", "0, 0%, 100%"] },
    { name: "MATRIX", colors: ["120, 100%, 60%", "140, 100%, 50%", "0, 0%, 100%"] },
    { name: "ICE AGE", colors: ["200, 100%, 70%", "180, 100%, 80%", "220, 100%, 90%"] },
    { name: "VAMPIRE", colors: ["0, 100%, 60%", "350, 100%, 50%", "0, 0%, 30%"] },
    { name: "DEEP SPACE", colors: ["260, 100%, 70%", "290, 100%, 60%", "200, 50%, 60%"] },
    { name: "RADIOACTIVE", colors: ["60, 100%, 60%", "120, 100%, 60%", "0, 0%, 100%"] },
    { name: "MONOCHROME", colors: ["0, 0%, 100%", "0, 0%, 50%", "0, 0%, 80%"] },
    { name: "ROYAL", colors: ["280, 100%, 60%", "50, 100%, 50%", "0, 0%, 100%"] },
  ];

  // Utility: generate a more varied DNA (chaos + speed loud)
  const randomDNA = (): HeartDNA => {
    const rand = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    const palette = rand(palettes);
    const structures = ["CONTOUR", "CLOUD", "GRID", "ORBIT", "RAIN", "ATOM", "SPIRAL", "NOISE", "GALAXY", "VORTEX"] as HeartDNA['structure'][];
    const structure = rand(structures);
    const physicsList = ["PULSE", "FLOW", "VIBRATE", "STILL", "SPIN", "IMPLODE", "BREATHE"] as HeartDNA['physics'][];
    let physics = rand(physicsList);
    if (structure === "GRID") physics = "STILL";
    if (["ATOM","GALAXY","VORTEX"].includes(structure)) physics = "SPIN";
    if (structure === "RAIN") physics = "FLOW";

    const scaleModes = ["MICRO","NORMAL","NORMAL","MACRO","TITAN"] as HeartDNA['scaleMode'][];
    const scaleMode = rand(scaleModes);

    // Chaos & Speed variance: sometimes calm, sometimes wild
    const chaos = Math.random() < 0.2 ? 45 + Math.random() * 80 : Math.random() * 30;
    const speed = (Math.random() - 0.5) * (Math.random() * 0.12);

    const particleCount = scaleMode === 'TITAN' ? 2800 : (scaleMode === 'MICRO' ? 900 : 1800 + Math.floor(Math.random() * 800));

    const name = `${palette.name} ${structure}`;

    return {
      name,
      palette: palette.colors,
      structure,
      physics,
      scaleMode,
      particleCount,
      particleSize: 0.7 + Math.random() * 2,
      glitchFactor: chaos,
      rotationSpeed: speed
    };
  };

  const repopulateParticles = (dna: HeartDNA) => {
    particlesRef.current = [];
    const w = window.innerWidth;
    const h = window.innerHeight;

    let sVal = Math.min(w, h) / 35;
    if (dna.scaleMode === "MICRO") sVal /= 2.5;
    if (dna.scaleMode === "MACRO") sVal *= 1.3;
    if (dna.scaleMode === "TITAN") sVal *= 1.8;

    for (let i = 0; i < dna.particleCount; i++) {
      const p = new Particle(w, h);
      const t = (Math.PI * 2 * i) / dna.particleCount;
      p.t = t;
      const pt = getHeartPos(t, sVal, w, h, 0);

      let scatter = 5;
      if (dna.structure === "CLOUD") scatter = 60;
      if (dna.structure === "NOISE") scatter = 150;
      if (dna.structure === "GALAXY") scatter = 80;
      if (dna.structure === "SPIRAL") p.t += i * 0.01;

      p.targetX = pt.x + (Math.random() - 0.5) * scatter;
      p.targetY = pt.y + (Math.random() - 0.5) * scatter;
      const zBase = (Math.random() - 0.5) * 80;
      let zVar = zBase;
      if (dna.scaleMode === "MICRO") zVar *= 0.6;
      if (dna.scaleMode === "MACRO") zVar *= 1.2;
      if (dna.scaleMode === "TITAN") zVar *= 1.6;
      p.z = zVar;
      p.targetZ = zVar + (Math.random() - 0.5) * 40;
      p.color = dna.palette[i % dna.palette.length];
      p.baseSize = dna.particleSize + Math.random();
      if (dna.scaleMode === "MICRO") p.baseSize *= 0.6;
      if (dna.structure === "GRID") p.baseSize = 1.5;
      p.size = 0;
      particlesRef.current.push(p);
    }
  };

  // Start one cycle: display for 12s then transition for ~2s then next
  const startCycle = () => {
    clearTimers();
    const dna = randomDNA();
    dnaRef.current = dna;
    setCurrentName(dna.name);
    repopulateParticles(dna);
    phaseRef.current = 'display';
    setNameVisible(false);

    // show name after heart forms (fade in slowly)
    // small delay to allow particles to settle into place
    window.setTimeout(() => setNameVisible(true), 1800);

    // Display duration
    const DISPLAY_MS = 12000;
    const TRANSITION_MS = 1800;

    cycleTimeoutRef.current = window.setTimeout(() => {
      // Begin transition: disperse particles
      phaseRef.current = 'transition';
      setNameVisible(false);

      // Impart velocities outward for dramatic disperse
      const w = window.innerWidth; const h = window.innerHeight;
      particlesRef.current.forEach((p) => {
        const cx = w / 2; const cy = h / 2;
        const dx = p.x - cx; const dy = p.y - cy;
        const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
        const normX = dx / dist; const normY = dy / dist;
        const velocity = 2 + Math.random() * 6 + (dna.glitchFactor || 0) * 0.03;
        p.vx = normX * velocity + (Math.random()-0.5) * 2;
        p.vy = normY * velocity + (Math.random()-0.5) * 2;
        p.vz = (Math.random() - 0.5) * 6;
      });

      // After transition complete, start next cycle
      transitionTimeoutRef.current = window.setTimeout(() => {
        particlesRef.current = [];
        startCycle();
      }, TRANSITION_MS);
    }, DISPLAY_MS);
  };

  const clearTimers = () => {
    if (cycleTimeoutRef.current) { clearTimeout(cycleTimeoutRef.current); cycleTimeoutRef.current = null; }
    if (transitionTimeoutRef.current) { clearTimeout(transitionTimeoutRef.current); transitionTimeoutRef.current = null; }
  };

  // RENDER LOOP
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    let lastDpr = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      if (dpr !== lastDpr) {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lastDpr = dpr;
      }
    };

    const render = () => {
      time += 0.016;
      const curPhase = phaseRef.current;
      const curDNA = dnaRef.current;

      ctx.globalCompositeOperation = 'source-over';

      if (curPhase === 'display') {
        const alpha = curDNA?.physics === 'SPIN' ? 0.2 : 0.12;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(0,0, window.innerWidth, window.innerHeight);
      } else if (curPhase === 'transition') {
        ctx.fillStyle = `rgba(0,0,0,0.06)`;
        ctx.fillRect(0,0, window.innerWidth, window.innerHeight);
      } else {
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight);
      }

      ctx.globalCompositeOperation = 'lighter';

      particlesRef.current.forEach((p) => {
        if (curPhase === 'display') {
          if (p.size < p.baseSize) p.size += (p.baseSize - p.size) * 0.1;

          if (curDNA && p.targetX !== undefined && p.targetY !== undefined) {
            const w = window.innerWidth; const h = window.innerHeight;
            let scale = Math.min(w,h) / 35;
            if (curDNA.scaleMode === 'MICRO') scale /= 2.5;
            if (curDNA.scaleMode === 'MACRO') scale *= 1.3;
            if (curDNA.scaleMode === 'TITAN') scale *= 1.6;

            if (["SPIN","ATOM","GALAXY","VORTEX"].includes(curDNA.structure) || curDNA.physics === 'SPIN') {
              const rot = time * curDNA.rotationSpeed;
              const pt = getHeartPos(p.t, scale, w, h, rot);
              if (curDNA.structure === 'ATOM' || curDNA.structure === 'GALAXY') {
                const orbitR = 40 + Math.sin(time * 2 + p.t) * 20;
                pt.x += Math.cos(time * 3 + p.offset) * orbitR;
                pt.y += Math.sin(time * 3 + p.offset) * orbitR;
              }
              p.targetX = pt.x + (Math.cos(time + p.offset) * curDNA.glitchFactor);
              p.targetY = pt.y + (Math.sin(time + p.offset) * curDNA.glitchFactor);
              p.targetZ = pt.z;
            } else if (curDNA.physics === 'FLOW') {
              p.t += p.speed;
              const pt = getHeartPos(p.t, scale, w, h, 0);
              p.targetX = pt.x + (Math.random()-0.5) * curDNA.glitchFactor;
              p.targetY = pt.y + (Math.random()-0.5) * curDNA.glitchFactor;
              p.targetZ = pt.z;
            } else if (curDNA.physics === 'PULSE' || curDNA.physics === 'BREATHE') {
              const beat = Math.pow(Math.sin(time * 3), 4) * 25;
              const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
              p.targetX! += ((p.x - cx) / 100) * beat * 0.02;
              p.targetY! += ((p.y - cy) / 100) * beat * 0.02;
            }

            const dx = p.targetX - p.x; const dy = p.targetY - p.y;
            let ease = 0.08;
            if (curDNA.physics === 'IMPLODE') ease = 0.01;
            if (curDNA.physics === 'STILL') ease = 0.1;
            p.x += dx * ease; p.y += dy * ease;
            if (p.targetZ !== undefined) { const dz = p.targetZ - p.z; p.z += dz * (ease * 0.6); }

            const sparkle = Math.sin(time * 8 + p.sparkleOffset);
            p.alpha = sparkle > 0.8 ? 1 : 0.6;
          }
        } else if (curPhase === 'transition') {
          p.x += p.vx * 1.5;
          p.y += p.vy * 1.5;
          p.z += p.vz * 1.2;
          p.alpha *= 0.96;
          p.size *= 0.97;
        }

        if (p.size > 0.01 && p.alpha > 0.02) {
          const w = window.innerWidth; const h = window.innerHeight;
          let drawX = p.x; let drawY = p.y; let drawZ = p.z || 0;
          const rot = curDNA ? (time * (curDNA.rotationSpeed || 0)) : 0;
          if (curDNA && (curDNA.physics === 'SPIN' || ["ATOM","GALAXY","VORTEX"].includes(curDNA.structure))) {
            const lx = p.x - w/2; const lz = drawZ;
            const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
            const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
            drawX = rx + w/2; drawZ = rz;
          }

          const proj = project3D(drawX, drawY, drawZ, w, h);
          if (proj.scale > 0.05) {
            const turbX = Math.sin(time * 2 + p.y * 0.01) * 0.5;
            const turbY = Math.cos(time * 1.7 + p.x * 0.01) * 0.35;
            const sx = proj.x + turbX; const sy = proj.y + turbY;
            const screenSize = Math.max(0.01, p.size * proj.scale);
            const bloom = Math.min(40, screenSize * 8 * proj.scale);

            ctx.fillStyle = `hsla(${p.color}, ${p.alpha})`;
            ctx.beginPath(); ctx.shadowBlur = bloom; ctx.shadowColor = `hsla(${p.color}, 0.6)`;
            ctx.arc(sx, sy, screenSize, 0, Math.PI * 2); ctx.fill();

            if (proj.scale > 0.9) {
              ctx.beginPath(); ctx.globalAlpha = Math.min(0.6, p.alpha * 0.6);
              ctx.arc(sx, sy, screenSize * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            }
          }
        }
      });

      animRef.current = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    resize();
    render();

    // start cycles
    startCycle();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      clearTimers();
    };
  }, []);

  // Ensure full cleanup on unmount
  useEffect(() => {
    return () => { clearTimers(); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden touch-none select-none cursor-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Minimal Name UI at bottom center */}
      <div className="absolute bottom-8 left-0 right-0 pointer-events-none flex items-end justify-center">
        <div
          style={{
            transition: 'opacity 900ms ease, transform 900ms ease',
            opacity: nameVisible ? 1 : 0,
            transform: nameVisible ? 'translateY(0px)' : 'translateY(8px)'
          }}
          className="text-white/90 text-[14px] md:text-[18px] font-medium tracking-wider uppercase drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)] pointer-events-none"
        >
          {currentName}
        </div>
      </div>
    </div>
  );
}
