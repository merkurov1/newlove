'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, User, Settings, LogOut, ShieldCheck, ScanFace, Flame, Trash2, ReceiptText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';

interface HeaderProps {
  currentMode?: 'merkurov' | 'temple';
  onModeChange?: (mode: 'merkurov' | 'temple') => void;
  activeTempleView?: string;
  onTempleViewChange?: (view: any) => void;
}

export default function Header({ 
  currentMode = 'merkurov', 
  onModeChange,
  activeTempleView = 'WALL',
  onTempleViewChange 
}: HeaderProps) {
  const { user, profile, roles, isLoading, signOut, signInWithGoogle } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const pathname = usePathname() || '';

  useEffect(() => {
    setIsMenuOpen(false);
    setIsProfileOpen(false);
  }, [pathname]);

  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';
  const userImage =
    profile?.image ||
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    (user as any)?.image ||
    null;
  const userName = profile?.name || user?.user_metadata?.name || user?.email || 'Guest';
  const userInitials = userName ? userName.substring(0, 2).toUpperCase() : 'AM';

  const roleNorm = (Array.isArray(roles) && roles.length) ? roles[0] : ((user as any)?.role ? String((user as any).role).toUpperCase() : 'USER');
  const isAdmin = roleNorm === 'ADMIN';

  const navLinks = [
    { name: 'Art', href: '/heartandangel' },
    { name: 'Selection', href: '/selection' },
    { name: 'Advising', href: '/advising' },
    { name: 'About', href: '/isakeyforall' },
    { name: 'Journal', href: '/journal' },
  ];

  const templeNavItems = [
    { id: 'CAST', label: 'Cast', icon: ScanFace, color: 'text-indigo-600' },
    { id: 'ASH', label: 'Ash', icon: Trash2, color: 'text-rose-600' },
    { id: 'VIGIL', label: 'Vigil', icon: Flame, color: 'text-amber-600' },
    { id: 'DEBT', label: 'Debt', icon: ReceiptText, color: 'text-emerald-600' },
  ];

  const handleModeSwitch = (mode: 'merkurov' | 'temple') => {
    if (onModeChange) {
      onModeChange(mode);
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-b border-zinc-200/60 shadow-[0_4px_30px_rgba(0,0,0,0.02)] transition-all duration-300">
        <div className="max-w-[1800px] mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND / MODE SWITCHER */}
          <div className="flex items-center gap-5">
            {/* User Avatar */}
            <div className="relative">
              {isLoading ? (
                <div className="w-11 h-11 rounded-full bg-zinc-200 animate-pulse" />
              ) : user ? (
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-tr from-zinc-900 to-zinc-700 text-white font-medium text-base flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  {userImage ? (
                    <img src={userImage} alt={userName} className="w-full h-full object-cover" />
                  ) : (
                    <span>{userInitials}</span>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => signInWithGoogle()}
                  className="px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-mono tracking-wider uppercase hover:bg-zinc-800 transition-all shadow-sm"
                >
                  Sign In
                </button>
              )}

              {/* Profile Popover */}
              <AnimatePresence>
                {isProfileOpen && user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 mt-3 w-64 p-4 rounded-3xl bg-white/95 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 space-y-3"
                  >
                    <div className="flex items-center gap-3 pb-3 border-b border-zinc-200/50">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 text-white font-medium flex items-center justify-center text-sm shadow-inner flex-shrink-0">
                        {userImage ? (
                          <img src={userImage} alt={userName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{userInitials}</span>
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-sm font-semibold text-zinc-900 truncate">{userName}</div>
                        <div className="text-xs text-zinc-500 font-mono truncate">{user.email}</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Link
                        href={profileHref}
                        onClick={() => setIsProfileOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-all"
                      >
                        <User size={15} className="text-zinc-500" />
                        Profile & Archetype
                      </Link>
                      <Link
                        href="/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-all"
                      >
                        <Settings size={15} className="text-zinc-500" />
                        Settings
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setIsProfileOpen(false)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-pink-700 bg-pink-50 hover:bg-pink-100 transition-all"
                        >
                          <ShieldCheck size={15} className="text-pink-600" />
                          Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setIsProfileOpen(false);
                          signOut();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-rose-600 hover:bg-rose-50/60 transition-all"
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* MERKUROV & Digital Temple Switcher */}
            <div className="flex items-center gap-4 pl-4 border-l border-zinc-200">
              <button
                onClick={() => handleModeSwitch('merkurov')}
                className="font-sans font-bold text-base md:text-lg tracking-[0.2em] uppercase text-zinc-900 hover:opacity-60 transition-opacity text-left"
              >
                Merkurov
              </button>

              {onModeChange && (
                <button
                  onClick={() => handleModeSwitch(currentMode === 'merkurov' ? 'temple' : 'merkurov')}
                  className={`text-xs font-mono uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all border ${
                    currentMode === 'temple'
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200/70'
                  }`}
                >
                  {currentMode === 'temple' ? 'Archive' : 'Digital Temple'}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: DESKTOP NAV (Merkurov links OR Temple Ritual Icons) */}
          <nav role="navigation" className="hidden lg:flex items-center gap-6">
            {currentMode === 'merkurov' ? (
              navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`text-sm font-mono uppercase tracking-[0.15em] transition-all duration-300 ${
                    (pathname?.startsWith(link.href) ?? false)
                      ? 'text-zinc-900 font-bold border-b border-zinc-900 pb-0.5'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {link.name}
                </Link>
              ))
            ) : (
              <div className="flex items-center gap-3">
                {templeNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTempleView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTempleViewChange && onTempleViewChange(isActive ? 'WALL' : item.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wider transition-all border ${
                        isActive
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
                          : 'bg-white/60 text-zinc-700 border-zinc-200 hover:bg-white'
                      }`}
                    >
                      <Icon size={15} className={isActive ? 'text-white' : item.color} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </nav>

          {/* MOBILE BURGER */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden z-50 p-2 text-zinc-900"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* MOBILE MENU */}
      <div
        id="mobile-menu"
        aria-hidden={!isMenuOpen}
        className={`fixed inset-0 z-40 bg-white/95 backdrop-blur-3xl transform transition-transform duration-500 ease-in-out lg:hidden flex flex-col items-center justify-center ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          {onModeChange && (
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { handleModeSwitch('merkurov'); setIsMenuOpen(false); }}
                className={`px-5 py-2 rounded-full text-xs font-mono uppercase ${currentMode === 'merkurov' ? 'bg-zinc-900 text-white font-bold' : 'bg-zinc-100 text-zinc-600'}`}
              >
                Merkurov
              </button>
              <button
                onClick={() => { handleModeSwitch('temple'); setIsMenuOpen(false); }}
                className={`px-5 py-2 rounded-full text-xs font-mono uppercase ${currentMode === 'temple' ? 'bg-zinc-900 text-white font-bold' : 'bg-zinc-100 text-zinc-600'}`}
              >
                Digital Temple
              </button>
            </div>
          )}

          {currentMode === 'merkurov' ? (
            navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="text-2xl font-serif text-zinc-900 hover:text-zinc-600 transition-colors"
              >
                {link.name}
              </Link>
            ))
          ) : (
            <div className="flex flex-col gap-3 w-64">
              {templeNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onTempleViewChange && onTempleViewChange(item.id); setIsMenuOpen(false); }}
                  className="py-3 px-4 rounded-2xl bg-zinc-100 text-zinc-900 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
