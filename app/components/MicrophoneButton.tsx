"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

// Minimalist microphone button for /temple page.
// Records via MediaRecorder (fallback) and uploads to Supabase Storage,
// then notifies server to create a `whispers` row.

export default function MicrophoneButton({ className }: { className?: string }) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) setSupported(false);
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAndCreate(blob);
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      console.error('mic start error', e);
      setSupported(false);
    }
  };

  const stop = () => {
    const mr = mediaRef.current;
    if (!mr) return;
    try { mr.stop(); } catch (e) {}
    setRecording(false);
  };

  async function uploadAndCreate(blob: Blob) {
    // create filename and upload to supabase storage (public bucket `whispers`)
    const fn = `whispers/${Date.now()}-voice.webm`;
    try {
      // @ts-ignore
      const up = await supabase.storage.from('whispers').upload(fn, blob, { cacheControl: '3600', upsert: false });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from('whispers').getPublicUrl(fn).data.publicUrl;

      // collect telegram user id if available via Telegram WebApp
      // @ts-ignore
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      await fetch('/api/whispers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: tgUser?.id || null,
          telegram_first_name: tgUser?.first_name || null,
          telegram_file_id: publicUrl,
          telegram_file_unique_id: null,
          storage_path: fn
        })
      });
    } catch (e) {
      console.error('upload failed', e);
    }
  }

  if (!supported) return null;

  return (
    <button
      className={`w-10 h-10 rounded-full bg-white/6 hover:bg-white/10 flex items-center justify-center ${className || ''}`}
      onClick={() => recording ? stop() : start() }
      aria-pressed={recording}
      title={recording ? 'Stop recording' : 'Record a whisper'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 11v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </svg>
    </button>
  );
}
