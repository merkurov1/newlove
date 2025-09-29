// components/UserSidebar.js
'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

export default function UserSidebar() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return (
    <aside className="w-64 bg-white border-r border-gray-200 p-6 rounded-lg shadow-md flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {session.user.image && (
          <Image src={session.user.image} alt={session.user.name || ''} width={48} height={48} className="rounded-full" />
        )}
        <div>
          <div className="font-semibold text-gray-900">{session.user.name}</div>
          <div className="text-xs text-gray-500">{session.user.email}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-2 mt-4">
        <Link href={`/you/${session.user.name || 'me'}`} className="text-blue-600 hover:underline font-medium">Мой профиль</Link>
        <Link href="/users" className="text-blue-600 hover:underline font-medium">Все пользователи</Link>
      </nav>
    </aside>
  );
}
