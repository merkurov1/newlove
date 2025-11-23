'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export interface TempleLog {
  id: string;
  event_type?: string;
  message?: string;
  created_at?: string;
  [key: string]: any;
}

export default function TempleLogsClient({ initialLogs = [], serverError = null }: { initialLogs?: TempleLog[]; serverError?: string | null }) {
  const [logs, setLogs] = useState<TempleLog[]>(initialLogs ?? []);
  const [loading, setLoading] = useState<boolean>(initialLogs?.length === 0 && !serverError);
  const [error, setError] = useState<string | null>(serverError ?? null);

  useEffect(() => {
    const supabase = createClient();

    if (initialLogs.length === 0) {
      (async () => {
        try {
          setLoading(true);
          const { data, error: e } = await supabase
            .from('temple_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
          if (e) {
            console.warn('client fetch temple_log error', e);
            setError(String(e.message || e.code));
          } else {
            setLogs(data ?? []);
          }
        } catch (ex: any) {
          setError(String(ex));
        } finally {
          setLoading(false);
        }
      })();
    }

    // Realtime subscription
    const channel = supabase
      .channel('public:temple_log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'temple_log' },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          setLogs((prev) => [row, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [initialLogs.length]);

  if (error) return <div className="p-4 text-red-400">Ошибка: {error}</div>;
  if (loading) return <div className="p-4 text-gray-400">Загрузка...</div>;
  if (!logs || logs.length === 0) return <div className="p-4 text-gray-500">...тишина...</div>;

  return (
    <div className="space-y-2 p-4">
      {logs.map((log) => (
        <div key={String(log.id)} className="flex items-start gap-3 p-2 bg-neutral-900 rounded">
          <div style={{ minWidth: 28, textAlign: 'center' }}>
            {log.event_type === 'vigil' ? '🕯️' :
             log.event_type === 'letitgo' ? '❤️‍🔥' :
             log.event_type === 'absolution' ? '🕊️' :
             log.event_type === 'cast' ? '📡' :
             log.event_type === 'enter' ? '👣' : '•'}
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-200">{log.message}</div>
            <div className="text-xs text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
