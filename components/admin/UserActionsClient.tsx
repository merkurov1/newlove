"use client";
import { useState } from 'react';
import { Button } from '@/components/admin/Button';

type Props = { userId: string; currentRole?: string | null; onUpdated?: () => void };
export default function UserActionsClient({ userId, currentRole, onUpdated }: Props) {
  const [loading, setLoading] = useState<boolean>(false);

  async function updateRole(role: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateRole', userId, role }) });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Ошибка');
      onUpdated && onUpdated();
    } catch (e) {
      alert('Не удалось изменить роль');
    } finally { setLoading(false); }
  }

  async function deleteUser(): Promise<void> {
    if (!confirm('Удалить пользователя? Это действие необратимо.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteUser', userId }) });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Ошибка');
      onUpdated && onUpdated();
    } catch (e) {
      alert('Не удалось удалить пользователя');
    } finally { setLoading(false); }
  }

  return (
    <div className="flex items-center gap-2">
  <select defaultValue={String(currentRole || 'USER')} onChange={(e) => updateRole(e.target.value)} disabled={loading} className="text-sm border rounded px-2 py-1">
        <option value="USER">Пользователь</option>
        <option value="SUBSCRIBER">Подписчик</option>
        <option value="PATRON">Патрон</option>
        <option value="PREMIUM">Премиум</option>
        <option value="SPONSOR">Спонсор</option>
        <option value="ADMIN">Админ</option>
      </select>
      <Button variant="danger" size="sm" onClick={deleteUser} disabled={loading}>🗑️</Button>
    </div>
  );
}
