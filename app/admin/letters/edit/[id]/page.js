import prisma from '@/lib/prisma';
import { updateLetter } from '../../../actions';
import { notFound } from 'next/navigation';

export default async function EditLetterPage({ params }) {
  const letter = await prisma.letter.findUnique({
    where: { id: params.id },
  });

  if (!letter) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование выпуска</h1>
      <form action={updateLetter} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
        <input type="hidden" name="id" value={letter.id} />
        
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Тема письма</label>
          <input type="text" name="title" id="title" required defaultValue={letter.title} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
          <input type="text" name="slug" id="slug" required defaultValue={letter.slug} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
          <textarea name="content" id="content" rows="15" required defaultValue={letter.content} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"></textarea>
        </div>
        <div className="flex items-center">
          <input id="published" name="published" type="checkbox" defaultChecked={letter.published} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовано в архиве</label>
        </div>
        <div>
          <button type="submit" className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
            Сохранить изменения
          </button>
        </div>
      </form>
    </div>
  );
}

