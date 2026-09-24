'use client';

import { useState } from 'react';
import { saveLotAction } from '@/actions/saveLot';

interface SaveLotButtonProps {
  url: string;
  rawText?: string;
  onSuccess?: (data: any) => void;
}

export default function SaveLotButton({ url, rawText, onSuccess }: SaveLotButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setLoading(true);
    setStatus('idle');

    const res = await saveLotAction(url, rawText);

    setLoading(false);
    if (res.success) {
      setStatus('success');
      if (onSuccess) onSuccess(res.data);
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('error');
    }
  };

  return (
    <button
      onClick={handleSave}
      disabled={loading}
      className={`px-4 py-2 rounded-lg font-medium transition-all text-sm flex items-center gap-2 ${
        status === 'success'
          ? 'bg-green-600 text-white'
          : status === 'error'
          ? 'bg-red-600 text-white'
          : 'bg-black text-white hover:bg-neutral-800 disabled:opacity-50'
      }`}
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span> Сохранение...
        </>
      ) : status === 'success' ? (
        '✓ Сохранено в базу'
      ) : status === 'error' ? (
        '✕ Ошибка сохранения'
      ) : (
        'Сохранить в базу'
      )}
    </button>
  );
}
