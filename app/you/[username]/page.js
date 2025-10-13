// app/you/[username]/page.js


// Supabase helper is loaded dynamically inside getUserProfile to avoid build-time issues
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import { Suspense } from 'react';
import { getFirstImage } from '@/lib/contentUtils';

// Fallback-аватар по первой букве
function FallbackAvatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl sm:text-5xl font-bold mb-4 shadow-lg">
      {letter}
    </div>
  );
}

// --- 1. ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ ДАННЫХ ПРОФИЛЯ ---
// Находит пользователя по username и подгружает его контент
async function getUserProfile(username) {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default || mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
  if (!supabase) notFound();
  const { data: users } = await supabase.from('users').select('*').eq('username', username).limit(1);
  const user = (users && users[0]) || null;
  if (!user) notFound();
  // Fetch articles and projects separately
  const { data: articles } = await supabase.from('article').select('*, tags:tags(*)').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
  const { data: projects } = await supabase.from('project').select('*, tags:tags(*)').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
  user.articles = articles || [];
  user.projects = projects || [];
  return user;
}

// --- 2. ГЕНЕРИРУЕМ МЕТАДАННЫЕ ДЛЯ SEO ---
export async function generateMetadata({ params }) {
  const user = await getUserProfile(params.username);
  const meta = {
    title: `Профиль: ${user.name}`,
    description: user.bio || `Публичные статьи и проекты автора ${user.name}`,
  };
  return sanitizeMetadata(meta);
}

// --- 3. САМ КОМПОНЕНТ СТРАНИЦЫ ---
function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 animate-pulse">
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 rounded-full bg-gray-200 mb-4" />
        <div className="h-6 w-40 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
      </div>
      <div className="mt-8">
        <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-4">
          {[1,2,3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function ProfileContent({ username }) {
  const user = await getUserProfile(username);
  if (!user) return notFound();

  return (
    <div className="container mx-auto px-4 py-12">
      {/* --- БЛОК С ИНФОРМАЦИЕЙ О ПОЛЬЗОВАТЕЛЕ --- */}
      <div className="flex flex-col items-center text-center mb-16">
        {user.image ? (
          <Image 
            src={user.image}
            alt={user.name || 'Аватар'}
            width={128}
            height={128}
            className="rounded-full mb-4 shadow-lg"
          />
        ) : (
          <FallbackAvatar name={user.name} />
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{user.name}</h1>
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
              {await Promise.all(user.articles.map(async (article) => {
                const previewImage = await getFirstImage(article.content);
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
              }))}
            </div>
          </div>
        )}
        
        {/* В будущем здесь можно будет добавить и проекты */}
      </div>
    </div>
  );
}

export default function UserProfilePage({ params }) {
  const { username } = params;
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      {/* @ts-expect-error Server Component */}
      <ProfileContent username={username} />
    </Suspense>
  );

  return (
    <div className="container mx-auto px-4 py-12">
      {/* --- БЛОК С ИНФОРМАЦИЕЙ О ПОЛЬЗОВАТЕЛЕ --- */}
      <div className="flex flex-col items-center text-center mb-16">
        {user.image ? (
          <Image 
            src={user.image}
            alt={user.name || 'Аватар'}
            width={128}
            height={128}
            className="rounded-full mb-4 shadow-lg"
          />
        ) : (
          <FallbackAvatar name={user.name} />
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{user.name}</h1>
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
