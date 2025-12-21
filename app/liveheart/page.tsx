"use client";

import React, { useEffect, useRef, useState } from "react";

// --- TYPES & CONFIG ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";
type Archetype = "VOID" | "MERCURY" | "WEB" | "NOVA";

const CONFIG = {
  COLLECTION_THRESHOLD: 1000, // Reduced for faster generation (approx 3-4s)
  PARTICLE_COUNT: 800,        // Base count
  WEB_PARTICLE_COUNT: 300,    // Lower for Web to save FPS on line calculations
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseColor: string;
  color: string;
  
  // Artifact properties
  targetX?: number;
  targetY?: number;
  angle: number; // for orbital motion
  speed: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = Math.random() * 2 + 1;
    this.baseColor = "rgba(255, 255, 255, 0.8)";
    this.color = this.baseColor;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.02 + Math.random() * 0.03;
  }
}

export default function LiveHeartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // State Refs (Mutable for performance)
  const particlesRef = useRef<Particle[]>([]);
  const metricsRef = useRef({ 
    speeds: [] as number[], 
    angles: [] as number[],
    totalDist: 0,
    lastX: 0,
    lastY: 0
  });

  // UI State
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const archetypeRef = useRef<Archetype | null>(null);

  // --- HEART GENERATOR ---
  const getHeartPoint = (t: number, scale: number, w: number, h: number) => {
    // Parametric Heart Formula
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return {
      x: w / 2 + x * scale,
      y: h / 2 - y * scale
    };
  };

  // --- CORE LOOP ---
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
      time += 0.01;
      
      // 1. Clear Canvas
      // "Nova" gets a trails effect, others get clean clear
      if (archetypeRef.current === "NOVA") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Trails
      } else {
        ctx.fillStyle = "rgba(0, 0, 0, 1)"; // Clean
      }
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // 2. Render Particles
      const currentPhase = phaseRef.current;
      const currentArchetype = archetypeRef.current;

      // OPTIMIZATION: Connect lines only for WEB archetype
      if (currentPhase === "artifact" && currentArchetype === "WEB") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 0.5;
        // Simple neighbor check (expensive, so we use fewer particles for WEB)
        for (let i = 0; i < particlesRef.current.length; i++) {
            const p1 = particlesRef.current[i];
            // Connect to random neighbors to save perf
            for (let j = i + 1; j < particlesRef.current.length; j += 5) {
                const p2 = particlesRef.current[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                if (dx*dx + dy*dy < 2000) { // Distance < ~45px
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
      }

      particlesRef.current.forEach((p) => {
        // --- PHYSICS ---
        
        if (currentPhase === "collecting" || currentPhase === "idle") {
            // Float physics
            p.x += p.vx;
            p.y += p.vy;
            p.size *= 0.95; // Shrink trails
        } 
        else if (currentPhase === "crystallizing" || currentPhase === "artifact") {
            if (p.targetX !== undefined && p.targetY !== undefined) {
                // Easing to target
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                
                // Stiffness depends on Archetype
                let ease = 0.05;
                if (currentArchetype === "MERCURY") ease = 0.1; // Snappy
                if (currentArchetype === "VOID") ease = 0.02;    // Slow/Ghostly

                p.x += dx * ease;
                p.y += dy * ease;

                // --- ARTIFACT ANIMATION ---
                if (currentPhase === "artifact") {
                    // VOID: Drifting smoke
                    if (currentArchetype === "VOID") {
                        p.x += Math.sin(time + p.angle) * 0.5;
                        p.y += Math.cos(time + p.angle) * 0.5;
                    }
                    // MERCURY: Tight liquid pulse
                    else if (currentArchetype === "MERCURY") {
                        // Heartbeat
                        const beat = Math.pow(Math.sin(time * 3), 63) * 15; // Sharp beat
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        const dirX = p.x - cx;
                        const dirY = p.y - cy;
                        // Normalize and apply
                        const len = Math.sqrt(dirX*dirX + dirY*dirY);
                        p.x += (dirX/len) * beat * 0.05;
                        p.y += (dirY/len) * beat * 0.05;
                    }
                    // NOVA: Explosion vibration
                    else if (currentArchetype === "NOVA") {
                        p.x += (Math.random() - 0.5) * 3;
                        p.y += (Math.random() - 0.5) * 3;
                    }
                    // WEB: Vibration
                    else if (currentArchetype === "WEB") {
                         p.x += Math.sin(time * 5 + p.angle) * 0.2;
                    }
                }
            }
        }

        // --- DRAW PARTICLE ---
        if (p.size > 0.1) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            
            // Glow for Nova
            if (currentArchetype === "NOVA") {
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.fill();
        }
      });

      // Cleanup invisible particles during collection
      if (currentPhase === "collecting") {
        particlesRef.current = particlesRef.current.filter(p => p.size > 0.2);
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

    // 1. Calculate Metrics
    const dx = x - metricsRef.current.lastX;
    const dy = y - metricsRef.current.lastY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Ignore micro-movements
    if (dist < 2) return;

    // Record Speed
    metricsRef.current.speeds.push(dist);
    // Record Angle (Chaos)
    const angle = Math.atan2(dy, dx);
    metricsRef.current.angles.push(angle);
    
    metricsRef.current.totalDist += dist;
    metricsRef.current.lastX = x;
    metricsRef.current.lastY = y;

    // 2. Spawn Trail
    for(let i=0; i<2; i++) {
        const p = new Particle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10);
        particlesRef.current.push(p);
    }

    // 3. Progress
    const pct = Math.min(100, (metricsRef.current.totalDist / CONFIG.COLLECTION_THRESHOLD) * 100);
    setProgress(pct);

    if (pct >= 100) completeCollection();
  };

  const completeCollection = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    // --- ANALYZE METRICS ---
    const speeds = metricsRef.current.speeds;
    const angles = metricsRef.current.angles;
    
    // Avg Speed
    const avgSpeed = speeds.reduce((a,b) => a+b, 0) / speeds.length;
    
    // Chaos (Jerkiness) - sum of angle changes
    let totalAngleChange = 0;
    for(let i=1; i<angles.length; i++) {
        let diff = Math.abs(angles[i] - angles[i-1]);
        if (diff > Math.PI) diff = Math.PI * 2 - diff; // Normalize wrap-around
        totalAngleChange += diff;
    }
    const avgChaos = totalAngleChange / angles.length;

    // --- DETERMINE ARCHETYPE ---
    // Thresholds: Speed ~ 5-20, Chaos ~ 0.1 - 1.0
    let type: Archetype = "VOID";
    
    const isFast = avgSpeed > 15;
    const isChaotic = avgChaos > 0.5;

    if (!isFast && !isChaotic) type = "VOID";
    if (isFast && !isChaotic) type = "MERCURY";
    if (!isFast && isChaotic) type = "WEB";
    if (isFast && isChaotic) type = "NOVA";

    setArchetype(type);
    archetypeRef.current = type;

    // --- GENERATE HEART TARGETS ---
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w, h) / 35;
    
    // Adjust particle count for optimization
    const targetCount = type === "WEB" ? CONFIG.WEB_PARTICLE_COUNT : CONFIG.PARTICLE_COUNT;
    
    // Resample particles
    particlesRef.current = []; // Clear trails
    for(let i=0; i<targetCount; i++) {
        // Spawn from random positions (implosion effect)
        const p = new Particle(
            (Math.random() - 0.5) * w * 1.5 + w/2, 
            (Math.random() - 0.5) * h * 1.5 + h/2
        );
        
        // Calculate Target on Heart
        // Add random "t" to distribute points around the heart
        // Some archetypes (VOID) use partial heart
        const t = (Math.PI * 2 * i) / targetCount;
        
        // Modifiers per Archetype
        let modT = t;
        if (type === "VOID") modT += (Math.random() - 0.5) * 0.5; // Messy
        
        const pt = getHeartPoint(modT, scale, w, h);
        
        // Scatter targets based on archetype
        let scatter = 0;
        if (type === "VOID") scatter = 20;
        if (type === "NOVA") scatter = 40;
        
        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;

        // Colors
        if (type === "VOID") {
            p.color = "rgba(200, 200, 255, 0.4)";
            p.size = Math.random() * 1.5;
        }
        if (type === "MERCURY") {
            p.color = i % 2 === 0 ? "#FFFFFF" : "#A0A0A0";
            p.size = Math.random() * 3 + 1;
        }
        if (type === "WEB") {
            p.color = "#00FFFF";
            p.size = 2;
        }
        if (type === "NOVA") {
            p.color = Math.random() > 0.5 ? "#FF0040" : "#FFFFFF";
            p.size = Math.random() * 4 + 1;
        }

        particlesRef.current.push(p);
    }

    // Transition to Artifact
    setTimeout(() => {
        phaseRef.current = "artifact";
        setPhase("artifact");
    }, 1500); // 1.5s Crystallization time
  };

  // --- RENDER ---
  // Cursor Logic: Hide cursor when finished
  const cursorClass = (phase === "crystallizing" || phase === "artifact") ? "cursor-none" : "cursor-crosshair";

  return (
    <div 
        className={`fixed inset-0 bg-black overflow-hidden touch-none select-none ${cursorClass}`}
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* TEXT LAYER */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center font-sans z-10">
        
        {/* INSTRUCTIONS */}
        {(phase === "idle" || phase === "collecting") && (
          <div className="text-center transition-opacity duration-500">
             <h1 className="text-white/80 text-xs tracking-[0.3em] uppercase animate-pulse">
                Imprint Your State
             </h1>
          </div>
        )}

        {/* REVEAL */}
        {phase === "artifact" && archetype && (
             <div className="absolute bottom-12 text-center animate-in fade-in duration-1000 slide-in-from-bottom-4 pointer-events-auto">
                <div className="text-white/40 text-[10px] font-mono mb-2 uppercase tracking-widest">
                    Archetype Detected
                </div>
                <div className="text-3xl font-light text-white mb-8 tracking-widest uppercase">
                    {archetype}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 border border-white/10 bg-white/5 text-white/60 text-xs uppercase tracking-[0.2em] hover:bg-white hover:text-black hover:border-white transition-all duration-300 backdrop-blur-sm cursor-pointer"
                >
                    Reset
                </button>
             </div>
        )}
      </div>

      {/* PROGRESS LINE */}
      {phase === "collecting" && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-white transition-all duration-75 ease-linear"
             style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}