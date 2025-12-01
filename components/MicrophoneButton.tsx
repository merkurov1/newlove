"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function MicrophoneButton({ className }: { className?: string }) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [timer, setTimer] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
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
        setRecordedBlob(blob);
        setIsPanelOpen(true);
      };
      mr.start();
      setRecording(true);
      setTimer(0);
      timerRef.current = window.setInterval(() => setTimer(t => t + 1), 1000) as unknown as number;
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

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  async function uploadAndCreate(blob: Blob) {
    const fn = `whispers/${Date.now()}-voice.webm`;
    try {
      // @ts-ignore
      const up = await supabase.storage.from('whispers').upload(fn, blob, { cacheControl: '3600', upsert: false });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from('whispers').getPublicUrl(fn).data.publicUrl;

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

  const sendRecorded = async () => {
    if (!recordedBlob) return;
    await uploadAndCreate(recordedBlob);
    // cleanup
    setRecordedBlob(null);
    setIsPanelOpen(false);
    setTimer(0);
    clearTimer();
  };

  const discardRecorded = () => {
    setRecordedBlob(null);
    setIsPanelOpen(false);
    setTimer(0);
    clearTimer();
  };

  if (!supported) return null;

  return (
    <div className={`relative ${className || ''}`}>
      <button
        className={`w-10 h-10 rounded-full bg-white/6 hover:bg-white/10 flex items-center justify-center`}
        onClick={() => {
          if (!isPanelOpen) setIsPanelOpen(true);
          else setIsPanelOpen(false);
        }}
        title={`Open voice recorder`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 11v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </button>

      {isPanelOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#0B0B0B] border border-white/6 rounded p-3 shadow-lg z-40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-white/60">Voice Whisper</div>
            <div className="text-xs text-white/40">{timer}s</div>
          </div>

          <div className="flex items-center gap-2">
            {!recording ? (
              <button onClick={start} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded">Record</button>
            ) : (
              <button onClick={stop} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black py-2 rounded">Stop</button>
            )}
            <button onClick={() => { discardRecorded(); setIsPanelOpen(false); }} className="px-3 py-2 bg-white/6 rounded">Close</button>
          </div>

          {recordedBlob && (
            <div className="mt-3">
              <audio controls src={URL.createObjectURL(recordedBlob)} className="w-full mb-2" />
              <div className="flex gap-2">
                <button onClick={sendRecorded} className="flex-1 bg-white text-black py-2 rounded">Send</button>
                <button onClick={discardRecorded} className="px-3 py-2 bg-white/6 rounded">Discard</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
