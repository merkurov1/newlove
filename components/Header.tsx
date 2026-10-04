'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { User, Settings, LogOut, ShieldCheck, Menu, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';

export default function Header() {
  const auth = useAuth() as any;
  const user = auth?.user;
  const profile = auth?.profile;
  const roles = auth?.roles || profile?.roles || user?.user_metadata?.roles || [];
  const isLoading = auth?.isLoading;
  const signOut = auth?.signOut;

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const pathname = usePathname() || '';
  const profileRef = useRef<HTMLDivElement | null>(null);
  const siteMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (siteMenuRef.current && !siteMenuRef.current.contains(event.target as Node)) {
        setIsSiteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsProfileOpen(false);
    setIsSiteMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const userId = user?.id || profile?.id || '';
  const profileHref = userId ? `/you/${userId}` : '/profile';
  
  const userImage = profile?.image || profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const userName = profile?.name || profile?.full_name || user?.user_metadata?.name || user?.email || 'Guest';
  const userInitials = userName ? userName.substring(0, 2).toUpperCase() : 'AM';
  
  const isAdmin = Array.isArray(roles) && roles.includes('ADMIN');

  const isOwner = !user || userName.toLowerCase().includes('merkurov') || userName.toLowerCase().includes('антон');
  const brandDisplay = isOwner ? 'Merkurov' : (userName.split(' ').slice(-1)[0] || userName);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-md transition-all">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-10 h-24 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND / SURNAME */}
          <div className="flex items-center gap-5">
            
            {/* 1. АВАТАР И ПОЛЬЗОВАТЕЛЬСКОЕ МЕНЮ */}
            <div className="relative" ref={profileRef}>
              {isLoading ? (
                <div className="w-12 h-12 rounded-full bg-zinc-200/50 animate-pulse" />
              ) : user ? (
                <button
                  type="button"
                  onClick={() => { setIsProfileOpen(!isProfileOpen); setIsSiteMenuOpen(false); }}
                  className="w-12 h-12 rounded-full overflow-hidden bg-zinc-900 text-white font-medium text-sm flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  aria-label="User Menu"
                >
                  {userImage ? (
                    <img src={userImage} alt={userName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{userInitials}</span>
                  )}
                </button>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-mono uppercase tracking-wider hover:bg-zinc-800 transition-all shadow-sm"
                >
                  Sign In
                </Link>
              )}

              {/* Синхронизированное меню профиля */}
              <AnimatePresence>
                {isProfileOpen && user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-3 w-72 p-3 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-50 space-y-1.5 font-sans"
                  >
                    <Link 
                      href={profileHref} 
                      onClick={() => setIsProfileOpen(false)} 
                      className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-base font-serif text-zinc-800 hover:bg-zinc-100/80 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <User size={18} className="text-zinc-500" />
                        <span>Profile</span>
                      </div>
                      <ChevronRight size={16} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    <Link 
                      href="/profile" 
                      onClick={() => setIsProfileOpen(false)} 
                      className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-base font-serif text-zinc-800 hover:bg-zinc-100/80 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Settings size={18} className="text-zinc-500" />
                        <span>Settings</span>
                      </div>
                      <ChevronRight size={16} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    {isAdmin && (
                      <Link 
                        href="/admin" 
                        onClick={() => setIsProfileOpen(false)} 
                        className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-base font-serif text-pink-700 bg-pink-50/60 hover:bg-pink-100/60 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <ShieldCheck size={18} className="text-pink-600" />
                          <span>Admin Panel</span>
                        </div>
                        <ChevronRight size={16} className="text-pink-400 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    )}

                    <button 
                      onClick={() => { setIsProfileOpen(false); signOut?.(); }} 
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-base font-serif text-rose-600 hover:bg-rose-50 transition-all cursor-pointer text-left"
                    >
                      <LogOut size={18} className="text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2. НАЗВАНИЕ / ФАМИЛИЯ С РАМКОЙ И УВЕЛИЧЕННЫМ ШРИФТОМ */}
            <div className="relative" ref={siteMenuRef}>
              <button
                type="button"
                onClick={() => { setIsSiteMenuOpen(!isSiteMenuOpen); setIsProfileOpen(false); }}
                className="bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-zinc-200/80 shadow-sm font-sans font-bold text-lg tracking-[0.2em] uppercase text-zinc-900 hover:border-zinc-400 transition-all cursor-pointer flex items-center gap-3"
              >
                <span>{brandDisplay}</span>
                <span className="text-xs font-mono text-zinc-400">▼</span>
              </button>

              {/* Синхронизированное меню сайта */}
              <AnimatePresence>
                {isSiteMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-3 w-84 p-5 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 space-y-5 font-sans"
                  >
                    {/* LOBBY */}
                    <div className="space-y-1.5">
                      <Link
                        href="/lobby"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-serif text-lg font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
                      >
                        LOBBY
                      </Link>
                      <div className="pl-4 space-y-1 border-l border-zinc-200 text-sm text-zinc-600">
                        <Link href="/about" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">about</Link>
                        <Link href="/advising" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">advising</Link>
                        <Link href="/unframed" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">unframed</Link>
                        <Link href="/journal" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">journal</Link>
                      </div>
                    </div>

                    {/* CURATORS ENGINE */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                      <Link
                        href="/art-engine"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-serif text-lg font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
                      >
                        CURATORS ENGINE
                      </Link>
                      <div className="pl-4 space-y-1 border-l border-zinc-200 text-sm text-zinc-600">
                        <Link href="/selection" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">selection</Link>
                      </div>
                    </div>

                    {/* HEART & ANGEL */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                      <Link
                        href="/heartandangel"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-serif text-lg font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
                      >
                        HEART &amp; ANGEL
                      </Link>
                      <div className="pl-4 space-y-1 border-l border-zinc-200 text-sm text-zinc-600">
                        <Link href="/heartandangel/calm/" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">calm</Link>
                        <Link href="/heartandangel/letitgo/" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-zinc-900 py-1 transition-colors">let it go</Link>
                      </div>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* MOBILE MENU TOGGLE BUTTON */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-3 rounded-full bg-white/90 backdrop-blur-md border border-zinc-200 text-zinc-800 hover:bg-zinc-100 transition-colors shadow-sm"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

        </div>
      </header>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-24 bg-white/95 backdrop-blur-3xl border-b border-zinc-200 shadow-2xl z-40 p-6 lg:hidden space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto font-sans text-base"
          >
            <div className="space-y-5">
              <div>
                <Link href="/lobby" onClick={() => setIsMobileMenuOpen(false)} className="block font-serif text-lg font-medium text-zinc-900">Lobby</Link>
                <div className="pl-4 space-y-2 text-sm text-zinc-600 border-l border-zinc-200 mt-2">
                  <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className="block">about</Link>
                  <Link href="/advising" onClick={() => setIsMobileMenuOpen(false)} className="block">advising</Link>
                  <Link href="/unframed" onClick={() => setIsMobileMenuOpen(false)} className="block">unframed</Link>
                  <Link href="/journal" onClick={() => setIsMobileMenuOpen(false)} className="block">journal</Link>
                </div>
              </div>

              <div>
                <Link href="/art-engine" onClick={() => setIsMobileMenuOpen(false)} className="block font-serif text-lg font-medium text-zinc-900">Curators Engine</Link>
                <div className="pl-4 space-y-2 text-sm text-zinc-600 border-l border-zinc-200 mt-2">
                  <Link href="/selection" onClick={() => setIsMobileMenuOpen(false)} className="block">selection</Link>
                </div>
              </div>

              <div>
                <Link href="/heartandangel" onClick={() => setIsMobileMenuOpen(false)} className="block font-serif text-lg font-medium text-zinc-900">Heart &amp; Angel</Link>
                <div className="pl-4 space-y-2 text-sm text-zinc-600 border-l border-zinc-200 mt-2">
                  <Link href="/heartandangel/calm/" onClick={() => setIsMobileMenuOpen(false)} className="block">calm</Link>
                  <Link href="/heartandangel/letitgo/" onClick={() => setIsMobileMenuOpen(false)} className="block">let it go</Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
