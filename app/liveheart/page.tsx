"use client";

import React, { useEffect, useRef, useState } from "react";

type Phase = "collecting" | "crystallizing" | "artifact";

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  targetX?: number;
  targetY?: number;

  constructor(x: number, y: number, color = "#fff", size = 2) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.size = size;
    this.color = color;
  }
}

export default function LiveHeartPage(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pointersRef = useRef<Map<number, { x: number; y: number; time: number }>>(new Map());
  const metricsRef = useRef<{ speeds: number[]; angChanges: number[] }>({ speeds: [], angChanges: [] });
  const phaseRef = useRef<Phase>("collecting");
  const [phase, setPhase] = useState<Phase>("collecting");
  const [progress, setProgress] = useState<number>(0);
  const [hash, setHash] = useState<string>("");
  const [chaosScore, setChaosScore] = useState<number>(0);

  // Configuration
  const TARGET_PROGRESS = 100;
  const MAX_PARTICLES = 1200;
  const COLLECTION_DISTANCE_TARGET = 2000; // arbitrary distance for full progress

  // Helpers
  const now = () => performance.now();

  // Heart parametric points
  const generateHeartPoints = (count: number, w: number, h: number, scale = 12) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const t = (Math.PI * 2 * i) / count;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push({ x: w / 2 + x * scale, y: h / 2 - y * scale });
    }
    return pts;
  };

  // Compute a simple chaos score from collected metrics
  const computeChaos = () => {
    const { speeds, angChanges } = metricsRef.current;
    if (speeds.length === 0) return 0;
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / speeds.length;
    const angMean = angChanges.length ? angChanges.reduce((a, b) => a + b, 0) / angChanges.length : 0;
    // Normalize roughly into 0..1
    const score = Math.tanh((Math.sqrt(variance) * 0.02 + angMean * 0.02));
    return Math.min(Math.max(score, 0), 1);
  };

  // Simple async SHA-256 -> hex
  const digestHex = async (input: string) => {
    const enc = new TextEncoder();
    const data = enc.encode(input);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  };

  // Reset everything
  const resetAll = () => {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, c.width, c.height);
      }
    }
    particlesRef.current = [];
    metricsRef.current = { speeds: [], angChanges: [] };
    pointersRef.current.clear();
    phaseRef.current = "collecting";
    setPhase("collecting");
    setProgress(0);
    setHash("");
    setChaosScore(0);
  };

  // Initialize canvas and animation loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // clear to black
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Fade background a bit each frame to create trails (done in draw loop)

    let lastTime = now();
    let totalCollectedDistance = 0;

    const draw = (t: number) => {
      const dt = (t - lastTime) / 1000;
      lastTime = t;

      // trail fade
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const particles = particlesRef.current;

      if (phaseRef.current === "collecting") {
        // Draw particles and age them
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          // simple physics
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.x += p.vx * dt * 60;
          p.y += p.vy * dt * 60;

          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (phaseRef.current === "crystallizing") {
        // Move particles towards pre-assigned heart targets.
        // Assign targets only once (if any particle lacks a target).
        const needAssign = particles.some(p => p.targetX == null || p.targetY == null);
        let pts: { x: number; y: number }[] = [];
        if (needAssign) {
          pts = generateHeartPoints(Math.max(200, particles.length), canvas.width / dpr, canvas.height / dpr, Math.min(canvas.width / dpr, canvas.height / dpr) / 40);
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.targetX == null || p.targetY == null) {
              const target = pts[i % pts.length];
              p.targetX = target.x + (Math.random() - 0.5) * 4;
              p.targetY = target.y + (Math.random() - 0.5) * 4;
              // give them slight velocity toward center
              p.vx = (p.targetX - p.x) * 0.01;
              p.vy = (p.targetY - p.y) * 0.01;
            }
          }
        }

        // Interpolate toward fixed targets
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.targetX == null || p.targetY == null) continue;
          // stronger interpolation for faster convergence
          p.x += (p.targetX - p.x) * 0.18;
          p.y += (p.targetY - p.y) * 0.18;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        // check convergence with a relaxed threshold (within ~5px)
        const settled = particles.every(p => {
          if (p.targetX == null || p.targetY == null) return false;
          const dx = p.x - p.targetX;
          const dy = p.y - p.targetY;
          return dx * dx + dy * dy < 25;
        });
        if (settled) {
          // snap particles exactly to their targets to avoid jitter
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.targetX != null && p.targetY != null) {
              p.x = p.targetX;
              p.y = p.targetY;
            }
          }
          phaseRef.current = "artifact";
          setPhase("artifact");
        }
      } else {
        // artifact: pulse heart
        const score = chaosScore; // 0..1
        const freq = 0.8 + score * 8; // pulse speed
        const amp = 0.02 + score * 0.12; // pulse amplitude
        const tsec = t / 1000;
        const scale = 1 + Math.sin(tsec * Math.PI * freq) * amp;

        // draw particles around their target positions
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const cx = canvas.width / dpr / 2;
          const cy = canvas.height / dpr / 2;
          const tx = p.targetX ?? p.x;
          const ty = p.targetY ?? p.y;
          const dx = tx - cx;
          const dy = ty - cy;
          const nx = cx + dx * scale + (Math.random() - 0.5) * score * 6;
          const ny = cy + dy * scale + (Math.random() - 0.5) * score * 6;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(nx, ny, p.size + (score * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cap particle array
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer handlers
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;

    let totalDistance = 0;

    const pointerDown = (e: PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, time: now() });
    };

    const pointerMove = (e: PointerEvent) => {
      const prev = pointersRef.current.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY, time: now() };
      if (prev) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const dt = Math.max(1, cur.time - prev.time) / 1000;
        const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px/sec

        // angular change approximation: compare last velocity vector to current (use speeds array)
        const lastSpeed = metricsRef.current.speeds.length ? metricsRef.current.speeds[metricsRef.current.speeds.length - 1] : speed;
        const angChange = Math.abs(speed - lastSpeed);

        metricsRef.current.speeds.push(speed);
        metricsRef.current.angChanges.push(angChange);

        totalDistance += Math.sqrt(dx * dx + dy * dy);

        // create a few particles at cursor with slight randomization
        const particles = particlesRef.current;
        const count = Math.min(6, Math.ceil(Math.sqrt(speed) / 2));
        for (let i = 0; i < count; i++) {
          const p = new Particle(cur.x + (Math.random() - 0.5) * 8, cur.y + (Math.random() - 0.5) * 8, "#fff", Math.max(1, Math.random() * 2));
          p.vx = dx * (0.2 + Math.random() * 0.6);
          p.vy = dy * (0.2 + Math.random() * 0.6);
          p.color = "rgba(255,255,255," + (0.4 + Math.random() * 0.6) + ")";
          particles.push(p);
        }

        // update progress
        const prog = Math.min(100, Math.round((totalDistance / COLLECTION_DISTANCE_TARGET) * 100));
        setProgress(prog);

        // update chaos score
        const score = computeChaos();
        setChaosScore(score);

        // check completion
        if (prog >= TARGET_PROGRESS && phaseRef.current === "collecting") {
          // move to crystallizing
          phaseRef.current = "crystallizing";
          setPhase("crystallizing");

          // set particle colors based on chaos
          const paletteHigh = ["#FF2D55", "#00F5FF", "#FFFFFF"];
          const paletteLow = ["#FFD700", "#FFF1F3", "#FFC0CB"];
          const palette = score > 0.45 ? paletteHigh : paletteLow;

          particlesRef.current.forEach((p, idx) => {
            p.color = palette[idx % palette.length];
            p.size = 1 + Math.random() * (score > 0.45 ? 2.5 : 1.8);
          });

          // compute final hash and set
          (async () => {
            const metricsSnapshot = JSON.stringify({ speeds: metricsRef.current.speeds.slice(-200), ang: metricsRef.current.angChanges.slice(-200), score });
            const h = await digestHex(metricsSnapshot);
            setHash(`M-SIG:${h.slice(0, 12).toUpperCase()}`);
          })();
        }
      } else {
        pointersRef.current.set(e.pointerId, cur);
      }
      pointersRef.current.set(e.pointerId, cur);
    };

    const pointerUp = (e: PointerEvent) => {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {}
      pointersRef.current.delete(e.pointerId);
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
    };
  }, []);

  // When crystallizing, assign targets and let animation handle interpolation
  useEffect(() => {
    if (phase !== "crystallizing") return;
    const canvas = canvasRef.current!;
    const pts = generateHeartPoints(Math.max(200, particlesRef.current.length), canvas.width / Math.max(1, window.devicePixelRatio || 1), canvas.height / Math.max(1, window.devicePixelRatio || 1), Math.min(canvas.width, canvas.height) / (40 * (window.devicePixelRatio || 1)));
    const particles = particlesRef.current;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const t = pts[i % pts.length];
      p.targetX = t.x + (Math.random() - 0.5) * 6;
      p.targetY = t.y + (Math.random() - 0.5) * 6;
      // give them slight velocity toward center
      p.vx = (p.targetX - p.x) * 0.01;
      p.vy = (p.targetY - p.y) * 0.01;
    }
  }, [phase]);

  // UI color helper for overlay based on chaos
  const uiColor = () => (chaosScore > 0.45 ? "text-cyan-400" : "text-amber-300");

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        {phase === "collecting" && (
          <div className="text-center pointer-events-auto">
            <h1 className={`text-3xl md:text-4xl font-semibold text-white mb-2 ${uiColor()}`}>Imprint your chaos. Touch & Move.</h1>
            <p className="text-sm text-gray-300 opacity-80">Move across the screen — the system will crystallize your motion into an artifact.</p>
          </div>
        )}

        {phase === "crystallizing" && (
          <div className="text-center pointer-events-auto">
            <h1 className="text-3xl md:text-4xl font-semibold text-white mb-2">Crystallizing…</h1>
            <p className="text-sm text-gray-300 opacity-80">Your imprint is condensing into form.</p>
          </div>
        )}

        {phase === "artifact" && (
          <div className="text-center pointer-events-auto">
            <h1 className={`text-3xl md:text-4xl font-semibold mb-2 ${uiColor()}`}>The Artifact</h1>
            <p className="text-sm text-gray-200 opacity-85 mb-3">{chaosScore > 0.45 ? "Electric — volatile pulse" : "Silk — deep, slow heart"}</p>
            <div className="flex items-center gap-3 justify-center">
              <button
                className="bg-white/6 hover:bg-white/10 text-white px-4 py-2 rounded-md text-sm"
                onClick={() => {
                  resetAll();
                }}
              >
                Reset
              </button>
              <div className="text-xs text-gray-300 px-3 py-2 bg-white/6 rounded-md">{hash || "M-SIG:—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar bottom */}
      {phase === "collecting" && (
        <div className="absolute left-4 right-4 bottom-8 pointer-events-auto">
          <div className="w-full bg-white/6 h-2 rounded-full overflow-hidden">
            <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-yellow-400 transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-gray-300 mt-2 text-center">Progress: {progress}%</div>
        </div>
      )}
    </div>
  );
}
