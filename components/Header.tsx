'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Полный список ссылок как было раньше
  const navLinks = [
    { name: 'Art', href: '/heartandangel' },
    { name: 'Selection', href: '/selection' },
    { name: 'Advising', href: '/advising' },
    { name: 'About', href: '/isakeyforall' },
    { name: 'Journal', href: '/journal' },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 transition-all duration-300">
        <div className="max-w-[1800px] mx-auto px-6 h-16 md:h-20 flex items-center justify-between">
          
          {/* LOGO */}
          <Link href="/" className="z-50 group">
            <span className="font-sans font-bold text-lg tracking-[0.2em] uppercase text-zinc-900 group-hover:opacity-50 transition-opacity">
              Merkurov
            </span>
          </Link>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-12">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`text-xs font-mono uppercase tracking-[0.15em] transition-all duration-300 ${
                  pathname === link.href 
                    ? 'text-red-600 font-bold border-b border-red-600 pb-0.5' 
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* MOBILE BURGER */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden z-50 p-2 text-zinc-900"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MOBILE MENU */}
      <div
        className={`fixed inset-0 z-40 bg-white transform transition-transform duration-500 ease-in-out ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full space-y-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-3xl font-serif font-medium text-zinc-900 hover:text-red-600 transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}