'use client';

import React from 'react';
import Header from '@/components/Header';
import { motion } from 'framer-motion';
import { Terminal, ArrowRight, ShieldCheck, Cpu, Globe, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function AdvisingPage() {
  const services = [
    {
      icon: Cpu,
      title: 'Digital Infrastructure & AI Strategy',
      description: 'Consulting on systemic integration of AI tools, workflow automation, decentralized systems, and resilience against digital regulatory friction.'
    },
    {
      icon: Globe,
      title: 'Media Architecture & Public Communications',
      description: 'Strategic positioning for publicists, creators, and tech ventures navigating contemporary information spaces, publications, and reputation management.'
    },
    {
      icon: ShieldCheck,
      title: 'Web3 & Smart Contract Advisory',
      description: 'Guidance on tokenomics, NFT utility architecture, Polygon deployment strategies, and bridging classical art assets into digital smart contracts.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden antialiased">
      
      {/* Background grain texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <Header />

      <main className="max-w-4xl mx-auto px-6 pt-36 pb-24 relative z-20 space-y-12">
        
        {/* Title Section */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 text-center sm:text-left max-w-2xl"
        >
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
            <Terminal size={14} /> Professional Practice
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-light tracking-tight uppercase text-zinc-900">
            Advising &amp; Strategy
          </h1>
          <p className="font-serif text-base sm:text-lg text-zinc-600 leading-relaxed italic">
            Direct, high-level strategic consulting for projects operating at the intersection of modern media, technology, and art.
          </p>
        </motion.div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {services.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-md">
                    <IconComponent size={18} />
                  </div>
                  <h3 className="font-sans font-bold text-base uppercase tracking-tight text-zinc-900">
                    {item.title}
                  </h3>
                  <p className="font-serif text-sm text-zinc-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Contact / Booking CTA Card (Liquid Glass) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-8 sm:p-10 rounded-3xl bg-white/90 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="space-y-2 text-center sm:text-left">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400 block">Engagement</span>
            <h3 className="font-serif text-2xl text-zinc-900">Ready to discuss your project?</h3>
            <p className="font-serif text-sm text-zinc-500">Advisory slots are limited and structured by direct inquiry.</p>
          </div>

          <a
            href="mailto:contact@merkurov.love"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-zinc-900 text-white font-mono text-xs uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all shadow-lg shrink-0"
          >
            <MessageSquare size={14} />
            <span>Inquire Directly</span>
          </a>
        </motion.div>

      </main>

      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-400 uppercase tracking-[0.3em] py-8 z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
