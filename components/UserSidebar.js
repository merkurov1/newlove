// components/UserSidebar.js
 'use client';
import Link from 'next/link';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import Image from 'next/image';

export default function UserSidebar() {
  const { session } = useSupabaseSession();
  if (!session?.user) return null;
  // username: сначала user.username, потом user.name, иначе 'me'
  const username = session.user.username || session.user.name || 'me';
  return (
    <div className="w-full border-t border-gray-200 bg-gray-50 flex flex-row items-center justify-center py-3 gap-3">
      {session.user.image && (
        <Image src={session.user.image} alt={session.user.name || ''} width={36} height={36} className="rounded-full border border-gray-200" />
      )}
      <nav className="flex flex-row items-center gap-3">
        <Link href={`/you/${username}`} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Пользователи">👥</Link>
        {session.user.role === 'ADMIN' && (
          <Link href="/admin" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Админка">⚙️</Link>
        )}
      </nav>
    </div>
  );
}
