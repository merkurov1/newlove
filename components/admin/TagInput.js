// components/admin/TagInput.js
'use client';
import { useState, useEffect } from 'react';

export default function TagInput({ initialTags }) {
  // Безопасная инициализация состояния, даже если initialTags не передан
  const [tags, setTags] = useState(() => (initialTags || []).map(t => t.name));
  const [inputValue, setInputValue] = useState('');

  // Синхронизация с невидимым полем для отправки на сервер
  const [hiddenInputValue, setHiddenInputValue] = useState(JSON.stringify(tags));
  useEffect(() => {
    setHiddenInputValue(JSON.stringify(tags));
  }, [tags]);

  // Этот useEffect синхронизирует состояние, если initialTags изменятся (важно для редактирования)
  useEffect(() => {
    setTags((initialTags || []).map(t => t.name));
  }, [initialTags]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div>
      <label htmlFor="tags" className="block text-sm font-medium text-gray-700">Теги</label>
      <div className="mt-1 p-2 border border-gray-300 rounded-md flex flex-wrap items-center gap-2">
        {tags.map((tag, index) => (
          <div key={index} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2 py-1 rounded-full">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-blue-500 hover:text-blue-700">&times;</button>
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Добавьте тег и нажмите Enter"
          className="flex-grow bg-transparent border-none focus:ring-0"
        />
      </div>
      <input type="hidden" name="tags" value={hiddenInputValue} />
    </div>
  );
}
