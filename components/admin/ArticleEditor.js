// components/admin/ArticleEditor.js

"use client"; // <-- Очень важная директива!

import React, { useState } from 'react';
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css"; // <-- Импорт стилей для редактора

export default function ArticleEditor({ initialValue = '' }) {
  const [content, setContent] = useState(initialValue);

  // Эта невидимая textarea нужна, чтобы форма правильно отправляла данные
  // на сервер, так как редактор - это сложный компонент.
  return (
    <div>
      <label htmlFor="content" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
      <div className="mt-1">
        <SimpleMdeReact id="content-editor" value={content} onChange={setContent} />
      </div>
      <textarea name="content" defaultValue={content} readOnly hidden />
    </div>
  );
}
