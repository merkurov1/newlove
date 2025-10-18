"use client";


import Link from "next/link";
import SafeImage from '@/components/SafeImage';
import GlobeAvatar from './GlobeAvatar';

import { useAuth } from '@/components/AuthContext';
import AdminAutoRedirect from './AdminAutoRedirect';
import useServerEffectiveRole from '@/hooks/useServerEffectiveRole';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import LoginButton from './LoginButton';



export default function Header({ projects, settings }) {
  const { session, isLoading } = useAuth();
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hideOnScroll, setHideOnScroll] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastScrollY = useRef(0);
  const [, setTick] = useState(0);
  const serverRole = useServerEffectiveRole(session?.user ? session : null);

  // Compute a friendly display name: prefer user_metadata fields from OAuth providers
  const displayName = (
    session?.user?.user_metadata?.name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.name ||
    (session?.user?.email ? session.user.email.split('@')[0] : null) ||
    ''
  );

  // Extract possible wallet address from session (support multiple shapes)
  const getWalletAddress = (sess) => {
    try {
      const u = sess?.user;
      if (!u) return null;
      // common places: user_metadata.address or wallets array
      const m = u.user_metadata || {};
      if (m?.address) return m.address;
      if (m?.wallet) return m.wallet;
      if (Array.isArray(m?.wallets) && m.wallets[0] && m.wallets[0].address) return m.wallets[0].address;
      // supabase identities array may contain provider/identity_data
      if (Array.isArray(u.identities)) {
        for (const id of u.identities) {
          if (!id) continue;
          if (id.provider && /web3|ethereum|wallet/i.test(id.provider) && id.identity_data) {
            // try common fields
            if (id.identity_data.address) return id.identity_data.address;
            if (id.identity_data.account) return id.identity_data.account;
            if (id.id) return id.id;
          }
        }
      }
      return null;
    } catch (e) { return null; }
  };

  const walletAddress = getWalletAddress(session);
  const shorten = (addr) => {
    if (!addr || typeof addr !== 'string') return addr;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };
  const walletShort = walletAddress ? shorten(walletAddress) : null;

  const site_name = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';
  // Простая и чистая логика: settings (правильный URL) -> локальный fallback
  const logoUrl = settings?.logo_url || '/images/logo.svg';

  // Умный скролл
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 0);
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentY > lastScrollY.current && currentY > 100) {
            setHideOnScroll(true);
          } else {
            setHideOnScroll(false);
          }
          lastScrollY.current = currentY;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };
    const onSessionChanged = () => {
      // force re-render
      try { setTick(t => t + 1); } catch (e) { }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('supabase:session-changed', onSessionChanged);
    // Close mobile menu when other UI needs to open modal (e.g., web3/onboard login)
    const closeMenuHandler = () => setIsMenuOpen(false);
    window.addEventListener('newlove:close-mobile-menu', closeMenuHandler);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('supabase:session-changed', onSessionChanged);
      window.removeEventListener('newlove:close-mobile-menu', closeMenuHandler);
    };
  }, []);

  return (
    <>
      {/* Opt-in debug overlay when ?auth_debug=1 */}
      {typeof window !== 'undefined' && window.location.search.includes('auth_debug=1') && (
        <div style={{ position: 'fixed', right: 8, bottom: 8, zIndex: 99999, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: 8, borderRadius: 6, fontSize: 12, maxWidth: 320 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Auth debug</div>
          <div>status: {status}</div>
          <div style={{ marginTop: 6 }}>user: {session?.user ? `${session.user.id} ${session.user.email}` : 'null'}</div>
          <div style={{ marginTop: 6 }}>role: {session?.user?.role || serverRole || '—'}</div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>open console: window.__newloveAuth</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            <div style={{ fontWeight: 600 }}>Recent events:</div>
            <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 6 }}>
              {typeof window !== 'undefined' && (window.__newloveAuth || {}).history ? (
                (window.__newloveAuth.history || []).slice().reverse().map((h, i) => (
                  <div key={i} style={{ fontSize: 11, opacity: 0.95, paddingTop: 4 }}>{new Date(h.ts).toLocaleTimeString()} {h.status} {h.short ? ` — ${h.short}` : ''}</div>
                ))
              ) : (
                <div style={{ fontSize: 11, opacity: 0.7 }}>no events yet</div>
              )}
            </div>
          </div>
        </div>
      )}
      <AdminAutoRedirect />
      <header
        className={`sticky top-0 z-50 w-full backdrop-blur-md bg-gradient-to-b from-pink-50 via-white/90 to-white transition-transform duration-400 ease-in-out ${hideOnScroll ? '-translate-y-full' : 'translate-y-0'} ${scrolled ? 'shadow-sm' : ''}`}
        style={{ WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}
      >
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/" className="group flex items-center space-x-4">
            <SafeImage
              src={logoUrl}
              alt="Логотип"
              width={40}
              height={40}
              priority
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <div>
              <h1 className="text-xl font-light tracking-wider text-gray-900">{site_name}</h1>
              <p className="hidden text-xs uppercase tracking-widest text-gray-400 sm:block">{slogan}</p>
            </div>
          </Link>

          <nav className="hidden items-center md:flex">
            <ul className="list-none flex items-center justify-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]">
              {/* Магазин временно убран - будет добавлен позже */}
              {Array.isArray(projects) && projects.map((project) => (
                <li key={project.id}>
                  <Link href={`/${project.slug}`} className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900 relative">
                    {project.title}
                    <span className="pointer-events-none absolute left-0 -bottom-0.5 h-[2.5px] w-full origin-left scale-x-0 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-400 transition-transform duration-300 group-hover:scale-x-100" style={{ transitionProperty: 'transform' }}></span>
                  </Link>
                </li>
              ))}
              {/* Защищённые разделы только для авторизованных, кроме Letters */}
              {status === 'authenticated' && (
                <>
                  <li>
                    <Link href="/lab" className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900 relative">
                      Lab
                      <span className="pointer-events-none absolute left-0 -bottom-0.5 h-[2.5px] w-full origin-left scale-x-0 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-400 transition-transform duration-300 group-hover:scale-x-100" style={{ transitionProperty: 'transform' }}></span>
                    </Link>
                  </li>
                  {/* Kit удалён */}
                </>
              )}
              {/* Letters теперь виден всем */}
              <li>
                <Link href="/letters" className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900 relative">
                  Letters
                  <span className="pointer-events-none absolute left-0 -bottom-0.5 h-[2.5px] w-full origin-left scale-x-0 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-400 transition-transform duration-300 group-hover:scale-x-100" style={{ transitionProperty: 'transform' }}></span>
                </Link>
              </li>
            </ul>
          </nav>

          <div className="hidden md:flex items-center justify-end" style={{ minWidth: '150px' }}>
            <a
              href="https://github.com/merkurov1/newlove"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors mr-4"
              title="GitHub Repository"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.157-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.579.688.481C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2Z" /></svg>
              <span className="sr-only">GitHub</span>
            </a>

            {status === 'authenticated' && session?.user ? (
              <div className="flex items-center gap-3">
                {(() => {
                  const avatarSrc = (session.user.user_metadata && (session.user.user_metadata.avatar_url || session.user.user_metadata.avatar)) || session.user.image || session.user.picture || null;
                  return avatarSrc ? (
                    <SafeImage
                      src={avatarSrc}
                      alt={displayName || session.user.email || 'User'}
                      width={36}
                      height={36}
                      className="rounded-full"
                    />
                  ) : (
                    <GlobeAvatar size={36} className="rounded-full" />
                  );
                })()}
                <div className="hidden sm:flex flex-col text-sm leading-tight">
                  <span className="font-medium text-gray-900">{displayName || session.user.email || walletShort}</span>
                  <span className="text-xs text-gray-500">{walletShort ? walletShort : (session.user.email || '')}</span>
                </div>
              </div>
            ) : (
              <LoginButton />
            )}
          </div>

          <div className="flex items-center md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="z-50 focus:outline-none">
              <svg className="h-6 w-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {/* Animated gradient line убрана по финальному ТЗ */}
      </header>

      <div className={`fixed inset-0 z-40 transform bg-white/90 backdrop-blur-md pt-24 transition-transform duration-300 md:hidden ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}>
        <nav className="container mx-auto px-4">
          <ul className="list-none flex flex-col items-center gap-6 text-sm font-semibold uppercase tracking-[0.2em]">
            {/* Магазин временно убран - будет добавлен позже */}
            {Array.isArray(projects) && projects.map((project) => (
              <li key={project.id}>
                <Link href={`/${project.slug}`} onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">{project.title}</Link>
              </li>
            ))}
            {/* Защищенные разделы только для авторизованных */}
            {status === 'authenticated' && (
              <>
                <li>
                  <Link href="/lab" onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">Lab</Link>
                </li>
                {/* Kit удалён */}
              </>
            )}
            {/* Letters теперь виден всем */}
            <li>
              <Link href="/letters" onClick={() => setIsMenuOpen(false)} className="py-2 text-gray-500 hover:text-gray-900">Letters</Link>
            </li>
            {/* Ссылки из UserSidebar перенесены сюда */}
            {status === 'authenticated' && (
              (() => {
                const username = session.user?.username;
                const profileHref = username ? `/you/${username}` : '/profile';
                return <>
                  <li>
                    <Link href={profileHref} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 py-2 text-gray-600 font-semibold hover:text-gray-900">
                      👤 Профиль
                    </Link>
                  </li>
                  <li>
                    <Link href="/users" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 py-2 text-gray-600 font-semibold hover:text-gray-900">
                      👥 Пользователи
                    </Link>
                  </li>
                </>;
              })()
            )}
          </ul>
        </nav>
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-center">
            <a
              href="https://github.com/merkurov1/newlove"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors mb-4"
              title="GitHub Repository"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.157-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.749 0 .268.18.579.688.481C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2Z" /></svg>
              <span className="sr-only">GitHub</span>
            </a>
            {status === 'loading' && <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />}
            <div style={{ marginTop: 16 }}>
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
