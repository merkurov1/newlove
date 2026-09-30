"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from './AuthContext';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function UserSidebar() {
  const { user, profile, roles, isLoading } = useAuth();
  const [effectiveRole, setEffectiveRole] = React.useState<string | null>(null);

  // На монтировании проверяем роль через серверный эндпоинт
  React.useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      try {
        const sb = createBrowserClient();
        const { data: sessData } = await sb.auth.getSession();
        const sess = (sessData || {}).session || null;
        if (!sess) return;

        const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (json && json.role) setEffectiveRole(String(json.role).toUpperCase());
      } catch (e) {
        // ignore
      }
    };
    checkRole();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !user) return null;

  // Извлекаем username с приоритетом из объекта profile из БД, затем из user_metadata
  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';

  // Определяем итоговую роль пользователя
  const roleFromClient =
    Array.isArray(roles) && roles.length
      ? roles[0]
      : ((user as any)?.role && String((user as any).role).toUpperCase()) || 'USER';
  const roleNorm = effectiveRole || roleFromClient || 'USER';

  // Получаем аватар и имя пользователя
  const userImage =
    profile?.image ||
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    (user as any)?.image ||
    null;
  const userName = profile?.name || user?.user_metadata?.name || user?.email || '';

  if (roleNorm === 'ADMIN') {
    // Админский сайдбар
    return (
      <div className="w-full border-t border-pink-300 bg-pink-50 flex flex-row items-center justify-center py-3 gap-3">
        {userImage && (
          <Image
            src={userImage}
            alt={userName}
            width={36}
            height={36}
            className="rounded-full border border-pink-300"
          />
        )}
        <nav className="flex flex-row items-center gap-3">
          <Link
            href={profileHref}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold"
            title="Профиль"
          >
            👤
          </Link>
          <Link
            href="/users"
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold"
            title="Пользователи"
          >
            👥
          </Link>
          <Link
            href="/admin"
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold"
            title="Админка"
          >
            ⚙️
          </Link>
        </nav>
      </div>
    );
  }

  // Обычный сайдбар
  return (
    <div className="w-full border-t border-gray-200 bg-gray-50 flex flex-row items-center justify-center py-3 gap-3">
      {userImage && (
        <Image
          src={userImage}
          alt={userName}
          width={36}
          height={36}
          className="rounded-full border border-gray-200"
        />
      )}
      <nav className="flex flex-row items-center gap-3">
        <Link
          href={profileHref}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition"
          title="Профиль"
        >
          👤
        </Link>
        <Link
          href="/users"
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition"
          title="Пользователи"
        >
          👥
        </Link>
      </nav>
      <div className="ml-3 text-xs text-gray-500">
        {!username && (
          <div className="mt-1 text-xs text-yellow-600">
            Заполните username в профиле чтобы получить публичную ссылку
          </div>
        )}
      </div>
    </div>
  );
}
