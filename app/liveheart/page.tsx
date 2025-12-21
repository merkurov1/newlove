"use client";

import React, { useEffect, useRef, useState } from "react";

// --- TYPES & DNA ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";

// The DNA of the generated heart
type HeartDNA = {
  paletteName: string;
  colors: string[];
  structure: "CONTOUR" | "CLOUD" | "GRID" | "ORBIT" | "RAIN";
  physics: "PULSE" | "FLOW" | "VIBRATE" | "STILL";
  scaleMode: "MICRO" | "NORMAL" | "MACRO" | "TITAN";
  particleCount: number;
  particleShape: "CIRCLE" | "SQUARE" | "SHARD";
  chaosLevel: number;
};

const CONFIG = {
  COLLECTION_THRESHOLD: 4500, // Longer ritual (~7s)
};

// --- PARTICLE CLASS ---
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  color: string;
  alpha: number;
  
  // Artifact props
  targetX?: number;
  targetY?: number;
  t: number; // position on curve (0 to 2PI)
  offset: number; // distance from line
  speed: number;
  
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.size = 0;
    this.baseSize = Math.random() * 2 + 1;
    this.color = "255, 255, 255";
    this.alpha = 1;
    this.t = Math.random() * Math.PI * 2;
    this.offset = (Math.random() - 0.5) * 20;
    this.speed = 0.002 + Math.random() * 0.005;
  }
}

