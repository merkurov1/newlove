'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hideOnScroll, setHideOnScroll] = useState(false);
  const [tick, setTick] = useState(0);
  const lastScrollY = useRef(0);

  // Умный скролл
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 0);
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentY > lastScrollY.current && currentY > 100) {
            setHideOnScroll(true);
          } else {
            setHideOnScroll(false);
          }
          lastScrollY.current = currentY;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };
    const onSessionChanged = () => {
      // force re-render
      try {
        setTick((t) => t + 1);
      } catch (e) {}
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('supabase:session-changed', onSessionChanged);
    const closeMenuHandler = () => setIsMenuOpen(false);
    window.addEventListener('newlove:close-mobile-menu', closeMenuHandler);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('supabase:session-changed', onSessionChanged);
      window.removeEventListener('newlove:close-mobile-menu', closeMenuHandler);
    };
  }, []);

  return (
    <div>
      {/* Opt-in debug overlay when ?auth_debug=1 */}
      {/* Debug overlay removed for production */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-100">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 py-4">
          {/* Left: Site name only */}
          <Link
            href="/"
            className="font-bold text-black uppercase tracking-widest"
            style={{ fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontSize: 20 }}
          >
            MERKUROV
          </Link>
          {/* Right: Navigation */}
          <nav className="flex items-center">
            <ul className="flex gap-10 text-base font-semibold uppercase tracking-widest">
              <li>
                <Link href="/heartandangel" className="hover:opacity-60 transition">
                  ART
                </Link>
              </li>
              <li>
                <Link href="/selection" className="hover:opacity-60 transition">
                  SELECTION
                </Link>
              </li>
              <li>
                <Link href="/advising" className="hover:opacity-60 transition">
                  ADVISING
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      {/* Animated gradient line убрана по финальному ТЗ */}

      {/* Mobile menu: same links, slide-in */}
      <div
        className={`fixed inset-0 z-40 bg-white pt-24 transition-transform duration-300 md:hidden ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <nav className="px-8">
          <ul className="flex flex-col items-end gap-8 text-2xl font-semibold uppercase tracking-widest">
            <li>
              <Link
                href="/heartandangel"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                ART
              </Link>
            </li>
            <li>
              <Link
                href="/selection"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                SELECTION
              </Link>
            </li>
            <li>
              <Link
                href="/advising"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                ADVISING
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
