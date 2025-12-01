"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function MicrophoneInline() {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null); // Use any to avoid NodeJS.Timeout vs number conflict
  
  const supabase = createClient();

  // Cleanup on unmount
  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) setSupported(false);
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    
    // Stop all tracks to release hardware microphone
    if (mediaRef.current && mediaRef.current.stream) {
      mediaRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const start = async () => {
    try {
      setUploadError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // FIX: iOS Safari logic
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : undefined;

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { 
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data); 
      };

      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
        
        // Generate preview URL
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop hardware
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      mr.start();
      setRecording(true);
      
      // Reset Timer
      setTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);

    } catch (e) {
      console.error('Mic start error:', e);
      setSupported(false);
    }
  };

  const stop = () => {
    const mr = mediaRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop(); // This triggers onstop above
    }
  };

  async function uploadAndCreate(blob: Blob) {
    // Detect extension
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `whispers/${Date.now()}-voice.${ext}`;
    
    try {
      setUploading(true);
      setUploadError(null);

      // 1. Upload
      const { error: upError } = await supabase.storage
        .from('whispers')
        .upload(filename, blob, { 
            cacheControl: '3600', 
            upsert: false,
            contentType: blob.type 
        });
      
      if (upError) throw upError;

      // 2. Get URL
      const { data } = supabase.storage.from('whispers').getPublicUrl(filename);
      const publicUrl = data.publicUrl;

      // 3. Telegram Metadata
      // @ts-ignore
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      // 4. API Call
      const resp = await fetch('/api/whispers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: tgUser?.id || null,
          telegram_first_name: tgUser?.first_name || null,
          telegram_file_id: publicUrl,
          telegram_file_unique_id: null,
          storage_path: filename
        })
      });

      if (!resp.ok) throw new Error(`API Error: ${resp.status}`);

      // Success cleanup
      setUploading(false);
      discardRecorded(); // Reset UI for next recording

    } catch (e: any) {
      console.error('Upload failed:', e);
      setUploading(false);
      setUploadError(e.message || 'Unknown error');
    }
  }

  const sendRecorded = async () => {
    if (!recordedBlob) return;
    await uploadAndCreate(recordedBlob);
  };

  const discardRecorded = () => {
    setRecordedBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setTimer(0);
    setUploadError(null);
  };

  if (!supported) return (
    <div className="p-4 bg-red-900/20 border border-red-500/50 text-red-200 text-xs rounded">
      Microphone not supported in this browser.
    </div>
  );

  return (
    <div className="w-full bg-[#0A0A0A] border border-white/10 p-4 rounded-md flex flex-col gap-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="text-sm font-medium text-white/80 uppercase tracking-wider">Voice Note</div>
        <div className={`text-xs font-mono ${recording ? 'text-red-500 animate-pulse' : 'text-white/40'}`}>
          00:{timer.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Controls Area */}
      <div className="flex flex-col gap-3">
        {!recordedBlob ? (
          // RECORDING STATE
          !recording ? (
            <button 
              onClick={start} 
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded transition-all flex items-center justify-center gap-2 group"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 group-hover:scale-125 transition-transform" />
              <span className="text-sm">Start Recording</span>
            </button>
          ) : (
            <button 
              onClick={stop} 
              className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
            >
              <div className="w-3 h-3 bg-white rounded-sm animate-pulse" />
              <span className="text-sm font-bold">Stop Recording</span>
            </button>
          )
        ) : (
          // REVIEW STATE
          <div className="flex flex-col gap-3 animate-in fade-in duration-300">
             {audioUrl && (
              <audio controls src={audioUrl} className="w-full h-10 block" />
            )}
            
            <div className="flex gap-2 mt-1">
              <button 
                disabled={uploading} 
                onClick={sendRecorded} 
                className="flex-1 bg-white text-black text-sm font-medium py-2 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {uploading ? 'Sending...' : 'Send Whisper'}
              </button>
              
              <button 
                disabled={uploading}
                onClick={discardRecorded} 
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/60 text-sm rounded hover:bg-white/10 hover:text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {uploadError && (
        <div className="text-xs text-red-400 bg-red-900/10 p-2 rounded border border-red-500/20">
          Error: {uploadError}
        </div>
      )}
    </div>
  );
}