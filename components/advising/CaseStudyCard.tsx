"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

type Props = {
  href: string;
  badge?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  layoutId?: string;
};

export default function CaseStudyCard({ href, badge, title, subtitle, layoutId }: Props) {
  return (
    <Link href={href} className="group block">
      <motion.div
        layoutId={layoutId}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="border border-gray-300 bg-white p-6 hover:border-black hover:shadow-2xl transition-all duration-500 relative overflow-hidden"
      >
        {badge && (
          <div className="absolute top-0 right-0 bg-black text-white text-[9px] font-mono px-2 py-1 uppercase">
            {badge}
          </div>
        )}

        <div className="flex items-start justify-between mb-4">
          <div>
            <motion.h4 whileHover={{ color: '#be123c' }} className="text-xl font-serif font-bold transition-colors">
              {title}
            </motion.h4>
            {subtitle && <p className="text-sm text-gray-500 font-mono mt-1">{subtitle}</p>}
          </div>
          <motion.span whileHover={{ x: 6 }} className="text-2xl transition-transform duration-300">→</motion.span>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed max-w-lg">
          {/* keep original intent: short description is passed in subtitle or left out */}
        </p>
      </motion.div>
    </Link>
  );
}
