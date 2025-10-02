"use client";
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/admin/Card';
import { SearchBox } from '@/components/admin/SearchBox';
import { Table } from '@/components/admin/Table';
import { EmptyState } from '@/components/admin/EmptyState';
import { Button } from '@/components/admin/Button';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

interface User {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  role: string;
  image: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = users.filter(user =>
        (user.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.username?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [users, searchQuery]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'user',
      label: 'Пользователь',
      render: (value: any, user: User) => (
        <div className="flex items-center gap-3">
          {user.image ? (
            <img 
              src={user.image} 
              alt={user.name || user.username || ''} 
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
              {(user.name || user.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-medium text-gray-900">
              {user.name || user.username || 'Без имени'}
            </div>
            {user.email && (
              <div className="text-sm text-gray-500">{user.email}</div>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'username',
      label: 'Username',
      sortable: true,
      render: (username: string) => username || '—'
    },
    {
      key: 'role',
      label: 'Роль',
      sortable: true,
      render: (role: string) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          role === 'ADMIN' 
            ? 'bg-purple-100 text-purple-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {role === 'ADMIN' ? '👑 Админ' : '👤 Пользователь'}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Действия',
      render: (value: any, user: User) => (
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {/* TODO: implement edit */}}
          >
            Изменить
          </Button>
          {user.role !== 'ADMIN' && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {/* TODO: implement block */}}
            >
              Заблокировать
            </Button>
          )}
        </div>
      )
    }
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSpinner size="lg" text="Загрузка пользователей..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader 
          title="Пользователи" 
          subtitle={`Всего пользователей: ${users.length}`}
          action={
            <Button variant="primary">
              Пригласить пользователя
            </Button>
          }
        />
        
        <CardContent>
          <div className="mb-6">
            <SearchBox
              onSearch={setSearchQuery}
              placeholder="Поиск по имени, username или email..."
              className="max-w-md"
            />
          </div>

          {filteredUsers.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon="🔍"
                title="Пользователи не найдены"
                description={`По запросу "${searchQuery}" пользователи не найдены. Попробуйте изменить критерии поиска.`}
              />
            ) : (
              <EmptyState
                icon="👥"
                title="Нет пользователей"
                description="В системе пока нет зарегистрированных пользователей."
                actionLabel="Пригласить пользователя"
                actionHref="/admin/users/invite"
              />
            )
          ) : (
            <Table
              columns={columns}
              data={filteredUsers}
              emptyMessage="Пользователи не найдены"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
