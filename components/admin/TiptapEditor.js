"use client";


import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

export default function TiptapEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg min-h-[300px] max-w-none focus:outline-none',
      },
    },
  });

  // Загрузка изображения через Supabase
  const fileInputRef = useRef();
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload/editor-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.success && data.file?.url) {
      editor.chain().focus().setImage({ src: data.file.url }).run();
    } else {
      alert('Ошибка загрузки: ' + (data.error || 'Неизвестная ошибка'));
    }
    event.target.value = '';
  };

  // Кнопка для вставки изображения
  const insertImage = () => {
    fileInputRef.current.click();
  };

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Tiptap, поддержка галерей)</label>
      <div className="border rounded min-h-[300px] bg-white">
        <div className="flex gap-2 p-2 border-b bg-gray-50">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor?.isActive('bold') ? 'font-bold text-blue-600' : ''}>B</button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor?.isActive('italic') ? 'italic text-blue-600' : ''}>I</button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
          <button type="button" onClick={insertImage}>🖼️ Вставить изображение</button>
        </div>
        <EditorContent editor={editor} className="p-4" />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </div>
    </div>
  );
}
