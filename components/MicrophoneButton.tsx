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
    // Basic check. Safari requires HTTPS to expose MediaDevices.
    if (!navigator.mediaDevices || !window.MediaRecorder) setSupported(false);
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // FIX: iOS Safari doesn't support 'audio/webm'. 
      // We check support and fallback to default (usually mp4 on iOS) if webm fails.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : undefined; // Let browser decide

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { 
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data); 
      };

      mr.onstop = () => {
        // Create blob using the actual recorder's mimeType
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
      };

      mr.start();
      setRecording(true);
      
      // Timer Reset
      setTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setTimer(t => t + 1), 1000);

    } catch (e) {
      console.error('Mic start error:', e);
      alert('Microphone access denied or not supported.');
      setSupported(false);
    }
  };

  const stop = () => {
    const mr = mediaRef.current;
    if (!mr) return;
    if (mr.state !== 'inactive') mr.stop();
    
    // Stop tracks to release microphone icon in browser tab
    mr.stream.getTracks().forEach(track => track.stop());

    setRecording(false);
    clearTimer(); // FIX: Stop timer immediately
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  async function uploadAndCreate(blob: Blob) {
    // Determine extension based on blob type
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `whispers/${Date.now()}-voice.${ext}`;

    try {
      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('whispers')
        .upload(filename, blob, { 
            cacheControl: '3600', 
            upsert: false,
            contentType: blob.type 
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data } = supabase.storage.from('whispers').getPublicUrl(filename);
      const publicUrl = data.publicUrl;

      // 3. Get Telegram Context (if any)
      // @ts-ignore
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      // 4. Insert Record via API
      const res = await fetch('/api/whispers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: tgUser?.id || null,
          telegram_first_name: tgUser?.first_name || null,
          telegram_file_id: publicUrl, // Storing URL as file_id for now
          telegram_file_unique_id: null,
          storage_path: filename
        })
      });
      
      if (!res.ok) throw new Error('API Insert Failed');

    } catch (e) {
      console.error('Upload pipeline failed:', e);
      alert('Failed to send voice message.');
    }
  }

  const sendRecorded = async () => {
    if (!recordedBlob) return;
    await uploadAndCreate(recordedBlob);
    
    // Cleanup
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
      {/* Main Trigger Button */}
      <button
        className={`w-10 h-10 rounded-full bg-white/6 hover:bg-white/10 flex items-center justify-center transition-colors`}
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        title="Record Voice Whisper"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 11v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </button>

      {/* Recording Panel */}
      {isPanelOpen && (
        <div className="absolute right-0 bottom-12 w-72 bg-[#0B0B0B] border border-white/10 rounded-lg p-4 shadow-2xl z-50 backdrop-blur-md">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-white/80">Voice Whisper</div>
            <div className={`text-xs font-mono ${recording ? 'text-red-400 animate-pulse' : 'text-white/40'}`}>
              00:{timer.toString().padStart(2, '0')}
            </div>
          </div>

          {!recordedBlob ? (
            <div className="flex gap-2">
              {!recording ? (
                <button onClick={start} className="flex-1 bg-white text-black text-sm font-medium py-2 rounded hover:bg-gray-200 transition">
                  Rec
                </button>
              ) : (
                <button onClick={stop} className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded hover:bg-red-500 transition">
                  Stop
                </button>
              )}
              <button onClick={() => setIsPanelOpen(false)} className="px-3 py-2 bg-white/5 text-white/60 text-sm rounded hover:bg-white/10">
                ✕
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <audio controls src={URL.createObjectURL(recordedBlob)} className="w-full h-8" />
              <div className="flex gap-2">
                <button onClick={sendRecorded} className="flex-1 bg-white text-black text-sm font-medium py-2 rounded hover:bg-gray-200">
                  Send
                </button>
                <button onClick={discardRecorded} className="flex-1 bg-white/5 text-white/60 text-sm font-medium py-2 rounded hover:bg-white/10">
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}