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

  React.useEffect(() => {
    if (!fileContent) {
      fetch('/unframed/Unframed.markdown')
        .then((res) => res.text())
        .then(setFileContent);
    }
  }, [fileContent]);

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
