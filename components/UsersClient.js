'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import GlobeAvatar from '@/components/GlobeAvatar';
import UserFilters from '@/components/UserFilters';
import { getRoleEmoji, getRoleName } from '@/lib/roles';

// Fallback-аватар по первой букве
function FallbackAvatar({ name }) {
  // Simple globe icon fallback to avoid loading a placeholder image file
  return <GlobeAvatar size={64} className="mb-3" />;
}

export default function UsersClient({ users: initialUsers }) {
  const [filteredUsers, setFilteredUsers] = useState(initialUsers);

  return (
    <div className="max-w-7xl mx-auto px-2 md:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">👥 Пользователи</h1>
        <p className="text-gray-600">
          Сообщество нашего сайта — {initialUsers.length} {initialUsers.length === 1 ? 'пользователь' : initialUsers.length < 5 ? 'пользователя' : 'пользователей'}
        </p>
      </div>

      {/* Фильтры по ролям */}
      <UserFilters users={initialUsers} onFilter={setFilteredUsers} />
      
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredUsers.map((user) => (
          <Link
            key={user.id}
            href={`/you/${user.username || user.name || user.id}`}
            className="flex flex-col items-center bg-white rounded-lg shadow p-6 hover:shadow-lg transition group"
          >
            {/* Роль с эмодзи */}
            <div className="w-full flex justify-end mb-2">
              <span 
                className="text-lg"
                title={getRoleName(user.role)}
              >
                {getRoleEmoji(user.role)}
              </span>
            </div>

            {/* Аватар */}
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || 'Пользователь'}
                width={64}
                height={64}
                className="rounded-full mb-3 border group-hover:scale-105 transition-transform"
              />
            ) : (
              <FallbackAvatar name={user.name} />
            )}

            {/* Имя и роль */}
            <div className="text-center">
              <div className="font-semibold text-gray-900 mb-1">
                {user.name || 'Без имени'}
              </div>
              <div className="text-xs text-gray-500 mb-2">{user.email}</div>
              
              {/* Название роли */}
              <div className="text-xs font-medium text-blue-600 mb-2">
                {getRoleName(user.role)}
              </div>

              {/* Статистика активности */}
              {(user._count.articles > 0 || user._count.projects > 0) && (
                <div className="flex justify-center gap-3 text-xs text-gray-400">
                  {user._count.articles > 0 && (
                    <span title="Опубликованные статьи">
                      📝 {user._count.articles}
                    </span>
                  )}
                  {user._count.projects > 0 && (
                    <span title="Опубликованные проекты">
                      🚀 {user._count.projects}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Пользователи не найдены
          </h3>
          <p className="text-gray-500">
            Попробуйте выбрать другой фильтр ролей
          </p>
        </div>
      )}
    </div>
  );
}