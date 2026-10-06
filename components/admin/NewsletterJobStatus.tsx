"use client";

import { useState, useEffect, useRef } from 'react';

/**
 * NewsletterJobStatus Component
 * 
 * Shows real-time status of newsletter job processing
 * Polls the database at a bounded interval while the page is visible.
 */

interface NewsletterJobStatusProps {
  jobId: string;
  onComplete?: () => void;
}

interface JobStats {
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export default function NewsletterJobStatus({ jobId, onComplete }: NewsletterJobStatusProps) {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef<(() => void) | undefined>(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const POLL_INTERVAL_MS = 10_000;

    const fetchJobStats = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/newsletter-jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to fetch job status');
        }
        const data = await res.json();
        if (cancelled) return false;
        setStats(data);
        setLoading(false);

        // Stop polling if job is completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          onCompleteRef.current?.();
          return false;
        }
        return true;
      } catch (err) {
        if (cancelled) return false;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
        return true;
      }
    };

    const scheduleNext = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        timer = setTimeout(async () => {
          const shouldContinue = await fetchJobStats();
          if (shouldContinue) scheduleNext();
        }, POLL_INTERVAL_MS);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (timer) clearTimeout(timer);
        void fetchJobStats().then((shouldContinue) => {
          if (shouldContinue) scheduleNext();
        });
      } else if (timer) {
        clearTimeout(timer);
      }
    };

    void fetchJobStats().then((shouldContinue) => {
      if (shouldContinue) scheduleNext();
    });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [jobId]);

  if (loading && !stats) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
        <div className="flex items-center gap-2">
          <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span className="text-blue-700">Загрузка статуса отправки...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-700">❌ Ошибка: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const progress = stats.total_count > 0 
    ? Math.round(((stats.sent_count + stats.failed_count) / stats.total_count) * 100)
    : 0;

  const successRate = (stats.sent_count + stats.failed_count) > 0
    ? Math.round((stats.sent_count / (stats.sent_count + stats.failed_count)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className={`p-4 rounded-md border ${
        stats.status === 'completed' ? 'bg-green-50 border-green-200' :
        stats.status === 'failed' ? 'bg-red-50 border-red-200' :
        stats.status === 'processing' ? 'bg-blue-50 border-blue-200' :
        'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stats.status === 'processing' && (
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            )}
            {stats.status === 'completed' && <span className="text-2xl">✅</span>}
            {stats.status === 'failed' && <span className="text-2xl">❌</span>}
            {stats.status === 'pending' && <span className="text-2xl">⏳</span>}
            
            <div>
              <h3 className="font-semibold">
                {stats.status === 'pending' && 'Ожидание обработки'}
                {stats.status === 'processing' && 'Отправка писем...'}
                {stats.status === 'completed' && 'Отправка завершена'}
                {stats.status === 'failed' && 'Ошибка отправки'}
              </h3>
              <p className="text-sm text-gray-600">Job ID: {jobId}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold">{progress}%</div>
            <div className="text-xs text-gray-600">прогресс</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.status !== 'pending' && (
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{stats.sent_count + stats.failed_count} / {stats.total_count} обработано</span>
            <span>Success Rate: {successRate}%</span>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-white border rounded-md">
          <div className="text-2xl font-bold text-gray-900">{stats.total_count}</div>
          <div className="text-xs text-gray-600">Всего подписчиков</div>
        </div>
        <div className="p-3 bg-white border rounded-md">
          <div className="text-2xl font-bold text-green-600">{stats.sent_count}</div>
          <div className="text-xs text-gray-600">Успешно отправлено</div>
        </div>
        <div className="p-3 bg-white border rounded-md">
          <div className="text-2xl font-bold text-red-600">{stats.failed_count}</div>
          <div className="text-xs text-gray-600">Ошибок</div>
        </div>
      </div>

      {/* Timestamps */}
      {(stats.started_at || stats.completed_at) && (
        <div className="text-sm text-gray-600 space-y-1">
          {stats.started_at && (
            <div>⏰ Начало: {new Date(stats.started_at).toLocaleString('ru-RU')}</div>
          )}
          {stats.completed_at && (
            <div>✓ Завершено: {new Date(stats.completed_at).toLocaleString('ru-RU')}</div>
          )}
        </div>
      )}

      {/* Error Message */}
      {stats.error_message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">
            <strong>Ошибка:</strong> {stats.error_message}
          </p>
        </div>
      )}

      {/* Status Note */}
      {stats.status === 'pending' && (
        <div className="text-sm text-gray-600 italic">
          💡 Обработка начнется в течение минуты через background worker
        </div>
      )}
    </div>
  );
}
