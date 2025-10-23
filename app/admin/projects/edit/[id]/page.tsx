"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateProject } from '@/app/admin/actions';

export default function ProjectEditorPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then(res => res.json())
      .then(data => {
        setProject(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading project:', error);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="text-lg">Загрузка проекта...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center min-h-[200px] flex items-center justify-center">
        <div className="text-red-600">Проект не найден</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Редактирование проекта: {project.title}
      </h1>
      <ContentForm 
        initialData={project} 
        saveAction={updateProject} 
        type="проект" 
      />
    </div>
  );
}
