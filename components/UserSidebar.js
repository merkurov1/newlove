// components/UserSidebar.js
"use client";
import React from 'react';
import Link from 'next/link';
// import useSupabaseSession from '@/hooks/useSupabaseSession';
import { useAuth } from './AuthContext';
import Image from 'next/image';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function UserSidebar() {
  const { user, roles, isLoading } = useAuth();
  const [effectiveRole, setEffectiveRole] = React.useState(null);
  // On mount, check effective role via server endpoint and cache it locally
  React.useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      try {
        const sb = createBrowserClient();
        const { data: sessData } = await sb.auth.getSession();
        const sess = (sessData || {}).session || null;
        const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (json && json.role) setEffectiveRole(String(json.role).toUpperCase());
      } catch (e) {
        // ignore
      }
    };
    checkRole();
    return () => { mounted = false; };
  }, []);

  if (isLoading || !user) return null;
  // Prefer canonical username (slug). If username isn't set, link to /profile (edit page)
  // to avoid generating invalid public profile URLs from display names.
  const username = user.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';

  // diagnostics removed in production UI


  // Prefer server-detected effectiveRole (RPC) if available, otherwise fall back to client roles/session
  const roleFromClient = (Array.isArray(roles) && roles.length) ? roles[0] : ((user.role || '') && String(user.role).toUpperCase()) || 'USER';
  const roleNorm = effectiveRole || roleFromClient || 'USER';
  // Debug panel removed for cleaner user sidebar

  if (roleNorm === 'ADMIN') {
    // Админский сайдбар
    return (
      <div className="w-full border-t border-pink-300 bg-pink-50 flex flex-row items-center justify-center py-3 gap-3">
        {user.image && (
          <Image src={user.image} alt={user.name || ''} width={36} height={36} className="rounded-full border border-pink-300" />
        )}
        <nav className="flex flex-row items-center gap-3">
    <Link href={profileHref} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Профиль">👤</Link>
          <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Пользователи">👥</Link>
          <Link href="/admin" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Админка">⚙️</Link>
          <Link href="/admin/logs" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Логи">📝</Link>
        </nav>
  {/* debugPanel removed */}
      </div>
    );
  }

  // Обычный сайдбар
  return (
    <div className="w-full border-t border-gray-200 bg-gray-50 flex flex-row items-center justify-center py-3 gap-3">
      {user.image && (
        <Image src={user.image} alt={user.name || ''} width={36} height={36} className="rounded-full border border-gray-200" />
      )}
      <nav className="flex flex-row items-center gap-3">
  <Link href={profileHref} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Пользователи">👥</Link>
      </nav>
      <div className="ml-3 text-xs text-gray-500">
        <div>status: {String(isLoading)}</div>
        <div>id: {user.id}</div>
        <div>email: {user.email || '—'}</div>
        <div>role: {(user.role || '').toString()}</div>
        {!user.username && (
          <div className="mt-1 text-xs text-yellow-600">Заполните username в профиле чтобы получить публичную ссылку</div>
        )}
      </div>
    </div>
  );
}
