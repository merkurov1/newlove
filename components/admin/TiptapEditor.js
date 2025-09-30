"use client";

import React, { useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import 'easymde/dist/easymde.min.css';
import md from '@/lib/markdown';

// Skeleton loader для редактора
function EditorSkeleton() {
  return (
    <div className="animate-pulse border rounded p-4 min-h-[200px] bg-gray-100">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-5/6 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  );
}

// Динамический импорт SimpleMDE (SSR: false)
const SimpleMdeReact = dynamic(() => import('react-simplemde-editor'), { ssr: false });


export default function TiptapEditor({ value, onChange }) {
  const mdeRef = useRef();

  // Загрузка изображения через Supabase
  const handleImageUpload = useCallback(async (file, onSuccess, onError) => {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('/api/upload/editor-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.file?.url) {
        onSuccess(data.file.url);
      } else {
        onError(data.error || 'Ошибка загрузки');
      }
    } catch (e) {
      onError(e.message);
    }
  }, []);

  // Настройка SimpleMDE для вставки изображений
  const getMdeOptions = useCallback(() => ({
    spellChecker: false,
    autosave: { enabled: false },
    placeholder: 'Введите текст...',
    previewRender: (plainText) => {
      const html = md.render(plainText);
      return `<div class="prose prose-blue max-w-none">${html}</div>`;
    },
    toolbar: [
      'bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|',
      'link', {
        name: 'image',
        action: function customImageUpload(editor) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            handleImageUpload(file, (url) => {
              const cm = editor.codemirror;
              const pos = cm.getCursor();
              cm.replaceRange(`![](${url})`, pos);
            }, (err) => {
              alert('Ошибка загрузки: ' + err);
            });
          };
          input.click();
        },
        className: 'fa fa-image',
        title: 'Загрузить изображение',
      }, '|', 'table', 'code', 'preview', 'side-by-side', 'fullscreen', 'guide'
    ],
    renderingConfig: {
      codeSyntaxHighlighting: true,
    },
  }), [handleImageUpload]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Markdown)</label>
      <Suspense fallback={<EditorSkeleton />}>
        <SimpleMdeReact
          id="content-editor"
          value={value}
          onChange={onChange}
          options={getMdeOptions()}
          getMdeInstance={(instance) => { mdeRef.current = instance; }}
        />
      </Suspense>
    </div>
  );
}
