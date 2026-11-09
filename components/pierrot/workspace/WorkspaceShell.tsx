'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Brain, PenLine } from 'lucide-react';
import PierrotAvatar from './PierrotAvatar';
import {
  activeWorkspaceKey,
  buildWorkspaceRoutes,
  shortcutRoute,
  type WorkspaceNavProject,
} from '@/lib/pierrot/workspace/navigation';

function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/pierrot-sw.js', { scope: '/admin/pierrot' }).catch(() => {
    // Offline shell is an enhancement; the workspace stays fully usable.
  });
}

export default function WorkspaceShell({
  children,
  projects = [],
}: {
  children: React.ReactNode;
  projects?: WorkspaceNavProject[];
}) {
  const pathname = usePathname() || '/admin/pierrot';
  const router = useRouter();
  const searchParams = useSearchParams();
  const historyId = searchParams?.get('history') || null;
  const projectSlug = searchParams?.get('project') || null;
  const routes = useMemo(() => buildWorkspaceRoutes(projects), [projects]);
  const active = activeWorkspaceKey(pathname, projects, historyId, projectSlug);

  useEffect(() => {
    if (pathname.startsWith('/admin/pierrot')) registerServiceWorker();
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const route = shortcutRoute(event, event.target, routes);
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

      const item = routes.find((entry) => entry.key === route.key);
      if (item) router.push(item.path);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, router, routes]);

  function startNewSession() {
    if (pathname === '/admin/pierrot') {
      window.dispatchEvent(new CustomEvent('pierrot:new-session'));
      return;
    }
    router.push('/admin/pierrot?new=1');
  }

  function openPanel(section: 'memory' | 'flow') {
    if (pathname === '/admin/pierrot') {
      window.dispatchEvent(new CustomEvent('pierrot:open-panel', { detail: { section } }));
      return;
    }
    router.push(`/admin/pierrot?panel=${section}`);
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

        <nav className="pw-topbar-nav" aria-label="Меню чатов">
          {routes.map((item) => (
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

        <div className="pw-topbar-actions" aria-label="Память и Flow">
          <button
            type="button"
            className="pw-topbar-action"
            onClick={() => openPanel('memory')}
            aria-label="Открыть память"
            title="Память"
          >
            <Brain size={18} strokeWidth={1.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="pw-topbar-action"
            onClick={() => openPanel('flow')}
            aria-label="Открыть Flow"
            title="Flow"
          >
            <PenLine size={17} strokeWidth={1.4} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="pw-main">{children}</main>
    </div>
  );
}
