import React, { useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Blockquote from '@tiptap/extension-blockquote';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Lowlight } from 'lowlight/lib/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { useDropzone } from 'react-dropzone';

export default function TiptapEditor({ value, onChange }) {
  const [html, setHtml] = useState(value || '');
  const [isUploading, setIsUploading] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Image.configure({ inline: false }),
      Highlight,
      Blockquote,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight: Lowlight }),
    ],
    content: value || '',
    autofocus: true,
    onUpdate: ({ editor }) => {
      const htmlValue = editor.getHTML();
      setHtml(htmlValue);
      if (typeof onChange === 'function') {
        onChange(htmlValue);
      }
    },
  });

  // Обработчик загрузки изображений (input)
  const handleImageUpload = useCallback(async (eventOrFile) => {
    let file;
    if (eventOrFile.target) {
      file = eventOrFile.target.files[0];
    } else {
      file = eventOrFile;
    }
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload/editor-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    setIsUploading(false);
    if (data.success && data.file?.url) {
      editor.chain().focus().setImage({ src: data.file.url }).run();
    } else {
      alert('Ошибка загрузки изображения: ' + (data.error || 'Unknown error'));
    }
  }, [editor]);

  // Drag&Drop изображений
  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles.length) return;
    handleImageUpload(acceptedFiles[0]);
  }, [handleImageUpload]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    disabled: isUploading,
  });

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Tiptap)</label>
      <div className="mb-2 flex gap-2 items-center">
        <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
        {isUploading && <span className="text-xs text-gray-500">Загрузка...</span>}
      </div>
      <div {...getRootProps()} className={`border rounded bg-white min-h-[300px] p-2 transition-colors ${isDragActive ? 'ring-2 ring-blue-400' : ''}`}
        style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}>
        <input {...getInputProps()} />
        <EditorContent editor={editor} />
        {isDragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <span className="text-blue-600 font-semibold">Перетащите изображение сюда…</span>
          </div>
        )}
      </div>
      <input type="hidden" name="content" value={html} />
    </div>
  );
}
