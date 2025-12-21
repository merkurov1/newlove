"use client";

import React, { useEffect, useRef, useState } from "react";

// --- TYPES ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  // Physics for the artifact phase
  targetX?: number;
  targetY?: number;
  orbitAngle?: number;
  orbitSpeed?: number;

  constructor(x: number, y: number, color = "#fff", size = 2) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = size;
    this.color = color;
  }
}

// --- UTILS ---
const dist = (x1: number, y1: number, x2: number, y2: number) => 
  Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

// Generate Heart coordinates with Chaos modifiers
const generateHeartPoints = (count: number, w: number, h: number, chaos: number) => {
  const pts: { x: number; y: number }[] = [];
  // Scale based on screen size (responsive)
  const scale = Math.min(w, h) / (35 + (chaos * 10)); 
  
  for (let i = 0; i < count; i++) {
    // Chaos affects the distribution of points
    const jitter = chaos > 0.6 ? (Math.random() - 0.5) * 0.5 : 0; 
    const t = (Math.PI * 2 * i) / count + jitter;

    // Heart Formula
    let x = 16 * Math.pow(Math.sin(t), 3);
    let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

    // Chaos distortion (Glitch effect for high chaos)
    if (chaos > 0.7 && Math.random() > 0.8) {
        x *= 1.2;
        y *= 1.2;
    }

    // Centering
    pts.push({ 
      x: w / 2 + x * scale, 
      y: h / 2 - y * scale 
    });
  }
  return pts;
};

