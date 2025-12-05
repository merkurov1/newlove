"use client";

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll } from '@react-three/drei';
import TunnelScene from './unframedTunnel/TunnelScene';
import TIMELINE from '@/lib/unframedTimeline';
import Image from 'next/image';

export default function UnframedTunnelClient() {
  return (
    <Canvas className="fixed inset-0 z-30" camera={{ position: [0, 0, 10], fov: 50 }}>
      <Suspense fallback={null}>
        <ScrollControls pages={6} damping={0.2}>
          <Scroll>
            <TunnelScene />
          </Scroll>
          <Scroll html>
            <div className="container mx-auto px-6 md:px-12" style={{ pointerEvents: 'auto' }}>
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
  );
}
