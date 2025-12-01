"use client";

import React, { useState } from 'react';

export default function WhisperActions({ id, url }: { id: string; url: string | null }) {
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  // debug removed for production

  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replySuccess, setReplySuccess] = useState(false);

  const handleTranscribe = async () => {
    setTranscribeError(null);
    setTranscribedText(null);
    if (!id || !url) {
      setTranscribeError('missing id or url');
      return;
    }
    setTranscribing(true);
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whisperId: id, url })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `status ${res.status}`);
      }
      if (data.transcribed && data.text) setTranscribedText(data.text);
    } catch (e: any) {
      setTranscribeError(e?.message || String(e));
    } finally {
      setTranscribing(false);
    }
  };

  const handleReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setReplyError(null);
    setReplySuccess(false);
    if (!id || !replyMessage) {
      setReplyError('Введите сообщение');
      return;
    }
    setReplying(true);
    try {
      const res = await fetch('/api/whispers/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whisperId: id, message: replyMessage })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `status ${res.status}`);
      setReplySuccess(true);
      setReplyMessage('');
    } catch (err: any) {
      setReplyError(err?.message || String(err));
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button onClick={handleTranscribe} disabled={transcribing || !url} className="px-3 py-1 bg-white/6 rounded">
          {transcribing ? 'Транскрибируется…' : 'Транскрибировать'}
        </button>
        {transcribeError ? <div className="text-xs text-red-400">{transcribeError}</div> : null}
      </div>

      {transcribedText ? (
        <div className="text-sm bg-white/3 p-2 rounded font-mono text-white/90">{transcribedText}</div>
      ) : null}

      {/* debug removed */}

      <form onSubmit={handleReply} className="flex items-center gap-2">
        <input
          value={replyMessage}
          onChange={(e) => setReplyMessage(e.target.value)}
          placeholder="Ваш ответ"
          className="flex-1 p-2 bg-black/20 rounded text-sm"
        />
        <button className="px-3 py-1 bg-white/6 rounded" disabled={replying}>{replying ? 'Отправка…' : 'Отправить'}</button>
      </form>
      {replyError ? <div className="text-xs text-red-400">{replyError}</div> : null}
      {replySuccess ? <div className="text-xs text-green-400">Отправлено</div> : null}
    </div>
  );
}
