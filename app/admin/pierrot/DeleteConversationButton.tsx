'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteConversationButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    if (!window.confirm('Delete this conversation and its messages/events?')) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/admin/pierrot/conversations?id=${encodeURIComponent(conversationId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }

      router.push('/admin/pierrot');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={remove}
        disabled={loading}
        className="border border-[#D9C2C8] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8B1E3F] hover:bg-[#F8EAF0] disabled:opacity-50"
      >
        {loading ? 'Deleting…' : 'Delete conversation'}
      </button>
      {error && <span className="text-xs text-[#8B1E3F]">{error}</span>}
    </span>
  );
}
