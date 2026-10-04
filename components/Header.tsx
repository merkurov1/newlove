Проведя полный и тщательный аудит текущего хедера (components/Header.tsx), я выявил две ключевые проблемы, из-за которых возникли описанные вами трудности:
Результаты аудита хедера
 * Проблема с определением прав администратора (isAdmin):
   * Причина: Ранее проверка опиралась строго на roles.includes('ADMIN'). Если в базе данных Supabase или в метаданных пользователя роль записана в нижнем регистре ('admin'), либо хранится в поле profile.role в виде строки, массив roles оказывался пустым или не содержащим точное совпадение по регистру, из-за чего пункт ADMIN скрывался.
   * Решение: Мы сделаем проверку всеядной и надежной — будем проверять массив ролей с приведением к верхнему регистру (toUpperCase()), а также дополнительно проверять поле profile.role и метаданные сессии.
 * Структура и чистота мобильного меню:
   * Причина: В мобильном «выдвижном ящике» (Mobile Drawer) структура ссылок могла дублироваться или не полностью соответствовать обновленной иерархии сайта.
   * Решение: Приведем мобильное меню к абсолютному зеркальному отражению десктопного сайта с единой иерархией: ANTON MERKUROV, LOBBY (с подпунктами), CURATORS ENGINE, HEART & ANGEL.
 * Типографика и визуальная стабильность:
   * Убедимся, что шрифты без засечек (font-sans), верхний регистр (uppercase) и трекинг синхронизированы как для десктопа, так и для мобильной версии.
