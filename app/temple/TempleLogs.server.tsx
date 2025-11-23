import React from 'react';
import TempleLogsClient from './TempleLogs.client';

export default async function TempleLogsServer() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const srv = getServerSupabaseClient({ useServiceRole: true });

    const { data, error } = await srv
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Server fetch temple_log error', error);
      return <TempleLogsClient initialLogs={[]} serverError={String(error.message || error.code)} />;
    }

    return <TempleLogsClient initialLogs={data ?? []} />;
  } catch (e: any) {
    console.error('TempleLogsServer unexpected error', e);
    return <TempleLogsClient initialLogs={[]} serverError={String(e?.message || e)} />;
  }
}
