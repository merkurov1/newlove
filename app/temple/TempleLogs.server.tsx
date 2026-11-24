import React from 'react';
import TempleLogsClient from './TempleLogs.client';
import {
  TEMPLE_RITUAL_OR_FILTER,
  TEMPLE_TRACE_LIMIT,
  selectTempleTraces,
} from '@/lib/temple/feed';

export default async function TempleLogsServer() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const srv = getServerSupabaseClient({ useServiceRole: true });

    const { data, error } = await srv
      .from('temple_log')
      .select('id,event_type,author,message,created_at,audio_url')
      .or(TEMPLE_RITUAL_OR_FILTER)
      .order('created_at', { ascending: false })
      .limit(TEMPLE_TRACE_LIMIT * 3);

    if (error) {
      console.error('Server fetch temple_log error', error);
      return <TempleLogsClient initialLogs={[]} serverError={String(error.message || error.code)} />;
    }

    return (
      <TempleLogsClient
        initialLogs={selectTempleTraces(data ?? [], TEMPLE_TRACE_LIMIT)}
      />
    );
  } catch (e: any) {
    console.error('TempleLogsServer unexpected error', e);
    return <TempleLogsClient initialLogs={[]} serverError={String(e?.message || e)} />;
  }
}
