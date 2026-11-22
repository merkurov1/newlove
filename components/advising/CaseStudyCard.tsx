'use client';

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
    <Link href={href} className="group block no-underline">
      <motion.div
        layoutId={layoutId}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="relative overflow-hidden rounded-2xl border border-[#1D1B18]/12 bg-white/55 p-6 shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-sm transition-all duration-500 hover:border-[#1D1B18]/35 hover:shadow-[0_24px_60px_rgba(58,46,30,0.12)]"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <motion.h4
            whileHover={{ color: '#8D3D2E' }}
            className="min-w-0 text-xl font-serif font-bold text-[#1D1B18] no-underline transition-colors"
          >
            {title}
          </motion.h4>
          <div className="flex shrink-0 items-center gap-2">
            {badge && (
              <div className="rounded-full border border-[#1D1B18]/15 bg-white/70 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60] backdrop-blur-sm">
                {badge}
              </div>
            )}
            <motion.span
              whileHover={{ x: 6 }}
              className="text-2xl text-[#6F6A60] transition-transform duration-300"
            >
              →
            </motion.span>
          </div>
        </div>

        {subtitle && (
          <p className="font-mono text-sm leading-relaxed text-[#6F6A60] no-underline">
            {subtitle}
          </p>
        )}
      </motion.div>
    </Link>
  );
}
