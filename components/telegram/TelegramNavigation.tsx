'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { hapticSelection } from '@/lib/telegram/webApp';
import {
  resolveTelegramNavigation,
  type TelegramNavigationGroup,
  type TelegramNavigationIcon,
  type TelegramNavigationLink,
} from '@/lib/telegram/navigation';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Authored line marks instead of a stock icon grid. Each shape is deliberately
 * drawn on the same 16px optical grid so the two navigation modes share a
 * rhythm while reading as different products.
 */
function NavigationMark({ icon, className }: { icon: TelegramNavigationIcon; className?: string }) {
  const shared = {
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    className,
  };

  switch (icon) {
    case 'world':
      return (
        <svg {...shared}>
          <path d="M2 12.25h12" />
          <path d="M3.1 12.25 6 7.9l2.3 2.8 2.1-3.4 2.5 4.95" />
        </svg>
      );

    case 'temple':
      return (
        <svg {...shared}>
          <path d="M4 13V7a4 4 0 0 1 8 0v6" />
          <path d="M2.75 13h10.5" />
        </svg>
      );

    case 'calm':
      return (
        <svg {...shared}>
          <circle cx="8" cy="7.25" r="3.75" />
          <path d="M2.75 13h10.5" />
        </svg>
      );

    case 'release':
      return (
        <svg {...shared}>
          <path d="M8 2.75v8.5" />
          <path d="m5.25 8.5 2.75 2.75 2.75-2.75" />
        </svg>
      );

    case 'absolution':
      return (
        <svg {...shared}>
          <path d="M8 2.25 12 3.9v3.6c0 2.8-1.7 4.8-4 6.25-2.3-1.45-4-3.45-4-6.25V3.9z" />
        </svg>
      );

    case 'cast':
      return (
        <svg {...shared}>
          <path d="M3 13 13 3" />
          <path d="M7.5 3H13v5.5" />
        </svg>
      );

    case 'issues':
      return (
        <svg {...shared}>
          <path d="M4.25 3h7.5v10h-7.5z" />
          <path d="M6.25 1.5h7.5V11" />
        </svg>
      );

    case 'flow':
    default:
      return (
        <svg {...shared}>
          <path d="M2.5 5h11" />
          <path d="M2.5 8h7.5" />
          <path d="M2.5 11h5" />
        </svg>
      );
  }
}

function CloseMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </svg>
  );
}

function NavigationGroup({
  group,
  index,
  activeHref,
  onNavigate,
}: {
  group: TelegramNavigationGroup;
  index: number;
  activeHref: string | null;
  onNavigate: () => void;
}) {
  return (
    <div className="telegram-nav__group">
      <div className="telegram-nav__group-heading">
        <span className="telegram-nav__group-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3 className="telegram-nav__group-title">{group.label}</h3>
      </div>

      <ul className="telegram-nav__list">
        {group.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={false}
              onClick={onNavigate}
              aria-current={activeHref === link.href ? 'page' : undefined}
              data-active={activeHref === link.href ? 'true' : 'false'}
              className="telegram-nav__link"
            >
              <span className="telegram-nav__link-mark" aria-hidden="true">
                <NavigationMark icon={link.icon} />
              </span>

              <span className="telegram-nav__link-text">
                <span className="telegram-nav__link-label">{link.label}</span>
                <span className="telegram-nav__link-description">{link.description}</span>
              </span>

              <span className="telegram-nav__current" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrossSpaceLink({
  link,
  onNavigate,
}: {
  link: TelegramNavigationLink;
  onNavigate: () => void;
}) {
  return (
    <div className="telegram-nav__cross">
      <p className="telegram-nav__eyebrow">Elsewhere</p>

      <Link
        href={link.href}
        prefetch={false}
        onClick={onNavigate}
        className="telegram-nav__cross-link"
      >
        <span className="telegram-nav__cross-mark" aria-hidden="true">
          <NavigationMark icon={link.icon} />
        </span>

        <span className="telegram-nav__cross-text">
          <span className="telegram-nav__cross-label">{link.label}</span>
          <span className="telegram-nav__cross-description">{link.description}</span>
        </span>

        <span className="telegram-nav__cross-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  );
}

export default function TelegramNavigation() {
  const pathname = usePathname() || '';
  const { mode, hasUnread, toggleConversation } = usePierrot();
  const [isOpen, setIsOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const navigation = resolveTelegramNavigation(pathname);
  const { context } = navigation;

  const closeMenu = useCallback(() => {
    setIsOpen(false);

    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const handleNavigate = useCallback(() => {
    hapticSelection();
    closeMenu();
  }, [closeMenu]);

  const openMenu = useCallback(() => {
    hapticSelection();
    setIsOpen(true);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [mode, pathname]);

  useEffect(() => {
    if (!isOpen || mode !== 'site') return;

    return registerTelegramBackHandler(() => {
      closeMenu();
      return true;
    });
  }, [closeMenu, isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    let focusFrame = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    focusFrame = window.requestAnimationFrame(() => {
      closeRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener('keydown', handleKeyDown);

      window.cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, closeMenu]);

  if (mode !== 'site') {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleConversation}
        aria-label={hasUnread ? 'Open Pierrot, new message' : 'Open Pierrot'}
        title="Pierrot"
        className="telegram-nav-trigger telegram-pierrot-trigger"
      >
        <span className="font-serif text-[15px] font-medium normal-case tracking-normal">P</span>
        <span className="hidden sm:inline">Pierrot</span>
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-300 ring-2 ring-[#141210]"
          />
        )}
      </button>

      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="telegram-navigation-panel"
        aria-label={navigation.triggerAriaLabel}
        data-nav-context={context}
        className={`telegram-nav-trigger telegram-nav-trigger--${context}`}
      >
        <span className="telegram-nav-trigger__mark" aria-hidden="true">
          <NavigationMark icon={context === 'flow' ? 'flow' : 'temple'} />
        </span>

        <span className="telegram-nav-trigger__label">{navigation.triggerLabel}</span>

        <span className="telegram-nav-trigger__accent" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className={`telegram-nav-backdrop telegram-nav-backdrop--${context}`}
          data-nav-context={context}
          role="presentation"
          onClick={closeMenu}
        >
          <section
            id="telegram-navigation-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="telegram-nav-title"
            aria-describedby="telegram-nav-note"
            data-nav-context={context}
            data-testid="telegram-navigation-panel"
            className={`telegram-nav-panel telegram-nav-panel--${context}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="telegram-nav__header">
              <div className="telegram-nav__heading">
                <p className="telegram-nav__eyebrow">{navigation.eyebrow}</p>

                <h2 id="telegram-nav-title" className="telegram-nav__title">
                  {navigation.title}
                </h2>
              </div>

              <button
                ref={closeRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close navigation"
                className="telegram-nav__close"
              >
                <CloseMark />
              </button>
            </header>

            <p id="telegram-nav-note" className="telegram-nav__note">
              {navigation.note}
            </p>

            <nav aria-label={`${navigation.title} navigation`}>
              {navigation.groups.map((group, index) => (
                <NavigationGroup
                  key={group.id}
                  group={group}
                  index={index}
                  activeHref={navigation.activeHref}
                  onNavigate={handleNavigate}
                />
              ))}
            </nav>

            {navigation.crossSpace && (
              <CrossSpaceLink link={navigation.crossSpace} onNavigate={handleNavigate} />
            )}

            <p className="telegram-nav__footnote">
              The full site remains available in a regular browser.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
