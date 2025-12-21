"use client";

import React, { useEffect, useRef, useState } from "react";

// --- TYPES & CONFIG ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";
type Archetype = "VOID" | "STARDUST" | "MERCURY" | "MAGMA" | "NEON" | "GLITCH";

const CONFIG = {
  COLLECTION_THRESHOLD: 4000, 
  PARTICLE_COUNT: 1200, // More particles, smaller size
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  color: string;
  alpha: number;
  
  // Artifact properties
  targetX?: number;
  targetY?: number;
  angle: number;     // Orbit angle
  radius: number;    // Orbit radius
  speed: number;     // Orbit speed
  wobble: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 3;
    this.vy = (Math.random() - 0.5) * 3;
    this.size = Math.random() * 2;
    this.baseSize = this.size;
    this.color = "255, 255, 255"; // RGB base for rgba manipulation
    this.alpha = 1;
    this.angle = Math.random() * Math.PI * 2;
    this.radius = Math.random() * 20;
    this.speed = 0.005 + Math.random() * 0.02;
    this.wobble = Math.random() * 100;
  }
}

export default function LiveHeartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const particlesRef = useRef<Particle[]>([]);
  const metricsRef = useRef({ 
    speeds: [] as number[], 
    angles: [] as number[],
    totalDist: 0,
    lastX: 0,
    lastY: 0,
    minX: 9999, maxX: 0, minY: 9999, maxY: 0 
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const archetypeRef = useRef<Archetype | null>(null);

  // --- HEART FORMULA ---
  const getHeartPoint = (t: number, scale: number, w: number, h: number) => {
    // Modified parametric for better spread
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: w / 2 + x * scale, y: h / 2 - y * scale };
  };

  // --- LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    window.addEventListener("resize", resize);
    resize();

    const render = () => {
      time += 0.02;
      const curArchetype = archetypeRef.current;
      const curPhase = phaseRef.current;
      
      // 1. BACKGROUND & TRAILS
      // Use 'destination-out' to create fading trails or clean clear
      if (curPhase === "artifact" && (curArchetype === "NEON" || curArchetype === "MAGMA")) {
         ctx.globalCompositeOperation = "source-over";
         ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; // Long trails
         ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      } else {
         ctx.globalCompositeOperation = "source-over";
         ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }

      // 2. SET BLENDING MODE (The "High-End" Glow)
      // Screen/Lighter makes overlapping particles bright instead of muddy
      ctx.globalCompositeOperation = "screen"; 

      // 3. RENDER PARTICLES
      
      // NEON/WEB LINES
      if (curPhase === "artifact" && curArchetype === "NEON") {
         ctx.strokeStyle = "rgba(0, 255, 255, 0.15)";
         ctx.lineWidth = 0.5;
         ctx.beginPath();
         particlesRef.current.forEach((p, i) => {
             if (i % 4 === 0 && p.targetX) ctx.moveTo(p.x, p.y);
             if (i % 4 === 0 && particlesRef.current[i+1]?.targetX) ctx.lineTo(particlesRef.current[i+1].x, particlesRef.current[i+1].y);
         });
         ctx.stroke();
      }

      particlesRef.current.forEach((p) => {
        // --- PHYSICS ---
        if (curPhase === "collecting" || curPhase === "idle") {
            p.x += p.vx;
            p.y += p.vy;
            p.size *= 0.96; 
            p.alpha -= 0.01;
        } 
        else if (curPhase === "crystallizing" || curPhase === "artifact") {
            if (p.targetX !== undefined && p.targetY !== undefined) {
                // Easing
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                let ease = 0.05;
                
                // Physics tweaks per archetype
                if (curArchetype === "MERCURY") ease = 0.1;
                if (curArchetype === "MAGMA") ease = 0.02;
                if (curArchetype === "GLITCH") ease = 0.2;

                p.x += dx * ease;
                p.y += dy * ease;

                // --- ARTIFACT ANIMATION ---
                if (curPhase === "artifact") {
                    // STARDUST: Sparkle
                    if (curArchetype === "STARDUST") {
                        p.alpha = 0.5 + Math.sin(time * 5 + p.wobble) * 0.5;
                    }
                    // MERCURY: Flow
                    else if (curArchetype === "MERCURY") {
                        p.x += Math.sin(time + p.angle) * 0.5;
                        p.y += Math.cos(time + p.angle) * 0.5;
                    }
                    // MAGMA: Rise
                    else if (curArchetype === "MAGMA") {
                        p.y -= 0.5; 
                        if (p.y < p.targetY! - 20) p.y = p.targetY! + 10;
                        p.alpha = Math.random();
                    }
                    // GLITCH: Teleport
                    else if (curArchetype === "GLITCH") {
                        if (Math.random() > 0.98) {
                            p.x = p.targetX! + (Math.random()-0.5)*50;
                        }
                    }
                    // VOID: Breathing
                    else if (curArchetype === "VOID") {
                        const beat = Math.sin(time);
                        p.x += (p.x - window.innerWidth/2) * 0.001 * beat;
                        p.y += (p.y - window.innerHeight/2) * 0.001 * beat;
                    }
                }
            }
        }

        // --- DRAW ---
        if (p.size > 0.1 && p.alpha > 0.01) {
            
            if (curArchetype === "GLITCH") {
                // Square particles for glitch
                ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
                ctx.fillRect(p.x, p.y, p.size * 2, p.size * 2);
            } else {
                // Soft Glow Circles
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                
                // Gradient for "Softness"
                // Using simple fill for perf, but alpha handles the glow
                ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
                
                // Add Glow to specific types
                if (curArchetype === "NEON" || curArchetype === "MAGMA") {
                    ctx.shadowBlur = p.size * 2;
                    ctx.shadowColor = `rgba(${p.color}, 0.5)`;
                } else {
                    ctx.shadowBlur = 0;
                }
                
                ctx.fill();
            }
        }
      });

      // Spawn new particles continuously in collection to avoid gaps
      if (curPhase === "collecting" && particlesRef.current.length < 500) {
         // keep buffer full
      }

      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // --- INPUT LOGIC ---
  const handleInput = (x: number, y: number) => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "collecting") return;

    if (phaseRef.current === "idle") {
        phaseRef.current = "collecting";
        setPhase("collecting");
        metricsRef.current.lastX = x;
        metricsRef.current.lastY = y;
    }

    const dx = x - metricsRef.current.lastX;
    const dy = y - metricsRef.current.lastY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 2) return;

    metricsRef.current.speeds.push(dist);
    metricsRef.current.angles.push(Math.atan2(dy, dx));
    
    if (x < metricsRef.current.minX) metricsRef.current.minX = x;
    if (x > metricsRef.current.maxX) metricsRef.current.maxX = x;
    if (y < metricsRef.current.minY) metricsRef.current.minY = y;
    if (y > metricsRef.current.maxY) metricsRef.current.maxY = y;

    metricsRef.current.totalDist += dist;
    metricsRef.current.lastX = x;
    metricsRef.current.lastY = y;

    // SPAWN TRAIL PARTICLES (Small & Many)
    for(let i=0; i<3; i++) {
        const p = new Particle(x + (Math.random()-0.5)*20, y + (Math.random()-0.5)*20);
        // Size depends on speed, but kept small
        p.size = Math.random() * 3; 
        p.alpha = 0.6;
        p.color = "150, 150, 255"; // Initial Trail Color (Blueish)
        particlesRef.current.push(p);
    }

    const pct = Math.min(100, (metricsRef.current.totalDist / CONFIG.COLLECTION_THRESHOLD) * 100);
    setProgress(pct);

    if (pct >= 100) completeCollection();
  };

  const completeCollection = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    const { speeds, angles, minX, maxX, minY, maxY } = metricsRef.current;
    
    // ANALYSIS
    const avgSpeed = speeds.reduce((a,b) => a+b, 0) / speeds.length;
    
    let angleChanges = 0;
    for(let i=1; i<angles.length; i++) {
        let diff = Math.abs(angles[i] - angles[i-1]);
        if (diff > 3) diff = 0; 
        angleChanges += diff;
    }
    const chaos = angleChanges / angles.length;
    const areaCov = ((maxX - minX) * (maxY - minY)) / (window.innerWidth * window.innerHeight);

    // LOGIC TREE (Updated for variety)
    let type: Archetype = "STARDUST"; // Default beautiful one

    if (areaCov < 0.15 && chaos < 0.2) type = "VOID";       // Tiny, careful movements
    else if (avgSpeed > 30) type = "MAGMA";                 // Aggressive speed
    else if (chaos > 0.8) type = "GLITCH";                  // Crazy shaking
    else if (areaCov > 0.4 && chaos < 0.4) type = "MERCURY"; // Big smooth loops
    else if (chaos > 0.5) type = "NEON";                    // Fast sharp turns
    else type = "STARDUST";                                 // Balance

    setArchetype(type);
    archetypeRef.current = type;

    // REGENERATE PARTICLES
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w, h) / 35;
    
    let targetCount = CONFIG.PARTICLE_COUNT;
    if (type === "STARDUST") targetCount = 2000; // More for stardust
    if (type === "VOID") targetCount = 600;      // Less for void

    particlesRef.current = []; // Clear
    
    for(let i=0; i<targetCount; i++) {
        // Spiral spawn
        const p = new Particle(w/2, h/2);
        
        // Distribute along heart
        const t = (Math.PI * 2 * i) / targetCount;
        let modT = t;
        
        // VOID uses only parts of the heart
        if (type === "VOID" && Math.random() > 0.5) continue; 

        const pt = getHeartPoint(modT, scale, w, h);
        
        // Scatter Amount (How tight is the heart)
        let scatter = 10;
        if (type === "MAGMA") scatter = 30;
        if (type === "STARDUST") scatter = 60; // Cloud
        if (type === "VOID") scatter = 80;     // Mist

        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;

        // COLORS (RGB Strings for reuse)
        p.size = Math.random() * 2 + 0.5; // SMALLER PARTICLES
        p.alpha = Math.random();

        if (type === "STARDUST") {
            p.color = "200, 220, 255"; // Ice Blue
            p.size = Math.random() * 1.5;
        }
        else if (type === "MERCURY") {
            p.color = i%2===0 ? "255, 255, 255" : "180, 180, 180"; // Silver
            p.size = Math.random() * 3 + 1;
            p.alpha = 1;
        }
        else if (type === "MAGMA") {
            p.color = Math.random() > 0.7 ? "255, 200, 50" : "255, 50, 0"; // Orange/Red
            p.size = Math.random() * 4 + 1;
        }
        else if (type === "NEON") {
            p.color = "0, 255, 255"; // Cyan
            p.size = 1.5;
        }
        else if (type === "GLITCH") {
            p.color = Math.random() > 0.5 ? "0, 255, 0" : "255, 0, 255"; // Matrix
            p.size = Math.random() * 3;
        }
        else if (type === "VOID") {
            p.color = "100, 100, 120"; // Grey
            p.size = Math.random() * 2;
            p.alpha = 0.4;
        }

        particlesRef.current.push(p);
    }

    setTimeout(() => {
        phaseRef.current = "artifact";
        setPhase("artifact");
    }, 800);
  };

  const cursorClass = (phase === "crystallizing" || phase === "artifact") ? "cursor-none" : "cursor-crosshair";

  return (
    <div 
        className={`fixed inset-0 bg-black overflow-hidden touch-none select-none ${cursorClass}`}
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* NOISE GRAIN OVERLAY - THE "FILM" LOOK */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      {/* UI LAYER - High Contrast & Drop Shadow */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center font-sans z-20">
        
        {(phase === "idle" || phase === "collecting") && (
          <div className="text-center">
             <h1 className="text-white text-[10px] md:text-xs tracking-[0.4em] uppercase animate-pulse drop-shadow-md">
                Imprint Your Chaos
             </h1>
          </div>
        )}

        {phase === "artifact" && archetype && (
             <div className="absolute bottom-12 text-center animate-in fade-in zoom-in duration-1000 pointer-events-auto">
                <div className="text-white/40 text-[9px] font-mono mb-2 uppercase tracking-widest drop-shadow-sm">
                    Signature: {Math.random().toString(36).substring(7).toUpperCase()}
                </div>
                <div className="text-3xl md:text-4xl font-extralight text-white mb-6 tracking-[0.3em] uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                    {archetype}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 border border-white/20 bg-black/40 backdrop-blur-md text-white/70 text-[10px] uppercase tracking-[0.25em] hover:bg-white hover:text-black hover:border-white transition-all duration-500 shadow-lg"
                >
                    Restart Ritual
                </button>
             </div>
        )}
      </div>

      {phase === "collecting" && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-white transition-all duration-100 ease-linear shadow-[0_0_10px_white]"
             style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}