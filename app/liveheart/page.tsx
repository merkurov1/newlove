"use client";

import React, { useEffect, useRef, useState } from "react";

// --- TYPES & CONFIG ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";
type Archetype = "VOID" | "MERCURY" | "WEB" | "NOVA" | "GLITCH";

const CONFIG = {
  COLLECTION_THRESHOLD: 3500, // Increased: Requires more movement (~6-8s)
  PARTICLE_COUNT: 900,
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number; // Remember original size for pulsing
  color: string;
  
  // Artifact properties
  targetX?: number;
  targetY?: number;
  angle: number;
  speed: number;
  wobble: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = Math.random() * 2 + 0.5;
    this.baseSize = this.size;
    this.color = "rgba(255, 255, 255, 0.8)";
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.01 + Math.random() * 0.02;
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
    minX: 9999, maxX: 0, minY: 9999, maxY: 0 // For bounding box (Amplitude)
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const archetypeRef = useRef<Archetype | null>(null);

  // --- HEART FORMULA ---
  const getHeartPoint = (t: number, scale: number, w: number, h: number) => {
    // Basic Heart
    let x = 16 * Math.pow(Math.sin(t), 3);
    let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
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
      time += 0.015;
      const curArchetype = archetypeRef.current;
      
      // CLEAR CANVAS & BLENDING MODES
      // NOVA/GLITCH get trails. VOID gets clean clear.
      if (curArchetype === "NOVA" || curArchetype === "GLITCH") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.globalCompositeOperation = "lighter"; // Glow effect
      } else if (curArchetype === "WEB") {
         ctx.globalCompositeOperation = "source-over";
         ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
         ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }

      // RENDER PARTICLES
      const curPhase = phaseRef.current;

      // WEB CONNECTIONS (Draw lines before particles)
      if (curPhase === "artifact" && curArchetype === "WEB") {
        ctx.strokeStyle = "rgba(0, 255, 255, 0.1)";
        ctx.lineWidth = 0.5;
        // Optimization: only connect every Nth particle to close neighbors
        const limit = particlesRef.current.length;
        for (let i = 0; i < limit; i+=2) {
            const p1 = particlesRef.current[i];
            if (p1.size < 0.1) continue;
            // Connect to nearby randoms
            for (let j = i + 1; j < Math.min(i + 15, limit); j++) {
                const p2 = particlesRef.current[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                if (dx*dx + dy*dy < 1500) { 
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
      }

      particlesRef.current.forEach((p) => {
        // --- PHYSICS ENGINE ---
        if (curPhase === "collecting" || curPhase === "idle") {
            p.x += p.vx;
            p.y += p.vy;
            p.size *= 0.94; // Fast fade for trails
        } 
        else if (curPhase === "crystallizing" || curPhase === "artifact") {
            if (p.targetX !== undefined && p.targetY !== undefined) {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                
                // Tightness of the heart shape
                let ease = 0.05;
                if (curArchetype === "MERCURY") ease = 0.15;
                if (curArchetype === "WEB") ease = 0.03;
                if (curArchetype === "GLITCH") ease = 0.2;

                p.x += dx * ease;
                p.y += dy * ease;

                // --- ARTIFACT BEHAVIOR ---
                if (curPhase === "artifact") {
                    // VOID: Ghostly drift, size pulse
                    if (curArchetype === "VOID") {
                        p.x += Math.sin(time + p.angle) * 0.3;
                        p.y += Math.cos(time + p.angle) * 0.3;
                        p.size = p.baseSize + Math.sin(time * 2 + p.wobble) * 0.5;
                    }
                    // MERCURY: Liquid surface, breathing
                    else if (curArchetype === "MERCURY") {
                        const beat = Math.pow(Math.sin(time * 2), 4); // Soft heavy beat
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        const dirX = p.x - cx;
                        const dirY = p.y - cy;
                        p.x += dirX * 0.002 * beat;
                        p.y += dirY * 0.002 * beat;
                    }
                    // NOVA: Chaotic vibration + Orbit
                    else if (curArchetype === "NOVA") {
                        p.x += (Math.random() - 0.5) * 4;
                        p.y += (Math.random() - 0.5) * 4;
                    }
                    // GLITCH: Digital noise
                    else if (curArchetype === "GLITCH") {
                        if (Math.random() > 0.95) {
                            p.x += (Math.random() - 0.5) * 20;
                        }
                    }
                }
            }
        }

        // --- DRAW ---
        if (p.size > 0.1) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
      });

      // Cleanup
      if (curPhase === "collecting") {
        particlesRef.current = particlesRef.current.filter(p => p.size > 0.1);
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
    
    // Ignore idle
    if (dist < 2) return;

    // Metrics
    metricsRef.current.speeds.push(dist);
    metricsRef.current.angles.push(Math.atan2(dy, dx));
    
    // Bounding box for Amplitude
    if (x < metricsRef.current.minX) metricsRef.current.minX = x;
    if (x > metricsRef.current.maxX) metricsRef.current.maxX = x;
    if (y < metricsRef.current.minY) metricsRef.current.minY = y;
    if (y > metricsRef.current.maxY) metricsRef.current.maxY = y;

    metricsRef.current.totalDist += dist;
    metricsRef.current.lastX = x;
    metricsRef.current.lastY = y;

    // Visual Trail (Size depends on speed!)
    const pCount = 2; 
    for(let i=0; i<pCount; i++) {
        const p = new Particle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10);
        // Faster movement = Bigger particles (Shards)
        p.size = Math.min(15, (dist / 3)) * Math.random(); 
        if (p.size < 1) p.size = 1;
        
        particlesRef.current.push(p);
    }

    const pct = Math.min(100, (metricsRef.current.totalDist / CONFIG.COLLECTION_THRESHOLD) * 100);
    setProgress(pct);

    if (pct >= 100) completeCollection();
  };

  const completeCollection = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    // --- DECISION ENGINE ---
    const { speeds, angles, minX, maxX, minY, maxY } = metricsRef.current;
    
    // 1. Avg Speed
    const avgSpeed = speeds.reduce((a,b) => a+b, 0) / speeds.length;
    
    // 2. Chaos (Angle variance)
    let angleChanges = 0;
    for(let i=1; i<angles.length; i++) {
        let diff = Math.abs(angles[i] - angles[i-1]);
        if (diff > 3) diff = 0; // Filter huge jumps
        angleChanges += diff;
    }
    const chaos = angleChanges / angles.length; // 0.1 (smooth) to 1.0+ (crazy)

    // 3. Amplitude (Screen coverage)
    const widthCov = maxX - minX;
    const heightCov = maxY - minY;
    const areaCov = (widthCov * heightCov) / (window.innerWidth * window.innerHeight); // 0.0 to 1.0

    // LOGIC TREE
    let type: Archetype = "VOID";
    
    // Default to VOID (Zen)
    if (areaCov < 0.1 && avgSpeed < 10) type = "VOID";
    // Large smooth movements -> MERCURY
    else if (areaCov > 0.3 && chaos < 0.4) type = "MERCURY";
    // Small erratic movements -> WEB
    else if (areaCov < 0.2 && chaos > 0.5) type = "WEB";
    // Fast large movements -> NOVA
    else if (avgSpeed > 20) type = "NOVA";
    // Extreme chaos -> GLITCH
    else if (chaos > 0.8) type = "GLITCH";
    // Fallback based on speed
    else type = avgSpeed > 15 ? "NOVA" : "MERCURY";

    setArchetype(type);
    archetypeRef.current = type;

    // --- REGENERATE FOR ARTIFACT ---
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w, h) / 35; // Standard scale
    
    let targetCount = CONFIG.PARTICLE_COUNT;
    if (type === "WEB") targetCount = 300; // Less for web
    if (type === "NOVA") targetCount = 1200; // More for explosion

    particlesRef.current = [];
    
    for(let i=0; i<targetCount; i++) {
        // Start pos: Center implosion or Random
        const startX = type === "NOVA" ? w/2 : (Math.random()*w);
        const startY = type === "NOVA" ? h/2 : (Math.random()*h);
        
        const p = new Particle(startX, startY);
        
        // Target on Heart
        const t = (Math.PI * 2 * i) / targetCount;
        let modT = t;
        
        // Glitch distorts shape
        if (type === "GLITCH" && Math.random() > 0.8) modT += Math.random(); 

        const pt = getHeartPoint(modT, scale, w, h);
        
        // Scatter targets
        let scatter = 0;
        if (type === "VOID") scatter = 15;
        if (type === "NOVA") scatter = 50;
        if (type === "GLITCH") scatter = 100;

        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;

        // SIZE & COLOR LOGIC
        p.baseSize = Math.random() * 2;
        
        if (type === "VOID") {
            // Tiny dust
            p.color = "rgba(150, 150, 200, 0.5)";
            p.baseSize = Math.random() * 1.5;
        }
        else if (type === "MERCURY") {
            // Large metallic blobs
            p.color = i % 2 === 0 ? "#FFFFFF" : "#AAAAAA";
            p.baseSize = Math.random() * 6 + 2; 
        }
        else if (type === "WEB") {
            // Cyan Nodes
            p.color = "#00FFFF";
            p.baseSize = 2;
        }
        else if (type === "NOVA") {
            // Fire
            p.color = Math.random() > 0.5 ? "#FF4400" : "#FFCC00";
            p.baseSize = Math.random() * 4 + 1;
        }
        else if (type === "GLITCH") {
            // Green/Pink
            p.color = Math.random() > 0.5 ? "#00FF00" : "#FF00FF";
            p.baseSize = Math.random() * 3;
        }
        
        // Apply calculated size from movement speed to some particles
        if (Math.random() > 0.7) p.baseSize *= (avgSpeed / 10);

        p.size = 0.1; // Start invisible, grow in
        particlesRef.current.push(p);
    }

    // Delay to let old trails fade, then grow new heart
    setTimeout(() => {
        phaseRef.current = "artifact";
        setPhase("artifact");
        particlesRef.current.forEach(p => p.size = p.baseSize);
    }, 1000);
  };

  const cursorClass = (phase === "crystallizing" || phase === "artifact") ? "cursor-none" : "cursor-crosshair";

  return (
    <div 
        className={`fixed inset-0 bg-black overflow-hidden touch-none select-none ${cursorClass}`}
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* UI */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center font-sans z-10 mix-blend-difference">
        
        {(phase === "idle" || phase === "collecting") && (
          <div className="text-center opacity-70">
             <h1 className="text-white text-[10px] md:text-xs tracking-[0.4em] uppercase animate-pulse">
                Draw Your Chaos
             </h1>
          </div>
        )}

        {phase === "artifact" && archetype && (
             <div className="absolute bottom-12 text-center animate-in fade-in zoom-in duration-1000 pointer-events-auto">
                <div className="text-white/50 text-[10px] font-mono mb-3 uppercase tracking-widest">
                    Signature Detected
                </div>
                <div className="text-4xl md:text-5xl font-extralight text-white mb-8 tracking-[0.2em] uppercase blur-[0.5px]">
                    {archetype}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 border border-white/20 bg-black/20 text-white/80 text-[10px] uppercase tracking-[0.25em] hover:bg-white hover:text-black transition-all duration-500"
                >
                    Reset Ritual
                </button>
             </div>
        )}
      </div>

      {phase === "collecting" && (
        <div className="absolute bottom-0 left-0 h-[3px] bg-white mix-blend-overlay transition-all duration-100 ease-linear"
             style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}