'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export default function TemplePageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 9, scale: 0.995, filter: 'blur(5px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.998, filter: 'blur(3px)' }}
        transition={{ duration: reduceMotion ? 0.12 : 0.34, ease: [0.22, 1, 0.36, 1] }}
      >{children}</motion.div>
    </AnimatePresence>
  );
}
