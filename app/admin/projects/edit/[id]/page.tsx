"use client";

import React, { useEffect, useRef, useState } from 'react';
import EditorJS, { OutputData } from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import ImageTool from '@editorjs/image';
import CodeTool from '@editorjs/code';
import { useRouter } from 'next/navigation';

type Project = {
  id: string;
  title: string;
  slug: string;
  content: OutputData;
};

export default function ProjectEditorPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<EditorJS | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then(res => res.json())
      .then(data => {
        setProject(data);
        setLoading(false);
      });
  }, [params.id]);

  useEffect(() => {
    if (!loading && project && !editorRef.current) {
      editorRef.current = new EditorJS({
        holder: 'editorjs',
        data: project.content,
        tools: {
          header: Header,
          list: List,
          code: CodeTool,
          image: {
            class: ImageTool,
            config: {
              endpoints: {
                byFile: '/api/upload', // Реализуйте этот API для загрузки файлов
                byUrl: '/api/upload',
              },
            },
          },
        },
      });
    }
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [loading, project]);

  const handleSave = async () => {
    if (!editorRef.current) return;
    const output = await editorRef.current.save();
    await fetch(`/api/projects/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project,
        content: output,
      }),
    });
    router.refresh();
    alert('Сохранено!');
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div>
      <h1>Редактирование проекта: {project?.title}</h1>
      <div id="editorjs" className="border rounded p-4 bg-white" />
      <button onClick={handleSave} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
        Сохранить
      </button>
    </div>
  );
}
