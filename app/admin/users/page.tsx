"use client";
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/admin/Card';
import { SearchBox } from '@/components/admin/SearchBox';
import { EmptyState } from '@/components/admin/EmptyState';
import { Button } from '@/components/admin/Button';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getRoleEmoji, getRoleName } from '@/lib/roles';
import { Role } from '@/types/next-auth.d';
import UserEditModal from '@/components/admin/UserEditModal';

interface User {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  role: Role;
  image: string | null;
  bio: string | null;
  website: string | null;
  subscription?: {
    id: string;
    email: string;
    createdAt: string;
  } | null;
  _count: {
    articles: number;
    projects: number;
    messages: number;
  };
}

interface OrphanSubscriber {
  id: string;
  email: string;
  createdAt: string;
}

interface UsersData {
  users: User[];
  orphanSubscribers: OrphanSubscriber[];
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersData>({ users: [], orphanSubscribers: [] });
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredSubscribers, setFilteredSubscribers] = useState<OrphanSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'subscribers'>('users');
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = data.users.filter(user =>
        (user.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.username?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredUsers(filtered);

      const filteredSubs = data.orphanSubscribers.filter(sub =>
        sub.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSubscribers(filteredSubs);
    } else {
      setFilteredUsers(data.users);
      setFilteredSubscribers(data.orphanSubscribers);
    }
  }, [data, searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userId: string, updateData: Partial<User>) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        await fetchData(); // Перезагружаем данные
      } else {
        const error = await response.json();
        alert(error.error || 'Ошибка обновления пользователя');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Ошибка обновления пользователя');
    }
  };

  const quickUpdateUserRole = async (userId: string, newRole: Role) => {
    await updateUser(userId, { role: newRole });
  };

  const deleteSubscriber = async (subscriberId: string) => {
    if (!confirm('Удалить подписчика?')) return;

    try {
      const response = await fetch(`/api/subscribers/${subscriberId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error deleting subscriber:', error);
    }
  };

  if (loading) return <LoadingSpinner />;

  const roleOptions = Object.values(Role);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          👥 Управление пользователями
        </h1>
        <p className="text-gray-600">
          Управление пользователями, ролями и подписчиками
        </p>
      </div>

      {/* Табы */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            👤 Пользователи ({data.users.length})
          </button>
          <button
            onClick={() => setActiveTab('subscribers')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'subscribers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📧 Подписчики без аккаунта ({data.orphanSubscribers.length})
          </button>
        </nav>
      </div>

      <SearchBox 
        onSearch={setSearchQuery}
        placeholder={`Поиск ${activeTab === 'users' ? 'пользователей' : 'подписчиков'}...`}
      />

      {activeTab === 'users' && (
        <Card>
          <CardHeader title="Зарегистрированные пользователи" />
          <CardContent>
            {filteredUsers.length === 0 ? (
              <EmptyState 
                title="Пользователи не найдены" 
                description="Попробуйте изменить критерии поиска"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Пользователь
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Роль
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Подписка
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Активность
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {user.image && (
                              <img 
                                className="h-10 w-10 rounded-full mr-3" 
                                src={user.image} 
                                alt={user.name || 'User'} 
                              />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.name || 'Без имени'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {user.email}
                              </div>
                              {user.username && (
                                <div className="text-xs text-gray-400">
                                  @{user.username}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{getRoleEmoji(user.role)}</span>
                            <select
                              value={user.role}
                              onChange={(e) => quickUpdateUserRole(user.id, e.target.value as Role)}
                              className="text-sm border rounded px-2 py-1"
                            >
                              {roleOptions.map(role => (
                                <option key={role} value={role}>
                                  {getRoleName(role)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.subscription ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✅ Подписан
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              ⏸️ Не подписан
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="space-y-1">
                            <div>📝 {user._count.articles} статей</div>
                            <div>🚀 {user._count.projects} проектов</div>
                            <div>💬 {user._count.messages} сообщений</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingUser(user)}
                          >
                            ✏️ Редактировать
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'subscribers' && (
        <Card>
          <CardHeader title="Подписчики без аккаунта" />
          <CardContent>
            {filteredSubscribers.length === 0 ? (
              <EmptyState 
                title="Подписчики не найдены" 
                description="Нет подписчиков без зарегистрированных аккаунтов"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Дата подписки
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSubscribers.map((subscriber) => (
                      <tr key={subscriber.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {subscriber.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(subscriber.createdAt).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteSubscriber(subscriber.id)}
                          >
                            🗑️ Удалить
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Модальное окно редактирования */}
      <UserEditModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSave={updateUser}
      />
    </div>
  );
}