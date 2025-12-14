'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  // Закрываем меню при смене страницы
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { name: 'Art', href: '/heartandangel' },
    { name: 'Selection', href: '/selection' },
    { name: 'Advising', href: '/advising' },
    { name: 'Journal', href: '/journal' },
    { name: 'Index', href: '/silence' }, // Новый актив
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 transition-all duration-300">
        <div className="max-w-[1800px] mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* LOGO */}
          <Link href="/" className="z-50">
            <span className="font-sans font-bold text-lg tracking-[0.2em] uppercase text-black hover:opacity-50 transition-opacity">
              Merkurov
            </span>
          </Link>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`text-xs font-mono uppercase tracking-[0.15em] transition-colors duration-300 ${
                  pathname === link.href 
                    ? 'text-red-600 font-bold' 
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                {link.name}
              </Link>
            ))}
            
            {/* CTA Button */}
            <Link 
              href="/lobby" 
              className="ml-4 px-4 py-2 border border-gray-200 rounded-full text-[10px] font-mono uppercase tracking-widest hover:bg-black hover:text-white hover:border-black transition-all"
            >
              Private Office
            </Link>
          </nav>

          {/* MOBILE BURGER */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden z-50 p-2 text-black"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MOBILE MENU OVERLAY */}
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
              className="text-3xl font-serif font-medium text-black hover:text-red-600 transition-colors"
            >
              {link.name}
            </Link>
          ))}
          <div className="w-12 h-[1px] bg-gray-200 my-8"></div>
          <Link 
            href="/lobby"
            className="text-xs font-mono uppercase tracking-widest text-gray-500 border border-gray-200 px-6 py-3 rounded-full"
          >
            Enter Private Office
          </Link>
        </div>
      </div>
    </>
  );
}