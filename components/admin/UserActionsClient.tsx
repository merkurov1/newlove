"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/admin/Button';

type Props = { 
  userId: string; 
  currentRole?: string | null;
  isSubscribed?: boolean;
};

export default function UserActionsClient({ userId, currentRole, isSubscribed = false }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [subscribed, setSubscribed] = useState<boolean>(isSubscribed);
  const router = useRouter();

  async function updateRole(role: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateRole', userId, role }) });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Request failed');
      // Refresh the current route so server data is re-fetched
      router.refresh();
    } catch (e) {
      alert('Unable to update role');
    } finally { setLoading(false); }
  }

  async function deleteUser(): Promise<void> {
    if (!confirm('Delete this user? This action cannot be undone.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteUser', userId }) });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Request failed');
      // Refresh to reflect deleted user
      router.refresh();
    } catch (e) {
      alert('Unable to delete user');
    } finally { setLoading(false); }
  }

  async function toggleSubscription() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ action: 'toggleSubscription', userId, subscribe: !subscribed }) 
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Request failed');
      setSubscribed(!subscribed);
      router.refresh();
    } catch (e) {
      alert('Unable to update subscription');
    } finally { setLoading(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <select defaultValue={String(currentRole || 'USER')} onChange={(e) => updateRole(e.target.value)} disabled={loading} className="text-sm border rounded px-2 py-1">
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
      </select>
      <Button 
        variant={subscribed ? "secondary" : "primary"} 
        size="sm" 
        onClick={toggleSubscription} 
        disabled={loading}
        title={subscribed ? "Unsubscribe" : "Subscribe"}
      >
        {subscribed ? '📧✓' : '📧'}
      </Button>
      <Button variant="danger" size="sm" onClick={deleteUser} disabled={loading}>🗑️</Button>
    </div>
  );
}
