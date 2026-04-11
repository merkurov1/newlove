'use client';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Paywall from './Paywall';

const Markdown = dynamic(() => import('react-markdown'), { ssr: false });
const remarkGfm = require('remark-gfm');
const rehypeHighlight = require('rehype-highlight');
import 'highlight.js/styles/github.css';

export default function BookReaderPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const entry = `${new Date().toISOString()} ${msg}`;
    setLogs((s) => [...s, entry]);
    // also output to console for convenience
    // eslint-disable-next-line no-console
    console.log(entry);
  };

  React.useEffect(() => {
    try {
      addLog('checking paid/localStorage unlock');
      const params = new URLSearchParams(window.location.search);
      if (params.get('paid') === '1') {
        addLog('paid=1 detected in URL');
        setUnlocked(true);
        localStorage.setItem('unframed_unlocked', '1');
      } else if (localStorage.getItem('unframed_unlocked') === '1') {
        addLog('unframed_unlocked found in localStorage');
        setUnlocked(true);
      }
    } catch (e) {
      addLog(`error while checking unlock: ${e}`);
    }
  }, []);

  React.useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setError(null);
    if (!fileContent) {
      addLog('starting fetch /unframed/Unframed.markdown');
      fetch('/unframed/Unframed.markdown')
        .then((res) => {
          addLog(`fetch response status: ${res.status}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => {
          addLog(`fetched markdown length: ${text?.length ?? 0}`);
          if (!cancelled) setFileContent(text);
        })
        .catch((err) => {
          addLog(`fetch error: ${err?.message || String(err)}`);
          if (!cancelled) setError(err?.message || 'Error loading book');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [unlocked, fileContent]);

  if (!unlocked) {
    return (
      <Paywall
        onUnlock={() => {
          setUnlocked(true);
          localStorage.setItem('unframed_unlocked', '1');
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="text-center mt-16 text-lg text-red-600">Error loading book: {error}</div>
    );
  }

  if (!fileContent) {
    return <div className="text-center mt-16 text-lg text-gray-500">Loading book...</div>;
  }

  return (
    <div className="prose mx-auto p-6 max-w-3xl bg-white rounded shadow-lg">
      <h1 className="text-3xl font-bold mb-6">Unframed</h1>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {fileContent}
      </Markdown>
      <div className="mt-8 p-4 bg-gray-50 rounded">
        <h3 className="text-lg font-semibold mb-2">Diagnostics</h3>
        <div className="text-sm font-mono whitespace-pre-wrap max-h-48 overflow-auto">
          {logs.length === 0 ? 'No logs yet.' : logs.join('\n')}
        </div>
      </div>
    </div>
  );
}
