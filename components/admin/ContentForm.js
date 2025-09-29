// components/admin/ContentForm.js
'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader from '@/components/ImageUploader';
import TagInput from '@/components/admin/TagInput'; // <-- 1. Импортируем наш новый компонент

const ArticleEditor = dynamic(/* ... */);

export default function ContentForm({ initialData, saveAction, type = 'project' }) {
  const isEditing = !!initialData;
  const [content, setContent] = useState(initialData?.content || '');
  const editorInstanceRef = useRef(null);

  const handleImageInsert = (markdownImage) => { /* ... */ };

  return (
    <form action={saveAction} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
      {/* ... (поля id, title, slug без изменений) ... */}
      
      {/* 2. Добавляем компонент для ввода тегов */}
      <TagInput initialTags={initialData?.tags} />
      
      <ImageUploader onUploadSuccess={handleImageInsert} />

      <ArticleEditor 
        value={content} 
        onChange={setContent}
        getMdeInstance={(instance) => { editorInstanceRef.current = instance; }}
      />

      {/* ... (чекбокс published и кнопка без изменений) ... */}
    </form>
  );
}
