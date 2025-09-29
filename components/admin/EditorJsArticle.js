'use client';

import React, { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Embed from '@editorjs/embed';
import ImageTool from '@editorjs/image';
// Для загрузки изображений через Supabase


export default function EditorJsArticle({ value, onChange }) {
  const editorRef = useRef(null);
  const holder = useRef(`editorjs-${Math.random()}`);

  useEffect(() => {
    if (!editorRef.current) {
      editorRef.current = new EditorJS({
        holder: holder.current,
        tools: {
          header: Header,
          list: List,
          embed: Embed,
          image: {
            class: ImageTool,
            config: {
              uploader: {
                async uploadByFile(file) {
                  const formData = new FormData();
                  formData.append('image', file);
                  const res = await fetch('/api/upload/editor-image', {
                    method: 'POST',
                    body: formData,
                  });
                  const data = await res.json();
                  if (data.success) {
                    return { success: 1, file: { url: data.file.url } };
                  } else {
                    return { success: 0, error: data.error || 'Upload failed' };
                  }
                },
              },
            },
          },
        },
        data: value ? JSON.parse(value) : {},
        onChange: async () => {
          const data = await editorRef.current.save();
          onChange(JSON.stringify(data));
        },
        autofocus: true,
      });
    }
    return () => {
      if (editorRef.current && editorRef.current.destroy) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // Обновление value при редактировании (если нужно)
  useEffect(() => {
    if (editorRef.current && value) {
      editorRef.current.render(JSON.parse(value));
    }
  }, [value]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">Содержимое (Editor.js)</label>
      <div id={holder.current} className="mt-1 border rounded bg-white min-h-[300px]" />
      <input type="hidden" name="content" value={value} />
    </div>
  );
}