'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { User, Settings, LogOut, ShieldCheck, Menu, X, ChevronRight, Compass, Heart, BookOpen } from 'lucide-react';
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

  // Закрытие выпадающих меню при клике вне их областей
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

  // Определяем, владелец ли сайта (Антон Меркуров) или сторонний пользователь
  const isOwner = !user || userName.toLowerCase().includes('merkurov') || userName.toLowerCase().includes('антон');
  const brandDisplay = isOwner ? 'Merkurov' : (userName.split(' ').slice(-1)[0] || userName);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-b border-zinc-200/60 shadow-[0_4px_30px_rgba(0,0,0,0.02)] transition-all">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-10 h-24 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND / SURNAME */}
          <div className="flex items-center gap-5">
            
            {/* 1. АВАТАР И ПОЛЬЗОВАТЕЛЬСКОЕ МЕНЮ */}
            <div className="relative" ref={profileRef}>
              {isLoading ? (
                <div className="w-12 h-12 rounded-full bg-zinc-200 animate-pulse" />
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
                  className="px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-mono uppercase tracking-wider hover:bg-zinc-800 transition-all shadow-sm"
                >
                  Sign In
                </Link>
              )}

              {/* Ультра-лаконичное меню профиля (без дублирования аватара/почты и без линий) */}
              <AnimatePresence>
                {isProfileOpen && user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-3 w-64 p-2 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-50 space-y-1"
                  >
                    <Link 
                      href={profileHref} 
                      onClick={() => setIsProfileOpen(false)} 
                      className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-zinc-100/80 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <User size={16} className="text-zinc-500" />
                        <span>Profile</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    <Link 
                      href="/profile" 
                      onClick={() => setIsProfileOpen(false)} 
                      className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-zinc-100/80 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Settings size={16} className="text-zinc-500" />
                        <span>Settings</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    {isAdmin && (
                      <Link 
                        href="/admin" 
                        onClick={() => setIsProfileOpen(false)} 
                        className="group w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-pink-700 bg-pink-50/60 hover:bg-pink-100/60 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <ShieldCheck size={16} className="text-pink-600" />
                          <span>Admin Panel</span>
                        </div>
                        <ChevronRight size={14} className="text-pink-400 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    )}

                    <button 
                      onClick={() => { setIsProfileOpen(false); signOut?.(); }} 
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-all cursor-pointer text-left"
                    >
                      <LogOut size={16} className="text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2. НАЗВАНИЕ / ФАМИЛИЯ И НАВИГАЦИОННОЕ МЕНЮ САЙТА */}
            <div className="relative" ref={siteMenuRef}>
              <button
                type="button"
                onClick={() => { setIsSiteMenuOpen(!isSiteMenuOpen); setIsProfileOpen(false); }}
                className="font-sans font-bold text-lg tracking-[0.2em] uppercase text-zinc-900 hover:opacity-70 transition-opacity cursor-pointer flex items-center gap-2"
              >
                <span>{brandDisplay}</span>
                <span className="text-xs font-mono text-zinc-400 font-normal">▼</span>
              </button>

              {/* Лаконичное выпадающее меню сайта */}
              <AnimatePresence>
                {isSiteMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-4 w-80 p-4 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 space-y-6"
                  >
                    {/* Главные рубрики */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 px-3">Lobby &amp; Essays</div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { name: 'Lobby', href: '/lobby' },
                          { name: 'About', href: '/isakeyforall' },
                          { name: 'Advising', href: '/advising' },
                          { name: 'Unframed', href: '/unframed' },
                          { name: 'Journal', href: '/journal' }
                        ].map((item) => (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsSiteMenuOpen(false)}
                            className="px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Curators Engine */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 px-3 flex items-center gap-1.5">
                        <Compass size={12} />
                        <span>Curators Engine</span>
                      </div>
                      <div className="space-y-1">
                        <Link
                          href="/art-engine"
                          onClick={() => setIsSiteMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Art Engine Hub
                        </Link>
                        <Link
                          href="/selection"
                          onClick={() => setIsSiteMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Selection
                        </Link>
                      </div>
                    </div>

                    {/* Heart & Angel */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 px-3 flex items-center gap-1.5">
                        <Heart size={12} />
                        <span>Heart &amp; Angel</span>
                      </div>
                      <div className="space-y-1">
                        <Link
                          href="/heartandangel/world"
                          onClick={() => setIsSiteMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Sanctuary World
                        </Link>
                        <Link
                          href="/heartandangel/calm"
                          onClick={() => setIsSiteMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Calm
                        </Link>
                        <Link
                          href="/heartandangel/letitgo"
                          onClick={() => setIsSiteMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          Let It Go
                        </Link>
                      </div>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* DESKTOP QUICK LINKS */}
          <div className="hidden lg:flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-zinc-500">
            <Link href="/lobby" className="hover:text-zinc-900 transition-colors">Lobby</Link>
            <Link href="/art-engine" className="hover:text-zinc-900 transition-colors">Curators Engine</Link>
            <Link href="/heartandangel/world" className="hover:text-zinc-900 transition-colors">Heart &amp; Angel</Link>
          </div>

          {/* MOBILE MENU TOGGLE BUTTON */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-3 rounded-full bg-zinc-100 text-zinc-800 hover:bg-zinc-200 transition-colors"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
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
            className="fixed inset-x-0 top-24 bg-white/95 backdrop-blur-3xl border-b border-zinc-200 shadow-2xl z-40 p-6 lg:hidden space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto"
          >
            <div className="space-y-4 font-mono text-sm uppercase tracking-wider">
              <div className="text-xs text-zinc-400">Main Navigation</div>
              <div className="grid grid-cols-1 gap-2">
                <Link href="/lobby" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Lobby</Link>
                <Link href="/art-engine" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Curators Engine</Link>
                <Link href="/selection" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Selection</Link>
                <Link href="/heartandangel/world" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Heart &amp; Angel World</Link>
                <Link href="/heartandangel/calm" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Calm</Link>
                <Link href="/heartandangel/letitgo" onClick={() => setIsMobileMenuOpen(false)} className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-800">Let It Go</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
