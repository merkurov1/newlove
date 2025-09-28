'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
// ... другие импорты

async function verifyAdmin() { /* ... без изменений ... */ }

// --- СТАТЬИ (Article) ---

export async function createArticle(formData) { /* ... без изменений ... */ }

export async function updateArticle(formData) {
  // ... логика обновления ...
  const slug = formData.get('slug')?.toString();

  // ... try/catch блок ...

  revalidatePath('/admin/articles');
  // <<< ИЗМЕНЕНИЕ: Ревалидируем "плоский" путь
  revalidatePath(`/${slug}`); 
  redirect('/admin/articles');
}

export async function deleteArticle(formData) { /* ... без изменений ... */ }

// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) { /* ... без изменений ... */ }

export async function updateProject(formData) {
  // ... логика обновления ...
  const slug = formData.get('slug')?.toString();
  
  // ... prisma.project.update ...

  revalidatePath('/admin/projects');
  // <<< ИЗМЕНЕНИЕ: Ревалидируем "плоский" путь
  revalidatePath(`/${slug}`);
  redirect('/admin/projects');
}

export async function deleteProject(formData) { /* ... без изменений ... */ }

Ваши следующие шаги:
 * Создайте новый файл app/[slug]/page.js с кодом из первого блока.
 * Замените содержимое файлов components/Header.js, app/page.js и app/admin/actions.js на обновленные версии.
 * Удалите старые папки. Это финальный и обязательный шаг. Выполните в терминале:
   rm -rf app/articles
rm -rf app/projects




