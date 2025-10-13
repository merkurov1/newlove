import React from 'react';
import { Role } from '@/types/next-auth.d';
import { getRoleEmoji, getRoleName } from '@/lib/roles';

// Single, clean implementation for UserEditModal. All duplicates removed.
interface User {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: Role;
  bio?: string | null;
  website?: string | null;
}

interface Props {
  user: User | null;
  onClose: () => void;
  onSave: (userId: string, updates: Partial<User>) => Promise<void>;
}

export default function UserEditModal({ user, onClose, onSave }: Props) {
  // Hooks must be declared unconditionally at the top of the component
  const [formData, setFormData] = React.useState<Partial<User>>({
    name: user?.name ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
    website: user?.website ?? '',
    role: user?.role ?? Role.USER,
  });
  const [saving, setSaving] = React.useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(user.id, formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">✏️ Редактировать пользователя</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (не изменяется)</label>
              <input type="email" value={user.email ?? ''} disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
              <input type="text" value={String(formData.name ?? '')} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Введите имя" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" value={String(formData.username ?? '')} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="username" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
              <select value={String(formData.role ?? '')} onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                {Object.values(Role).map((r) => (
                  <option key={String(r)} value={String(r)}>
                    {getRoleEmoji(r as any)} {getRoleName(r as any)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea value={String(formData.bio ?? '')} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Краткое описание пользователя" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Веб-сайт</label>
              <input type="url" value={String(formData.website ?? '')} onChange={(e) => setFormData({ ...formData, website: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="https://example.com" />
            </div>

            <div className="flex gap-3 pt-4">
              <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? '⏳ Сохранение...' : '💾 Сохранить'}</button>
              <button type="button" onClick={onClose} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400">❌ Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}