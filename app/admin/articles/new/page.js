// === ИСПРАВЛЕННЫЙ ПУТЬ ===
// Из app/admin/articles/new/ нужно подняться на два уровня (../../) до app/admin/
import { createArticle } from '../../actions';

export default function NewArticlePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Новая публикация</h1>
      <form action={createArticle} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Заголовок</label>
          <input type="text" name="title" id="title" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
          <input type="text" name="slug" id="slug" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
          <textarea name="content" id="content" rows="10" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"></textarea>
        </div>
        <div className="flex items-center">
          <input id="published" name="published" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовать сразу</label>
        </div>
        <div>
          <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Создать публикацию
          </button>
        </div>
      </form>
    </div>
  );
}