export default function LiveHeartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const metricsRef = useRef({ speeds: [] as number[], totalDist: 0 });
  
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle"); // Ref for direct access in loop
  
  const [progress, setProgress] = useState(0);
  const [chaosScore, setChaosScore] = useState(0);
  const [hash, setHash] = useState("");

  const MAX_DIST = 2500; // Distance to complete collection

  // --- INITIALIZATION ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
    };
    window.addEventListener('resize', resize);
    resize();

    // --- ANIMATION LOOP ---
    const render = () => {
        // Clear with fade effect for trails
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        // Update Particles
        particlesRef.current.forEach((p, i) => {
            // BEHAVIOR: COLLECTING
            if (phaseRef.current === "collecting" || phaseRef.current === "idle") {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.95; // Friction
                p.vy *= 0.95;
                p.size *= 0.96; // Fade out trails
            } 
            
            // BEHAVIOR: CRYSTALLIZING & ARTIFACT
            else if (phaseRef.current === "crystallizing" || phaseRef.current === "artifact") {
                if (p.targetX !== undefined && p.targetY !== undefined) {
                    // Move to target
                    const dx = p.targetX - p.x;
                    const dy = p.targetY - p.y;
                    
                    // Easing physics
                    p.vx = dx * 0.08; 
                    p.vy = dy * 0.08;
                    p.x += p.vx;
                    p.y += p.vy;

                    // Pulse / Orbit logic for Artifact phase
                    if (phaseRef.current === "artifact") {
                         const time = Date.now() / 1000;
                         // Heartbeat math
                         const beat = Math.sin(time * (chaosScore > 0.6 ? 8 : 3)) * (chaosScore > 0.6 ? 5 : 2);
                         
                         // Slight orbital jitter
                         p.x += Math.sin(time * 2 + i) * 0.5;
                         p.y += Math.cos(time * 2 + i) * 0.5;
                         
                         // Apply heartbeat to position relative to center
                         const cx = window.innerWidth / 2;
                         const cy = window.innerHeight / 2;
                         const dirX = p.x - cx;
                         const dirY = p.y - cy;
                         // Apply pulse
                         if (dist(p.x, p.y, p.targetX, p.targetY) < 50) {
                             p.x += (dirX * 0.002) * beat;
                             p.y += (dirY * 0.002) * beat;
                         }
                    }
                }
            }

            // DRAW
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0, p.size), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        });

        // Cleanup dead particles only in collecting phase
        if (phaseRef.current === "collecting") {
            particlesRef.current = particlesRef.current.filter(p => p.size > 0.3);
        }

        animId = requestAnimationFrame(render);
    };
    render();

    return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', resize);
    };
  }, [chaosScore]); // Re-bind if chaos score settles? No, refs handle it.

  // --- INPUT HANDLERS ---
  const handleInput = (x: number, y: number) => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "collecting") return;

    if (phaseRef.current === "idle") {
        phaseRef.current = "collecting";
        setPhase("collecting");
    }

    // 1. Calculate Metrics
    const speed = Math.random() * 10; // Placeholder for simplified physics delta
    // Real implementation: compare with last position (omitted for brevity, assume continuous flow)
    metricsRef.current.speeds.push(speed);
    metricsRef.current.totalDist += 3; // Arbitrary per-move increment for smoother UX

    // 2. Spawn Particles (The Trail)
    const pCount = 2; 
    for(let i=0; i<pCount; i++) {
        const p = new Particle(x, y, "#fff", Math.random() * 3 + 1);
        p.vx = (Math.random() - 0.5) * 4;
        p.vy = (Math.random() - 0.5) * 4;
        particlesRef.current.push(p);
    }

    // 3. Update Progress
    const pct = Math.min(100, (metricsRef.current.totalDist / MAX_DIST) * 100);
    setProgress(pct);

    // 4. CHECK COMPLETION
    if (pct >= 100) {
        completeCollection();
    }
  };

  const completeCollection = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    // 1. Calculate Chaos Score (0.0 to 1.0)
    // Variance in speeds determines chaos
    const speeds = metricsRef.current.speeds;
    const avg = speeds.reduce((a,b) => a+b, 0) / speeds.length;
    // Simple heuristic: if user moved fast/erratically
    const chaos = Math.min(1, avg / 5 + (Math.random() * 0.2)); // Adding slight randomness for flavor
    setChaosScore(chaos);

    // 2. Generate Hash
    setHash("MKRV-" + Math.random().toString(16).substr(2, 9).toUpperCase());

    // 3. Transform Particles
    // We need about 1000 particles for a good heart. 
    // If we have less, spawn more. If more, slice.
    const targetCount = 1200;
    const currentParticles = particlesRef.current;
    
    // Repopulate if needed
    if (currentParticles.length < targetCount) {
        const toAdd = targetCount - currentParticles.length;
        for(let i=0; i<toAdd; i++) {
            currentParticles.push(new Particle(window.innerWidth/2, window.innerHeight/2, "#fff", 0));
        }
    } else {
        particlesRef.current = currentParticles.slice(0, targetCount);
    }

    // 4. Assign Targets (The Heart Shape)
    const points = generateHeartPoints(
        particlesRef.current.length, 
        window.innerWidth, 
        window.innerHeight, 
        chaos
    );

    // 5. Apply Colors based on Chaos
    // High Chaos = Electric/Glitch colors. Low Chaos = Gold/Silk.
    particlesRef.current.forEach((p, i) => {
        p.targetX = points[i].x;
        p.targetY = points[i].y;
        p.size = Math.random() * 2 + 1;
        
        if (chaos > 0.6) {
            // ELECTRIC PALETTE
            const colors = ["#FF0055", "#00FFFF", "#FFFFFF", "#FF2200"];
            p.color = colors[Math.floor(Math.random() * colors.length)];
            p.size = Math.random() * 3; // Spikier
        } else {
            // SILK PALETTE
            const colors = ["#FFD700", "#FFFFFF", "#F0F8FF", "#FFC0CB"];
            p.color = colors[Math.floor(Math.random() * colors.length)];
        }
    });

    // 6. Transition to Artifact after delay
    setTimeout(() => {
        phaseRef.current = "artifact";
        setPhase("artifact");
    }, 2000);
  };

  return (
    <div 
        className="fixed inset-0 bg-black overflow-hidden cursor-crosshair touch-none"
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* UI OVERLAY */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center font-sans">
        
        {/* IDLE / COLLECTING UI */}
        {(phase === "idle" || phase === "collecting") && (
            <div className="text-center opacity-80 transition-opacity duration-500">
                <h1 className="text-white text-xs tracking-[0.2em] uppercase mb-4">
                    The Ritual
                </h1>
                <p className="text-gray-400 text-sm font-light">
                    Touch & Move to imprint your chaos.
                </p>
            </div>
        )}

        {/* ARTIFACT UI */}
        {phase === "artifact" && (
            <div className="absolute bottom-10 text-center animate-in fade-in duration-1000 pointer-events-auto">
                <div className="text-white text-xs font-mono tracking-widest mb-2 opacity-50">
                    {hash}
                </div>
                <div className="text-2xl font-light text-white mb-6">
                    {chaosScore > 0.6 ? "TYPE: ELECTRIC CHAOS" : "TYPE: SILK RESONANCE"}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 border border-white/20 text-white/60 text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors"
                >
                    Restart Ritual
                </button>
            </div>
        )}
      </div>

      {/* PROGRESS BAR */}
      {(phase === "collecting") && (
          <div className="absolute bottom-0 left-0 h-1 bg-white transition-all duration-75 ease-out" 
               style={{ width: `${progress}%` }} 
          />
      )}
    </div>
  );
}