// app/you/[username]/page.js

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getFirstImage } from '@/lib/contentUtils';

// --- 1. ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ ДАННЫХ ПРОФИЛЯ ---
// Находит пользователя по username и подгружает его контент
async function getUserProfile(username) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      articles: {
        where: { published: true },
        orderBy: { publishedAt: 'desc' },
        include: { tags: true },
      },
      projects: {
        where: { published: true },
        orderBy: { publishedAt: 'desc' },
        include: { tags: true },
      }
    },
  });

  if (!user) {
    notFound();
  }
  return user;
}

// --- 2. ГЕНЕРИРУЕМ МЕТАДАННЫЕ ДЛЯ SEO ---
export async function generateMetadata({ params }) {
  const user = await getUserProfile(params.username);
  return {
    title: `Профиль: ${user.name}`,
    description: user.bio || `Публичные статьи и проекты автора ${user.name}`,
  };
}

// --- 3. САМ КОМПОНЕНТ СТРАНИЦЫ ---
export default async function UserProfilePage({ params }) {
  const user = await getUserProfile(params.username);

  return (
    <div className="container mx-auto px-4 py-12">
      {/* --- БЛОК С ИНФОРМАЦИЕЙ О ПОЛЬЗОВАТЕЛЕ --- */}
      <div className="flex flex-col items-center text-center mb-16">
        <Image 
          src={user.image || '/default-avatar.png'} 
          alt={user.name || 'Аватар'}
          width={128}
          height={128}
          className="rounded-full mb-4 shadow-lg"
        />
        <h1 className="text-4xl font-bold text-gray-900">{user.name}</h1>
        <p className="text-lg text-gray-500 mt-1">@{user.username}</p>
        
        {user.bio && (
          <p className="max-w-2xl mt-4 text-gray-700">{user.bio}</p>
        )}
        
        {user.website && (
          <Link href={user.website} target="_blank" rel="noopener noreferrer" className="mt-4 text-blue-600 hover:underline">
            {user.website.replace(/^(https?:\/\/)?(www\.)?/, '')}
          </Link>
        )}
      </div>

      {/* --- СПИСОК ПУБЛИКАЦИЙ ПОЛЬЗОВАТЕЛЯ --- */}
      <div className="space-y-16">
        {user.articles.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Публикации</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Используем вёрстку карточек с главной страницы */}
              {user.articles.map((article) => {
                const previewImage = getFirstImage(article.content);
                return (
                  <div key={article.id} className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden">
                    {previewImage && (
                      <Link href={`/${article.slug}`} className="block relative w-full h-48">
                        <Image src={previewImage} alt={article.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      </Link>
                    )}
                    <div className="p-6 flex-grow flex flex-col">
                      <Link href={`/${article.slug}`}>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">{article.title}</h3>
                      </Link>
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {article.tags.map(t => (<Link key={t.id} href={`/tags/${t.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{t.name}</Link>))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* В будущем здесь можно будет добавить и проекты */}
      </div>
    </div>
  );
}