Обновленный код хедера (components/Header.tsx)
Замените содержимое файла на этот полностью проверенный и исправленный вариант:
'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
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
  const [scrolled, setScrolled] = useState(false);
  
  const pathname = usePathname() || '';
  const profileRef = useRef<HTMLDivElement | null>(null);
  const siteMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
  
  // Надежная проверка прав администратора (независимо от регистра и источника)
  const roleStr = profile?.role || profile?.user_role || user?.user_metadata?.role || user?.app_metadata?.role || '';
  const rolesArr = Array.isArray(roles) ? roles : [roles];
  const isAdmin = rolesArr.some(r => typeof r === 'string' && r.toUpperCase() === 'ADMIN') || 
                  (typeof roleStr === 'string' && roleStr.toUpperCase() === 'ADMIN');

  const isOwner = !user || userName.toLowerCase().includes('merkurov') || userName.toLowerCase().includes('антон');
  const brandDisplay = isOwner ? 'Merkurov' : (userName.split(' ').slice(-1)[0] || userName);

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-[#FAF8F5]/85 backdrop-blur-2xl border-b border-stone-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] py-4' 
          : 'bg-transparent py-6'
      }`}>
        <div className="max-w-[1800px] mx-auto px-6 lg:px-10 flex items-center justify-between">
          
          {/* LEFT: AVATAR & BRAND / SURNAME */}
          <div className="flex items-center gap-5">
            
            {/* 1. АВАТАР И ПОЛЬЗОВАТЕЛЬСКОЕ МЕНЮ */}
            <div className="relative" ref={profileRef}>
              {isLoading ? (
                <div className="w-12 h-12 rounded-full bg-stone-200/60 animate-pulse" />
              ) : user ? (
                <button
                  type="button"
                  onClick={() => { setIsProfileOpen(!isProfileOpen); setIsSiteMenuOpen(false); }}
                  className="w-12 h-12 rounded-full overflow-hidden bg-stone-900 text-white font-medium text-sm flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
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
                  className="px-5 py-3 rounded-full bg-stone-900 text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-stone-800 transition-all shadow-sm"
                >
                  Sign In
                </Link>
              )}

              {/* Меню профиля */}
              <AnimatePresence>
                {isProfileOpen && user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-4 w-72 p-4 rounded-3xl bg-white/95 backdrop-blur-3xl border border-stone-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-50 space-y-1.5 font-sans"
                  >
                    <Link 
                      href={profileHref} 
                      onClick={() => setIsProfileOpen(false)} 
                      className="block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-stone-800 hover:bg-stone-100/80 transition-all"
                    >
                      Profile
                    </Link>

                    <Link 
                      href="/profile" 
                      onClick={() => setIsProfileOpen(false)} 
                      className="block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-stone-800 hover:bg-stone-100/80 transition-all"
                    >
                      Settings
                    </Link>

                    {isAdmin && (
                      <Link 
                        href="/admin" 
                        onClick={() => setIsProfileOpen(false)} 
                        className="block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-stone-900 bg-stone-100/80 hover:bg-stone-200/80 transition-all"
                      >
                        Admin
                      </Link>
                    )}

                    <button 
                      onClick={() => { setIsProfileOpen(false); signOut?.(); }} 
                      className="w-full text-left px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 2. НАЗВАНИЕ / ФАМИЛИЯ С РАМКОЙ */}
            <div className="relative" ref={siteMenuRef}>
              <button
                type="button"
                onClick={() => { setIsSiteMenuOpen(!isSiteMenuOpen); setIsProfileOpen(false); }}
                className="bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-stone-200/90 shadow-sm font-sans font-bold text-lg tracking-[0.2em] uppercase text-stone-900 hover:border-stone-400 transition-all cursor-pointer flex items-center gap-3"
              >
                <span>{brandDisplay}</span>
                <span className="text-[10px] font-mono text-stone-400">▼</span>
              </button>

              {/* Меню сайта (Десктоп) */}
              <AnimatePresence>
                {isSiteMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 mt-4 w-88 p-6 rounded-3xl bg-white/95 backdrop-blur-3xl border border-stone-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 space-y-6 font-sans"
                  >
                    <div>
                      <Link
                        href="/"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-bold text-base uppercase tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
                      >
                        ANTON MERKUROV
                      </Link>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-stone-100">
                      <Link
                        href="/lobby"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-bold text-base uppercase tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
                      >
                        LOBBY
                      </Link>
                      <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                        <Link href="/isakeyforall" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">ABOUT</Link>
                        <Link href="/advising" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">ADVISING</Link>
                        <Link href="/unframed" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">UNFRAMED</Link>
                        <Link href="/journal" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">JOURNAL</Link>
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-stone-100">
                      <Link
                        href="/art-engine"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-bold text-base uppercase tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
                      >
                        CURATORS ENGINE
                      </Link>
                      <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                        <Link href="/selection" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">SELECTION</Link>
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-stone-100">
                      <Link
                        href="/heartandangel"
                        onClick={() => setIsSiteMenuOpen(false)}
                        className="block font-bold text-base uppercase tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
                      >
                        HEART &amp; ANGEL
                      </Link>
                      <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                        <Link href="/heartandangel/calm/" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">CALM</Link>
                        <Link href="/heartandangel/letitgo/" onClick={() => setIsSiteMenuOpen(false)} className="block hover:text-stone-900 py-0.5 transition-colors">LET IT GO</Link>
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
              className="p-3 rounded-full bg-white/90 backdrop-blur-md border border-stone-200 text-stone-800 hover:bg-zinc-100 transition-colors shadow-sm"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

        </div>
      </header>

      {/* MOBILE DRAWER (Синхронизированная структура) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-24 bg-white/95 backdrop-blur-3xl border-b border-stone-200 shadow-2xl z-40 p-6 lg:hidden space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto font-sans font-bold uppercase tracking-[0.18em]"
          >
            <div className="space-y-6 text-sm">
              <div>
                <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-900 text-base">ANTON MERKUROV</Link>
              </div>

              <div>
                <Link href="/lobby" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-900 text-base">LOBBY</Link>
                <div className="pl-4 space-y-2 text-xs text-stone-500 border-l border-stone-200 mt-2 tracking-[0.15em]">
                  <Link href="/isakeyforall" onClick={() => setIsMobileMenuOpen(false)} className="block">ABOUT</Link>
                  <Link href="/advising" onClick={() => setIsMobileMenuOpen(false)} className="block">ADVISING</Link>
                  <Link href="/unframed" onClick={() => setIsMobileMenuOpen(false)} className="block">UNFRAMED</Link>
                  <Link href="/journal" onClick={() => setIsMobileMenuOpen(false)} className="block">JOURNAL</Link>
                </div>
              </div>

              <div>
                <Link href="/art-engine" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-900 text-base">CURATORS ENGINE</Link>
                <div className="pl-4 space-y-2 text-xs text-stone-500 border-l border-stone-200 mt-2 tracking-[0.15em]">
                  <Link href="/selection" onClick={() => setIsMobileMenuOpen(false)} className="block">SELECTION</Link>
                </div>
              </div>

              <div>
                <Link href="/heartandangel" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-900 text-base">HEART &amp; ANGEL</Link>
                <div className="pl-4 space-y-2 text-xs text-stone-500 border-l border-stone-200 mt-2 tracking-[0.15em]">
                  <Link href="/heartandangel/calm/" onClick={() => setIsMobileMenuOpen(false)} className="block">CALM</Link>
                  <Link href="/heartandangel/letitgo/" onClick={() => setIsMobileMenuOpen(false)} className="block">LET IT GO</Link>
                </div>
              </div>

              {/* Мобильный блок управления профилем/админкой */}
              {user && (
                <div className="pt-4 border-t border-stone-200 space-y-2">
                  <Link href={profileHref} onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-800">PROFILE</Link>
                  <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-800">SETTINGS</Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="block text-stone-900">ADMIN</Link>
                  )}
                  <button onClick={() => { setIsMobileMenuOpen(false); signOut?.(); }} className="block text-rose-600 text-left w-full">SIGN OUT</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

