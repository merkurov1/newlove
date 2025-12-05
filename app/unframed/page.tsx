"use client";

import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ScrollControls, Scroll, Text, useScroll } from '@react-three/drei';
import Image from 'next/image';
import * as THREE from 'three';
import { Terminal } from 'lucide-react';


// --- Assets ---
const ASSETS = {
  HERO_BG:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png',
  SYSTEM_MAP:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png',
  TIGER:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
  AUDIO:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a',
};

// Timeline data (Artist Arc)
const TIMELINE = [
  { year: '1984', title: 'The Floor', text: "I am four years old. The sun cuts through the tall Stalinist windows. I am drawing." },
  { year: '1998', title: 'The Rooftops', text: 'We drilled through walls, running coaxial cables with frozen hands. We built the infrastructure of freedom.' },
  { year: '2003', title: 'The Glass Cage', text: 'A city that kept walking. Silence louder than the noise.' },
  { year: '2008', title: 'The Spectral Tiger', text: 'Digital value doesn’t need banks. It only needs Consensus.' , image: ASSETS.TIGER},
  { year: '2017', title: 'The Source Code', text: 'We scanned the idol and turned stone into a file.' },
  { year: '2022', title: 'The Silence', text: 'The city adjusted its headphones and kept walking.' , image: ASSETS.HERO_BG},
  { year: '2025', title: 'The Canvas', text: 'The loop closed. I shut the door on the noise. I picked up the stylus. I am finally awake.' },
];

// --- 3D Components ---
function TunnelText({ children, position = [0, 0, 0], size = 2 }: any) {
  // Simple 3D text — large, editorial, fading into fog
  return (
    <Text
      fontSize={size}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
      position={position}
      material-toneMapped={false}
    >
      {children}
    </Text>
  );
}

function CameraFollower({ totalDepth = 40 }: { totalDepth?: number }) {
  const { camera } = useThree();
  const scroll = useScroll();

  useFrame(() => {
    // scroll.offset moves 0..1 across pages; map to camera z position
    const z = 10 - scroll.offset * totalDepth; // start in front, move forward
    camera.position.z = z;
    // subtle parallax: tilt a bit based on offset
    camera.rotation.y = (scroll.offset - 0.5) * 0.05;
  });
  return null;
}

function TunnelScene() {
  const gap = 6; // distance between years along z
  const { scene } = useThree();

  useEffect(() => {
    // Fog
    const fog = new THREE.Fog('black', 5, 40);
    scene.fog = fog;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 5, 5);
    scene.add(ambient);
    scene.add(dir);

    return () => {
      scene.fog = null as any;
      scene.remove(ambient);
      scene.remove(dir);
    };
  }, [scene]);

  return (
    <>
      {/* Camera follower reacts to scroll */}
      <CameraFollower totalDepth={TIMELINE.length * gap + 10} />

      {/* Place year texts along the z axis as individual Text components */}
      {TIMELINE.map((item, i) => {
        const z = -i * gap - 6; // push into scene
        const size = Math.max(3.5, 6 - i * 0.4);
        return (
          <TunnelText key={item.year} size={size} position={[0, 0, z]}>
            {item.year}
          </TunnelText>
        );
      })}
    </>
  );
}

