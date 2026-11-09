'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import PierrotAvatar from './PierrotAvatar';
import {
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  shortcutRoute,
} from '@/lib/pierrot/workspace/navigation';

function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/pierrot-sw.js', { scope: '/admin/pierrot' }).catch(() => {
    // Offline shell is an enhancement; the workspace stays fully usable.
  });
}

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin/pierrot';
  const router = useRouter();
  const active = activeWorkspaceKey(pathname);

  useEffect(() => {
    if (pathname.startsWith('/admin/pierrot')) registerServiceWorker();
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const route = shortcutRoute(event, event.target);
      if (!route) return;

      event.preventDefault();

      if (route.key === 'new-chat') {
        if (pathname === '/admin/pierrot') {
          window.dispatchEvent(new CustomEvent('pierrot:new-session'));
        } else {
          router.push('/admin/pierrot?new=1');
        }
        return;
      }

      const item = WORKSPACE_ROUTES.find((entry) => entry.key === route.key);
      if (item) router.push(item.path);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, router]);

  function startNewSession() {
    if (pathname === '/admin/pierrot') {
      window.dispatchEvent(new CustomEvent('pierrot:new-session'));
      return;
    }
    router.push('/admin/pierrot?new=1');
  }

  return (
    <div className="pw-root">
      <header className="pw-topbar" aria-label="Pierrot">
        <button
          type="button"
          className="pw-topbar-avatar"
          onClick={startNewSession}
          aria-label="Начать новую сессию Пьеро"
          title="Новая сессия"
        >
          <PierrotAvatar size={30} />
        </button>

        <nav className="pw-topbar-nav" aria-label="Основная навигация">
          {WORKSPACE_ROUTES.map((item) => (
            <Link
              key={item.key}
              href={item.path}
              className="pw-topbar-link"
              aria-current={active === item.key ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="pw-main">{children}</main>
    </div>
  );
}
