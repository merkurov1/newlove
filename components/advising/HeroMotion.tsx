"use client";

import React from 'react';
import { motion } from 'framer-motion';

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: string;
};

const container = {
  hidden: { opacity: 0, y: 12 },
  // small stagger (seconds) so children animate promptly — previous value was accidentally large
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function HeroMotion({ title, subtitle, status }: Props) {
  return (
    <motion.div initial="hidden" animate="show" variants={container}>
      <div className="flex justify-between items-center mb-6">
        <motion.span variants={item} className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400">
          Merkurov Private Office
        </motion.span>

        <motion.div variants={item} className="font-mono text-[10px] tracking-widest uppercase text-green-600 border border-green-600 px-2 py-1 rounded-full">
          <motion.span
            animate={{ scale: [1, 1.08, 1], boxShadow: ["0 0 0 rgba(0,0,0,0)", "0 0 12px rgba(16,185,129,0.2)", "0 0 0 rgba(0,0,0,0)"] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="inline-block"
          >
            {status || 'System Online'}
          </motion.span>
        </motion.div>
      </div>

      <motion.h1 variants={item} className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6">
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p variants={item} className="text-xl md:text-2xl font-serif italic text-gray-600">
          {subtitle}
        </motion.p>
      )}
    </motion.div>
  );
}
