import React from 'react';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import Link from 'next/link';
import Image from 'next/image';
import { getRoleEmoji, getRoleName } from '@/lib/roles';
import UserActionsClient from '@/components/admin/UserActionsClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  // Use service-role client on the server to fetch all users safely
  const supabaseAdmin = getServerSupabaseClient({ useServiceRole: true });

  // Prefer admin.listUsers for canonical user list (falls back to users table query)
  let users: any[] = [];
  try {
    if (supabaseAdmin.auth && typeof (supabaseAdmin.auth as any).admin?.listUsers === 'function') {
      const { data: userList, error } = await (supabaseAdmin.auth as any).admin.listUsers();
      if (!error && userList?.users) {
        users = (userList.users || []).map((u: any) => ({
          id: u.id,
          name: u.user_metadata?.name ?? null,
          username: u.user_metadata?.username ?? null,
          email: u.email ?? null,
          role: u.user_metadata?.role ?? 'USER',
          image: u.user_metadata?.image ?? null,
        }));
      }
    } else {
      const { data, error } = await supabaseAdmin.from('users').select('id,email,username,name,user_metadata');
      if (!error && Array.isArray(data)) {
        users = data.map((u: any) => ({ id: u.id, email: u.email, username: u.username, name: u.name, role: u.user_metadata?.role ?? 'USER' }));
      }
    }
  } catch (e) {
    console.error('Admin users server fetch error', e);
  }

  // Fetch subscribers for status
  let subs: any[] = [];
  try {
    const { data: s } = await supabaseAdmin.from('subscribers').select('id,email,isActive,userId');
    if (Array.isArray(s)) subs = s;
  } catch (e) {
    console.error('Failed to fetch subscribers', e);
  }
  const subsByUser: Record<string, any> = {};
  for (const s of subs) {
    if (s.userId) subsByUser[String(s.userId)] = s;
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-green-800">Пользователи</h1>
          <p className="text-gray-500">Управление пользователями и ролями</p>
        </div>
        <Link href="/admin" className="text-sm text-gray-600 hover:underline">← Назад в панель</Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 bg-white rounded-xl shadow-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Пользователь</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Подписка</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Роль</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Действия</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user: any) => (
              <tr key={user.id} className="hover:bg-green-50">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    {user.image && (
                      <Image className="rounded-full mr-3" src={user.image} alt={user.name ?? 'User'} width={40} height={40} unoptimized />
                    )}
                    <div>
                      <div className="text-sm font-semibold">{user.name ?? (user.email || 'Без имени')}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">{subsByUser[user.id]?.isActive ? 'Да' : 'Нет'}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>{getRoleEmoji(user.role)}</span>
                    <div className="text-sm text-gray-700">{getRoleName(user.role)}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <UserActionsClient userId={user.id} currentRole={user.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}