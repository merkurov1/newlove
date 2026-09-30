'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { User, Settings, LogOut, ShieldCheck, Menu, X, ScanFace, Flame, Trash2, ReceiptText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';

export default function Header() {
  const { user, profile, roles, isLoading, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeEcosystem, setActiveEcosystem] = useState<'merkurov' | 'temple' | 'art' | 'heart'>('merkurov');
  
  const pathname = usePathname() || '';
  const router = useRouter();

  const isTemplePage = pathname.startsWith('/temple');
  const isCastPage = pathname.startsWith('/cast');

  useEffect(() => {
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    if (isTemplePage || isCastPage) setActiveEcosystem('temple');
    else if (pathname.startsWith('/selection') || pathname.startsWith('/heartandangel')) setActiveEcosystem('art');
  }, [pathname, isTemplePage, isCastPage]);

  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';
  const userImage = profile?.image || profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const userName = profile?.name || user?.user_metadata?.name || user?.email || 'Guest';
  const userInitials = userName ? userName.substring(0, 2).toUpperCase() : 'AM';
  const isAdmin = roles.includes('ADMIN');

  // Экосистемное меню
  const ecosystems = [
    { id: 'merkurov', label: 'Merkurov', links: [
      { name: 'Lobby', href: '/lobby' },
      { name: 'About', href: '/isakeyforall' },
      { name: 'Journal', href: '/journal' }
    ]},
    { id: 'temple', label: 'Digital Temple', links: [
      { name: 'Sanctuary', href: '/temple' },
      { name: 'Cast Protocol', href: '/cast' },
      { name: 'Vigil', href: '/temple' },
      { name: 'Ash', href: '/temple' }
    ]},
    { id: 'art', label: 'Art & Selection', links: [
      { name: 'Selection', href: '/selection' },
      { name: 'Curators Engine', href: '/selection' },
      { name: 'Advising', href: '/advising' }
    ]},
    { id: 'heart', label: 'Heart & Angel', links: [
      { name: 'Gallery', href: '/heartandangel' },
      { name: 'Let It Go', href: '/heartandangel' },
      { name: 'Calm', href: '/heartandangel' }
    ]}
  ];

  const currentEco = ecosystems.find(e => e.id === activeEcosystem) || ecosystems[0];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-b border-zinc-200/60 shadow-[0_4px_30px_rgba(0,0,0,0.02)] transition-all">
        <div className="max-w-[1800px] mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="relative">
              {isLoading ? (
                <div className="w-10 h-10 rounded-full bg-zinc-200 animate-pulse" />
              ) : user ? (
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 text-white font-medium text-xs flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 transition-all"
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
                  className="px-3.5 py-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-mono uppercase tracking-wider hover:bg-zinc-800 transition-all shadow-sm"
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
                    className="absolute left-0 mt-3 w-64 p-4 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 space-y-3"
                  >
                    <div className="flex items-center gap-3 pb-3 border-b border-zinc-200/50">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-900 text-white font-medium flex items-center justify-center text-xs">
                        {userImage ? <img src={userImage} alt={userName} className="w-full h-full object-cover" /> : <span>{userInitials}</span>}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-zinc-900 truncate">{userName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{user.email}</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Link href={profileHref} onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                        <User size={14} className="text-zinc-500" /> Profile & Archetype
                      </Link>
                      <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                        <Settings size={14} className="text-zinc-500" /> Settings
                      </Link>
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-pink-700 bg-pink-50">
                          <ShieldCheck size={14} className="text-pink-600" /> Admin Panel
                        </Link>
                      )}
                      <button onClick={() => { setIsProfileOpen(false); signOut(); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50">
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* BRAND */}
            <Link href="/" className="font-sans font-bold text-sm sm:text-base tracking-[0.2em] uppercase text-zinc-900">
              Merkurov
            </Link>
          </div>

          {/* DESKTOP ECOSYSTEM TABS & LINKS */}
          <div className="hidden lg:flex items-center gap-8">
            <div className="flex items-center bg-zinc-100 p-1 rounded-full border border-zinc-200/60 font-mono text-[11px] uppercase">
              {ecosystems.map((eco) => (
                <button
                  key={eco.id}
                  onClick={() => setActiveEcosystem(eco.id as any)}
                  className={`px-4 py-1.5 rounded-full transition-all ${activeEcosystem === eco.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {eco.label}
                </button>
              ))}
            </div>

            <nav className="flex items-center gap-5">
              {currentEco.links.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`text-xs font-mono uppercase tracking-[0.15s] transition-colors ${pathname === link.href ? 'text-zinc-900 font-bold underline underline-offset-4' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* MOBILE MENU TOGGLE BUTTON */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2.5 rounded-full bg-zinc-100 text-zinc-800 hover:bg-zinc-200 transition-colors"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
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
            className="fixed inset-x-0 top-20 bg-white/95 backdrop-blur-3xl border-b border-zinc-200 shadow-2xl z-40 p-6 lg:hidden space-y-6"
          >
            <div className="grid grid-cols-2 gap-2 font-mono text-xs uppercase">
              {ecosystems.map((eco) => (
                <button
                  key={eco.id}
                  onClick={() => setActiveEcosystem(eco.id as any)}
                  className={`p-3 rounded-2xl text-left transition-all border ${activeEcosystem === eco.id ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm' : 'bg-zinc-50 text-zinc-600 border-zinc-200'}`}
                >
                  {eco.label}
                </button>
              ))}
            </div>

            <div className="border-t border-zinc-100 pt-4 space-y-2">
              <div className="font-mono text-[10px] uppercase text-zinc-400 tracking-wider mb-2">Projects in {currentEco.label}:</div>
              {currentEco.links.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-sm font-medium text-zinc-800 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
