'use client';
import { useState } from 'react';
import { getRoleEmoji, getRoleName } from '@/lib/roles';
import { Role } from '@/types/next-auth.d';

export default function UserFilters({ users, onFilter }) {
  const [selectedRole, setSelectedRole] = useState('ALL');
  
  // Получаем уникальные роли пользователей
  const userRoles = [...new Set(users.map(user => user.role))];
  
  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (role === 'ALL') {
      onFilter(users);
    } else {
      onFilter(users.filter(user => user.role === role));
    }
  };

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <button
        onClick={() => handleRoleChange('ALL')}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
          selectedRole === 'ALL' 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        👥 Все ({users.length})
      </button>
      
      {userRoles.map((role) => {
        const roleUsers = users.filter(user => user.role === role);
        return (
          <button
            key={role}
            onClick={() => handleRoleChange(role)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              selectedRole === role 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {getRoleEmoji(role)} {getRoleName(role)} ({roleUsers.length})
          </button>
        );
      })}
    </div>
  );
}