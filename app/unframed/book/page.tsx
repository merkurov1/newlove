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

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('paid') === '1') {
        setUnlocked(true);
        localStorage.setItem('unframed_unlocked', '1');
      } else if (localStorage.getItem('unframed_unlocked') === '1') {
        setUnlocked(true);
      }
    } catch (e) {
      // ignore (SSR safety not needed; this is client)
    }
  }, []);

  React.useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setError(null);
    if (!fileContent) {
      fetch('/unframed/Unframed.markdown')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => {
          if (!cancelled) setFileContent(text);
        })
        .catch((err) => {
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
    </div>
  );
}
