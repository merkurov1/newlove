"use client";
// app/admin/projects/new/page.js

import ContentForm from '@/components/admin/ContentForm';
import { createProject } from '@/app/admin/actions';

export default function NewProjectPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Новый проект</h1>
      <ContentForm saveAction={createProject} type="проект" />
    </div>
  );
}
