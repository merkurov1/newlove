'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const navItems = [
    { label: 'ART', href: '/heartandangel' },
    { label: 'SELECTION', href: '/selection' },
    { label: 'ADVISING', href: '/advising' },
    { label: 'ABOUT', href: '/isakeyforall' },
    { label: 'JOURNAL', href: '/journal' }
  ];

  return (
    <div className="sticky top-0 z-50 font-sans">
      
      {/* 1. TICKER BAR (MARKET DATA) */}
      <div className="bg-[#1C1917] text-[#F2F0E9] text-[10px] md:text-xs font-mono py-1.5 px-4 overflow-hidden border-b border-black flex justify-between items-center relative z-50">
        <div className="flex gap-8 whitespace-nowrap overflow-x-auto no-scrollbar w-full">
           <span className="opacity-80">SYSTEM: ONLINE</span>
           <span className="text-[#B91C1C]">NOISE: HIGH</span>
           <span>SILENCE INDEX: 142.5 (+1.2%)</span>
           <span>GOLD: $2,650</span>
           <span>HERMES: €2,100</span>
           <span className="opacity-80">LOC: BELGRADE/LONDON</span>
        </div>
      </div>

      {/* 2. MAIN NAVIGATION */}
      <header className="w-full bg-[#F2F0E9] border-b border-[#1C1917]">
        <div className="w-full max-w-7xl mx-auto flex items-stretch justify-between h-16 md:h-20">
          
          {/* LOGO AREA */}
          <Link
            href="/"
            className="flex items-center px-4 sm:px-6 border-r border-[#1C1917] hover:bg-white transition-colors"
          >
            <div className="flex flex-col">
                <span className="font-serif font-black text-xl md:text-2xl tracking-tighter leading-none text-[#1C1917]">
                    MERKUROV
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#57534E] mt-1">
                    Private Office
                </span>
            </div>
          </Link>
          
          {/* DESKTOP MENU */}
          <nav className="hidden md:flex flex-1 items-stretch justify-end">
            <ul className="flex h-full">
              {navItems.map((item) => {
                const currentPath = pathname ?? '';
                const isActive = currentPath.startsWith(item.href);

                return (
                  <li key={item.label} className="h-full border-l border-[#1C1917]">
                    <Link
                      href={item.href}
                      className={`h-full flex items-center px-6 text-xs font-bold font-mono tracking-widest uppercase hover:bg-[#1C1917] hover:text-[#F2F0E9] transition-all ${isActive ? 'bg-[#1C1917] text-[#F2F0E9]' : 'text-[#1C1917]'}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          
          {/* MOBILE TOGGLE */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden flex items-center justify-center w-16 border-l border-[#1C1917] hover:bg-[#1C1917] hover:text-[#F2F0E9] transition-colors"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* 3. MOBILE MENU OVERLAY */}
      <div
        className={`fixed inset-0 z-40 bg-[#F2F0E9] pt-28 px-6 transition-transform duration-300 md:hidden border-r border-[#1C1917] ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <nav>
          <ul className="flex flex-col gap-6">
            {[
              { name: 'Art (The Ritual)', href: '/heartandangel' },
              { name: 'Selection (Inventory)', href: '/selection' },
              { name: 'Advising (Office)', href: '/advising' },
              { name: 'About (Protocol)', href: '/isakeyforall' },
              { name: 'Journal (Logs)', href: '/journal' }
            ].map((link) => (
              <li key={link.name} className="border-b border-[#1C1917]/20 pb-4">
                <Link
                  href={link.href}
                  className="text-3xl font-serif font-bold text-[#1C1917] active:text-[#B91C1C]"
                >
                  {link.name}
                </Link>
              </li>
            ))}
            <li className="mt-8">
                 <Link href="/lobby" className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#B91C1C]">
                    Enter System Lobby <ArrowUpRight size={14}/>
                 </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}