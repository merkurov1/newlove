'use client';

import React, { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Embed from '@editorjs/embed';
import ImageTool from '@editorjs/image';
// Для загрузки изображений через Supabase
import { supabase } from '@/lib/supabase-client';

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
                  // Загрузка файла в Supabase Storage
                  const fileName = `${Date.now()}-${file.name}`;
                  const { data, error } = await supabase.storage.from('media').upload(fileName, file);
                  if (error) {
                    return { success: 0, error: error.message };
                  }
                  const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
                  return {
                    success: 1,
                    file: {
                      url: urlData.publicUrl,
                    },
                  };
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