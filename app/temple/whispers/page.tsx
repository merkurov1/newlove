import React from 'react';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import MicrophoneButton from '@/components/MicrophoneButton';
import WhisperTestClient from '../WhisperTest.client';
import dynamic from 'next/dynamic';
const WhisperActions = dynamic(() => import('./WhisperActions.client'), { ssr: false });

export default async function WhispersPage() {
  // require admin
  // @ts-ignore
  await requireAdminFromRequest();

  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const { data } = await supabase.from('whispers').select('*').order('created_at', { ascending: false }).limit(200);

  const list = data || [];

  return (
    <div className="min-h-screen p-6 text-white bg-black">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-serif">Шёпоты в Храм</h1>
          <div className="flex items-center gap-3">
            <WhisperTestClient />
          </div>
        </div>

        <div className="space-y-4">
          {list.map((w: any) => (
            <div key={w.id} className="bg-white/3 border border-white/5 p-4 rounded-md">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12">
                  <audio controls src={w.telegram_file_id || ''} className="w-full" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-white/60">{new Date(w.created_at).toLocaleString()}</div>
                  <div className="mt-2 text-white/90">{w.transcribed_text || <span className="text-white/40">(не транскрибировано)</span>}</div>
                  <div className="mt-3">
                    <WhisperActions id={String(w.id)} url={w.telegram_file_id || null} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
