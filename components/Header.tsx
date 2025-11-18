'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      try {
        setTick((t) => t + 1);
      } catch (e) {}
    };
    // Keep client copy of projects fresh: fetch latest published projects on mount
    let mounted = true;
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        if (Array.isArray(data)) {
          // Only update when different to avoid unnecessary re-renders
          try {
            const same = JSON.stringify(data) === JSON.stringify(projectsState);
            if (!same) setProjectsState(data);
          } catch (e) {
            setProjectsState(data);
          }
        }
      } catch (e) {
        // Failed to refresh projects
      }
    };
    fetchProjects();
    const onProjectsUpdated = () => fetchProjects();
    window.addEventListener('resize', handleResize);
    window.addEventListener('supabase:session-changed', onSessionChanged);
    // Close mobile menu when other UI needs to open modal (e.g., web3/onboard login)
    const closeMenuHandler = () => setIsMenuOpen(false);
    window.addEventListener('newlove:close-mobile-menu', closeMenuHandler);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('supabase:session-changed', onSessionChanged);
      window.removeEventListener('newlove:close-mobile-menu', closeMenuHandler);
      window.removeEventListener('newlove:projects-updated', onProjectsUpdated);
      mounted = false;
    };
  }, []);

  return (
    <div>
      {/* Opt-in debug overlay when ?auth_debug=1 */}
      {typeof window !== 'undefined' && window.location.search.includes('auth_debug=1') && (
        <div
          style={{
            position: 'fixed',
            right: 8,
            bottom: 8,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
            maxWidth: 320,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Auth debug</div>
          <div>status: {status}</div>
          <div style={{ marginTop: 6 }}>
            user: {session?.user ? `${session.user.id} ${session.user.email}` : 'null'}
          </div>
          <div style={{ marginTop: 6 }}>role: {session?.user?.role || serverRole || '—'}</div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>open console: window.__newloveAuth</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            <div style={{ fontWeight: 600 }}>Recent events:</div>
            <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 6 }}>
              {typeof window !== 'undefined' && ((window as any).__newloveAuth || {}).history ? (
                ((window as any).__newloveAuth.history || [])
                  .slice()
                  .reverse()
                  .map((h: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, opacity: 0.95, paddingTop: 4 }}>
                      {new Date(h.ts).toLocaleTimeString()} {h.status}{' '}
                      {h.short ? ` — ${h.short}` : ''}
                    </div>
                  ))
              ) : (
                <div style={{ fontSize: 11, opacity: 0.7 }}>no events yet</div>
              )}
            </div>
          </div>
        </div>
      )}
      <AdminAutoRedirect />
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-100">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 py-4">
          {/* Left: Site name only */}
          <Link
            href="/"
            className="font-bold text-black uppercase tracking-widest"
            style={{ fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontSize: 20 }}
          >
            MERKUROV
          </Link>
          {/* Right: Navigation */}
          <nav className="flex items-center">
            <ul className="flex gap-10 text-base font-semibold uppercase tracking-widest">
              <li>
                <Link href="/art" className="hover:opacity-60 transition">
                  ART
                </Link>
              </li>
              <li>
                <Link href="/advising" className="hover:opacity-60 transition">
                  ADVISING
                </Link>
              </li>
              <li>
                <Link href="/letters" className="hover:opacity-60 transition">
                  JOURNAL
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      {/* Animated gradient line убрана по финальному ТЗ */}

      {/* Mobile menu: same links, slide-in */}
      <div
        className={`fixed inset-0 z-40 bg-white pt-24 transition-transform duration-300 md:hidden ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <nav className="px-8">
          <ul className="flex flex-col items-end gap-8 text-2xl font-semibold uppercase tracking-widest">
            <li>
              <Link
                href="/art"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                ART
              </Link>
            </li>
            <li>
              <Link
                href="/advising"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                ADVISING
              </Link>
            </li>
            <li>
              <Link
                href="/letters"
                onClick={() => setIsMenuOpen(false)}
                className="hover:opacity-60 transition"
              >
                JOURNAL
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
