// components/UserSidebar.js
'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

export default function UserSidebar() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return (
    <aside className="w-20 sm:w-24 bg-white border-r border-gray-200 py-6 px-2 flex flex-col items-center gap-8 shadow-md rounded-lg">
      {session.user.image && (
        <Image src={session.user.image} alt={session.user.name || ''} width={48} height={48} className="rounded-full border-2 border-gray-200" />
      )}
      <nav className="flex flex-col items-center gap-6 mt-2 w-full">
        <Link href={`/you/${session.user.name || 'me'}`} className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-blue-50 text-2xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-blue-50 text-2xl transition" title="Пользователи">👥</Link>
      </nav>
    </aside>
  );
}
