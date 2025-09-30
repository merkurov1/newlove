"use client";
// components/admin/ContentForm.js
'use client';

import TagInput from '@/components/admin/TagInput';
import TiptapEditor from '@/components/admin/TiptapEditor';

export default function ContentForm({ initialData, saveAction, type }) {
  const isEditing = !!initialData;
  return (
    <form action={saveAction} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md">
      {isEditing && <input type="hidden" name="id" value={initialData.id} />}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
        <input type="text" name="title" id="title" required defaultValue={initialData?.title || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
        <input type="text" name="slug" id="slug" required defaultValue={initialData?.slug || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>

      <TagInput initialTags={initialData?.tags} />

      <TiptapEditor value={initialData?.content || ''} />

      <div className="flex items-center mt-2 mb-2">
        <input id="published" name="published" type="checkbox" defaultChecked={initialData?.published || false} className="h-6 w-6 rounded border-gray-300 text-blue-600" />
        <label htmlFor="published" className="ml-3 block text-base text-gray-900">Опубликовано</label>
      </div>
      <div className="mt-4">
        <button type="submit" className="w-full flex justify-center py-3 px-4 border rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]">
          {isEditing ? 'Сохранить изменения' : `Создать ${type}`}
        </button>
      </div>
    </form>
  );
}