export default function LiveHeartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  
  // Metrics for generation
  const metricsRef = useRef({ 
    totalDist: 0,
    lastX: 0, lastY: 0,
    minX: 9999, maxX: 0, minY: 9999, maxY: 0,
    stops: 0 // How many times user stopped (hesitation)
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [dna, setDna] = useState<HeartDNA | null>(null);
  const dnaRef = useRef<HeartDNA | null>(null);

  // --- HEART MATH ---
  const getHeartPos = (t: number, scale: number, w: number, h: number) => {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: w / 2 + x * scale, y: h / 2 - y * scale };
  };

  // --- RENDER LOOP ---
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
    };
    window.addEventListener("resize", resize);
    resize();

    const render = () => {
      time += 0.01;
      const curPhase = phaseRef.current;
      const curDNA = dnaRef.current;

      // 1. CLEAN / TRAILS
      if (curPhase === "artifact" && (curDNA?.physics === "FLOW" || curDNA?.structure === "ORBIT")) {
         ctx.globalCompositeOperation = "source-over";
         ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; // Trails
         ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      } else {
         ctx.globalCompositeOperation = "source-over";
         ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }

      // 2. SET BLENDING (NO MUD)
      ctx.globalCompositeOperation = "screen"; 

      // 3. RENDER PARTICLES
      
      // GRID LINES LOGIC
      if (curPhase === "artifact" && curDNA?.structure === "GRID") {
          ctx.strokeStyle = `rgba(${curDNA.colors[0]}, 0.1)`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          // Draw random connections
          for (let i = 0; i < particlesRef.current.length; i+=10) {
             const p = particlesRef.current[i];
             const p2 = particlesRef.current[(i+5) % particlesRef.current.length];
             if (p.targetX && p2.targetX) {
                 ctx.moveTo(p.x, p.y);
                 ctx.lineTo(p2.x, p2.y);
             }
          }
          ctx.stroke();
      }

      particlesRef.current.forEach((p) => {
        // --- PHYSICS ---
        if (curPhase === "collecting" || curPhase === "idle") {
            p.x += p.vx;
            p.y += p.vy;
            p.size *= 0.95; 
            p.alpha -= 0.02;
        } 
        else if (curPhase === "crystallizing" || curPhase === "artifact") {
            if (curDNA && p.targetX !== undefined && p.targetY !== undefined) {
                
                // Target Easing
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                let ease = 0.05;
                if (curDNA.physics === "VIBRATE") ease = 0.2;
                if (curDNA.physics === "FLOW") ease = 0.02;
                
                p.x += dx * ease;
                p.y += dy * ease;

                // --- ARTIFACT ANIMATION ---
                if (curPhase === "artifact") {
                    // PULSE
                    if (curDNA.physics === "PULSE") {
                        const beat = Math.pow(Math.sin(time * 3), 4) * 15;
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        // Push out from center
                        p.x += ((p.x - cx) / 100) * beat * 0.05;
                        p.y += ((p.y - cy) / 100) * beat * 0.05;
                    }
                    // FLOW (Particles move along the heart line)
                    else if (curDNA.physics === "FLOW") {
                        p.t += p.speed; // Move along 'time' of curve
                        const w = window.innerWidth;
                        const h = window.innerHeight;
                        // Recalculate target based on new T
                        let scale = Math.min(w, h) / 35;
                        if (curDNA.scaleMode === "MICRO") scale /= 3;
                        if (curDNA.scaleMode === "TITAN") scale *= 2.5;

                        const newPt = getHeartPos(p.t, scale, w, h);
                        // Add offset noise
                        p.targetX = newPt.x + (Math.cos(time * 5) * p.offset);
                        p.targetY = newPt.y + (Math.sin(time * 5) * p.offset);
                    }
                    // VIBRATE
                    else if (curDNA.physics === "VIBRATE") {
                        p.x += (Math.random() - 0.5) * 4;
                        p.y += (Math.random() - 0.5) * 4;
                    }
                    
                    // RAIN EFFECT
                    if (curDNA.structure === "RAIN") {
                        p.y += 2; // Fall
                        if (p.y > window.innerHeight) p.y = 0;
                        if (p.y > p.targetY! + 50) p.alpha = 0; // Fade if too far
                        else p.alpha = Math.random();
                    }
                }
            }
        }

        // --- DRAW ---
        if (p.size > 0.1 && p.alpha > 0.01) {
            ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
            
            if (curDNA?.particleShape === "SQUARE") {
                ctx.fillRect(p.x, p.y, p.size, p.size);
            } 
            else if (curDNA?.particleShape === "SHARD") {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - p.size);
                ctx.lineTo(p.x + p.size, p.y);
                ctx.lineTo(p.x, p.y + p.size);
                ctx.lineTo(p.x - p.size, p.y);
                ctx.fill();
            }
            else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.shadowBlur = p.size * 2; // Glow
                ctx.shadowColor = `rgba(${p.color}, 0.5)`;
                ctx.fill();
            }
        }
      });

      // Spawn trail during collection
      if (curPhase === "collecting" && particlesRef.current.length < 500) {
          // Keep buffer
      }

      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // --- INPUT HANDLER ---
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
    if (dist < 2) {
        metricsRef.current.stops++; // Track hesitation
        return;
    }

    // Record scaling bounds
    if (x < metricsRef.current.minX) metricsRef.current.minX = x;
    if (x > metricsRef.current.maxX) metricsRef.current.maxX = x;
    if (y < metricsRef.current.minY) metricsRef.current.minY = y;
    if (y > metricsRef.current.maxY) metricsRef.current.maxY = y;

    metricsRef.current.totalDist += dist;
    metricsRef.current.lastX = x;
    metricsRef.current.lastY = y;

    // SPAWN TRAIL
    const p = new Particle(x, y);
    p.size = Math.random() * 4; 
    p.color = "100, 100, 100";
    p.alpha = 0.5;
    particlesRef.current.push(p);

    const pct = Math.min(100, (metricsRef.current.totalDist / CONFIG.COLLECTION_THRESHOLD) * 100);
    setProgress(pct);

    if (pct >= 100) generateArtifact();
  };

  // --- THE GENERATOR ---
  const generateArtifact = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    const m = metricsRef.current;
    
    // 1. CALCULATE FACTORS
    // Coverage: 0.0 to 1.0 (How much screen used)
    const coverage = ((m.maxX - m.minX) * (m.maxY - m.minY)) / (window.innerWidth * window.innerHeight);
    // Hesitation: Did they stop often?
    const hesitation = m.stops > 50; 
    
    // 2. GENERATE DNA (PROCEDURAL MIX)
    
    // SCALE Logic
    let scale: HeartDNA['scaleMode'] = "NORMAL";
    if (coverage < 0.1) scale = "MICRO";
    else if (coverage > 0.6) scale = "TITAN";
    else if (Math.random() > 0.8) scale = "MACRO";

    // PALETTE Logic (Random + Weighted)
    const palettes = [
        { name: "ICE", colors: ["0, 255, 255", "255, 255, 255", "0, 100, 255"] },
        { name: "TOXIC", colors: ["0, 255, 0", "200, 255, 0", "50, 50, 50"] },
        { name: "ROYAL", colors: ["255, 215, 0", "148, 0, 211", "255, 255, 255"] },
        { name: "BLOOD", colors: ["255, 0, 0", "255, 50, 50", "100, 0, 0"] },
        { name: "VOID", colors: ["100, 100, 100", "50, 50, 50", "200, 200, 200"] },
        { name: "NEON", colors: ["255, 0, 255", "0, 255, 255", "255, 255, 0"] }
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];

    // STRUCTURE Logic
    let struct: HeartDNA['structure'] = "CLOUD";
    const randStruct = Math.random();
    if (randStruct < 0.2) struct = "CONTOUR";
    else if (randStruct < 0.4) struct = "GRID";
    else if (randStruct < 0.6) struct = "ORBIT";
    else if (randStruct < 0.8) struct = "RAIN";

    // PHYSICS Logic
    let phys: HeartDNA['physics'] = "PULSE";
    if (hesitation) phys = "STILL";
    else if (scale === "TITAN") phys = "VIBRATE";
    else if (struct === "CONTOUR") phys = "FLOW";

    // SHAPE Logic
    let shape: HeartDNA['particleShape'] = "CIRCLE";
    if (palette.name === "TOXIC" || palette.name === "VOID") shape = "SQUARE";
    if (struct === "GRID") shape = "SHARD";

    const newDNA: HeartDNA = {
        paletteName: palette.name,
        colors: palette.colors,
        structure: struct,
        physics: phys,
        scaleMode: scale,
        particleCount: scale === "TITAN" ? 2000 : 1200,
        particleShape: shape,
        chaosLevel: Math.random()
    };

    setDna(newDNA);
    dnaRef.current = newDNA;

    // 3. SPAWN PARTICLES BASED ON DNA
    repopulateParticles(newDNA);

    setTimeout(() => {
        phaseRef.current = "artifact";
        setPhase("artifact");
    }, 1000);
  };

  const repopulateParticles = (dna: HeartDNA) => {
    particlesRef.current = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Scale Value
    let sVal = Math.min(w, h) / 35;
    if (dna.scaleMode === "MICRO") sVal /= 4;
    if (dna.scaleMode === "MACRO") sVal *= 1.5;
    if (dna.scaleMode === "TITAN") sVal *= 3;

    for(let i=0; i<dna.particleCount; i++) {
        // Start from random
        const p = new Particle(w/2 + (Math.random()-0.5)*w, h/2 + (Math.random()-0.5)*h);
        
        // Assign Target
        const t = (Math.PI * 2 * i) / dna.particleCount;
        p.t = t; // save for flow
        
        const pt = getHeartPos(t, sVal, w, h);
        
        // Structure Scatter
        let scatter = 0;
        if (dna.structure === "CLOUD") scatter = 60;
        if (dna.structure === "ORBIT") scatter = 10;
        if (dna.structure === "RAIN") scatter = 100;

        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;
        
        // Colors
        const colStr = dna.colors[i % dna.colors.length];
        p.color = colStr;
        p.size = Math.random() * 3 + 0.5;
        if (dna.scaleMode === "MICRO") p.size = 1;

        particlesRef.current.push(p);
    }
  };

  const cursorClass = (phase === "crystallizing" || phase === "artifact") ? "cursor-none" : "cursor-crosshair";

  return (
    <div 
        className={`fixed inset-0 bg-black overflow-hidden touch-none select-none ${cursorClass}`}
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* NOISE OVERLAY */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      {/* UI */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-20">
        
        {(phase === "idle" || phase === "collecting") && (
          <div className="text-center opacity-80">
             <h1 className="text-white/90 text-[10px] md:text-xs tracking-[0.5em] uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                Imprint Your Chaos
             </h1>
          </div>
        )}

        {phase === "artifact" && dna && (
             <div className="absolute inset-0 flex flex-col items-center justify-center animate-in fade-in duration-1000">
                {/* CENTERED TEXT - ALWAYS VISIBLE */}
                <div className="relative z-50 text-center mix-blend-difference">
                    <div className="text-white text-[10px] font-mono mb-2 uppercase tracking-[0.3em]">
                        {dna.scaleMode} // {dna.structure}
                    </div>
                    <div className="text-4xl md:text-6xl font-light text-white mb-8 tracking-[0.2em] uppercase">
                        {dna.paletteName}
                    </div>
                    <button 
                        onClick={() => window.location.reload()}
                        className="pointer-events-auto px-6 py-2 border border-white/40 text-white/80 text-[9px] uppercase tracking-[0.3em] hover:bg-white hover:text-black transition-all"
                    >
                        Again
                    </button>
                </div>
             </div>
        )}
      </div>

      {phase === "collecting" && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-white shadow-[0_0_15px_white] transition-all duration-75 ease-linear"
             style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}