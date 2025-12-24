'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

// --- DATA: PURE INVENTORY ---

const WORKS = [
  {
    id: '01',
    title: 'Live Heart',
    type: 'Generative Art',
    desc: 'Digital heartbeat simulation. CSS/JS animation.',
    link: '/liveheart',
    featured: true
  },
  {
    id: '02',
    title: 'Unframed',
    type: 'Non-Fiction',
    desc: 'Autobiographical text covering the transition from analog to digital.',
    link: '/unframed'
  },
  {
    id: '03',
    title: 'The Transformation of Control',
    type: 'Research',
    desc: 'Analytical report for Novaya Gazeta. 2025 Year in Review.',
    link: '/research/novayagazeta2025'
  },
  {
    id: '04',
    title: 'Research Hub',
    type: 'Archive',
    desc: 'Collection of columns and publicist works.',
    link: '/research'
  },
  {
    id: '05',
    title: 'Case Study: Fontana',
    type: 'Market Analysis',
    desc: 'Investment memorandum on Lucio Fontana’s "White Absolute".',
    link: '/case-study/fontana'
  },
  {
    id: '06',
    title: 'Case Study: Garcia',
    type: 'Market Analysis',
    desc: 'Deconstructing the value of contemporary visual myths.',
    link: '/case-study/garcia'
  },
  {
    id: '07',
    title: 'Silence',
    type: 'Manifesto',
    desc: 'Digital hygiene and information strategy.',
    link: '/silence'
  },
  {
    id: '08',
    title: 'The Lab',
    type: 'Development',
    desc: 'Experimental Next.js & Supabase playground.',
    link: 'https://lab.merkurov.love'
  },
  {
    id: '09',
    title: 'Cast',
    type: 'Tool',
    desc: 'User segmentation interface.',
    link: '/cast'
  },
  {
    id: '10',
    title: 'Let It Go',
    type: 'Interactive',
    desc: 'Psychometric tool for emotional release.',
    link: '/heartandangel/letitgo'
  }
];

// --- COMPONENT ---

export default function WhiteCube2025() {
  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-32">
      
      {/* 1. HERO: The Object */}
      <header className="pt-32 pb-20 px-6 max-w-5xl mx-auto border-b border-black">
        <div className="flex flex-col md:flex-row justify-between items-end gap-12">
          
          {/* Title */}
          <div>
            <h1 className="text-[8rem] md:text-[12rem] leading-[0.8] font-serif tracking-tighter">
              2025
            </h1>
            <p className="mt-8 text-sm md:text-base font-medium tracking-wide uppercase text-gray-500">
              Selected Works & Releases<br/>
              November — December
            </p>
          </div>

          {/* Featured Object (LiveHeart placeholder visual) */}
          <div className="w-full md:w-64 h-64 bg-gray-50 flex items-center justify-center border border-gray-100">
             {/* В реальном проекте сюда можно вставить компонент <HeartAnimation /> */}
             <div className="text-xs text-gray-400 font-mono text-center">
               [ LiveHeart Component ]<br/>
               Processing...
             </div>
          </div>
        </div>
      </header>

      {/* 2. THE INDEX */}
      <main className="max-w-5xl mx-auto px-6 pt-20">
        <div className="grid grid-cols-1 gap-0">
          
          {/* Table Header (Desktop) */}
          <div className="hidden md:grid grid-cols-[1fr_2fr_2fr_auto] gap-8 pb-4 border-b border-black text-xs font-bold uppercase tracking-widest text-gray-400">
            <div>No.</div>
            <div>Project</div>
            <div>Description</div>
            <div>Link</div>
          </div>

          {/* Rows */}
          {WORKS.map((work, i) => (
            <motion.div
              key={work.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={work.link} className="group block">
                <div className="md:grid md:grid-cols-[1fr_2fr_2fr_auto] gap-8 py-8 border-b border-gray-200 group-hover:border-black transition-colors items-baseline">
                  
                  {/* ID */}
                  <div className="text-xs font-mono text-gray-400 mb-2 md:mb-0">
                    {work.id}
                  </div>
                  
                  {/* Title & Type */}
                  <div className="mb-2 md:mb-0">
                    <h3 className="text-2xl md:text-3xl font-serif group-hover:underline decoration-1 underline-offset-4">
                      {work.title}
                    </h3>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mt-1 block">
                      {work.type}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="text-gray-600 font-sans text-sm md:text-base leading-relaxed max-w-md mb-4 md:mb-0">
                    {work.desc}
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-end">
                    <ArrowUpRight className="w-6 h-6 text-gray-300 group-hover:text-black group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                  </div>

                </div>
              </Link>
            </motion.div>
          ))}

        </div>
      </main>

      {/* 3. FOOTER */}
      <footer className="max-w-5xl mx-auto px-6 pt-20 flex justify-between items-end">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Merkurov.love
        </div>
        <div className="text-right">
          <p className="font-serif italic text-lg">
            "Compiled in 60 days."
          </p>
        </div>
      </footer>

    </div>
  );
}