// components/admin/ArticleEditor.js
// КАНДИДАТ НА УДАЛЕНИЕ: не используется ни в одном компоненте или странице
"use client";

import React, { useMemo } from 'react'; // Добавляем useMemo
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";

export default function ArticleEditor({ value, onChange, getMdeInstance }) {
  
  // Используем useMemo для опций, чтобы избежать лишних ререндеров
  const options = useMemo(() => {
    return {
      // Здесь можно будет настроить кнопки и другие параметры
      spellChecker: false,
    };
  }, []);

  return (
    <div>
      <label htmlFor="content-editor" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
      <div className="mt-1">
        <SimpleMdeReact 
          id="content-editor" 
          value={value} 
          onChange={onChange} 
          options={options}
          // Эта функция "пробрасывает" экземпляр редактора наверх
          getInstance={getMdeInstance} 
        />
      </div>
      <textarea name="content" value={value} readOnly hidden />
    </div>
  );
}
