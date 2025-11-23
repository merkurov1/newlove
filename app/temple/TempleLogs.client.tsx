"use client";

import React, { useEffect, useState } from 'react';

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
    let mounted = true;

    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/temple_logs');
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!mounted) return;
        setLogs(json.data ?? []);
      } catch (ex: any) {
        if (!mounted) return;
        console.warn('client fetch temple_log error', ex);
        setError(String(ex.message || ex));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLogs();

    const iv = setInterval(fetchLogs, 5000);
    return () => { mounted = false; clearInterval(iv); };
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
