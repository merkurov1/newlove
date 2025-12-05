"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ScrollControls, Scroll, useScroll, Text, Image as DreiImage } from '@react-three/drei';
import { useFrame as useKeyframe } from '@react-three/fiber';
import * as THREE from 'three';

// --- ASSETS ---
const ASSETS = {
  HERO_BG: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png",
  TIGER: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg",
};

// --- REDACTED TEXT COMPONENT (HTML) ---
const Redacted = ({ children }: { children: React.ReactNode }) => (
  <span className="group relative inline-block cursor-help mx-1 align-bottom">
    <span className="relative z-10 bg-black text-transparent select-none transition-all duration-300 group-hover:bg-transparent group-hover:text-red-600 group-hover:drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
      {children}
    </span>
    <span className="absolute inset-0 bg-zinc-800 animate-pulse group-hover:hidden" />
  </span>
);

// --- 3D SCENE CONTENT ---
function Scene() {
  const scroll = useScroll();
  const { viewport, scene } = useThree();

  // Make TypeScript happy by typing scroll/frame params as any where appropriate
  useFrame((state: any, delta: number) => {
    // Optional: Global subtle rotation or movement
    const r1 = scroll.range(0 / 6, 1 / 6); // First section
    // Can add logic here to rotate camera slightly based on scroll
  });

  // Set fog programmatically to avoid missing JSX intrinsic types for <fog />
  useEffect(() => {
    const oldFog = scene.fog;
    scene.fog = new THREE.Fog('#000000', 5, 20);
    return () => {
      scene.fog = oldFog;
    };
  }, [scene]);

  const { width, height } = (viewport as any) || { width: 0, height: 0 };

  return (
    <>
      
      {/* 3D YEARS FLOATING IN SPACE */}
      {/* 1984 */}
      <Text position={[0, 0, -5]} fontSize={4} color="#1a1a1a" font="/fonts/Inter-Bold.woff">
        1984
      </Text>
      
      {/* 1998 */}
      <Text position={[-2, -1, -15]} fontSize={4} color="#1a1a1a">
        1998
      </Text>

      {/* 2008 */}
      <Text position={[2, 1, -25]} fontSize={4} color="#1a1a1a">
        2008
      </Text>
      <DreiImage url={ASSETS.TIGER} position={[3, 0, -28]} scale={[4, 3]} transparent opacity={0.5} grayscale />

      {/* 2025 */}
      <Text position={[0, 0, -45]} fontSize={6} color="#ffffff">
        2025
      </Text>
    </>
  );
}

// --- HTML CONTENT (THE NARRATIVE) ---
// This overlays the 3D scene and scrolls with it
function HtmlContent() {
  return (
    <Scroll html style={{ width: '100%' }}>
      
      {/* 0. HERO TITLE (Fixed Visual is handled in page.tsx, this is spacer) */}
      <div style={{ height: '100vh' }}></div>

      {/* 1. MANIFESTO */}
      <div className="h-screen flex items-center justify-center px-6">
        <div className="max-w-4xl w-full bg-black/80 p-10 backdrop-blur-md border border-zinc-900">
           <p className="font-mono text-xs text-red-600 mb-8 uppercase tracking-[0.2em]">01 / The Premise</p>
           <h2 className="text-3xl md:text-5xl font-serif leading-[1.2] text-zinc-100">
              "I spent forty years running away from the boy on the floor. 
              I built networks on frozen rooftops. I sold the ghost of the Empire as crypto. <br/><br/>
              It was all a detour. <br/>
              <Redacted>The System</Redacted> demanded <Redacted>noise</Redacted>. I gave it <Redacted>noise</Redacted>.
              But the granite eventually cracks. <br/><br/>
              <span className="text-white font-bold">UNFRAMED</span> is the story of closing the loop. Of returning to the only thing that matters: <span className="underline decoration-red-600 underline-offset-8">The Line</span>."
           </h2>
        </div>
      </div>

      {/* 2. TIMELINE ITEMS (Spaced out for scroll) */}
      
      {/* 1984 */}
      <div className="h-screen flex items-center justify-start px-20">
         <div className="max-w-md">
            <h3 className="text-6xl font-black text-white mb-4">1984</h3>
            <p className="text-xl text-zinc-400 font-serif">The Floor. The sun cuts through the tall Stalinist windows. I am drawing.</p>
         </div>
      </div>

      {/* 1998 */}
      <div className="h-screen flex items-center justify-end px-20 text-right">
         <div className="max-w-md">
            <h3 className="text-6xl font-black text-white mb-4">1998</h3>
            <p className="text-xl text-zinc-400 font-serif">The Rooftops. We drilled through walls, running cables with frozen hands. Building the infrastructure of freedom.</p>
         </div>
      </div>

      {/* 2008 */}
      <div className="h-screen flex items-center justify-center text-center">
         <div className="max-w-lg bg-black/50 p-6 backdrop-blur">
            <h3 className="text-6xl font-black text-white mb-4">2008</h3>
            <p className="text-xl text-zinc-400 font-serif">The Spectral Tiger. While the economy collapsed, digital value held steady. It only needs Consensus.</p>
         </div>
      </div>

      {/* 2025 */}
      <div className="h-screen flex items-center justify-center">
         <div className="max-w-2xl text-center">
            <h3 className="text-9xl font-black text-white mb-6">2025</h3>
            <p className="text-3xl text-zinc-200 font-serif">The Loop Closed.<br/> I picked up the stylus. <br/> I am finally awake.</p>
         </div>
      </div>

    </Scroll>
  );
}


export default function UnframedTunnel() {
  return (
    <div className="h-screen w-full">
      <Canvas camera={{ position: [0, 0, 0], fov: 75 }}>
        <ScrollControls pages={6} damping={0.2}>
           {/* 3D Layer */}
           <Scene />
           {/* HTML Layer */}
           <HtmlContent />
        </ScrollControls>
      </Canvas>
    </div>
  );
}