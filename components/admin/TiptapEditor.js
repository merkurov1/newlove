"use client";

import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import GalleryGrid from './tiptap-extension-gallery';
import { uploadImage, validateImageFile, handleEditorError, tiptapConfig } from './editorUtils';


export default function TiptapEditor({ value, onChange }) {
  const [showCode, setShowCode] = useState(false);
  const [codeValue, setCodeValue] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure(tiptapConfig.extensions.image),
      GalleryGrid,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: tiptapConfig.extensions.editorProps,
  });

  // Загрузка изображения с использованием общих утилит
  const fileInputRef = useRef();
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Валидация файла
    const validation = validateImageFile(file);
    if (!validation.valid) {
      handleEditorError(validation.error, 'TiptapEditor');
      event.target.value = '';
      return;
    }
    
    // Загрузка изображения
    const result = await uploadImage(file, 'TiptapEditor');
    
    if (result.success && result.url) {
      editor.chain().focus().setImage({ src: result.url }).run();
    } else {
      handleEditorError(result.error, 'TiptapEditor');
    }
    
    event.target.value = '';
  };

  // Кнопка для вставки изображения
  const insertImage = () => {
    fileInputRef.current.click();
  };

  // Кнопка для просмотра/редактирования HTML-кода
  const openCode = () => {
    setCodeValue(editor.getHTML());
    setShowCode(true);
  };
  const saveCode = () => {
    editor.commands.setContent(codeValue, false);
    setShowCode(false);
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
        <div className="flex gap-2 p-2 border-b bg-gray-50 flex-wrap">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor?.isActive('bold') ? 'font-bold text-blue-600' : ''}>B</button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor?.isActive('italic') ? 'italic text-blue-600' : ''}>I</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</button>
          <button type="button" onClick={() => editor.chain().focus().undo().run()}>↺ Undo</button>
          <button type="button" onClick={() => editor.chain().focus().redo().run()}>↻ Redo</button>
          <button type="button" onClick={insertImage}>🖼️ Вставить изображение</button>
          <button type="button" onClick={openCode}>📝 Код</button>
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
      {showCode && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full">
            <h2 className="text-lg font-bold mb-2">HTML-код содержимого</h2>
            <textarea
              className="w-full h-64 border rounded p-2 font-mono text-xs"
              value={codeValue}
              onChange={e => setCodeValue(e.target.value)}
            />
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setShowCode(false)} className="px-4 py-2 rounded bg-gray-200">Отмена</button>
              <button onClick={saveCode} className="px-4 py-2 rounded bg-blue-600 text-white">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
