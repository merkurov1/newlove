// app/admin/new/page.js
'use client';

import { useState } from 'react';
import { createArticle } from '../actions';
import Link from 'next/link';
// import { useFormStatus } from 'react-dom'; // Для более сложного состояния загрузки

export default function NewArticlePage() {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  const generateSlug = (title) => {
    return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').trim();
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setSlug(generateSlug(newTitle));
  };
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Новая статья
      </h1>
      <form action={createArticle} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Заголовок</label>
          <input
            name="title"
            type="text"
            value={title}
            onChange={handleTitleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">URL (slug)</label>
          <input
            name="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Содержание</label>
          <textarea
            name="content"
            required
            rows={15}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-between items-center">
           <Link href="/admin" className="text-gray-600 hover:text-gray-800">
            ← Отмена
          </Link>
          <button
            type="submit"
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Опубликовать
          </button>
        </div>
      </form>
    </div>
  );
}
