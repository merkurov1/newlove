'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { User, Settings, LogOut, ShieldCheck, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';

export default function Header() {
  const { user, profile, roles, isLoading, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeEcosystem, setActiveEcosystem] = useState<'merkurov' | 'temple' | 'curators' | 'heart'>('merkurov');
  
  const pathname = usePathname() || '';

  useEffect(() => {
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    if (pathname.startsWith('/temple') || pathname.startsWith('/cast') || pathname.startsWith('/vigil') || pathname.startsWith('/absolution')) {
      setActiveEcosystem('temple');
    } else if (pathname.startsWith('/art-engine') || pathname.startsWith('/selection')) {
      setActiveEcosystem('curators');
    } else if (pathname.startsWith('/heartandangel')) {
      setActiveEcosystem('heart');
    } else {
      setActiveEcosystem('merkurov');
    }
  }, [pathname]);

  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';
  const userImage = profile?.image || profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const userName = profile?.name || user?.user_metadata?.name || user?.email || 'Guest';
  const userInitials = userName ? userName.substring(0, 2).toUpperCase() : 'AM';
  const isAdmin = roles.includes('ADMIN');

  const ecosystems = [
    { 
      id: 'merkurov', 
      label: 'Merkurov', 
      mainHref: '/lobby',
      links: [
        { name: 'Lobby', href: '/lobby' },
        { name: 'About', href: '/isakeyforall' },
        { name: 'Advising', href: '/advising' },
        { name: 'Unframed', href: '/unframed' },
        { name: 'Journal', href: '/journal' }
      ]
    },
    { 
      id: 'temple', 
      label: 'Digital Temple', 
      mainHref: '/temple',
      links: [
        { name: 'Temple', href: '/temple' },
        { name: 'Cast', href: '/cast' },
        { name: 'Vigil', href: '/vigil' },
        { name: 'Absolution', href: '/absolution' }
      ]
    },
    { 
      id: 'curators', 
      label: 'Curators Engine', 
      mainHref: '/art-engine',
      links: [
        { name: 'Art Engine', href: '/art-engine' },
        { name: 'Selection', href: '/selection' }
      ]
    },
    { 
      id: 'heart', 
      label: 'Heart & Angel', 
      mainHref: '/heartandangel',
      links: [
        { name: 'Let It Go', href: '/heartandangel/letitgo' },
        { name: 'Keep Calm', href: '/heartandangel/calm' }
      ]
    }
  ];

  const currentEco = ecosystems.find(e => e.id === activeEcosystem) || ecosystems[0];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-b border-zinc-200/60 shadow-[0_4px_30px_rgba(0,0,0,0.02)] transition-all">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-10 h-24 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND */}
          <div className="flex items-center gap-5">
            <div className="relative">
              {isLoading ? (
                <div className="w-12 h-12 rounded-full bg-zinc-200 animate-pulse" />
              ) : user ? (
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-12 h-12 rounded-full overflow-hidden bg-zinc-900 text-white font-medium text-sm flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 transition-all"
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

              {/* Profile Popover */}
              <AnimatePresence>
                {isProfileOpen && user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute left-0 mt-3 w-72 p-5 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 space-y-4"
                  >
                    <div className="flex items-center gap-3.5 pb-3.5 border-b border-zinc-200/50">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-900 text-white font-medium flex items-center justify-center text-sm">
                        {userImage ? <img src={userImage} alt={userName} className="w-full h-full object-cover" /> : <span>{userInitials}</span>}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-sm font-semibold text-zinc-900 truncate">{userName}</div>
                        <div className="text-xs text-zinc-500 font-mono truncate">{user.email}</div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Link href={profileHref} onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-zinc-100">
                        <User size={16} className="text-zinc-500" /> Profile & Archetype
                      </Link>
                      <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-zinc-100">
                        <Settings size={16} className="text-zinc-500" /> Settings
                      </Link>
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-pink-700 bg-pink-50">
                          <ShieldCheck size={16} className="text-pink-600" /> Admin Panel
                        </Link>
                      )}
                      <button onClick={() => { setIsProfileOpen(false); signOut(); }} className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-rose-600 hover:bg-rose-50">
                        <LogOut size={16} /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/" className="font-sans font-bold text-lg tracking-[0.2em] uppercase text-zinc-900">
              Merkurov
            </Link>
          </div>

          {/* DESKTOP ECOSYSTEM SWITCHER & SUB-LINKS */}
          <div className="hidden lg:flex items-center gap-8">
            
            {/* Ecosystem Switcher Capsule */}
            <div className="flex items-center bg-zinc-100 p-1.5 rounded-full border border-zinc-200/60 font-mono text-xs uppercase tracking-wider">
              {ecosystems.slice(1).map((eco) => (
                <Link
                  key={eco.id}
                  href={eco.mainHref}
                  className={`px-5 py-2 rounded-full transition-all ${activeEcosystem === eco.id ? 'bg-zinc-900 text-white shadow-sm font-semibold' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {eco.label}
                </Link>
              ))}
            </div>

            {/* Divider */}
            {currentEco.links.length > 0 && <div className="w-[1px] h-6 bg-zinc-200" />}

            {/* Current Ecosystem Sub-Links */}
            {currentEco.links.length > 0 && (
              <nav className="flex items-center gap-6">
                {currentEco.links.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`text-sm font-mono uppercase tracking-[0.15s] transition-colors ${pathname === link.href ? 'text-zinc-900 font-bold underline underline-offset-4' : 'text-zinc-400 hover:text-zinc-900'}`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            )}
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
            <div className="grid grid-cols-1 gap-2.5 font-mono text-sm uppercase tracking-wider">
              {ecosystems.map((eco) => (
                <Link
                  key={eco.id}
                  href={eco.mainHref}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-4 rounded-2xl text-left transition-all border flex items-center justify-between ${activeEcosystem === eco.id ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm font-bold' : 'bg-zinc-50 text-zinc-700 border-zinc-200'}`}
                >
                  <span>{eco.label}</span>
                </Link>
              ))}
            </div>

            {currentEco.links.length > 0 && (
              <div className="border-t border-zinc-100 pt-5 space-y-2.5">
                <div className="font-mono text-xs uppercase text-zinc-400 tracking-wider mb-3">
                  Projects in {currentEco.label}:
                </div>
                {currentEco.links.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block p-3.5 rounded-2xl text-base font-medium transition-colors ${pathname === link.href ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-50 text-zinc-800 hover:bg-zinc-100'}`}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
