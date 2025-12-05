"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Terminal, Volume2 } from 'lucide-react';

// Dynamically load the heavy 3D component
const UnframedTunnel = dynamic(() => import('@/components/unframed/UnframedTunnel'), { 
  ssr: false, 
  loading: () => <div className="h-screen w-full bg-black flex items-center justify-center text-zinc-500 font-mono">INITIALIZING SYSTEM...</div> 
});

const ASSETS = {
  AUDIO: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a',
};

export default function UnframedPage() {
  const [status, setStatus] = useState('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div className="bg-black text-white selection:bg-red-600 selection:text-white">
      
      {/* 1. FIXED HEADER (Always Visible) */}
      <div className="fixed top-0 left-0 w-full z-50 pointer-events-none mix-blend-difference flex flex-col items-center pt-8">
         <h1 className="text-[12vw] leading-none font-black uppercase tracking-tighter">UNFRAMED</h1>
         <p className="font-mono text-xs uppercase tracking-[0.3em] mt-2">The Granite. The Glitch. The Ghost.</p>
      </div>

      {/* 2. THE TUNNEL (Scroll Experience) */}
      {/* This component handles the first 600vh of scroll */}
      <UnframedTunnel />

      {/* 3. FOOTER CONTENT (Appears after 3D scroll ends) */}
      <div className="relative z-10 bg-black border-t border-zinc-900">
        
        {/* AI ANALYSIS */}
        <section className="max-w-5xl mx-auto px-6 py-32 border-b border-zinc-900">
           <div className="flex items-center gap-4 mb-12">
             <Volume2 className="text-red-600" />
             <span className="font-mono text-xs text-red-600 uppercase tracking-[0.2em]">AI Generated Analysis</span>
           </div>
           
           <h3 className="text-4xl md:text-5xl font-bold mb-6">The Autopsy of an Empire</h3>
           <p className="text-xl text-zinc-400 font-serif mb-8 max-w-2xl">
             Two synthetic hosts deconstruct the manuscript, analyzing the shift from heavy Granite to weightless Ether.
           </p>

           <div className="bg-zinc-900/50 p-6 border border-zinc-800">
             <audio controls className="w-full invert opacity-80 hover:opacity-100 transition-opacity">
               <source src={ASSETS.AUDIO} type="audio/mp4" />
             </audio>
           </div>
        </section>

        {/* REQUEST FORM */}
        <section className="py-32 px-6 flex justify-center">
           <div className="max-w-xl w-full">
              <div className="mb-8 flex items-center gap-2 text-zinc-500 font-mono text-xs uppercase tracking-widest">
                <Terminal size={14} /> Secure Transmission
              </div>
              
              <h2 className="text-3xl font-bold mb-8 uppercase">Request Full Proposal</h2>
              
              {status === 'success' ? (
                <div className="p-4 bg-green-900/20 text-green-500 font-mono text-sm border border-green-900">
                  &gt; SIGNAL RECEIVED.<br/>&gt; STAND BY FOR CONNECTION.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-0 border border-zinc-800">
                  <input type="text" className="w-full bg-black p-4 border-b border-zinc-800 text-white font-mono text-sm focus:outline-none focus:bg-zinc-900 uppercase" placeholder="NAME" required />
                  <input type="text" className="w-full bg-black p-4 border-b border-zinc-800 text-white font-mono text-sm focus:outline-none focus:bg-zinc-900 uppercase" placeholder="AGENCY" required />
                  <input type="email" className="w-full bg-black p-4 border-b border-zinc-800 text-white font-mono text-sm focus:outline-none focus:bg-zinc-900 uppercase" placeholder="EMAIL" required />
                  <button className="w-full bg-white text-black font-bold uppercase tracking-widest py-4 hover:bg-red-600 hover:text-white transition-colors">
                    Initialize
                  </button>
                </form>
              )}
           </div>
        </section>

        <footer className="py-8 text-center text-zinc-700 font-mono text-[10px] uppercase tracking-widest">
          Merkurov.Love © 2025
        </footer>

      </div>
    </div>
  );
}