// --- Page UI ---
export default function UnframedPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Surface runtime errors to avoid white screen — useful during debugging
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      setRuntimeError(`${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`);
      return false;
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      try {
        const reason = ev.reason instanceof Error ? ev.reason.stack || ev.reason.message : String(ev.reason);
        setRuntimeError(`UnhandledRejection: ${reason}`);
      } catch (e) {
        setRuntimeError('UnhandledRejection');
      }
    };
    window.addEventListener('error', onError as unknown as EventListener);
    window.addEventListener('unhandledrejection', onRejection as unknown as EventListener);
    return () => {
      window.removeEventListener('error', onError as unknown as EventListener);
      window.removeEventListener('unhandledrejection', onRejection as unknown as EventListener);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1200);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 overflow-hidden antialiased">

      {/* Runtime error overlay (visible when a runtime error occurs) */}
      {runtimeError && (
        <div className="fixed inset-0 z-[9999] bg-black/90 text-red-300 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto font-mono text-sm whitespace-pre-wrap">
            <strong className="block text-lg mb-4">Runtime Error (debug):</strong>
            <pre className="whitespace-pre-wrap">{runtimeError}</pre>
          </div>
        </div>
      )}

      {/* MASSIVE FIXED HEADER */}
      <header className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center">
        <div className="mt-12 text-center">
          <h1 className="text-[18vw] leading-[0.7] font-extrabold uppercase mix-blend-difference select-none" style={{ fontFamily: 'serif' }}>
            UNFRAMED
          </h1>
          <div className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-300">A MEMOIR BY ANTON MERKUROV</div>
        </div>
      </header>

      {/* 3D Scroll Tunnel */}
      <section className="relative h-screen w-full">
        <Canvas className="fixed inset-0 z-30" camera={{ position: [0, 0, 10], fov: 50 }}>
          <Suspense fallback={null}>
            <ScrollControls pages={6} damping={0.2}>
              <Scroll>
                <TunnelScene />
              </Scroll>

              {/* HTML overlay synchronized with scroll — narrative blocks */}
              <Scroll html>
                <div className="container mx-auto px-6 md:px-12" style={{ pointerEvents: 'auto' }}>
                  {/* create a block for each timeline item; they will flow through the ScrollControls pages */}
                  {TIMELINE.map((item, i) => (
                    <section key={item.year} className="min-h-screen flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                      <div className="max-w-3xl mx-auto">
                        <div className="font-mono text-xs text-red-600 uppercase tracking-widest mb-4">{`0${i + 1} / ${item.year}`}</div>
                        <h2 className="text-4xl md:text-6xl font-serif text-white mb-6">{item.title}</h2>
                        <p className="text-xl md:text-2xl text-zinc-300 font-serif leading-relaxed">{item.text}</p>
                        {item.image && (
                          <div className="mt-8 w-full max-w-2xl relative overflow-hidden">
                            <Image src={item.image} alt={item.title} width={1200} height={700} className="object-cover grayscale transition-all duration-500 hover:filter-none" />
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </Scroll>
            </ScrollControls>
          </Suspense>
        </Canvas>

        {/* Fallback static visual while Canvas loads (accessible) */}
        <div className="relative z-40 pointer-events-none" aria-hidden>
          <div className="absolute inset-0 bg-black/20" />
        </div>
      </section>

      {/* AFTER TUNNEL: NotebookLM + Request Form (static sections) */}
      <main className="relative z-40 bg-black px-6 md:px-20 py-24">
        <section className="max-w-6xl mx-auto mb-20">
          <div className="font-mono text-xs text-red-600 uppercase tracking-widest mb-4">03 / AI Analysis</div>
          <h3 className="text-4xl font-bold text-white mb-4">The Autopsy of an Empire</h3>
          <p className="text-lg text-zinc-400 font-serif leading-relaxed">Two synthetic hosts analyze the shift from the heavy Granite to the weightless Ether. NotebookLM generated insights and timestamps accompany the dossier.</p>

          <div className="mt-8 p-6 border border-zinc-800 bg-black/40">
            <audio controls className="w-full h-10">
              <source src={ASSETS.AUDIO} type="audio/mp4" />
            </audio>
          </div>
        </section>

        <section className="max-w-3xl mx-auto bg-[#050505] border border-zinc-900 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Terminal className="text-red-500" />
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Secure Transmission</div>
          </div>

          {status === 'success' ? (
            <div className="p-6 bg-green-900/10 border border-green-900/30 text-green-400 font-mono">Signal received. Awaiting confirmation.</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-xs text-zinc-400">NAME</label>
                <input className="w-full mt-2 bg-black border border-zinc-800 p-3 text-white" required />
              </div>
              <div>
                <label className="font-mono text-xs text-zinc-400">EMAIL</label>
                <input type="email" className="w-full mt-2 bg-black border border-zinc-800 p-3 text-white" required />
              </div>
              <button className="w-full bg-red-600 text-black font-bold py-3">Initialize Request</button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="z-40 relative text-center py-8 font-mono text-xs text-zinc-600">MERKUROV.LOVE / UNFRAMED © 2025</footer>
    </div>
  );
}