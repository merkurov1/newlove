'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Flame,
  Heart,
  Moon,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavigationItem = {
  href: string;
  label: string;
  note?: string;
  icon: LucideIcon;
};

const PRIMARY_LINKS: NavigationItem[] = [
  {
    href: '/heartandangel/world',
    label: 'World',
    note: 'The living landscape',
    icon: Compass,
  },
  {
    href: '/temple',
    label: 'Temple',
    note: 'The Sanctuary',
    icon: Sparkles,
  },
];

const RITUAL_LINKS: NavigationItem[] = [
  {
    href: '/heartandangel/calm',
    label: 'Calm',
    icon: Moon,
  },
  {
    href: '/heartandangel/letitgo',
    label: 'Let It Go',
    icon: Trash2,
  },
  {
    href: '/vigil',
    label: 'Vigil',
    icon: Flame,
  },
  {
    href: '/absolution',
    label: 'Absolution',
    icon: ShieldCheck,
  },
  {
    href: '/cast',
    label: 'Cast',
    icon: Terminal,
  },
  {
    href: '/tribute',
    label: 'Tribute',
    icon: Heart,
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/\/$/, '') || '/';
}

function isActiveRoute(pathname: string, href: string) {
  const current = normalizePath(pathname);

  return current === href || current.startsWith(`${href}/`);
}

export default function TelegramNavigation() {
  const pathname = usePathname() || '';
  const [isOpen, setIsOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeRef = useRef<HTMLButtonElement | null>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);

    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener('keydown', handleKeyDown);

      window.clearTimeout(focusTimer);
    };
  }, [isOpen, closeMenu]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open World, Temple and rituals navigation"
        className="telegram-nav-trigger"
      >
        <Compass size={14} aria-hidden="true" />
        <span className="hidden sm:inline">World · Temple</span>
      </button>

      {isOpen && (
        <div className="telegram-nav-backdrop" role="presentation" onClick={closeMenu}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="telegram-nav-title"
            className="telegram-nav-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/80">
                  The Threshold
                </p>

                <h2
                  id="telegram-nav-title"
                  className="mt-2 font-serif text-2xl font-normal text-stone-100"
                >
                  Where do you want to go?
                </h2>
              </div>

              <button
                ref={closeRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close navigation"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-stone-300 transition-colors hover:bg-white/10 hover:text-stone-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <nav
              aria-label="World and Temple"
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {PRIMARY_LINKS.map((item) => {
                const Icon = item.icon;
                const active = isActiveRoute(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={closeMenu}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex min-h-[92px] flex-col justify-between rounded-2xl border p-4 transition-colors ${
                      active
                        ? 'border-amber-300/60 bg-amber-300/10'
                        : 'border-white/10 bg-white/[0.04] hover:border-amber-300/40 hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-serif text-lg text-stone-100">{item.label}</span>

                      <Icon size={18} className="text-amber-300/80" aria-hidden="true" />
                    </span>

                    <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                      {item.note}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">
                Rituals
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {RITUAL_LINKS.map((item) => {
                  const Icon = item.icon;
                  const active = isActiveRoute(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={closeMenu}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors ${
                        active
                          ? 'border-amber-300/60 bg-amber-300/10 text-amber-100'
                          : 'border-white/10 bg-white/[0.03] text-stone-300 hover:border-amber-300/40 hover:bg-white/[0.07] hover:text-stone-100'
                      }`}
                    >
                      <Icon size={14} className="shrink-0 text-amber-300/75" aria-hidden="true" />

                      <span className="truncate font-serif text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-stone-600">
              The full site remains available in a regular browser.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
