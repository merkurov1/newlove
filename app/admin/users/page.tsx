import React from 'react';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  let users: any[] = [];
  try {
    const { data, error } = await supabase.from('users').select('id,email,username,name,created_at,updated_at,user_metadata');
    if (!error && Array.isArray(data)) users = data;
  } catch (e) {
    console.error('Failed to fetch users', e);
  }

  // Fetch subscribers status map
  let subs: any[] = [];
  try {
    const { data: s } = await supabase.from('subscribers').select('id,email,isActive,userId');
    if (Array.isArray(s)) subs = s;
  } catch (e) {
    console.error('Failed to fetch subscribers', e);
  }

  const subsByUser: Record<string, any> = {};
  for (const s of subs) {
    if (s.userId) subsByUser[String(s.userId)] = s;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Пользователи</h1>
        <Link href="/admin" className="text-sm text-gray-600 hover:underline">← Назад в панель</Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="py-2">Email</th>
              <th>Username</th>
              <th>Имя</th>
              <th>Подписка</th>
              <th>Роль</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-3 text-sm">{u.email}</td>
                <td className="text-sm">{u.username || '-'}</td>
                <td className="text-sm">{u.name || '-'}</td>
                <td className="text-sm">{subsByUser[u.id]?.isActive ? 'Да' : 'Нет'}</td>
                <td className="text-sm">{(u.user_metadata && u.user_metadata.role) || '-'}</td>
                <td className="text-sm">
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      if (!confirm('Сделать пользователя админом?')) return;
                      await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateRole', userId: u.id, role: 'ADMIN' }) });
                      location.reload();
                    }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Сделать ADMIN</button>

                    <button onClick={async () => {
                      if (!confirm('Удалить пользователя? Это действие необратимо.')) return;
                      await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteUser', userId: u.id }) });
                      location.reload();
                    }} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { getRoleEmoji, getRoleName } from '@/lib/roles';
import Image from 'next/image';
import UserActionsClient from '@/components/admin/UserActionsClient';

export default async function AdminUsersPage() {
  // Use service-role client on the server to fetch all users safely
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  let users: any[] = [];
  try {
    const { data: userList, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    users = (userList?.users || []).map((u: any) => ({
      id: u.id,
      name: u.user_metadata?.name ?? null,
      username: u.user_metadata?.username ?? null,
      email: u.email ?? null,
      role: u.user_metadata?.role ?? 'USER',
      image: u.user_metadata?.image ?? null,
      bio: u.user_metadata?.bio ?? null,
      website: u.user_metadata?.website ?? null,
      _count: { articles: 0, projects: 0, messages: 0 },
    }));
  } catch (e) {
    console.error('Admin users server fetch error', e);
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-green-800">Пользователи</h1>
          <p className="text-gray-500">Управление пользователями и ролями</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 bg-white rounded-xl shadow-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Пользователь</th>
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
                      <div className="text-sm font-semibold">{user.name ?? 'Без имени'}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span>{getRoleEmoji(user.role)}</span>
                    <div className="text-sm text-gray-700">{getRoleName(user.role)}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <UserActionsClient userId={user.id} currentRole={user.role} onUpdated={() => { /* trigger revalidation by refresh on client */ }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}