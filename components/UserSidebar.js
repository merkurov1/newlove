// components/UserSidebar.js
'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

export default function UserSidebar() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  // username: сначала user.username, потом user.name, иначе 'me'
  const username = session.user.username || session.user.name || 'me';
  return (
    <div className="w-full border-t border-gray-200 bg-gray-50 flex flex-col items-center py-6">
      {session.user.image && (
        <Image src={session.user.image} alt={session.user.name || ''} width={48} height={48} className="rounded-full border-2 border-gray-200 mb-2" />
      )}
      <nav className="flex flex-row items-center justify-center gap-6 mt-2 w-full">
        <Link href={`/you/${username}`} className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-blue-100 text-2xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-blue-100 text-2xl transition" title="Пользователи">👥</Link>
        {session.user.role === 'ADMIN' && (
          <Link href="/admin" className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-blue-100 text-2xl transition" title="Админка">⚙️</Link>
        )}
      </nav>
    </div>
  );
}
