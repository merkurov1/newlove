'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';
import useIsTelegram from '@/components/useIsTelegram';
import ComposerTrigger from '@/components/flow/ComposerTrigger';

export default function Header() {
  const auth = useAuth() as any;
  const user = auth?.user;
  const profile = auth?.profile;
  const roles =
    auth?.roles ||
    profile?.roles ||
    user?.user_metadata?.roles ||
    [];
  const isLoading = auth?.isLoading;
  const signOut = auth?.signOut;

  const [isProfileOpen, setIsProfileOpen] =
    useState(false);
  const [isSiteMenuOpen, setIsSiteMenuOpen] =
    useState(false);
  const [scrolled, setScrolled] =
    useState(false);

  const telegramApp = useIsTelegram();

  const pathname =
    usePathname() || '';

  const normalizedPath =
    pathname.replace(/\/$/, '') || '/';

  /*
   * Heart & Angel / Temple is an immersive
   * sub-world of the site. These routes have
   * their own navigation (TempleTopBar) and
   * must not receive the global site Header.
   */
  const isImmersiveRoute =
    normalizedPath === '/temple' ||
    normalizedPath === '/cast' ||
    normalizedPath === '/vigil' ||
    normalizedPath === '/absolution' ||
    normalizedPath === '/tribute' ||
    normalizedPath === '/heartandangel/world' ||
    normalizedPath === '/heartandangel/calm' ||
    normalizedPath === '/heartandangel/letitgo';

  const profileRef =
    useRef<HTMLDivElement | null>(null);

  const siteMenuRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncIdentity = () => {
      const tgUser =
        (window as any).Telegram?.WebApp
          ?.initDataUnsafe?.user;

      const telegramName =
        tgUser?.username ||
        tgUser?.first_name;

      const profileName =
        profile?.name ||
        profile?.full_name ||
        user?.user_metadata?.name;

      const name =
        telegramName ||
        profileName;

      if (name) {
        localStorage.setItem(
          'temple_user',
          name,
        );
      }
    };

    syncIdentity();

    const timer =
      window.setInterval(
        syncIdentity,
        1000,
      );

    return () =>
      window.clearInterval(timer);
  }, [profile, user]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(
        window.scrollY > 10,
      );
    };

    window.addEventListener(
      'scroll',
      handleScroll,
    );

    return () =>
      window.removeEventListener(
        'scroll',
        handleScroll,
      );
  }, []);

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
        setIsSiteMenuOpen(false);
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () =>
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
  }, []);

  useEffect(() => {
    function handleClickOutside(
      event: MouseEvent,
    ) {
      if (
        profileRef.current &&
        !profileRef.current.contains(
          event.target as Node,
        )
      ) {
        setIsProfileOpen(false);
      }

      if (
        siteMenuRef.current &&
        !siteMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setIsSiteMenuOpen(false);
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    );

    return () =>
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      );
  }, []);

  useEffect(() => {
    setIsProfileOpen(false);
    setIsSiteMenuOpen(false);
  }, [pathname]);

  const userId =
    user?.id ||
    profile?.id ||
    '';

  const profileHref =
    profile?.username
      ? `/you/${encodeURIComponent(
          profile.username,
        )}`
      : userId
        ? `/you/${userId}`
        : '/profile';

  const userImage =
    profile?.image ||
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const userName =
    profile?.name ||
    profile?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    'Guest';

  const userInitials =
    userName
      ? userName
          .substring(0, 2)
          .toUpperCase()
      : 'AM';

  const roleStr =
    profile?.role ||
    profile?.user_role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    '';

  const rolesArr =
    Array.isArray(roles)
      ? roles
      : [roles];

  const isAdmin =
    user?.email ===
      'merkurov@gmail.com' ||
    rolesArr.some(
      (r) =>
        typeof r === 'string' &&
        r.toUpperCase() ===
          'ADMIN',
    ) ||
    (typeof roleStr === 'string' &&
      roleStr.toUpperCase() ===
        'ADMIN');

  const isOwner =
    !user ||
    userName
      .toLowerCase()
      .includes('merkurov') ||
    userName
      .toLowerCase()
      .includes('антон');

  const brandDisplay =
    isOwner
      ? 'Merkurov'
      : userName
          .split(' ')
          .slice(-1)[0] ||
        userName;

  /*
   * Immersive routes deliberately have no
   * global Header. Their own navigation lives
   * inside the experience.
   */
  if (
    telegramApp ||
    isImmersiveRoute
  ) {
    return null;
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#FAF8F5]/85 backdrop-blur-2xl border-b border-stone-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] py-4'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-[1800px] mx-auto px-6 lg:px-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
          <div
            className="relative shrink-0"
            ref={profileRef}
          >
            {isLoading ? (
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-stone-200/60 animate-pulse" />
            ) : user ? (
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(
                    !isProfileOpen,
                  );
                  setIsSiteMenuOpen(
                    false,
                  );
                }}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-stone-900 text-white font-medium text-sm flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                aria-label="User Menu"
                aria-expanded={
                  isProfileOpen
                }
                aria-controls="profile-menu"
                aria-haspopup="menu"
              >
                {userImage ? (
                  <img
                    src={userImage}
                    alt={userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>
                    {userInitials}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href="/login"
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-full bg-stone-900 text-white text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] hover:bg-stone-800 transition-all shadow-sm"
              >
                Sign In
              </Link>
            )}

            <AnimatePresence>
              {isProfileOpen &&
                user && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      scale: 0.96,
                      y: 8,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.96,
                      y: 8,
                    }}
                    transition={{
                      duration: 0.15,
                      ease: 'easeOut',
                    }}
                    id="profile-menu"
                    role="menu"
                    className="absolute left-0 mt-4 w-[calc(100vw-3rem)] max-w-[280px] p-4 rounded-3xl bg-white/95 backdrop-blur-3xl border border-stone-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-50 space-y-1.5 font-sans"
                  >
                    <div className="px-4 pb-3 mb-1 border-b border-stone-100">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {userName}
                      </p>

                      {user?.email && (
                        <p className="truncate text-[10px] font-mono tracking-wide text-stone-400">
                          {user.email}
                        </p>
                      )}
                    </div>

                    <Link
                      href={profileHref}
                      onClick={() =>
                        setIsProfileOpen(
                          false,
                        )
                      }
                      role="menuitem"
                      className={`block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs transition-all ${
                        normalizedPath.startsWith(
                          '/you/',
                        )
                          ? 'bg-stone-100 text-stone-900'
                          : 'text-stone-800 hover:bg-stone-100/80'
                      }`}
                    >
                      Profile
                    </Link>

                    <Link
                      href="/profile"
                      onClick={() =>
                        setIsProfileOpen(
                          false,
                        )
                      }
                      role="menuitem"
                      className={`block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs transition-all ${
                        normalizedPath ===
                        '/profile'
                          ? 'bg-stone-100 text-stone-900'
                          : 'text-stone-800 hover:bg-stone-100/80'
                      }`}
                    >
                      Settings
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() =>
                          setIsProfileOpen(
                            false,
                          )
                        }
                        role="menuitem"
                        className="block w-full px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-stone-900 bg-stone-100/80 hover:bg-stone-200/80 transition-all"
                      >
                        admin
                      </Link>
                    )}

                    <button
                      onClick={() => {
                        setIsProfileOpen(
                          false,
                        );
                        signOut?.();
                      }}
                      role="menuitem"
                      className="w-full text-left px-4 py-3 rounded-2xl font-bold uppercase tracking-[0.15em] text-xs text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </motion.div>
                )}
            </AnimatePresence>
          </div>

          <div
            className="relative min-w-0 flex-1 sm:flex-none"
            ref={siteMenuRef}
          >
            <button
              type="button"
              onClick={() => {
                setIsSiteMenuOpen(
                  !isSiteMenuOpen,
                );
                setIsProfileOpen(false);
              }}
              className="w-full sm:w-auto bg-white/90 backdrop-blur-md px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl border border-stone-200/90 shadow-sm font-sans font-bold text-base sm:text-lg tracking-[0.15em] sm:tracking-[0.2em] uppercase text-stone-900 hover:border-stone-400 transition-all cursor-pointer flex items-center justify-between sm:justify-start gap-3 truncate"
              aria-expanded={
                isSiteMenuOpen
              }
              aria-controls="site-menu"
              aria-haspopup="menu"
            >
              <span className="truncate">
                {brandDisplay}
              </span>

              <span className="text-[10px] font-mono text-stone-400 shrink-0">
                ▼
              </span>
            </button>

            <AnimatePresence>
              {isSiteMenuOpen && (
                <motion.div
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    y: 8,
                  }}
                  transition={{
                    duration: 0.15,
                    ease: 'easeOut',
                  }}
                  id="site-menu"
                  role="menu"
                  className="absolute left-0 mt-4 w-[calc(100vw-3rem)] max-w-sm sm:w-[22rem] p-5 sm:p-6 rounded-3xl bg-white/95 backdrop-blur-3xl border border-stone-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 space-y-5 sm:space-y-6 font-sans max-h-[75vh] overflow-y-auto"
                >
                  <div>
                    <Link
                      href="/"
                      onClick={() =>
                        setIsSiteMenuOpen(
                          false,
                        )
                      }
                      className="block font-bold text-sm sm:text-base uppercase tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
                    >
                      ANTON MERKUROV
                    </Link>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-stone-100">
                    <Link
                      href="/lobby"
                      onClick={() =>
                        setIsSiteMenuOpen(
                          false,
                        )
                      }
                      className={`block font-bold text-sm sm:text-base uppercase tracking-[0.2em] transition-colors ${
                        normalizedPath ===
                        '/lobby'
                          ? 'text-stone-500'
                          : 'text-stone-900 hover:text-stone-600'
                      }`}
                    >
                      LOBBY
                    </Link>

                    <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                      <Link
                        href="/isakeyforall"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        ABOUT
                      </Link>

                      <Link
                        href="/advising"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        ADVISING
                      </Link>

                      <Link
                        href="/unframed"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        UNFRAMED
                      </Link>

                      <Link
                        href="/journal"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        JOURNAL
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-stone-100">
                    <Link
                      href="/art-engine"
                      onClick={() =>
                        setIsSiteMenuOpen(
                          false,
                        )
                      }
                      className={`block font-bold text-sm sm:text-base uppercase tracking-[0.2em] transition-colors ${
                        normalizedPath.startsWith(
                          '/art-engine',
                        )
                          ? 'text-stone-500'
                          : 'text-stone-900 hover:text-stone-600'
                      }`}
                    >
                      CURATORS ENGINE
                    </Link>

                    <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                      <Link
                        href="/selection"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        SELECTION
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-stone-100">
                    <Link
                      href="/heartandangel"
                      onClick={() =>
                        setIsSiteMenuOpen(
                          false,
                        )
                      }
                      className={`block font-bold text-sm sm:text-base uppercase tracking-[0.2em] transition-colors ${
                        normalizedPath.startsWith(
                          '/heartandangel',
                        ) ||
                        normalizedPath.startsWith(
                          '/temple',
                        ) ||
                        normalizedPath ===
                          '/vigil' ||
                        normalizedPath ===
                          '/absolution' ||
                        normalizedPath ===
                          '/tribute'
                          ? 'text-stone-500'
                          : 'text-stone-900 hover:text-stone-600'
                      }`}
                    >
                      HEART &amp; ANGEL
                    </Link>

                    <div className="pl-4 space-y-1.5 border-l border-stone-200 font-bold uppercase tracking-[0.15em] text-xs text-stone-500">
                      <Link
                        href="/heartandangel/calm/"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        CALM
                      </Link>

                      <Link
                        href="/heartandangel/letitgo/"
                        onClick={() =>
                          setIsSiteMenuOpen(
                            false,
                          )
                        }
                        className="block hover:text-stone-900 py-0.5 transition-colors"
                      >
                        LET IT GO
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {user && (
          <ComposerTrigger />
        )}
      </div>
    </header>
  );
}