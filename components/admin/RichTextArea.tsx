"use client";

import { useRef, useEffect } from 'react';
import TurndownService from 'turndown';

interface RichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export default function RichTextArea({
  value,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '120px',
}: RichTextAreaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);

  // Convert markdown to HTML for display
  useEffect(() => {
    if (!editorRef.current || isUpdatingRef.current) return;
    
    // Simple markdown to HTML conversion
    const htmlContent = value
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>');
    
    if (editorRef.current.innerHTML !== htmlContent) {
      editorRef.current.innerHTML = htmlContent;
    }
  }, [value]);

  const handleInput = () => {
    if (!editorRef.current) return;
    
    isUpdatingRef.current = true;
    
    // Convert HTML to markdown
    const html = editorRef.current.innerHTML;
    const markdown = turndownService.turndown(html);
    
    onChange(markdown);
    
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    
    // Get HTML from clipboard
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    
    // If HTML is available, convert it to markdown
    if (html) {
      const markdown = turndownService.turndown(html);
      document.execCommand('insertText', false, markdown);
    } else {
      // Fallback to plain text
      document.execCommand('insertText', false, text);
    }
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      onInput={handleInput}
      onPaste={handlePaste}
      className={`
        mt-1 block w-full rounded-md border border-gray-300 shadow-sm 
        text-base px-3 py-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500
        ${className}
      `}
      style={{ minHeight }}
      data-placeholder={placeholder}
      suppressContentEditableWarning
    />
  );
}
