// app/you/[username]/page.js

// Supabase helper is loaded dynamically inside getUserProfile to avoid build-time issues
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { getFirstImage } from '@/lib/contentUtils';

// Fallback avatar by first letter
function FallbackAvatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl sm:text-5xl font-bold mb-4 shadow-lg">
      {letter}
    </div>
  );
}

// Load user profile and related content
async function getUserProfile(username) {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest } = mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
  if (!supabase) notFound();
  const { data: users } = await supabase.from('users').select('*').eq('username', username).limit(1);
  const user = (users && users[0]) || null;
  if (!user) notFound();
  // Fetch articles from plural table and then tags via junction
  const { data: articlesData } = await supabase.from('articles').select('*').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
  const articles = articlesData || [];
  try {
    const ids = articles.map(a => a.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: links } = await supabase.from('_ArticleToTag').select('A,B').in('A', ids);
      const tagIds = (links || []).map(l => l.B).filter(Boolean);
      const { data: tags } = tagIds.length > 0 ? await supabase.from('Tag').select('id,name,slug').in('id', tagIds) : { data: [] };
      const tagsById = {};
      for (const t of tags || []) tagsById[t.id] = t;
      const tagsByArticle = {};
      for (const l of links || []) {
        if (!tagsByArticle[l.A]) tagsByArticle[l.A] = [];
        if (tagsById[l.B]) tagsByArticle[l.A].push(tagsById[l.B]);
      }
      for (const a of articles) a.tags = tagsByArticle[a.id] || [];
    }
  } catch (e) {
    console.error('Error fetching article tags for user page', e);
    for (const a of articles) a.tags = a.tags || [];
  }

  const { data: projectsData } = await supabase.from('projects').select('*').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
  const projects = projectsData || [];
  // attach tags for projects via junction table if present
  try {
    const pIds = projects.map(p => p.id).filter(Boolean);
    if (pIds.length > 0) {
      const { data: plinks } = await supabase.from('_ProjectToTag').select('A,B').in('A', pIds);
      const pTagIds = Array.from(new Set((plinks || []).map(l => l.B).filter(Boolean)));
      const { data: pTags } = pTagIds.length > 0 ? await supabase.from('Tag').select('id,name,slug').in('id', pTagIds) : { data: [] };
      const tagsById = {};
      for (const t of pTags || []) tagsById[t.id] = t;
      const tagsByProject = {};
      for (const l of plinks || []) {
        if (!tagsByProject[l.A]) tagsByProject[l.A] = [];
        if (tagsById[l.B]) tagsByProject[l.A].push(tagsById[l.B]);
      }
      for (const p of projects) p.tags = tagsByProject[p.id] || [];
    }
  } catch (e) {
    console.error('Error fetching project tags for user page', e);
    for (const p of projects) p.tags = p.tags || [];
  }
  user.articles = articles || [];
  user.projects = projects || [];
  return user;
}

export async function generateMetadata({ params }) {
  const user = await getUserProfile(params.username);
  return {
    title: `Профиль: ${user.name}`,
    description: user.bio || `Публичные статьи и проекты автора ${user.name}`,
  };
}

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

      <div className="space-y-16">
        {user.articles.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Публикации</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
                      {article.tags && article.tags.length > 0 && (
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
}

// Force dynamic rendering for this page to avoid server-component serialization issues during prerender
export const dynamic = 'force-dynamic';
