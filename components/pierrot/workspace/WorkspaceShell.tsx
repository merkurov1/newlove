'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Brain,
  Heart,
  MessageSquare,
  Palette,
  Send,
  Sparkles,
  Terminal,
} from 'lucide-react';
import PierrotAvatar from './PierrotAvatar';
import {
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  shortcutRoute,
} from '@/lib/pierrot/workspace/navigation';

const ICONS = {
  chat: MessageSquare,
  brain: Brain,
  flow: Send,
  dash: Activity,
  dev: Terminal,
  art: Palette,
  skills: Sparkles,
  heart: Heart,
} as const;

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
    registerServiceWorker();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const route = shortcutRoute(event, event.target);
      if (!route) return;

      event.preventDefault();

      if (route.key === 'new-chat') {
        router.push('/admin/pierrot?new=1');
        return;
      }

      const item = WORKSPACE_ROUTES.find((entry) => entry.key === route.key);
      if (item) router.push(item.path);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <div className="pw-root">
      <nav className="pw-rail" aria-label="Pierrot workspace">
        <Link href="/admin/pierrot" className="pw-rail-brand" aria-label="Pierrot">
          <PierrotAvatar size={32} />
        </Link>

        <div className="pw-rail-list">
          {WORKSPACE_ROUTES.map((item) => {
            const Icon = ICONS[item.key];
            const isActive = active === item.key;
            const shortLabel = 'shortLabel' in item ? item.shortLabel : item.label;

            return (
              <Link
                key={item.key}
                href={item.path}
                className="pw-rail-link"
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={`${item.label} · Cmd+${item.shortcut}`}
                onClick={(event) => {
                  if (item.key === 'chat' && isActive) {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent('pierrot:toggle-drawer'));
                  }
                }}
              >
                <Icon size={24} strokeWidth={1.4} aria-hidden="true" />
                <span className="max-[699px]:hidden">{item.label}</span>
                <span className="hidden max-[699px]:inline">{shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="pw-main">{children}</main>
    </div>
  );
}
