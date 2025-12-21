"use client";

import React, { useEffect, useRef, useState } from "react";

// --- DNA ARCHITECTURE ---
type Phase = "idle" | "collecting" | "crystallizing" | "artifact";

type HeartDNA = {
  name: string; // generated name like "NEON VORTEX"
  palette: string[];
  structure: "CONTOUR" | "CLOUD" | "GRID" | "ORBIT" | "RAIN" | "ATOM" | "SPIRAL" | "NOISE";
  physics: "PULSE" | "FLOW" | "VIBRATE" | "STILL" | "SPIN" | "IMPLODE";
  scaleMode: "MICRO" | "NORMAL" | "MACRO" | "TITAN";
  particleCount: number;
  particleSize: number;
  glitchFactor: number;
  rotationSpeed: number;
};

const CONFIG = {
  COLLECTION_THRESHOLD: 4000, 
};

// --- PARTICLE CLASS ---
class Particle {
  x: number;
  y: number;
  z: number; // For pseudo-3D
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  color: string; // HSL string
  alpha: number;
  
  // Artifact props
  targetX?: number;
  targetY?: number;
  targetZ?: number;
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
    this.baseSize = Math.random() * 2 + 0.5;
    this.color = "100, 100%, 100%";
    this.alpha = 1;
    this.t = Math.random() * Math.PI * 2;
    this.offset = (Math.random() - 0.5) * 30;
    this.speed = 0.002 + Math.random() * 0.01;
    this.sparkleOffset = Math.random() * 100;
  }
}

