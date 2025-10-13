"use client";
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { SearchBox } from '@/components/admin/SearchBox';
import { Button } from '@/components/admin/Button';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getRoleEmoji, getRoleName } from '@/lib/roles';
import { Role } from '@/types/next-auth.d';
import UserEditModal from '@/components/admin/UserEditModal';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

type User = {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: Role;
  image?: string | null;
  bio?: string | null;
  website?: string | null;
  subscription?: { id: string; email: string; createdAt: string } | null;
  _count?: { articles: number; projects: number; messages: number };
};

type OrphanSubscriber = { id: string; email: string; createdAt: string };

export default function AdminUsersPage() {
  const [data, setData] = useState<{ users: User[]; orphanSubscribers: OrphanSubscriber[] }>({ users: [], orphanSubscribers: [] });
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredSubscribers, setFilteredSubscribers] = useState<OrphanSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Create supabase client on demand inside functions to avoid using env vars in hook deps

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
  const supabase = createBrowserClient();
        const { data: userList }: any = await supabase.auth.admin.listUsers();
        const users = (userList?.users || []).map((u: any) => ({
          id: u.id,
          name: u.user_metadata?.name ?? null,
          username: u.user_metadata?.username ?? null,
          email: u.email ?? null,
          role: (u.user_metadata?.role as Role) ?? 'USER',
          image: u.user_metadata?.image ?? null,
          bio: u.user_metadata?.bio ?? null,
          website: u.user_metadata?.website ?? null,
          subscription: null,
          _count: { articles: 0, projects: 0, messages: 0 },
        }));
        setData({ users, orphanSubscribers: [] });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers(data.users);
      setFilteredSubscribers(data.orphanSubscribers);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredUsers(data.users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)));
    setFilteredSubscribers(data.orphanSubscribers.filter(s => s.email.toLowerCase().includes(q)));
  }, [data, searchQuery]);

  async function fetchData() {
    setLoading(true);
    try {
  const supabase = createBrowserClient();
      const { data: userList }: any = await supabase.auth.admin.listUsers();
      const users = (userList?.users || []).map((u: any) => ({
        id: u.id,
        name: u.user_metadata?.name ?? null,
        username: u.user_metadata?.username ?? null,
        email: u.email ?? null,
        role: (u.user_metadata?.role as Role) ?? 'USER',
        image: u.user_metadata?.image ?? null,
        bio: u.user_metadata?.bio ?? null,
        website: u.user_metadata?.website ?? null,
        subscription: null,
        _count: { articles: 0, projects: 0, messages: 0 },
      }));
      setData({ users, orphanSubscribers: [] });
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  async function updateUser(userId: string, updates: Partial<User>) {
    try {
  const supabase = createBrowserClient();
      if (updates.role) {
        const { error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: { role: updates.role } });
        if (error) throw error;
        await fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка обновления пользователя');
    }
  }

  if (loading) return <LoadingSpinner />;

  const roleOptions = Object.values(Role);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-green-800">Пользователи</h1>
          <p className="text-gray-500">Управление пользователями и ролями</p>
        </div>
      </div>

      <div className="mb-4">
        <SearchBox onSearch={setSearchQuery} placeholder="Поиск пользователей..." />
      </div>

      {filteredUsers.length === 0 ? (
        <div className="p-6 text-center text-gray-400">Пользователи не найдены</div>
      ) : (
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
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-green-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {user.image && (
                        <Image
                          className="rounded-full mr-3"
                          src={user.image}
                          alt={user.name ?? 'User'}
                          width={40}
                          height={40}
                          unoptimized
                        />
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
                      <select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value as Role })} className="text-sm border rounded px-2 py-1">
                        {roleOptions.map(r => <option key={r} value={r}>{getRoleName(r)}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Button variant="secondary" size="sm" onClick={() => setEditingUser(user)}>✏️ Редактировать</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserEditModal user={editingUser} onClose={() => setEditingUser(null)} onSave={updateUser} />
    </div>
  );
}