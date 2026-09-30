'use client';

import React from 'react';
import Header from '@/components/Header';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

export default function AdvisingPage() {
  const tracks = [
    {
      index: '01',
      title: 'Media Architecture & Public Strategy',
      description: 'Positioning publicists, creators, and modern ventures across independent publishing, international media outlets, and high-stakes information spaces.'
    },
    {
      index: '02',
      title: 'Digital Infrastructure & AI Integration',
      description: 'Systemic architecture for AI tools, workflow automation, decentralized systems, and resilience against regulatory friction.'
    },
    {
      index: '03',
      title: 'Web3 & Art Market Mechanics',
      description: 'Advisory on digital art valuation, smart contract logic, Polygon protocols, and bridging classical heritage with modern decentralized registries.'
    }
  ];

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white relative overflow-x-hidden antialiased">
      
      <Header />

      <main className="max-w-4xl mx-auto px-6 pt-36 pb-24 space-y-20">
        
        {/* Title Section */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 max-w-2xl border-b border-zinc-200 pb-12"
        >
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            Professional Practice
          </div>
          <h1 className="text-4xl sm:text-6xl font-serif font-light tracking-tight uppercase text-black">
            Advising
          </h1>
          <p className="font-serif text-lg text-zinc-600 leading-relaxed italic">
            Targeted strategic advisory and high-level consulting at the intersection of media, technology, and modern art markets.
          </p>
        </motion.div>

        {/* Tracks List (White Cube Editorial) */}
        <div className="space-y-8">
          {tracks.map((track, index) => (
            <motion.div
              key={track.index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-8 sm:p-12 border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-black transition-all duration-300 bg-white"
            >
              <div className="space-y-3 max-w-xl">
                <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                  {track.index}
                </span>
                <h3 className="font-sans font-bold text-xl uppercase tracking-tight text-black">
                  {track.title}
                </h3>
                <p className="font-serif text-sm sm:text-base text-zinc-600 leading-relaxed">
                  {track.description}
                </p>
              </div>

              <div className="shrink-0">
                <div className="w-12 h-12 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                  <ArrowUpRight size={18} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Direct Engagement Block */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="p-8 sm:p-12 border border-black bg-black text-white flex flex-col sm:flex-row items-center justify-between gap-8"
        >
          <div className="space-y-2 text-center sm:text-left">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">Availability</span>
            <h3 className="font-serif text-2xl tracking-tight">Direct Consultation</h3>
            <p className="font-serif text-sm text-zinc-400">Sessions are structured by prior inquiry and availability.</p>
          </div>

          <a
            href="mailto:contact@merkurov.love"
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-black font-mono text-xs uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all shrink-0 font-bold"
          >
            <span>Inquire via Email</span>
            <ArrowUpRight size={14} />
          </a>
        </motion.div>

      </main>

      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-400 uppercase tracking-[0.3em] py-8 border-t border-zinc-100">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