export default function LiveHeartPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  
  const metricsRef = useRef({ 
    totalDist: 0,
    lastX: 0, lastY: 0,
    stops: 0
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [dna, setDna] = useState<HeartDNA | null>(null);
  const dnaRef = useRef<HeartDNA | null>(null);

  // --- HEART MATH (Pseudo-3D) ---
  const getHeartPos = (t: number, scale: number, w: number, h: number, rotationY: number) => {
    // Base 2D Heart
    let x = 16 * Math.pow(Math.sin(t), 3);
    let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    
    // Apply Scale
    x *= scale;
    y *= -scale; // Flip Y for canvas

    // 3D Rotation simulation (around Y axis)
    const z = x * Math.sin(rotationY);
    x = x * Math.cos(rotationY);

    return { 
        x: w / 2 + x, 
        y: h / 2 + y,
        z: z 
    };
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
      time += 0.015;
      const curPhase = phaseRef.current;
      const curDNA = dnaRef.current;

      // 1. CLEAR & TRAIL EFFECTS
      if (curPhase === "artifact") {
         // Different trail lengths based on physics
         const alpha = curDNA?.physics === "SPIN" || curDNA?.structure === "SPIRAL" ? 0.2 : 0.1;
         ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
         ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      } else {
         ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }

      // 2. BLENDING FOR GLOW
      ctx.globalCompositeOperation = "lighter"; 

      // 3. DRAW PARTICLES
      
      // GRID CONNECTIONS
      if (curPhase === "artifact" && curDNA?.structure === "GRID") {
          ctx.strokeStyle = `hsla(${curDNA.palette[0]}, 0.1)`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          for (let i = 0; i < particlesRef.current.length; i+=12) {
             const p = particlesRef.current[i];
             const p2 = particlesRef.current[(i+4) % particlesRef.current.length];
             if (Math.abs(p.x - p2.x) < 100 && Math.abs(p.y - p2.y) < 100) {
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
            p.size *= 0.94; 
            p.alpha -= 0.02;
        } 
        else if (curPhase === "crystallizing" || curPhase === "artifact") {
            if (curDNA && p.targetX !== undefined && p.targetY !== undefined) {
                
                // Recalculate target if Spinning or Flowing
                if (curPhase === "artifact") {
                    if (curDNA.physics === "SPIN" || curDNA.structure === "ATOM") {
                        const w = window.innerWidth;
                        const h = window.innerHeight;
                        // Calculate Scale
                        let scale = Math.min(w, h) / 35;
                        if (curDNA.scaleMode === "MICRO") scale /= 3;
                        if (curDNA.scaleMode === "MACRO") scale *= 1.4;
                        if (curDNA.scaleMode === "TITAN") scale *= 1.8;

                        const rot = time * curDNA.rotationSpeed;
                        const pt = getHeartPos(p.t, scale, w, h, rot);
                        
                        // Atom orbit logic
                        if (curDNA.structure === "ATOM") {
                            const orbitR = 20 + Math.sin(time * 2 + p.t) * 20;
                            pt.x += Math.cos(time * 5 + p.offset) * orbitR;
                            pt.y += Math.sin(time * 5 + p.offset) * orbitR;
                        }

                        p.targetX = pt.x + (Math.cos(time + p.offset) * curDNA.glitchFactor);
                        p.targetY = pt.y + (Math.sin(time + p.offset) * curDNA.glitchFactor);
                    }
                    else if (curDNA.physics === "FLOW") {
                        p.t += p.speed;
                        const w = window.innerWidth;
                        const h = window.innerHeight;
                        let scale = Math.min(w, h) / 35;
                        if (curDNA.scaleMode === "MACRO") scale *= 1.4;
                        const pt = getHeartPos(p.t, scale, w, h, 0);
                        p.targetX = pt.x + (Math.random()-0.5) * curDNA.glitchFactor;
                        p.targetY = pt.y + (Math.random()-0.5) * curDNA.glitchFactor;
                    }
                    else if (curDNA.physics === "PULSE") {
                        const beat = Math.pow(Math.sin(time * 3), 4) * 20;
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        const dx = p.x - cx;
                        const dy = p.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        p.targetX! += (dx/dist) * beat * 0.01;
                        p.targetY! += (dy/dist) * beat * 0.01;
                    }
                }

                // Move to target
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                let ease = 0.05;
                if (curDNA.physics === "IMPLODE") ease = 0.01;
                
                p.x += dx * ease;
                p.y += dy * ease;

                // Sparkle Effect
                const sparkle = Math.sin(time * 10 + p.sparkleOffset);
                p.alpha = sparkle > 0.8 ? 1 : 0.6;
            }
        }

        // --- DRAW ---
        if (p.size > 0.1 && p.alpha > 0.01) {
            ctx.fillStyle = `hsla(${p.color}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            // Dynamic Glow based on Particle Size
            ctx.shadowBlur = p.size * 3;
            ctx.shadowColor = `hsla(${p.color}, 0.5)`;
            ctx.fill();
        }
      });

      // Spawn trail
      if (curPhase === "collecting" && particlesRef.current.length < 500) {
         // buffer
      }

      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // --- INPUT ---
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
    if (dist < 2) { metricsRef.current.stops++; return; }

    metricsRef.current.totalDist += dist;
    metricsRef.current.lastX = x;
    metricsRef.current.lastY = y;

    // Beautiful Trail
    const p = new Particle(window.innerWidth, window.innerHeight);
    p.x = x; p.y = y;
    p.size = Math.random() * 3 + 1;
    p.color = "200, 100%, 80%"; // Blueish
    p.alpha = 0.8;
    particlesRef.current.push(p);

    const pct = Math.min(100, (metricsRef.current.totalDist / CONFIG.COLLECTION_THRESHOLD) * 100);
    setProgress(pct);

    if (pct >= 100) generateArtifact();
  };

  // --- DNA GENERATOR (THE BRAIN) ---
  const generateArtifact = () => {
    phaseRef.current = "crystallizing";
    setPhase("crystallizing");

    // RANDOMIZER ENGINE
    const rand = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    const r = Math.random();

    // 1. PALETTES (HSL Strings)
    const palettes = [
        { name: "CYBERPUNK", colors: ["320, 100%, 50%", "190, 100%, 50%", "280, 100%, 60%"] },
        { name: "GOLDEN HOUR", colors: ["40, 100%, 60%", "20, 100%, 60%", "0, 0%, 100%"] },
        { name: "MATRIX", colors: ["120, 100%, 50%", "140, 100%, 40%", "0, 0%, 100%"] },
        { name: "ICE AGE", colors: ["200, 100%, 70%", "180, 100%, 80%", "220, 100%, 90%"] },
        { name: "VAMPIRE", colors: ["0, 100%, 50%", "350, 100%, 40%", "0, 0%, 20%"] },
        { name: "DEEP SPACE", colors: ["260, 100%, 70%", "290, 100%, 50%", "200, 50%, 50%"] },
        { name: "RADIOACTIVE", colors: ["60, 100%, 50%", "120, 100%, 50%", "0, 0%, 100%"] },
        { name: "MONOCHROME", colors: ["0, 0%, 100%", "0, 0%, 50%", "0, 0%, 80%"] },
    ];
    const palette = rand(palettes);

    // 2. SCALE (Constrained)
    const scaleModes = ["MICRO", "NORMAL", "NORMAL", "MACRO", "TITAN"];
    const scale = scaleModes[Math.floor(r * scaleModes.length)] as HeartDNA['scaleMode'];

    // 3. STRUCTURE
    const structures = ["CONTOUR", "CLOUD", "GRID", "ORBIT", "RAIN", "ATOM", "SPIRAL", "NOISE"];
    const structure = structures[Math.floor(Math.random() * structures.length)] as HeartDNA['structure'];

    // 4. PHYSICS
    const physicsList = ["PULSE", "FLOW", "VIBRATE", "STILL", "SPIN", "IMPLODE"];
    let physics = physicsList[Math.floor(Math.random() * physicsList.length)] as HeartDNA['physics'];
    
    // Constraints to avoid ugly combos
    if (structure === "GRID") physics = "STILL"; // Grid looks bad moving too fast
    if (structure === "ATOM") physics = "SPIN";  // Atoms must spin

    // 5. NAME GENERATION
    const name = `${palette.name} ${structure}`;

    const newDNA: HeartDNA = {
        name,
        palette: palette.colors,
        structure,
        physics,
        scaleMode: scale,
        particleCount: scale === "TITAN" ? 2500 : 1500, // Optimize count
        particleSize: Math.random() * 2 + 0.5,
        glitchFactor: Math.random() * 20,
        rotationSpeed: (Math.random() - 0.5) * 0.05
    };

    setDna(newDNA);
    dnaRef.current = newDNA;

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
    if (dna.scaleMode === "MICRO") sVal /= 3;
    if (dna.scaleMode === "MACRO") sVal *= 1.3;
    if (dna.scaleMode === "TITAN") sVal *= 1.8; // Capped max size

    for(let i=0; i<dna.particleCount; i++) {
        const p = new Particle(w, h);
        
        // Distribute T
        const t = (Math.PI * 2 * i) / dna.particleCount;
        p.t = t;
        
        // Initial Target Calc
        const pt = getHeartPos(t, sVal, w, h, 0);

        // Structure Scatter Logic
        let scatter = 5;
        if (dna.structure === "CLOUD") scatter = 50;
        if (dna.structure === "NOISE") scatter = 150;
        if (dna.structure === "SPIRAL") {
            p.t += i * 0.01; // Offset for spiral look
        }

        p.targetX = pt.x + (Math.random() - 0.5) * scatter;
        p.targetY = pt.y + (Math.random() - 0.5) * scatter;
        
        // Color Assignment
        p.color = dna.palette[i % dna.palette.length];
        
        // Size Variation
        p.baseSize = dna.particleSize + Math.random();
        if (dna.scaleMode === "MICRO") p.baseSize *= 0.8;
        if (dna.structure === "GRID") p.baseSize = 1.5;

        particlesRef.current.push(p);
    }
  };

  // --- RESTART LOGIC ---
  const handleRestart = () => {
      // Don't reload page, just regenerate
      metricsRef.current = { totalDist: 0, lastX: 0, lastY: 0, stops: 0 };
      particlesRef.current = [];
      setPhase("collecting");
      setProgress(0);
      setDna(null);
  };

  const cursorClass = (phase === "crystallizing" || phase === "artifact") ? "cursor-none" : "cursor-crosshair";

  return (
    <div 
        className={`fixed inset-0 bg-black overflow-hidden touch-none select-none ${cursorClass}`}
        onMouseMove={(e) => handleInput(e.clientX, e.clientY)}
        onTouchMove={(e) => handleInput(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* NOISE & VIGNETTE OVERLAY */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.1] z-10" 
           style={{ 
               backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
               boxShadow: "inset 0 0 100px rgba(0,0,0,0.9)"
           }} 
      />

      {/* UI */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-30">
        
        {(phase === "idle" || phase === "collecting") && (
          <div className="text-center opacity-90">
             <h1 className="text-white text-[10px] md:text-xs tracking-[0.5em] uppercase animate-pulse shadow-black drop-shadow-lg">
                Imprint Your Chaos
             </h1>
          </div>
        )}

        {phase === "artifact" && dna && (
             <div className="absolute inset-0 flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <div className="relative z-50 text-center mix-blend-difference hover:mix-blend-normal transition-all">
                    <div className="text-white text-[9px] font-mono mb-2 uppercase tracking-[0.3em] drop-shadow-md">
                        {dna.scaleMode} // {dna.physics}
                    </div>
                    <div className="text-3xl md:text-5xl font-extralight text-white mb-8 tracking-[0.2em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                        {dna.name}
                    </div>
                    <button 
                        onClick={handleRestart}
                        className="pointer-events-auto px-8 py-3 bg-white/10 border border-white/30 backdrop-blur-md text-white text-[10px] uppercase tracking-[0.3em] hover:bg-white hover:text-black hover:border-white transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                    >
                        Reshuffle
                    </button>
                </div>
             </div>
        )}
      </div>

      {phase === "collecting" && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-white shadow-[0_0_10px_white] transition-all duration-75 ease-linear z-30"
             style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}