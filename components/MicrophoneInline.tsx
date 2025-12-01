"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function MicrophoneInline() {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [timer, setTimer] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) setSupported(false);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    };
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let mr: MediaRecorder;
      try {
        mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      } catch (e) {
        mr = new MediaRecorder(stream as MediaStream);
      }
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        setRecording(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
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
    if (mr && mr.state !== 'inactive') {
      try { mr.stop(); } catch (e) { console.warn('mr.stop() failed', e); }
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      streamRef.current = null;
    }
  };

  async function uploadAndCreate(blob: Blob) {
    const fn = `whispers/${Date.now()}-voice.webm`;
    try {
      setUploading(true);
      setUploadError(null);
      // @ts-ignore
      const up = await supabase.storage.from('whispers').upload(fn, blob, { cacheControl: '3600', upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from('whispers').getPublicUrl(fn);
      const publicUrl = (pub as any)?.publicUrl || null;

      // @ts-ignore
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      const resp = await fetch('/api/whispers', {
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

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'unknown');
        throw new Error(`server returned ${resp.status}: ${text}`);
      }
      setUploading(false);
      setRecordedBlob(null);
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    } catch (e: any) {
      console.error('upload failed', e);
      setUploading(false);
      setUploadError(e?.message || String(e));
    }
  }

  const sendRecorded = async () => {
    if (!recordedBlob) return;
    await uploadAndCreate(recordedBlob);
    setRecordedBlob(null);
    setTimer(0);
  };

  const discardRecorded = () => {
    setRecordedBlob(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setTimer(0);
    setUploadError(null);
  };

  if (!supported) return null;

  return (
    <div className="w-full bg-[#0A0A0A] border border-white/6 p-4 rounded-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-mono text-white/80">Шёпот</div>
        <div className="text-xs text-white/40">{timer}s</div>
      </div>

      <div className="flex items-center gap-2">
        {!recording ? (
          <button onClick={start} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded">Record</button>
        ) : (
          <button onClick={stop} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black py-2 rounded">Stop</button>
        )}
        {audioUrl ? (
          <audio controls src={audioUrl} className="w-40" />
        ) : (
          <div className="w-40 text-[12px] text-white/40">No recording</div>
        )}
      </div>

      <div className="flex gap-2">
        <button disabled={!recordedBlob || uploading} onClick={sendRecorded} className="flex-1 bg-white text-black py-2 rounded disabled:opacity-50">{uploading ? 'Sending…' : 'Send'}</button>
        <button onClick={discardRecorded} className="px-3 py-2 bg-white/6 rounded">Discard</button>
      </div>

      {uploadError ? (
        <div className="text-xs text-red-400 mt-2">Upload error: {uploadError}</div>
      ) : null}
    </div>
  );
}
