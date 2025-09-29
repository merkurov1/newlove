// components/admin/ArticleEditor.js
"use client";

import React from 'react'; // Убираем useState, он больше не нужен
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";

// --- 1. КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Компонент теперь "управляемый" ---
// Он не хранит состояние сам, а получает его через props (value, onChange)
export default function ArticleEditor({ value, onChange }) {
  return (
    <div>
      <label htmlFor="content-editor" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
      <div className="mt-1">
        {/* 2. Передаем value и onChange напрямую в библиотеку редактора */}
        <SimpleMdeReact id="content-editor" value={value} onChange={onChange} />
      </div>
      {/* 3. Это скрытое поле теперь тоже получает актуальное значение из props */}
      <textarea name="content" value={value} readOnly hidden />
    </div>
  );
}
