// components/UserSidebar.js
"use client";
import Link from 'next/link';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import Image from 'next/image';

export default function UserSidebar() {
  const { session, status } = useSupabaseSession();
  if (status !== 'authenticated' || !session?.user) return null;
  const { user } = session;
  const username = user.username || user.name || 'me';

  if (user.role === 'ADMIN') {
    // Админский сайдбар
    return (
      <div className="w-full border-t border-pink-300 bg-pink-50 flex flex-row items-center justify-center py-3 gap-3">
        {user.image && (
          <Image src={user.image} alt={user.name || ''} width={36} height={36} className="rounded-full border border-pink-300" />
        )}
        <nav className="flex flex-row items-center gap-3">
          <Link href={`/you/${username}`} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Профиль">👤</Link>
          <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Пользователи">👥</Link>
          <Link href="/admin" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Админка">⚙️</Link>
          <Link href="/admin/logs" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Логи">📝</Link>
        </nav>
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
        <Link href={`/you/${username}`} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Пользователи">👥</Link>
      </nav>
    </div>
  );
}
