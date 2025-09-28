'use client';

import { useState, useEffect } from 'react';
import prisma from '@/lib/prisma';
import { updateProject } from '../../../actions';
import ImageUploader from '@/components/ImageUploader';

export default function EditProjectWrapper({ params }) {
    const [project, setProject] = useState(null);
    useEffect(() => {
        async function fetchProject() {
            const response = await fetch(`/api/projects/${params.id}`);
            const data = await response.json();
            setProject(data);
        }
        fetchProject();
    }, [params.id]);

    if (!project) {
        return <p>Загрузка...</p>;
    }
    
    return <EditProjectPage project={project} />;
}


function EditProjectPage({ project }) {
  const [content, setContent] = useState(project.content);

  const handleImageInsert = (markdownImage) => {
    setContent((prevContent) => `${prevContent}\n${markdownImage}\n`);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование проекта</h1>
      <form action={updateProject} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
        <input type="hidden" name="id" value={project.id} />
        
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
          <input type="text" name="title" id="title" required defaultValue={project.title} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
          <input type="text" name="slug" id="slug" required defaultValue={project.slug} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        
        <ImageUploader onUploadSuccess={handleImageInsert} />

        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
          <textarea 
            name="content" 
            id="content" 
            rows="15" 
            required 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          ></textarea>
        </div>
        <div className="flex items-center">
          <input id="published" name="published" type="checkbox" defaultChecked={project.published} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовано</label>
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


