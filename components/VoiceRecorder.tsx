'use client';

import { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onAudioRecorded?: (audioBlob: Blob) => void;
}

export default function VoiceRecorder({ onTranscription, onAudioRecorded }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (onAudioRecorded) {
          onAudioRecorded(audioBlob);
        }
        await processTranscription(audioBlob);
        
        // Останавливаем треки потока
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processTranscription = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'voice.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
      });
      
      // Пример обработки ответа от эндпоинта транскрипции
      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          onTranscription(data.text);
        }
      } else {
        // Заглушка, если бэкенд-транскрипция настраивается отдельно
        onTranscription("[Голосовое сообщение записано]");
      }
    } catch (e) {
      console.error('Transcription failed:', e);
      onTranscription("[Голосовое сообщение]");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center">
      {isProcessing ? (
        <button type="button" disabled className="p-2.5 rounded-full bg-zinc-100 text-zinc-400">
          <Loader2 size={18} className="animate-spin" />
        </button>
      ) : isRecording ? (
        <button
          type="button"
          onClick={stopRecording}
          className="p-2.5 rounded-full bg-rose-500 text-white animate-pulse hover:bg-rose-600 transition-all shadow-sm"
          title="Остановить запись"
        >
          <Square size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          className="p-2.5 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all shadow-sm"
          title="Записать голосовое"
        >
          <Mic size={18} />
        </button>
      )}
    </div>
  );
}
